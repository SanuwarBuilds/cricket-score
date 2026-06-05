/* ============================
   Admin Panel — JavaScript
   ============================ */

const AdminPanel = (() => {
  // Firebase config (same as main app)
  const firebaseConfig = {
    apiKey: "AIzaSyDcrIULzcnp4hqj7jL7v9VWtaC0jhIGyNo",
    authDomain: "cricket-score-2dd6e.firebaseapp.com",
    databaseURL: "https://cricket-score-2dd6e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cricket-score-2dd6e",
    storageBucket: "cricket-score-2dd6e.firebasestorage.app",
    messagingSenderId: "346158439568",
    appId: "1:346158439568:web:8df1ee903ed354c597cc15"
  };

  // Client-side hashing only hides credentials from casual source reading.
  // Move this to Firebase Auth + database rules before treating admin as secure.
  const ADMIN_ID_HASH = '5d13c013835a2faa367436b56fd0320c8ed472e65b809c848e5c28badae007a0';
  const ADMIN_PASS_HASH = 'd9e7a14204bcdf7cdb587fa8b21f8c9921ab8829f2da7f367879e01917152aa8';

  let db = null;
  let isLoggedIn = false;
  let matchesMap = {};
  let sessionsMap = {};
  let leafletMap = null;
  let mapMarkers = [];
  let controlMatchId = null;
  let controlMatchState = null;
  let controlListener = null;

  // ===== SHA-256 Hash =====
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ===== Init =====
  function init() {
    // Firebase
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Logout
    document.getElementById('btn-logout').addEventListener('click', logout);

    // Tabs
    document.querySelectorAll('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Control modal close
    document.getElementById('control-modal-close').addEventListener('click', closeControlModal);

    // Control buttons
    document.querySelectorAll('.ctrl-btn').forEach(btn => {
      btn.addEventListener('click', () => handleControlAction(btn.dataset.ctrl));
    });

    document.getElementById('btn-update-limits').addEventListener('click', handleUpdateLimits);
    document.getElementById('ctrl-reset').addEventListener('click', handleResetMatch);
    document.getElementById('ctrl-end').addEventListener('click', handleEndMatch);

    // Save settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

    // Check session
    if (sessionStorage.getItem('admin_token')) {
      isLoggedIn = true;
      showDashboard();
    }

    // Clock
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ===== Login =====
  async function handleLogin(e) {
    e.preventDefault();
    const id = document.getElementById('admin-id').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();
    const errorEl = document.getElementById('login-error');

    if (!id || !pass) {
      errorEl.textContent = 'Please fill in all fields.';
      return;
    }

    const idHash = await sha256(id);
    const passHash = await sha256(pass);

    if (idHash === ADMIN_ID_HASH && passHash === ADMIN_PASS_HASH) {
      isLoggedIn = true;
      sessionStorage.setItem('admin_token', Date.now().toString(36));
      errorEl.textContent = '';
      showDashboard();
    } else {
      errorEl.textContent = 'Invalid credentials. Access denied.';
    }
  }

  function logout() {
    isLoggedIn = false;
    sessionStorage.removeItem('admin_token');
    document.getElementById('admin-dashboard').classList.remove('active');
    document.getElementById('admin-login').classList.add('active');
    // Stop listeners
    if (db) {
      db.ref('matches/current').off();
      db.ref('analytics/sessions').off();
    }
  }

  // ===== Dashboard =====
  function showDashboard() {
    document.getElementById('admin-login').classList.remove('active');
    document.getElementById('admin-dashboard').classList.add('active');
    startListeners();
    loadSettings();
  }

  function startListeners() {
    // Listen for all matches
    db.ref('matches/current').on('value', (snap) => {
      const data = snap.val();
      matchesMap = {};
      if (data) {
        Object.keys(data).forEach(key => {
          const m = data[key];
          if (m && typeof m === 'object' && m.teams) {
            m.id = key;
            matchesMap[key] = m;
          }
        });
      }
      renderMatches();
      updateStats();
    });

    // Listen for sessions
    db.ref('analytics/sessions').on('value', (snap) => {
      const data = snap.val();
      sessionsMap = data || {};
      renderUsers();
      updateStats();
      updateMap();
    });
  }

  // ===== Render Matches =====
  function renderMatches() {
    const container = document.getElementById('admin-matches-list');
    const matches = Object.values(matchesMap);

    if (matches.length === 0) {
      container.innerHTML = '<p class="empty-state">No live matches right now.</p>';
      return;
    }

    let html = '';
    matches.forEach(m => {
      const team = m.teams[m.currentInnings] || m.teams[0];
      const balls = team.balls || 0;
      const overs = Math.floor(balls / 6) + '.' + (balls % 6);
      const modeClass = m.mode === 'tournament' ? 'tournament' : '';
      const modeLabel = m.mode === 'tournament' ? 'Tournament' : 'Local';
      const statusLabel = m.isMatchOver ? '🏁 Finished' : '🟢 Live';

      html += `
        <div class="match-admin-card" data-id="${m.id}">
          <div class="mac-header">
            <span class="mac-mode ${modeClass}">${modeLabel}</span>
            <span class="mac-id">${m.id}</span>
          </div>
          <div class="mac-teams">${m.teams[0].name} vs ${m.teams[1].name}</div>
          <div class="mac-score">
            <span class="mac-runs">${team.runs || 0}</span>
            <span class="mac-wickets">/${team.wickets || 0}</span>
            <span class="mac-overs">(${overs} ov)</span>
          </div>
          <div class="mac-innings">${statusLabel} · ${m.currentInnings === 0 ? '1st Innings' : '2nd Innings'}</div>
          <div class="mac-actions">
            <button class="mac-btn control-btn" onclick="AdminPanel.openControlModal('${m.id}')">⚙️ Control</button>
            <button class="mac-btn delete-btn" onclick="AdminPanel.adminDeleteMatch('${m.id}')">🗑️ Delete</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // ===== Render Users =====
  function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    const sessions = Object.values(sessionsMap);

    if (sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">No active users.</td></tr>';
      return;
    }

    let html = '';
    sessions.forEach(s => {
      const timeAgo = getTimeAgo(s.joinedAt);
      const location = s.city ? `${s.city}, ${s.country}` : (s.lat ? `${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}` : 'Unknown');
      html += `
        <tr>
          <td style="font-family:monospace;font-size:0.75rem;">${(s.sessionId || '').substring(0, 8)}…</td>
          <td>${s.device || 'Unknown'} · ${s.browser || ''}</td>
          <td>${location}</td>
          <td>${s.matchViewed || '—'}</td>
          <td>${timeAgo}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  function getTimeAgo(ts) {
    if (!ts) return '—';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return `${Math.floor(diff/3600)}h ago`;
  }

  // ===== Stats =====
  function updateStats() {
    const matches = Object.values(matchesMap);
    const sessions = Object.values(sessionsMap);
    const liveMatches = matches.filter(m => !m.isMatchOver);

    document.getElementById('stat-active-users').textContent = sessions.length;
    document.getElementById('stat-live-matches').textContent = liveMatches.length;
    document.getElementById('stat-matches-today').textContent = matches.length;

    const locCount = sessions.filter(s => s.lat && s.lng).length;
    document.getElementById('stat-locations').textContent = locCount;
  }

  // ===== Map =====
  function updateMap() {
    if (!leafletMap) {
      try {
        leafletMap = L.map('user-map').setView([20.5937, 78.9629], 4); // India center
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(leafletMap);
      } catch(e) {
        console.warn('Map init failed:', e);
        return;
      }
    }

    // Clear old markers
    mapMarkers.forEach(m => leafletMap.removeLayer(m));
    mapMarkers = [];

    const sessions = Object.values(sessionsMap);
    sessions.forEach(s => {
      if (s.lat && s.lng) {
        const marker = L.marker([s.lat, s.lng])
          .bindPopup(`<b>${s.device || 'User'}</b><br>${s.city || ''} ${s.country || ''}<br>${getTimeAgo(s.joinedAt)}`)
          .addTo(leafletMap);
        mapMarkers.push(marker);
      }
    });
  }

  // ===== Match Control Modal =====
  function openControlModal(matchId) {
    controlMatchId = matchId;
    controlMatchState = matchesMap[matchId];
    if (!controlMatchState) return;

    updateControlModal();

    // Start live listener for this match
    if (controlListener) db.ref('matches/current/' + controlMatchId).off('value', controlListener);
    controlListener = db.ref('matches/current/' + matchId).on('value', (snap) => {
      const d = snap.val();
      if (d) {
        d.id = matchId;
        controlMatchState = d;
        matchesMap[matchId] = d;
        updateControlModal();
      }
    });

    document.getElementById('match-control-modal').style.display = 'flex';
  }

  function updateControlModal() {
    if (!controlMatchState) return;
    const m = controlMatchState;
    const team = m.teams[m.currentInnings] || m.teams[0];
    const balls = team.balls || 0;
    const overs = Math.floor(balls / 6) + '.' + (balls % 6);

    document.getElementById('control-modal-title').textContent = `Match Control — ${m.id.substring(0,8)}`;
    document.getElementById('control-team-a').textContent = m.teams[0].name;
    document.getElementById('control-team-b').textContent = m.teams[1].name;
    document.getElementById('control-score').textContent = `${team.runs || 0}/${team.wickets || 0}`;
    document.getElementById('control-overs').textContent = `(${overs} ov)`;

    if (document.activeElement.id !== 'ctrl-edit-overs') {
      document.getElementById('ctrl-edit-overs').value = m.totalOvers || 5;
    }
    if (document.activeElement.id !== 'ctrl-edit-players') {
      document.getElementById('ctrl-edit-players').value = m.playersPerTeam || 11;
    }
  }

  function closeControlModal() {
    document.getElementById('match-control-modal').style.display = 'none';
    if (controlListener && controlMatchId) {
      db.ref('matches/current/' + controlMatchId).off('value', controlListener);
      controlListener = null;
    }
    controlMatchId = null;
    controlMatchState = null;
  }

  // ===== Admin Match Actions =====
  function handleControlAction(action) {
    if (!controlMatchState || !controlMatchId) return;
    const state = controlMatchState;
    if (state.isMatchOver && action !== 'undo') return;

    switch(action) {
      case '0': CricketEngine.addRuns(state, 0); state.lastEvent = { type: 'run0', timestamp: Date.now() }; break;
      case '1': CricketEngine.addRuns(state, 1); state.lastEvent = { type: 'run1', timestamp: Date.now() }; break;
      case '2': CricketEngine.addRuns(state, 2); state.lastEvent = { type: 'run2', timestamp: Date.now() }; break;
      case '3': CricketEngine.addRuns(state, 3); state.lastEvent = { type: 'run3', timestamp: Date.now() }; break;
      case '4': CricketEngine.addRuns(state, 4); state.lastEvent = { type: 'four', timestamp: Date.now() }; break;
      case '6': CricketEngine.addRuns(state, 6); state.lastEvent = { type: 'six', timestamp: Date.now() }; break;
      case 'wide': CricketEngine.addWide(state, 0); state.lastEvent = { type: 'wide', timestamp: Date.now() }; break;
      case 'noball': CricketEngine.addNoBall(state, 0); state.lastEvent = { type: 'noball', timestamp: Date.now() }; break;
      case 'out': CricketEngine.addWicket(state); state.lastEvent = { type: 'out', timestamp: Date.now() }; break;
      case 'undo': CricketEngine.undo(state); break;
      default: return;
    }

    // Sync to Firebase directly
    if (state.isMatchOver && !state.historySaved) {
      state.historySaved = true;
      saveMatchHistory(state);
    }
    syncControlMatch(state);
  }

  function syncControlMatch(state) {
    if (!db || !state || !state.id) return;
    const syncData = { ...state };
    delete syncData.history;
    db.ref('matches/current/' + state.id).set(syncData);
  }

  function saveMatchHistory(state) {
    if (!db || !state) return;
    const historyData = {
      teamA: state.teams[0]?.name || 'Team A',
      teamB: state.teams[1]?.name || 'Team B',
      runsA: state.teams[0]?.runs || 0,
      wicketsA: state.teams[0]?.wickets || 0,
      runsB: state.teams[1]?.runs || 0,
      wicketsB: state.teams[1]?.wickets || 0,
      overs: state.totalOvers || 5,
      winner: state.winner || 'Unknown',
      date: Date.now()
    };
    db.ref('score/history').push(historyData);
  }

  function handleResetMatch() {
    if (!controlMatchId) return;
    if (!confirm('Are you sure you want to DELETE this match?')) return;
    db.ref('matches/current/' + controlMatchId).remove();
    closeControlModal();
  }

  function handleUpdateLimits() {
    if (!controlMatchState || !controlMatchId) return;
    const newOvers = parseInt(document.getElementById('ctrl-edit-overs').value);
    const newPlayers = parseInt(document.getElementById('ctrl-edit-players').value);
    
    if (newOvers >= 1) controlMatchState.totalOvers = newOvers;
    if (newPlayers >= 2) {
      controlMatchState.playersPerTeam = newPlayers;
      controlMatchState.maxWickets = newPlayers - 1;
    }
    
    syncControlMatch(controlMatchState);
    
    const btn = document.getElementById('btn-update-limits');
    const oldText = btn.textContent;
    btn.textContent = 'Updated!';
    setTimeout(() => { btn.textContent = oldText; }, 1500);
  }

  function handleEndMatch() {
    if (!controlMatchState || !controlMatchId) return;
    if (!confirm('End this match now?')) return;
    controlMatchState.isMatchOver = true;

    const teamA = controlMatchState.teams[0];
    const teamB = controlMatchState.teams[1];
    if (teamB.runs > teamA.runs) {
      controlMatchState.winner = teamB.name;
      controlMatchState.winMessage = `${teamB.name} won`;
    } else if (teamA.runs > teamB.runs) {
      controlMatchState.winner = teamA.name;
      controlMatchState.winMessage = `${teamA.name} won`;
    } else {
      controlMatchState.winner = 'Tie';
      controlMatchState.winMessage = 'Match Tied!';
    }

    syncControlMatch(controlMatchState);
    closeControlModal();
  }

  function adminDeleteMatch(matchId) {
    if (!confirm('Delete this match permanently?')) return;
    db.ref('matches/current/' + matchId).remove();
  }

  // ===== Settings =====
  function loadSettings() {
    db.ref('settings').once('value').then(snap => {
      const s = snap.val();
      if (s) {
        if (s.siteTitle) document.getElementById('setting-title').value = s.siteTitle;
        if (s.defaultOvers) document.getElementById('setting-overs').value = s.defaultOvers;
        if (s.defaultPlayers) document.getElementById('setting-players').value = s.defaultPlayers;
        document.getElementById('setting-animations').checked = s.animationsEnabled !== false;
      }
    });
  }

  function saveSettings() {
    const settings = {
      siteTitle: document.getElementById('setting-title').value.trim() || 'Quick Cricket Score',
      defaultOvers: parseInt(document.getElementById('setting-overs').value) || 5,
      defaultPlayers: parseInt(document.getElementById('setting-players').value) || 11,
      animationsEnabled: document.getElementById('setting-animations').checked
    };

    db.ref('settings').set(settings).then(() => {
      const btn = document.getElementById('btn-save-settings');
      btn.textContent = '✓ Saved!';
      setTimeout(() => { btn.textContent = 'Save Settings'; }, 1500);
    });
  }

  // ===== Tabs =====
  function switchTab(tabId) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    // Init map when switching to map tab
    if (tabId === 'tab-map' && leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }
  }

  // ===== Clock =====
  function updateClock() {
    const now = new Date();
    const str = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const el = document.getElementById('admin-clock');
    if (el) el.textContent = str;
  }

  // Public API
  return {
    init,
    openControlModal,
    adminDeleteMatch
  };
})();

document.addEventListener('DOMContentLoaded', AdminPanel.init);
