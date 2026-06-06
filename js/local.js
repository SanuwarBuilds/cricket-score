/* ============================
   Local Score Mode Controller
   ============================ */

const LocalMode = (() => {
  let matchState = null;
  let isAuthenticated = false;
  let matchListener = null;
  let pendingExtraMode = null; // { type: 'wide' | 'noball' } when toggle ON and waiting for run tap

  // DOM references (lazy)
  const el = (id) => document.getElementById(id);

  async function hashSecret(value) {
    if (!window.crypto?.subtle) return value;
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function createMatchCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  /**
   * Initialize setup form
   */
  function initSetup() {
    const playersInput = el('local-players');
    const info = el('local-players-info');
    const teamAInput = el('local-teamA');
    const teamBInput = el('local-teamB');
    const batFirstSelect = el('local-bat-first');

    if (playersInput) {
      playersInput.addEventListener('input', () => {
        const n = parseInt(playersInput.value);
        if (n >= 2) {
          info.textContent = `Total Wickets = ${n - 1} (Players - 1)`;
        } else {
          info.textContent = '';
        }
      });
    }

    const updateBatFirstOptions = () => {
      if (!batFirstSelect) return;
      const tA = teamAInput.value.trim() || 'Team A';
      const tB = teamBInput.value.trim() || 'Team B';
      batFirstSelect.options[0].text = tA;
      batFirstSelect.options[1].text = tB;
    };

    if (teamAInput) teamAInput.addEventListener('input', updateBatFirstOptions);
    if (teamBInput) teamBInput.addEventListener('input', updateBatFirstOptions);

    const form = el('local-setup-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        startMatch();
      });
    }
  }

  /**
   * Start a new local match
   */
  async function startMatch() {
    const teamA = el('local-teamA').value.trim() || 'Team A';
    const teamB = el('local-teamB').value.trim() || 'Team B';
    const colorA = el('local-colorA').value;
    const logoA = el('local-logoA').value;
    const colorB = el('local-colorB').value;
    const logoB = el('local-logoB').value;
    const overs = parseInt(el('local-overs').value) || 5;
    const players = parseInt(el('local-players').value) || 8;
    const batFirst = parseInt(el('local-bat-first').value) || 0;
    const hostPassword = el('local-host-password').value.trim();
    const hostPasswordHash = await hashSecret(hostPassword);

    const noBallRunEnabled = el('toggle-noball-run') ? el('toggle-noball-run').checked : false;
    const wideRunEnabled = el('toggle-wide-run') ? el('toggle-wide-run').checked : false;

    matchState = CricketEngine.createMatch({
      mode: 'local',
      teamA, teamB,
      colorA, logoA,
      colorB, logoB,
      totalOvers: overs,
      playersPerTeam: players,
      batFirst: batFirst,
      hostPasswordHash: hostPasswordHash,
      matchCode: createMatchCode(),
      noBallRunEnabled: noBallRunEnabled,
      wideRunEnabled: wideRunEnabled
    });

    // Upload instantly to Firebase so viewers see it on the Home Screen immediately
    const synced = await FirebaseSync.syncState(matchState);
    if (!synced) {
      App.showToast('Live sync blocked. Update Firebase rules to show this match on other devices.', 6000);
    }

    isAuthenticated = true; // Auto-authenticate the host creator
    updateAuthBanner();
    updateScoreboard();
    // Clear old celebration
    const bg = document.getElementById('celebration-bg');
    if (bg) bg.innerHTML = '';

    App.navigate('local-match');

    // Clean up previous match listener if any
    if (matchListener) {
      FirebaseSync.removeMatchCallback(matchListener);
    }

    // Create and register new match listener
    matchListener = (data) => {
      if (data) {
        if (data.teams) {
          data.teams.forEach(t => {
            t.ballHistory = t.ballHistory || [];
            t.currentOver = t.currentOver || [];
            t.overSummaries = t.overSummaries || [];
            t.players = t.players || [];
          });
        }
        // Don't overwrite our new match state with an old finished match
        if (data.isMatchOver && matchState && !matchState.isMatchOver) {
          return;
        }
        // Trigger animation for remote events
        if (data.lastEvent && (!matchState || !matchState.lastEvent || matchState.lastEvent.timestamp !== data.lastEvent.timestamp)) {
          const type = data.lastEvent.type;
          Animations.show(type);
          if (type && type.startsWith('run')) {
             const runs = parseInt(type.replace('run',''));
             Animations.playPitchAnimation(runs, 'local');
          }
        }
        // Preserve local history (since it's not synced from Firebase)
        const localHistory = matchState && matchState.history ? matchState.history : [];
        matchState = data;
        matchState.history = localHistory;
        updateScoreboard();
        if (data.isMatchOver) {
          showMatchEnd();
        }
      }
    };

    // Start listening for real-time updates from Firebase
    FirebaseSync.listenMatch(matchState.id, matchListener);
    
    // Initialize reactions for this match
    App.initReactions(matchState.id);
  }

  /**
   * Join an active live match as a viewer
   */
  function joinLiveMatch(data) {
    matchState = data;
    isAuthenticated = false;
    updateAuthBanner();
    updateScoreboard();
    
    // Clear old celebration
    const bg = el('celebration-bg');
    if (bg) bg.innerHTML = '';
    
    App.navigate('local-match');
    
    if (data.isMatchOver) {
      showMatchEnd();
    }

    // Clean up previous match listener if any
    if (matchListener) {
      FirebaseSync.removeMatchCallback(matchListener);
    }

    // Register listener for real-time updates
    matchListener = (updatedData) => {
      if (updatedData) {
        if (updatedData.teams) {
          updatedData.teams.forEach(t => {
            t.ballHistory = t.ballHistory || [];
            t.currentOver = t.currentOver || [];
            t.overSummaries = t.overSummaries || [];
            t.players = t.players || [];
          });
        }
        // Trigger animation for remote events
        if (updatedData.lastEvent && (!matchState || !matchState.lastEvent || matchState.lastEvent.timestamp !== updatedData.lastEvent.timestamp)) {
          const type = updatedData.lastEvent.type;
          Animations.show(type);
          if (type && type.startsWith('run')) {
             const runs = parseInt(type.replace('run',''));
             Animations.playPitchAnimation(runs, 'local');
          }
        }
        // Preserve local history
        const localHistory = matchState && matchState.history ? matchState.history : [];
        matchState = updatedData;
        matchState.history = localHistory;
        updateScoreboard();
        if (updatedData.isMatchOver) {
          showMatchEnd();
        }
      }
    };
    FirebaseSync.listenMatch(matchState.id, matchListener);
    
    // Initialize reactions for this match
    App.initReactions(matchState.id);
    App.navigate('local-match');
  }

  /**
   * Handle scoring action
   */
  function handleAction(action) {
    if (!matchState || matchState.isMatchOver) return;

    let animType = null;

    // If we're in pending extra mode, the next tap of a run button resolves it
    if (pendingExtraMode && ['dot','1','2','3','4','5','6'].includes(action)) {
      const runs = action === 'dot' ? 0 : parseInt(action);
      if (pendingExtraMode.type === 'wide') {
        CricketEngine.addWide(matchState, runs);
        animType = 'wide';
      } else {
        CricketEngine.addNoBall(matchState, runs);
        animType = 'noball';
      }
      pendingExtraMode = null;
      _clearPendingUI();

      if (animType) Animations.show(animType);
      _animateScore();
      updateScoreboard();
      if (isAuthenticated) {
        if (animType) matchState.lastEvent = { type: animType, timestamp: Date.now() };
        FirebaseSync.syncState(matchState);
      }
      if (matchState.isMatchOver) setTimeout(() => showMatchEnd(), 1200);
      return;
    }

    // If a wide/noball arrived while already pending, commit the base first, then re-enter
    if (pendingExtraMode && (action === 'wide' || action === 'noball')) {
      // Commit pending with 0 bonus runs (engine handles full +1 add since toggle is ON here)
      if (pendingExtraMode.type === 'wide') CricketEngine.addWide(matchState, 0);
      else CricketEngine.addNoBall(matchState, 0);
      pendingExtraMode = null;
      _clearPendingUI();
    }

    switch (action) {
      case 'dot':
        CricketEngine.addRuns(matchState, 0);
        Animations.playPitchAnimation(0, 'local');
        break;
      case '1':
        CricketEngine.addRuns(matchState, 1);
        Animations.playPitchAnimation(1, 'local');
        animType = 'run1';
        break;
      case '2':
        CricketEngine.addRuns(matchState, 2);
        Animations.playPitchAnimation(2, 'local');
        animType = 'run2';
        break;
      case '3':
        CricketEngine.addRuns(matchState, 3);
        Animations.playPitchAnimation(3, 'local');
        animType = 'run3';
        break;
      case '4':
        CricketEngine.addRuns(matchState, 4);
        Animations.playPitchAnimation(4, 'local');
        animType = 'four';
        break;
      case '5':
        CricketEngine.addRuns(matchState, 5);
        break;
      case '6':
        CricketEngine.addRuns(matchState, 6);
        Animations.playPitchAnimation(6, 'local');
        animType = 'six';
        break;
      case 'wide':
        if (matchState.wideRunEnabled) {
          // Toggle ON: auto +1 run immediately, no pending mode, no extra run prompt
          CricketEngine.addWide(matchState, 0);
          animType = 'wide';
          break;
        }
        // Toggle OFF: animation only, zero score change
        Animations.show('wide');
        return;
      case 'noball':
        if (matchState.noBallRunEnabled) {
          // Toggle ON: enter pending mode — wait for run button tap for extra runs
          pendingExtraMode = { type: 'noball' };
          _showPendingUI('noball');
          return; // Don't fire yet
        }
        // Toggle OFF: animation only, zero score change
        Animations.show('noball');
        return;
      case 'out':
        // If pending, cancel pending first
        if (pendingExtraMode) {
          if (pendingExtraMode.type === 'wide') CricketEngine.addWide(matchState, 0);
          else CricketEngine.addNoBall(matchState, 0);
          pendingExtraMode = null;
          _clearPendingUI();
        }
        CricketEngine.addWicket(matchState);
        Animations.playPitchAnimation('out', 'local');
        animType = 'out';
        break;
      case 'extrarun':
        CricketEngine.addExtraRun(matchState);
        animType = null;
        break;
      case 'undo':
        pendingExtraMode = null;
        _clearPendingUI();
        if (CricketEngine.undo(matchState)) {
          const runsEl = el('local-runs');
          if (runsEl) {
            runsEl.classList.remove('animate');
            void runsEl.offsetWidth;
            runsEl.classList.add('animate');
          }
        }
        break;
      default:
        return;
    }

    // Show animation
    if (animType) {
      Animations.show(animType);
    }

    _animateScore();
    updateScoreboard();

    // Sync to Firebase if authenticated
    if (isAuthenticated) {
      if (animType) {
        matchState.lastEvent = { type: animType, timestamp: Date.now() };
      }
      FirebaseSync.syncState(matchState);

      if (matchState.isMatchOver && !matchState.historySaved) {
        matchState.historySaved = true;
        FirebaseSync.saveMatchHistory(matchState);
      }
    }

    // Check match over
    if (matchState.isMatchOver) {
      setTimeout(() => showMatchEnd(), 1200);
    }
  }

  function _animateScore() {
    const runsEl = el('local-runs');
    if (runsEl) {
      runsEl.classList.remove('animate');
      void runsEl.offsetWidth;
      runsEl.classList.add('animate');
    }
  }

  function _showPendingUI(type) {
    const label = type === 'wide' ? 'Wide' : 'No Ball';
    const controls = el('local-controls');
    if (!controls) return;
    let hint = controls.querySelector('.pending-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'pending-hint';
      controls.insertBefore(hint, controls.firstChild);
    }
    hint.textContent = `${label} — Tap a run button to add extra runs`;
    hint.style.display = 'block';
    // Highlight run buttons
    controls.querySelectorAll('.run-btn').forEach(btn => btn.classList.add('pending-highlight'));
  }

  function _clearPendingUI() {
    const controls = el('local-controls');
    if (!controls) return;
    const hint = controls.querySelector('.pending-hint');
    if (hint) hint.style.display = 'none';
    controls.querySelectorAll('.run-btn').forEach(btn => btn.classList.remove('pending-highlight'));
  }

  /**
   * Update scoreboard UI
   */
  function updateScoreboard() {
    if (!matchState) return;

    const team = CricketEngine.getBattingTeam(matchState);
    const bowlingTeam = CricketEngine.getBowlingTeam(matchState);
    const innings = matchState.currentInnings;

    // Team badges
    el('local-sb-teamA').textContent = matchState.teams[0].name;
    el('local-sb-teamB').textContent = matchState.teams[1].name;
    
    const emblemA = el('local-emblem-teamA');
    const emblemB = el('local-emblem-teamB');
    if (emblemA) emblemA.textContent = matchState.teams[0].emblem || '🦁';
    if (emblemB) emblemB.textContent = matchState.teams[1].emblem || '🐯';

    // Batting indicator & custom colors
    const badgeA = el('local-teamA-badge');
    const badgeB = el('local-teamB-badge');
    if (badgeA) {
      badgeA.style.borderColor = matchState.teams[0].color || '#3b82f6';
      badgeA.style.setProperty('--batting-glow', matchState.teams[0].color || '#3b82f6');
    }
    if (badgeB) {
      badgeB.style.borderColor = matchState.teams[1].color || '#ef4444';
      badgeB.style.setProperty('--batting-glow', matchState.teams[1].color || '#ef4444');
    }
    badgeA.classList.toggle('batting', innings === 0);
    badgeB.classList.toggle('batting', innings === 1);

    // Apply colors to runners (both batsmen are from the batting team)
    const runnerA = el('local-runner-a');
    const runnerB = el('local-runner-b');
    [runnerA, runnerB].forEach(runner => {
      if (runner) {
        runner.querySelectorAll('.p-head, .p-cap, .p-torso, .p-arm').forEach(part => {
          part.style.backgroundColor = team.color || '#3b82f6';
        });
      }
    });

    // Style Bowler, Keeper, and Outfield fielders with bowling team's color
    const fielders = document.querySelectorAll('#local-pitch-container .pitch-fielder, #local-pitch-container .field-fielder');
    fielders.forEach(fielder => {
      const color = bowlingTeam.color || '#ef4444';
      fielder.style.setProperty('--fielder-color', color);
      if (fielder.classList.contains('pitch-fielder')) {
        fielder.style.filter = `drop-shadow(0 8px 6px rgba(0,0,0,0.5)) drop-shadow(0 0 4px ${color})`;
      } else {
        fielder.style.boxShadow = `0 4px 6px rgba(0,0,0,0.4), 0 0 8px ${color}`;
      }
      fielder.querySelectorAll('.p-head, .p-cap, .p-torso, .p-arm').forEach(part => {
        part.style.backgroundColor = color;
      });
    });

    // Innings label
    el('local-innings-label').textContent = innings === 0 ? '1st Innings' : '2nd Innings';

    // Score
    el('local-runs').textContent = team.runs;
    el('local-wickets').textContent = team.wickets;
    el('local-overs-display').textContent = CricketEngine.getOversDisplay(matchState);
    el('local-total-overs').textContent = matchState.totalOvers;

    // Players remaining
    const remaining = CricketEngine.getPlayersRemaining(matchState);
    el('local-players-remaining').textContent = remaining;

    // Run rate
    el('local-run-rate').textContent = CricketEngine.getRunRate(matchState);

    // Target and required (2nd innings only)
    const showTarget = innings === 1 && matchState.target !== null;
    el('local-target-section').style.display = showTarget ? '' : 'none';
    el('local-required-section').style.display = showTarget ? '' : 'none';
    el('local-reqrate-section').style.display = showTarget ? '' : 'none';

    if (showTarget) {
      el('local-target').textContent = matchState.target;
      const reqRuns = CricketEngine.getRequiredRuns(matchState);
      const remBalls = CricketEngine.getRemainingBalls(matchState);
      el('local-required').textContent = `${reqRuns} off ${remBalls}`;
      el('local-req-rate').textContent = CricketEngine.getRequiredRate(matchState) || '0.00';
    }

    // Wicket indicator
    updateWicketIndicator('local-wicket-indicator', team.wickets, matchState.maxWickets);

    // Current over balls
    updateCurrentOver('local-current-over', team.currentOver);

    // Extras
    const extrasEl = el('local-extras');
    if (extrasEl) extrasEl.textContent = matchState.extras || 0;

    // Show/hide extra run button (only for authenticated scorer)
    const extraRunBtn = el('local-extra-run-btn');
    if (extraRunBtn) extraRunBtn.style.display = isAuthenticated ? 'block' : 'none';

    // Draw/update stats charts
    App.updateCharts(matchState, 'local');
  }

  /**
   * Render wicket indicator dots
   */
  function updateWicketIndicator(containerId, wicketsFallen, maxWickets) {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < maxWickets; i++) {
      const dot = document.createElement('div');
      dot.className = 'wicket-dot' + (i < wicketsFallen ? ' out' : '');
      container.appendChild(dot);
    }
  }

  /**
   * Render current over balls
   */
  function updateCurrentOver(containerId, overBalls) {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = '';
    (overBalls || []).forEach(ball => {
      const tag = document.createElement('span');
      tag.className = 'ball-tag ' + (ball.class || '');
      tag.textContent = ball.label;
      container.appendChild(tag);
    });
  }

  /**
   * Show match end screen
   */
  function showMatchEnd() {
    if (!matchState) return;
    el('winner-title').textContent = matchState.winMessage || 'Match Over';

    // Set data-team so letter-drop animation can read it
    const teamNameEl = el('winner-team-name');
    teamNameEl.textContent = '';
    teamNameEl.dataset.team = matchState.winner || '';

    const scoresHTML = matchState.teams.map(t => {
      const overs = Math.floor(t.balls / 6);
      const balls = t.balls % 6;
      const recentOvers = (t.overSummaries || []).slice(-6);
      const firstOverNumber = Math.max(1, (t.overSummaries || []).length - recentOvers.length + 1);
      const overRows = recentOvers.map((over, idx) => {
        const ballsHtml = over.map(b => `<span class="mini-ball ${b.class || ''}">${escapeHTML(b.label)}</span>`).join('');
        return `<div class="scorecard-over"><span>Over ${firstOverNumber + idx}</span><div>${ballsHtml}</div></div>`;
      }).join('');
      return `<div class="final-score-line"><span>${escapeHTML(t.name)}</span> — ${t.runs}/${t.wickets} (${overs}.${balls} overs)</div>${overRows}`;
    }).join('');
    el('final-scores').innerHTML = scoresHTML;

    // Reset congrats opacity for re-entry
    const congrats = document.getElementById('congrats-msg');
    if (congrats) { congrats.style.opacity = '0'; congrats.style.transform = 'scale(0.7)'; congrats.style.transition = ''; }

    App.navigate('match-end');
    Animations.celebrate();
  }

  /**
   * Update auth banner
   */
  function updateAuthBanner() {
    const banner = el('local-auth-banner');
    if (!banner) return;
    const container = document.querySelector('#screen-local-match .match-container');
    if (container) container.classList.toggle('viewer-mode', !isAuthenticated);
    const icon = banner.querySelector('.auth-corner-icon');
    if (isAuthenticated) {
      banner.classList.add('authenticated');
      if (icon) icon.textContent = '✅';
      banner.title = 'Authenticated';
    } else {
      banner.classList.remove('authenticated');
      if (icon) icon.textContent = '🔒';
      banner.title = 'Authenticate';
    }
  }

  /**
   * Authenticate device
   */
  async function authenticate(code) {
    const codeHash = await hashSecret(code);
    if (matchState && (codeHash === matchState.hostPasswordHash || code === matchState.hostPassword)) {
      isAuthenticated = true;
      updateAuthBanner();
      // Sync current state
      if (matchState) {
        FirebaseSync.syncState(matchState);
      }
      return true;
    }
    return false;
  }

  /**
   * Delete match (clears Firebase and local state)
   */
  async function deleteMatch(code) {
    const codeHash = await hashSecret(code);
    if (matchState && (codeHash === matchState.hostPasswordHash || code === matchState.hostPassword)) {
      if (isAuthenticated) {
        if (matchListener) {
          FirebaseSync.removeMatchCallback(matchListener);
          matchListener = null;
        }
        FirebaseSync.resetMatch(matchState.id);
      }
      matchState = null;
      isAuthenticated = false;
      return true;
    }
    return false;
  }

  /**
   * Check if authenticated
   */
  function getIsAuthenticated() {
    return isAuthenticated;
  }

  /**
   * Get match state
   */
  function getState() {
    return matchState;
  }

  return {
    initSetup,
    startMatch,
    joinLiveMatch,
    handleAction,
    authenticate,
    deleteMatch,
    getIsAuthenticated,
    getState,
    updateScoreboard,
    showMatchEnd,
    updateAuthBanner
  };
})();
