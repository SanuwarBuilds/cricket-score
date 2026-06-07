/* ============================
   App — Router & Initialization
   ============================ */

const App = (() => {

  let currentScreen = 'home';
  let currentMode = null; // 'local' or 'tournament'
  let lastSharePayload = null;
  let historyMatches = [];

  /**
   * Navigate to a screen
   */
  function navigate(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
    });

    // Show target
    const target = document.getElementById('screen-' + screenId);
    if (target) {
      target.classList.add('active');
      currentScreen = screenId;
    }

    // Track current mode
    if (screenId === 'local-setup' || screenId === 'local-match') {
      currentMode = 'local';
    } else if (screenId === 'tournament-setup' || screenId === 'tournament-match') {
      currentMode = 'tournament';
    } else if (screenId === 'home') {
      currentMode = null;
    }

    // Custom Triggers
    if (screenId === 'history') {
      loadHistory();
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  /**
   * Load History Data
   */
  function loadHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<div class="history-loading">Loading history...</div>';

    firebase.database().ref('score/history').orderByChild('date').once('value')
      .then(snapshot => {
        if (!snapshot.exists()) {
          list.innerHTML = '<div class="history-empty">No matches found.</div>';
          return;
        }

        let html = '';
        const matches = [];
        snapshot.forEach(child => {
          matches.push({ id: child.key, ...child.val() });
        });
        
        // Reverse array to show newest first
        matches.reverse();
        
        historyMatches = matches;

        matches.forEach(m => {
          const date = new Date(m.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
          const teamA = m.teamA || 'Team A';
          const teamB = m.teamB || 'Team B';
          const scoreA = `${m.runsA || 0}/${m.wicketsA || 0}`;
          const scoreB = `${m.runsB || 0}/${m.wicketsB || 0}`;
          const winner = m.winner || 'Unknown';
          const winnerClass = winner === teamA ? 'winner-a' : winner === teamB ? 'winner-b' : '';
          html += `
            <div class="history-card ${winnerClass}" data-id="${escapeHTML(m.id)}">
              <div class="history-header">
                <span>${escapeHTML(date)}</span>
                <span class="history-chip">${m.overs || 0} Overs</span>
              </div>
              <div class="history-versus">
                <div class="history-team-row">
                  <span class="history-team-name">${escapeHTML(teamA)}</span>
                  <span class="history-score-pill">${escapeHTML(scoreA)}</span>
                </div>
                <div class="history-team-row">
                  <span class="history-team-name">${escapeHTML(teamB)}</span>
                  <span class="history-score-pill">${escapeHTML(scoreB)}</span>
                </div>
              </div>
              <div class="history-result">
                <span class="history-winner-badge">Winner</span>
                <strong>${escapeHTML(winner)}</strong>
              </div>
            </div>
          `;
        });

        list.innerHTML = html;
      })
      .catch(err => {
        console.error("History err:", err);
        list.innerHTML = '<div class="history-empty " style="color:var(--red);">Failed to load history</div>';
      });
  }

  /**
   * Add ripple effect
   */
  function addRipple(e, container) {
    const rect = container.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (x - size / 2) + 'px';
    ripple.style.top = (y - size / 2) + 'px';

    const rippleContainer = container.querySelector('.ripple-container');
    if (rippleContainer) {
      rippleContainer.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
  }

  // ==========================================
  // SERVICE WORKER REGISTRATION (FCM)
  // ==========================================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then(r  => console.log('[SW] Registered:', r.scope))
      .catch(e => console.warn('[SW] Registration failed:', e));
  }

  // =================================================
  // PINNED MATCH MANAGER — Notification-Only
  // Works on: Android Chrome, Desktop Chrome, Firefox
  // =================================================
  const VAPID_KEY = 'BDRdmPMEpxIwqsGFujWKC_vgl2qkU_LojLDhHTIrLAKw3QOzFyfSbXGWDNDaVF14AcrQG5dfv9f8IPFHgHgYHA8';

  function showToast(msg, duration) {
    duration = duration || 2500;
    var t = document.getElementById('pin-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pin-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);' +
        'background:rgba(10,14,26,0.96);color:#fff;padding:10px 22px;border-radius:30px;' +
        'font-size:0.85rem;font-weight:600;letter-spacing:0.3px;' +
        'box-shadow:0 4px 24px rgba(0,0,0,0.6);z-index:99999;' +
        'transition:opacity 0.25s,transform 0.25s;opacity:0;' +
        'border:1px solid rgba(0,229,255,0.25);white-space:nowrap;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(function() {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(t._hide);
    t._hide = setTimeout(function() {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
  }

  var PinnedManager = {
    currentRef: null,
    messaging:  null,

    init: function() {
      // Init Firebase Messaging
      try {
        if (typeof firebase !== 'undefined' && firebase.messaging) {
          this.messaging = firebase.messaging();
        }
      } catch(e) {}

      // Restore pin from previous session if match still live
      var savedId = sessionStorage.getItem('pinnedMatchId');
      if (!savedId) return;
      var DB = FirebaseSync.getDb();
      if (!DB) { sessionStorage.removeItem('pinnedMatchId'); return; }
      var self = this;
      DB.ref('matches/current/' + savedId).once('value').then(function(snap) {
        var val = snap.val();
        if (val && !val.isMatchOver) {
          self._listen(savedId);
        } else {
          sessionStorage.removeItem('pinnedMatchId');
        }
      }).catch(function() { sessionStorage.removeItem('pinnedMatchId'); });
    },

    pinMatch: async function(matchId) {
      // Check API support
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        showToast('❌ Notifications not supported in this browser');
        return;
      }
      // Request permission
      if (Notification.permission !== 'granted') {
        var perm = 'denied';
        try { perm = await Notification.requestPermission(); } catch(e) {}
        if (perm !== 'granted') {
          showToast('❌ Allow notifications to pin live score');
          return;
        }
      }
      // FCM token (non-blocking)
      if (this.messaging) {
        var msg = this.messaging;
        navigator.serviceWorker.ready.then(function(sw) {
          return msg.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
        }).then(function(t) {
          console.log('[FCM] token:', t ? t.slice(0,20)+'…' : 'none');
        }).catch(function(e) {
          console.warn('[FCM] getToken:', e);
        });
      }
      // Save and start
      sessionStorage.setItem('pinnedMatchId', matchId);
      this._listen(matchId);
      showToast('📌 Live score pinned');
    },

    unpin: async function(showFeedback) {
      if (showFeedback === undefined) showFeedback = true;
      sessionStorage.removeItem('pinnedMatchId');
      this._detach();
      try {
        var reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        if (reg) {
          var notifs = await reg.getNotifications({ tag: 'live-score' });
          notifs.forEach(function(n) { n.close(); });
        }
      } catch(e) {}
      if (showFeedback) showToast('🗑 Live score unpinned');
    },

    _listen: function(matchId) {
      this._detach();
      var DB = FirebaseSync.getDb();
      if (!DB) return;
      var self = this;
      this.currentRef = DB.ref('matches/current/' + matchId);
      this.currentRef.on('value', function(snap) {
        var val = snap.val();
        if (!val || val.isMatchOver) {
          if (val && val.isMatchOver) {
            var bat = val.teams && val.teams[val.currentInnings === 0 ? 0 : 1];
            self._push(
              '🏏 MATCH FINISHED',
              'Winner: ' + (val.winner || '?') + '\nFinal: ' + (bat ? bat.runs+'/'+bat.wickets : ''),
              true
            );
            setTimeout(function() { self.unpin(false); }, 10000);
          } else {
            self.unpin(false);
          }
          return;
        }
        var teamA = (val.teams && val.teams[0] && val.teams[0].name) || 'Team A';
        var teamB = (val.teams && val.teams[1] && val.teams[1].name) || 'Team B';
        var bat   = val.teams && val.teams[val.currentInnings || 0];
        if (!bat) return;
        var runs  = bat.runs    != null ? bat.runs    : 0;
        var wkts  = bat.wickets != null ? bat.wickets : 0;
        var ovs   = bat.overs   != null ? bat.overs   : '0.0';
        var left  = self._remaining(val.totalOvers, ovs);
        var tgt   = val.target ? 'Target: ' + val.target : '';
        var lines = [bat.name + ': ' + runs + '/' + wkts, 'Overs: ' + ovs, left, tgt]
          .filter(Boolean).join('\n');
        self._push('🔴 LIVE: ' + teamA + ' vs ' + teamB, lines, false);
      });
    },

    _push: function(title, body, isFinished) {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.ready.then(function(reg) {
        return reg.showNotification(title, {
          body:               body,
          icon:               '/public/stadium-bg.png',
          badge:              '/public/stadium-bg.png',
          tag:                'live-score',
          renotify:           false,
          requireInteraction: !isFinished,
          silent:             true,
          data:               { url: '/' }
        });
      }).catch(function(e) { console.warn('[SW] showNotification:', e); });
    },

    _detach: function() {
      if (this.currentRef) { this.currentRef.off('value'); this.currentRef = null; }
    },

    _remaining: function(total, overs) {
      if (!total) return '';
      var p    = parseFloat(overs);
      var done = Math.floor(p) * 6 + Math.round((p % 1) * 10);
      var left = total * 6 - done;
      if (left <= 0) return '';
      var ol = Math.floor(left / 6), bl = left % 6;
      return ol > 0 ? ol + '.' + bl + ' left' : left + 'b left';
    }
  };

  /**
   * Initialize the app
   */
  function init() {
    // Init Firebase
    FirebaseSync.init();
    
    // Init Pinned Widget
    PinnedManager.init();

    // ===== User Session Tracking =====
    const sessionId = crypto.randomUUID ? crypto.randomUUID() : 
      Date.now().toString(36) + Math.random().toString(36).substring(2);
    
    const ua = navigator.userAgent;
    const device = /Mobile|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop';
    const browser = /Chrome/i.test(ua) ? 'Chrome' : 
                    /Safari/i.test(ua) ? 'Safari' : 
                    /Firefox/i.test(ua) ? 'Firefox' : 'Other';
    
    const sessionData = {
      sessionId,
      joinedAt: Date.now(),
      device,
      browser,
      lat: null,
      lng: null,
      city: 'Unknown',
      country: '',
      matchViewed: ''
    };

    // Push session immediately (without location)
    FirebaseSync.trackSession(sessionData);

    function enrichSessionWithLocation() {
      fetch('https://api.bigdatacloud.net/data/client-ip')
        .then(r => r.json())
        .then(ipData => {
          const ip = ipData.ipString || '';
          return fetch('https://api.bigdatacloud.net/data/ip-geolocation?ip=' + ip + '&key=bdc_4b3cf26f5b284870b1b3e38c14dcb034');
        })
        .then(r => r.json())
        .then(geo => {
          sessionData.lat = geo.location?.latitude || null;
          sessionData.lng = geo.location?.longitude || null;
          sessionData.city = geo.location?.city || geo.city || geo.location?.localityName || 'Unknown';
          sessionData.country = geo.country?.name || '';
          FirebaseSync.trackSession(sessionData);
        })
        .catch(() => {
          fetch('https://ipwho.is/')
            .then(r => r.json())
            .then(d => {
              sessionData.lat = d.latitude || null;
              sessionData.lng = d.longitude || null;
              sessionData.city = d.city || 'Unknown';
              sessionData.country = d.country || '';
              FirebaseSync.trackSession(sessionData);
            })
            .catch(() => { /* Keep as Unknown */ });
        });
    }

    function showPrivacyConsent() {
      if (localStorage.getItem('location_analytics_consent')) return;
      const box = document.createElement('div');
      box.className = 'privacy-consent';
      box.innerHTML = `
        <div>
          <strong>Help improve live cricket scoring</strong>
          <span>Allow approximate city-level analytics for the admin dashboard?</span>
        </div>
        <div class="privacy-actions">
          <button data-consent="allow">Allow</button>
          <button data-consent="deny">Not now</button>
        </div>
      `;
      document.body.appendChild(box);
      box.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-consent]');
        if (!btn) return;
        const value = btn.dataset.consent;
        localStorage.setItem('location_analytics_consent', value);
        box.remove();
        if (value === 'allow') enrichSessionWithLocation();
      });
    }

    if (localStorage.getItem('location_analytics_consent') === 'allow') {
      enrichSessionWithLocation();
    } else {
      showPrivacyConsent();
    }

    // Clean up session on page unload
    window.addEventListener('beforeunload', () => {
      FirebaseSync.removeSession(sessionId);
    });

    // Start listening globally for active matches to show on Home Screen
    const matchesContainer = document.getElementById('live-matches-container');
    const joinCodeCard = document.getElementById('join-code-card');
    const joinCodeToggle = document.getElementById('btn-toggle-join-code');
    const joinCodeInput = document.getElementById('join-match-code');
    const joinCodeError = document.getElementById('join-code-error');
    const joinCodeBtn = document.getElementById('btn-join-code');
    let globalMatchesMap = {};
    let pendingJoinCode = (new URLSearchParams(window.location.search).get('match') || '').trim();

    function matchCodeOf(match) {
      return (match.matchCode || (match.id || '').slice(0, 6)).toUpperCase();
    }

    function findMatchByCode(code) {
      const normalized = (code || '').trim().toUpperCase();
      if (!normalized) return null;
      return Object.values(globalMatchesMap).find(match =>
        match.id === code ||
        match.id?.toUpperCase() === normalized ||
        matchCodeOf(match) === normalized ||
        match.id?.toUpperCase().startsWith(normalized)
      ) || null;
    }

    function joinLiveMatch(matchState) {
      if (!matchState) return false;
      const runJoin = () => {
        if (matchState.mode === 'local') {
          FirebaseSync.updateSessionMatch(sessionId, matchState.teams[0].name + ' vs ' + matchState.teams[1].name);
          LocalMode.joinLiveMatch(matchState);
        } else if (matchState.mode === 'tournament') {
          FirebaseSync.updateSessionMatch(sessionId, matchState.teams[0].name + ' vs ' + matchState.teams[1].name);
          TournamentMode.joinLiveMatch(matchState);
        }
      };
      showCinematicIntro(matchState, runJoin);
      return true;
    }

    FirebaseSync.listenAllMatches((matches) => {
      if (!matchesContainer) return;

      // Ensure we clear mapping on each update to prevent old ghost matches
      globalMatchesMap = {};
      
      // Filter to only true match objects that aren't over
      const activeMatches = matches.filter(m => 
        m && 
        typeof m === 'object' && 
        m.id && 
        m.teams && 
        m.mode && 
        !m.isMatchOver
      );
      
      if (activeMatches.length === 0) {
        matchesContainer.innerHTML = '';
        return;
      }

      let html = '';
      activeMatches.forEach(match => {
        globalMatchesMap[match.id] = match;
        const modeLabel = match.mode === 'tournament' ? '🏆 Tournament' : '🏠 Local';
        
        let teamAtxt = 'Team A';
        let teamBtxt = 'Team B';
        if (match.teams && match.teams.length >= 2) {
           teamAtxt = match.teams[0].name || 'Team A';
           teamBtxt = match.teams[1].name || 'Team B';
        }

        const isPinned = sessionStorage.getItem('pinnedMatchId') === match.id;
        const pinAction = isPinned ? 'unpin-match' : 'pin-match';
        const pinText   = isPinned ? '🛑 Unpin Match' : '📌 Pin This Match';
        const descText  = isPinned ? '📌 Pinned ✓'   : 'Tap to View Score';
        const codeText  = matchCodeOf(match);

        html += `
          <div class="live-match-banner" data-match-id="${match.id}" style="display: block; margin-bottom: 12px; cursor: pointer;">
            <div class="live-badge"><span></span>LIVE ${modeLabel}</div>
            <button class="banner-menu-btn" data-action="toggle-menu">⋮</button>
            <div class="banner-menu-dropdown hidden">
               <button class="dropdown-item" data-action="view-match">👁 View Live Match</button>
               <button class="dropdown-item" data-action="${pinAction}">${pinText}</button>
            </div>
            <div class="live-match-teams">${teamAtxt} vs ${teamBtxt}</div>
            <div class="live-match-desc">${descText} · Code ${codeText}</div>
          </div>
        `;
      });
      matchesContainer.innerHTML = html;

      if (pendingJoinCode) {
        const match = findMatchByCode(pendingJoinCode);
        if (match) {
          pendingJoinCode = '';
          joinLiveMatch(match);
        }
      }
    });

    if (joinCodeToggle && joinCodeCard && joinCodeInput) {
      joinCodeToggle.addEventListener('click', () => {
        const isCollapsed = joinCodeCard.classList.toggle('collapsed');
        if (!isCollapsed) joinCodeInput.focus();
      });
    }

    if (joinCodeBtn && joinCodeInput) {
      joinCodeBtn.addEventListener('click', () => {
        const match = findMatchByCode(joinCodeInput.value);
        if (match) {
          joinCodeError.textContent = '';
          joinCodeInput.value = '';
          if (joinCodeCard) joinCodeCard.classList.add('collapsed');
          joinLiveMatch(match);
        } else {
          joinCodeError.textContent = 'No live match found for this code.';
          if (joinCodeCard) joinCodeCard.classList.remove('collapsed');
        }
      });
      joinCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinCodeBtn.click();
      });
    }

    if (matchesContainer) {
      matchesContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.live-match-banner');
        if (!card) return;
        
        const matchId = card.getAttribute('data-match-id');
        const matchState = globalMatchesMap[matchId];
        if (!matchState) return;

        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.stopPropagation();
          const action = actionBtn.getAttribute('data-action');
          if (action === 'toggle-menu') {
            document.querySelectorAll('.banner-menu-dropdown').forEach(d => {
               if (d !== card.querySelector('.banner-menu-dropdown')) d.classList.add('hidden');
            });
            card.querySelector('.banner-menu-dropdown').classList.toggle('hidden');
            return; // stop here
          }

          if (action === 'pin-match') {
            e.preventDefault();
            document.querySelectorAll('.banner-menu-dropdown').forEach(d => d.classList.add('hidden'));
            PinnedManager.pinMatch(matchState.id);
            return; // CRITICAL: do not fall through to cinematic/navigation
          }

          if (action === 'unpin-match') {
            e.preventDefault();
            document.querySelectorAll('.banner-menu-dropdown').forEach(d => d.classList.add('hidden'));
            PinnedManager.unpin(true);
            return; // CRITICAL: do not fall through to cinematic/navigation
          }

          if (action === 'view-match') {
            card.querySelector('.banner-menu-dropdown').classList.add('hidden');
            // fall through to joinMatch below
          } else {
            return; // unknown action — do nothing
          }
        }

        // Only reach here when tapping the card directly OR 'view-match'
        joinLiveMatch(matchState);
      });
    }

    // Init mode setups
    LocalMode.initSetup();
    TournamentMode.initSetup();

    // ---- Home Main Menu ----
    const homeMenuBtn = document.getElementById('btn-home-menu');
    const homeDropdown = document.getElementById('home-dropdown');
    if (homeMenuBtn && homeDropdown) {
      homeMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        homeDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!homeDropdown.classList.contains('hidden') && !e.target.closest('#btn-home-menu')) {
          homeDropdown.classList.add('hidden');
        }
        
        if (!e.target.closest('.banner-menu-btn')) {
          document.querySelectorAll('.banner-menu-dropdown').forEach(d => d.classList.add('hidden'));
        }
      });
      document.getElementById('btn-go-history').addEventListener('click', () => {
        navigate('history');
      });

      // ---- History Scorecard Detail Click ----
      const historyList = document.getElementById('history-list');
      if (historyList) {
        historyList.addEventListener('click', (e) => {
          const card = e.target.closest('.history-card');
          if (card) {
            const matchId = card.getAttribute('data-id');
            openHistoryDetail(matchId);
          }
        });
      }

      const histCloseBtn = document.getElementById('hist-modal-close');
      if (histCloseBtn) {
        histCloseBtn.addEventListener('click', () => {
          hideModal('history-detail-modal');
        });
      }

      // ---- Theme Toggle Logic ----
      const btnToggleTheme = document.getElementById('btn-toggle-theme');
      if (btnToggleTheme) {
        // Init theme state from local storage
        const savedTheme = localStorage.getItem('app_theme') || 'basic';
        if (savedTheme === 'basic') {
          document.body.classList.add('theme-basic');
          btnToggleTheme.textContent = '⚫ Switch to Premium Theme';
        } else {
          document.body.classList.remove('theme-basic');
          btnToggleTheme.textContent = '⚪ Switch to Basic White Theme';
        }

        // Handle click event to switch themes
        btnToggleTheme.addEventListener('click', () => {
          const isBasic = document.body.classList.toggle('theme-basic');
          if (isBasic) {
            localStorage.setItem('app_theme', 'basic');
            btnToggleTheme.textContent = '⚫ Switch to Premium Theme';
          } else {
            localStorage.setItem('app_theme', 'premium');
            btnToggleTheme.textContent = '⚪ Switch to Basic White Theme';
          }
          
          // Force redraw charts if a match is active
          const activeMatchState = (typeof LocalMode !== 'undefined' && typeof TournamentMode !== 'undefined')
            ? (LocalMode.getState() || TournamentMode.getState())
            : null;
          if (activeMatchState) {
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen) {
              const activeId = activeScreen.id;
              if (activeId === 'screen-local-match') {
                updateCharts(activeMatchState, 'local', true);
              } else if (activeId === 'screen-tournament-match') {
                updateCharts(activeMatchState, 'tournament', true);
              }
            }
          }
        });
      }

    }

    // ---- Navigation buttons ----
    document.querySelectorAll('[data-navigate]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        addRipple(e, btn);
        const target = btn.getAttribute('data-navigate');
        if (target === 'tournament-setup') {
          showToast('🏆 This is still in developing stage');
          return;
        }
        navigate(target);
      });
    });

    // ---- Local Mode — Run buttons ----
    const localControls = document.getElementById('local-controls');
    if (localControls) {
      localControls.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        // Only authenticated can score
        if (!LocalMode.getIsAuthenticated()) {
          showAuthModal('local');
          return;
        }

        LocalMode.handleAction(btn.dataset.action);
      });
    }

    // ---- Tournament Mode — Run buttons ----
    const tournamentControls = document.getElementById('tournament-controls');
    if (tournamentControls) {
      tournamentControls.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        if (!TournamentMode.getIsAuthenticated()) {
          showAuthModal('tournament');
          return;
        }

        TournamentMode.handleAction(btn.dataset.action);
      });
    }

    // ---- Auth buttons ----
    document.getElementById('local-auth-banner').addEventListener('click', () => showAuthModal('local'));
    document.getElementById('tournament-auth-banner').addEventListener('click', () => showAuthModal('tournament'));

    // ---- Auth modal ----
    document.getElementById('auth-confirm').addEventListener('click', async () => {
      const code = document.getElementById('auth-code-input').value.trim();
      let success = false;

      if (currentMode === 'local') {
        success = await LocalMode.authenticate(code);
      } else if (currentMode === 'tournament') {
        success = await TournamentMode.authenticate(code);
      }

      if (success) {
        hideModal('auth-modal');
        document.getElementById('auth-code-input').value = '';
        document.getElementById('auth-error').textContent = '';
      } else {
        document.getElementById('auth-error').textContent = 'Invalid code. Try again.';
      }
    });

    document.getElementById('auth-cancel').addEventListener('click', () => {
      hideModal('auth-modal');
      document.getElementById('auth-code-input').value = '';
      document.getElementById('auth-error').textContent = '';
    });

    // ---- Delete buttons ----
    document.getElementById('btn-local-delete').addEventListener('click', () => showDeleteModal());
    document.getElementById('btn-tournament-delete').addEventListener('click', () => showDeleteModal());

    // ---- Delete modal ----
    document.getElementById('delete-confirm').addEventListener('click', async () => {
      const code = document.getElementById('delete-code-input').value.trim();
      let success = false;

      if (currentMode === 'local') {
        success = await LocalMode.deleteMatch(code);
      } else if (currentMode === 'tournament') {
        success = await TournamentMode.deleteMatch(code);
      }

      if (success) {
        hideModal('delete-modal');
        document.getElementById('delete-code-input').value = '';
        document.getElementById('delete-error').textContent = '';
        navigate('home');
      } else {
        document.getElementById('delete-error').textContent = 'Invalid code. Try again.';
      }
    });

    document.getElementById('delete-cancel').addEventListener('click', () => {
      hideModal('delete-modal');
      document.getElementById('delete-code-input').value = '';
      document.getElementById('delete-error').textContent = '';
    });

    // ---- Home buttons ----
    document.getElementById('btn-local-home').addEventListener('click', () => navigate('home'));
    document.getElementById('btn-tournament-home').addEventListener('click', () => navigate('home'));
    document.getElementById('btn-local-share').addEventListener('click', () => showShareModal(LocalMode.getState(), false));
    document.getElementById('btn-tournament-share').addEventListener('click', () => showShareModal(TournamentMode.getState(), false));
    document.getElementById('btn-final-share').addEventListener('click', () => {
      showShareModal(LocalMode.getState() || TournamentMode.getState(), true);
    });
    document.getElementById('share-close').addEventListener('click', () => hideModal('share-modal'));
    document.getElementById('share-copy').addEventListener('click', copyShareLink);
    document.getElementById('share-whatsapp').addEventListener('click', openShareWhatsApp);

    // ---- Handle auth code input Enter key ----
    document.getElementById('auth-code-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('auth-confirm').click();
    });
    document.getElementById('delete-code-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('delete-confirm').click();
    });

    // ---- Panel Tabs Click Handlers ----
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetId = tab.getAttribute('data-tab-target');
        const container = tab.closest('.match-bottom-panel');
        
        // Deactivate all sibling tabs
        container.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Hide all sibling panel content divs
        container.querySelectorAll('.tab-panelactive').forEach(panel => {
          panel.style.display = 'none';
          panel.classList.remove('active');
        });
        
        // Show target panel content
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.style.display = 'flex';
          targetPanel.classList.add('active');
          
          // If stats tab is opened, force a chart redraw
          const activeMatchState = LocalMode.getState() || TournamentMode.getState();
          if (targetId.includes('tab-stats') && activeMatchState) {
            updateCharts(activeMatchState, targetId.startsWith('local') ? 'local' : 'tournament', true);
          }
        }
      });
    });

    // ---- Cheer Emojis Send Handlers ----
    document.addEventListener('click', (e) => {
      const cheerBtn = e.target.closest('.cheer-btn-trigger');
      if (cheerBtn) {
        const emoji = cheerBtn.getAttribute('data-emoji');
        sendReaction(emoji);
      }
    });



    // Start on home
    navigate('home');
  }

  /**
   * Show auth modal
   */
  function showAuthModal(mode) {
    currentMode = mode;
    document.getElementById('auth-modal').classList.add('active');
    document.getElementById('auth-code-input').focus();
  }

  /**
   * Show delete modal
   */
  function showDeleteModal() {
    document.getElementById('delete-modal').classList.add('active');
    document.getElementById('delete-code-input').focus();
  }

  /**
   * Hide a modal
   */
  function hideModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  function matchCodeOf(match) {
    return (match?.matchCode || (match?.id || '').slice(0, 6)).toUpperCase();
  }

  function matchLinkOf(match) {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('match', match?.id || '');
    return url.toString();
  }

  function shareTextOf(match, isResult) {
    if (!match?.teams?.length) return 'Quick Cricket Score live match';
    const teamA = match.teams[0];
    const teamB = match.teams[1];
    if (isResult || match.isMatchOver) {
      return `${match.winMessage || 'Match result'}\n${teamA.name}: ${teamA.runs}/${teamA.wickets}\n${teamB.name}: ${teamB.runs}/${teamB.wickets}\nQuick Cricket Score`;
    }
    const batting = match.teams[match.currentInnings || 0] || teamA;
    return `Live cricket score: ${teamA.name} vs ${teamB.name}\n${batting.name}: ${batting.runs}/${batting.wickets} (${CricketEngine.getOversDisplay(match)} ov)\nCode: ${matchCodeOf(match)}\n${matchLinkOf(match)}`;
  }

  function showShareModal(match, isResult) {
    if (!match?.id) {
      showToast('No active match to share');
      return;
    }
    const link = matchLinkOf(match);
    const text = shareTextOf(match, isResult);
    lastSharePayload = { link, text };
    document.getElementById('share-modal-sub').textContent = isResult ? 'Share the final result' : 'Send this link or code to viewers';
    document.getElementById('share-code-text').textContent = matchCodeOf(match);
    document.getElementById('share-link-input').value = link;
    document.getElementById('share-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
    document.getElementById('share-modal').classList.add('active');
  }

  async function copyShareLink() {
    if (!lastSharePayload) return;
    try {
      await navigator.clipboard.writeText(lastSharePayload.link);
      showToast('Link copied');
    } catch(e) {
      document.getElementById('share-link-input').select();
      showToast('Select and copy the link');
    }
  }

  function openShareWhatsApp() {
    if (!lastSharePayload) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(lastSharePayload.text)}`, '_blank', 'noopener');
  }

  /**
   * Show cinematic match intro overlay
   */
  function showCinematicIntro(matchState, onComplete) {
    const intro = document.getElementById('cinematic-intro');
    if (!intro) {
      if (onComplete) onComplete();
      return;
    }

    // Populate data
    const teamA = matchState.teams?.[0]?.name || 'Team A';
    const teamB = matchState.teams?.[1]?.name || 'Team B';
    document.getElementById('intro-match-type').textContent = matchState.mode === 'tournament' ? 'Tournament Match' : 'Local Match';
    document.getElementById('intro-team-a-name').textContent = teamA;
    document.getElementById('intro-team-b-name').textContent = teamB;
    
    // Fetch overs and players accurately from the state
    const overs = matchState.totalOvers || '10';
    const players = matchState.playersPerTeam || '11';
    
    document.getElementById('intro-overs').textContent = `${overs} Overs Match`;
    document.getElementById('intro-players').textContent = `${players} Players`;
    
    const subDetails = document.getElementById('intro-sub-details');
    if (matchState.mode === 'tournament' && matchState.tournamentName) {
      subDetails.textContent = matchState.tournamentName;
    } else {
      subDetails.textContent = 'Live Broadcast';
    }

    // Show intro
    intro.classList.remove('hidden');

    let timeoutId;
    
    // Complete function
    const finishIntro = () => {
      clearTimeout(timeoutId);
      intro.classList.add('hidden');
      document.getElementById('intro-skip-btn').removeEventListener('click', finishIntro);
      if (onComplete) onComplete();
    };

    // Auto complete after 3.8s (sync with CSS animations)
    timeoutId = setTimeout(finishIntro, 3800);

    // Skip button
    document.getElementById('intro-skip-btn').addEventListener('click', finishIntro);
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  // ==========================================================
  // REAL-TIME CHARTS & REACTIONS IMPLEMENTATIONS
  // ==========================================================

  let wormChartInstance = null;
  let manhattanChartInstance = null;
  let lastChartMatchId = null;
  let currentReactionsRef = null;

  function updateCharts(state, mode, forceRedraw = false) {
    if (!state || !state.teams) return;
    
    // Only draw if the stats tab is currently active
    const statsTabBtn = document.getElementById(`btn-${mode}-tab-stats`);
    if (!statsTabBtn || (!statsTabBtn.classList.contains('active') && !forceRedraw)) {
      return; 
    }

    const canvasWorm = document.getElementById(`${mode}-worm-canvas`);
    const canvasManhattan = document.getElementById(`${mode}-manhattan-canvas`);
    if (!canvasWorm || !canvasManhattan) return;

    // Check theme state
    const isBasicTheme = document.body.classList.contains('theme-basic');
    const chartLabelColor = isBasicTheme ? '#0f172a' : '#fff';
    const chartGridColor = isBasicTheme ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255,255,255,0.05)';
    const chartTicksColor = isBasicTheme ? '#475569' : '#889';

    // If match ID changed, clean up previous chart instances
    if (lastChartMatchId !== state.id) {
      destroyCharts();
      lastChartMatchId = state.id;
    }

    const teamA = state.teams[0];
    const teamB = state.teams[1];
    const totalOvers = state.totalOvers || 5;

    const statsA = parseHistoryForCharts(teamA, totalOvers);
    const statsB = parseHistoryForCharts(teamB, totalOvers);

    const labels = Array.from({ length: totalOvers + 1 }, (_, i) => i);

    const wormDataA = [0].concat(statsA.map(s => s.cumulativeRuns));
    const wormDataB = state.currentInnings >= 1 || state.isMatchOver || teamB.ballHistory.length > 0 ? [0].concat(statsB.map(s => s.cumulativeRuns)) : [];

    const manhattanDataA = statsA.map(s => s.runsInOver);
    const manhattanDataB = statsB.map(s => s.runsInOver);
    const manhattanLabels = Array.from({ length: totalOvers }, (_, i) => `Ov ${i + 1}`);

    // Update or create Worm line chart
    if (wormChartInstance && !forceRedraw) {
      wormChartInstance.data.datasets[0].label = teamA.name;
      wormChartInstance.data.datasets[0].data = wormDataA;
      wormChartInstance.data.datasets[0].borderColor = teamA.color || '#3b82f6';
      wormChartInstance.data.datasets[0].pointBackgroundColor = teamA.color || '#3b82f6';
      
      if (wormChartInstance.data.datasets[1]) {
        wormChartInstance.data.datasets[1].label = teamB.name;
        wormChartInstance.data.datasets[1].data = wormDataB;
        wormChartInstance.data.datasets[1].borderColor = teamB.color || '#ef4444';
        wormChartInstance.data.datasets[1].pointBackgroundColor = teamB.color || '#ef4444';
      } else if (wormDataB.length > 0) {
        wormChartInstance.data.datasets.push({
          label: teamB.name,
          data: wormDataB,
          borderColor: teamB.color || '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: teamB.color || '#ef4444'
        });
      }
      wormChartInstance.update('none');
    } else {
      if (wormChartInstance) wormChartInstance.destroy();
      
      const datasets = [
        {
          label: teamA.name,
          data: wormDataA,
          borderColor: teamA.color || '#3b82f6',
          backgroundColor: 'rgba(0, 229, 255, 0.05)',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: teamA.color || '#3b82f6'
        }
      ];

      if (wormDataB.length > 0) {
        datasets.push({
          label: teamB.name,
          data: wormDataB,
          borderColor: teamB.color || '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: teamB.color || '#ef4444'
        });
      }

      wormChartInstance = new Chart(canvasWorm.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: chartLabelColor, font: { family: 'Outfit', size: 10 } } }
          },
          scales: {
            x: { grid: { color: chartGridColor }, ticks: { color: chartTicksColor } },
            y: { grid: { color: chartGridColor }, ticks: { color: chartTicksColor }, min: 0 }
          }
        }
      });
    }

    // Update or create Manhattan bar chart
    if (manhattanChartInstance && !forceRedraw) {
      manhattanChartInstance.data.datasets[0].label = teamA.name;
      manhattanChartInstance.data.datasets[0].data = manhattanDataA;
      manhattanChartInstance.data.datasets[0].backgroundColor = teamA.color || '#3b82f6';
      
      if (manhattanChartInstance.data.datasets[1]) {
        manhattanChartInstance.data.datasets[1].label = teamB.name;
        manhattanChartInstance.data.datasets[1].data = manhattanDataB;
        manhattanChartInstance.data.datasets[1].backgroundColor = teamB.color || '#ef4444';
      } else if (manhattanDataB.length > 0) {
        manhattanChartInstance.data.datasets.push({
          label: teamB.name,
          data: manhattanDataB,
          backgroundColor: teamB.color || '#ef4444',
          borderRadius: 4
        });
      }
      manhattanChartInstance.update('none');
    } else {
      if (manhattanChartInstance) manhattanChartInstance.destroy();
      
      const datasets = [
        {
          label: teamA.name,
          data: manhattanDataA,
          backgroundColor: teamA.color || '#3b82f6',
          borderRadius: 4
        }
      ];

      if (state.currentInnings >= 1 || state.isMatchOver || teamB.ballHistory.length > 0) {
        datasets.push({
          label: teamB.name,
          data: manhattanDataB,
          backgroundColor: teamB.color || '#ef4444',
          borderRadius: 4
        });
      }

      manhattanChartInstance = new Chart(canvasManhattan.getContext('2d'), {
        type: 'bar',
        data: { labels: manhattanLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: chartLabelColor, font: { family: 'Outfit', size: 10 } } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: chartTicksColor } },
            y: { grid: { color: chartGridColor }, ticks: { color: chartTicksColor }, min: 0 }
          }
        }
      });
    }
  }

  function destroyCharts() {
    if (wormChartInstance) { wormChartInstance.destroy(); wormChartInstance = null; }
    if (manhattanChartInstance) { manhattanChartInstance.destroy(); manhattanChartInstance = null; }
    lastChartMatchId = null;
  }

  function parseHistoryForCharts(team, totalOvers) {
    const history = team.ballHistory || [];
    const stats = [];
    let currentRuns = 0;
    let currentWickets = 0;
    let legalBalls = 0;
    let runsInOver = 0;
    let overNumber = 1;

    for (let i = 0; i < history.length; i++) {
      const ball = history[i];
      const val = ball.value || 0;
      currentRuns += val;
      runsInOver += val;

      if (ball.type === 'out') currentWickets += 1;
      if (ball.type !== 'wide' && ball.type !== 'noball') legalBalls += 1;

      if (legalBalls === 6) {
        stats.push({ overNumber, runsInOver, cumulativeRuns: currentRuns, wickets: currentWickets });
        runsInOver = 0;
        legalBalls = 0;
        overNumber += 1;
      }
    }

    if (legalBalls > 0 && stats.length < totalOvers) {
      stats.push({ overNumber, runsInOver, cumulativeRuns: currentRuns, wickets: currentWickets });
    }
    
    return stats;
  }

  function initReactions(matchId) {
    if (!matchId) return;
    
    if (currentReactionsRef) {
      currentReactionsRef.off('child_added');
      currentReactionsRef = null;
    }
    
    const DB = FirebaseSync.getDb();
    if (!DB) return;
    
    currentReactionsRef = DB.ref('matches/current/' + matchId + '/reactions');
    
    // Listen for new child added
    currentReactionsRef.on('child_added', (snapshot) => {
      const reaction = snapshot.val();
      // Only show reactions added in last 8 seconds to prevent old ghost reactions on page load
      if (reaction && reaction.type && (Date.now() - reaction.timestamp < 8000)) {
        spawnFloatingEmoji(reaction.type);
      }
    });
  }

  function sendReaction(emoji) {
    const matchState = LocalMode.getState() || TournamentMode.getState();
    if (!matchState || !matchState.id) return;
    
    const DB = FirebaseSync.getDb();
    if (!DB) return;
    
    const ref = DB.ref('matches/current/' + matchState.id + '/reactions').push();
    ref.set({
      type: emoji,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    setTimeout(() => {
      ref.remove();
    }, 4000);
  }

  function spawnFloatingEmoji(emoji) {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    const container = activeScreen.querySelector('.pitch-container');
    if (!container) return;
    
    const emojiEl = document.createElement('div');
    emojiEl.className = 'floating-emoji';
    emojiEl.textContent = emoji;
    
    // Spawn between 15% and 85% width
    const startX = 15 + Math.random() * 70;
    emojiEl.style.left = startX + '%';
    
    const duration = 2.8 + Math.random() * 1.2;
    emojiEl.style.animationDuration = duration + 's';
    
    container.appendChild(emojiEl);
    
    setTimeout(() => {
      emojiEl.remove();
    }, duration * 1000);
  }

  function openHistoryDetail(matchId) {
    const match = historyMatches.find(m => m.id === matchId);
    if (!match) return;

    const modal = document.getElementById('history-detail-modal');
    if (!modal) return;

    document.getElementById('hist-modal-title').textContent = `${match.teamA} vs ${match.teamB}`;
    
    const dateStr = new Date(match.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const modeLabel = match.fullDetails?.mode === 'tournament' ? '🏆 Tournament Match' : '🏠 Local Match';
    const tournamentStr = match.fullDetails?.tournamentName ? ` - ${match.fullDetails.tournamentName}` : '';
    document.getElementById('hist-modal-meta').textContent = `${modeLabel}${tournamentStr} • ${dateStr}`;

    const content = document.getElementById('hist-modal-content');
    content.innerHTML = '';

    if (match.fullDetails) {
      const fd = match.fullDetails;
      let html = '';
      
      if (fd.winMessage) {
        html += `<div class="winner-msg-banner">🏆 ${escapeHTML(fd.winMessage)}</div>`;
      }
      
      fd.teams.forEach((t, tIdx) => {
        const battingColor = t.color || (tIdx === 0 ? '#3b82f6' : '#ef4444');
        const teamOvers = Math.floor(t.balls / 6);
        const teamBalls = t.balls % 6;
        
        html += `
          <div class="hist-team-section">
            <div class="hist-team-header">
              <span class="hist-team-title" style="color: ${battingColor}">
                <span>${t.emblem || '🏏'}</span>
                <strong>${escapeHTML(t.name)}</strong>
              </span>
              <span class="hist-team-score">${t.runs}/${t.wickets} <span style="font-size:0.72rem; font-weight:500; color:var(--text-muted);">(${teamOvers}.${teamBalls} Ov)</span></span>
            </div>
        `;
        
        if (t.captain) {
          html += `<div class="hist-team-captain">Captain: <strong>${escapeHTML(t.captain)}</strong></div>`;
        }
        
        if (t.overSummaries && t.overSummaries.length > 0) {
          html += `
            <div class="hist-overs-title">Completed Overs</div>
            <div class="hist-overs-list">
          `;
          t.overSummaries.forEach((over, oIdx) => {
            let overRuns = 0;
            const ballsHtml = over.map(ball => {
              if (ball.label !== 'W') {
                if (ball.label.startsWith('WD') || ball.label.startsWith('NB')) {
                  const parts = ball.label.split('+');
                  overRuns += 1 + (parts.length > 1 ? parseInt(parts[1]) : 0);
                } else {
                  const r = parseInt(ball.label);
                  if (!isNaN(r)) overRuns += r;
                }
              }
              return `<span class="mini-ball ${ball.class || ''}">${escapeHTML(ball.label)}</span>`;
            }).join('');
            
            html += `
              <div class="hist-over-row">
                <span class="hist-over-num">Over ${oIdx + 1}</span>
                <div class="hist-over-balls">${ballsHtml}</div>
                <span class="recent-over-runs" style="margin-left:auto;">${overRuns}R</span>
              </div>
            `;
          });
          html += `</div>`;
        } else {
          html += `<div style="font-size:0.72rem; color:var(--text-muted); font-style:italic;">No completed overs.</div>`;
        }

        if (t.players && t.players.length > 0) {
          html += `
            <div class="hist-squad-section" style="margin-top: 10px; border-top:1px dashed var(--border-color); padding-top:8px;">
              <div class="hist-squad-title">Squad List</div>
              <div class="hist-squad-list">${escapeHTML(t.players.join(', '))}</div>
            </div>
          `;
        }

        html += `</div>`;
      });
      
      content.innerHTML = html;
    } else {
      content.innerHTML = `
        <div class="hist-team-section">
          <div style="font-size: 0.85rem; line-height: 1.6;">
            <strong>${escapeHTML(match.teamA)}:</strong> ${match.runsA}/${match.wicketsA}<br>
            <strong>${escapeHTML(match.teamB)}:</strong> ${match.runsB}/${match.wicketsB}<br>
            <strong>Match Winner:</strong> ${escapeHTML(match.winner)}<br>
            <strong>Match overs configured:</strong> ${match.overs} overs<br>
            <p style="font-size:0.72rem; color:var(--text-muted); font-style:italic; margin-top:8px;">
              Note: Full scorecard and ball-by-ball summaries are only available for matches played after this update.
            </p>
          </div>
        </div>
      `;
    }

    modal.classList.add('active');
  }

  return { navigate, showCinematicIntro, showToast, updateCharts, initReactions, destroyCharts };
})();
