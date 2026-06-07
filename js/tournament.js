/* ============================
   Tournament Score Mode Controller
   ============================ */

const TournamentMode = (() => {
  let matchState = null;
  let isAuthenticated = false;
  let matchListener = null;

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
   * Initialize tournament setup
   */
  function initSetup() {
    const playersInput = el('tournament-players');
    const info = el('tournament-players-info');
    const teamAInput = el('tournament-teamA');
    const teamBInput = el('tournament-teamB');
    const batFirstSelect = el('tournament-bat-first');

    const updateBatFirstOptions = () => {
      if (!batFirstSelect) return;
      const tA = teamAInput?.value.trim() || 'Team A';
      const tB = teamBInput?.value.trim() || 'Team B';
      batFirstSelect.options[0].text = tA;
      batFirstSelect.options[1].text = tB;
    };

    if (teamAInput) teamAInput.addEventListener('input', updateBatFirstOptions);
    if (teamBInput) teamBInput.addEventListener('input', updateBatFirstOptions);

    if (playersInput) {
      playersInput.addEventListener('input', () => {
        const n = parseInt(playersInput.value);
        if (n >= 2) {
          info.textContent = `Total Wickets = ${n - 1} (Players - 1)`;
          renderPlayerNameInputs(n);
        } else {
          info.textContent = '';
          el('tournament-player-names-section').innerHTML = '';
        }
      });
    }

    const form = el('tournament-setup-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        startMatch();
      });
    }
  }

  /**
   * Render player name inputs dynamically
   */
  function renderPlayerNameInputs(count) {
    const section = el('tournament-player-names-section');
    if (!section) return;

    const teamAName = el('tournament-teamA').value.trim() || 'Team A';
    const teamBName = el('tournament-teamB').value.trim() || 'Team B';

    let html = '';

    // Team A Players
    html += `<div class="player-names-group"><h4>${teamAName} Players</h4><div class="player-inputs">`;
    for (let i = 1; i <= count; i++) {
      html += `<input type="text" class="playerA-input" data-index="${i}" placeholder="Player ${i}" />`;
    }
    html += `</div></div>`;

    // Team B Players
    html += `<div class="player-names-group"><h4>${teamBName} Players</h4><div class="player-inputs">`;
    for (let i = 1; i <= count; i++) {
      html += `<input type="text" class="playerB-input" data-index="${i}" placeholder="Player ${i}" />`;
    }
    html += `</div></div>`;

    section.innerHTML = html;
  }

  /**
   * Start a tournament match
   */
  async function startMatch() {
    const tournamentName = el('tournament-name').value.trim() || 'Tournament';
    const teamA = el('tournament-teamA').value.trim() || 'Team A';
    const teamB = el('tournament-teamB').value.trim() || 'Team B';
    const captainA = el('tournament-captainA').value.trim() || '';
    const captainB = el('tournament-captainB').value.trim() || '';
    const overs = parseInt(el('tournament-overs').value) || 10;
    const players = parseInt(el('tournament-players').value) || 11;
    const hostPassword = el('tournament-host-password').value.trim();
    const hostPasswordHash = await hashSecret(hostPassword);

    // Gather player names
    const playersA = [];
    const playersB = [];
    document.querySelectorAll('.playerA-input').forEach(inp => {
      playersA.push(inp.value.trim() || `Player ${inp.dataset.index}`);
    });
    document.querySelectorAll('.playerB-input').forEach(inp => {
      playersB.push(inp.value.trim() || `Player ${inp.dataset.index}`);
    });
    const colorA = el('tournament-colorA').value;
    const logoA = el('tournament-logoA').value;
    const colorB = el('tournament-colorB').value;
    const logoB = el('tournament-logoB').value;
    const batFirst = parseInt(el('tournament-bat-first').value) || 0;

    matchState = CricketEngine.createMatch({
      mode: 'tournament',
      teamA, teamB,
      captainA, captainB,
      colorA, logoA,
      colorB, logoB,
      totalOvers: overs,
      playersPerTeam: players,
      playersA, playersB,
      tournamentName,
      batFirst: batFirst,
      hostPasswordHash: hostPasswordHash,
      matchCode: createMatchCode(),
      // Tournament always counts Wide & NoBall runs (+1 each, no pending mode)
      wideRunEnabled: true,
      noBallRunEnabled: true
    });

    // Upload instantly to Firebase so viewers see it on the Home Screen immediately
    const synced = await FirebaseSync.syncState(matchState);
    if (!synced) {
      App.showToast('Live sync blocked. Update Firebase rules to show this match on other devices.', 6000);
    }

    isAuthenticated = true; // Auto-authenticate the host creator
    updateAuthBanner();
    AI.setLastSpokenText('');
    updateScoreboard();
    renderPlayerList();
    
    // Clear old celebration
    const bg = document.getElementById('celebration-bg');
    if (bg) bg.innerHTML = '';

    App.navigate('tournament-match');

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
             Animations.playPitchAnimation(runs, 'tournament');
          }
        }
        // Preserve local history (since it's not synced from Firebase)
        const localHistory = matchState && matchState.history ? matchState.history : [];
        matchState = data;
        matchState.history = localHistory;
        updateScoreboard();
        renderPlayerList();
        if (data.isMatchOver) {
          showMatchEnd();
        }
      }
    };

    // Start listening for real-time updates from Firebase
    FirebaseSync.listenMatch(matchState.id, matchListener);
    
    // Initialize reactions
    App.initReactions(matchState.id);
    App.navigate('tournament-match');
  }

  /**
   * Join an active live match as a viewer
   */
  function joinLiveMatch(data) {
    matchState = data;
    isAuthenticated = false;
    updateAuthBanner();
    AI.setLastSpokenText(data ? data.aiCommentary : '');
    updateScoreboard();
    renderPlayerList();
    
    // Clear old celebration
    const bg = el('celebration-bg');
    if (bg) bg.innerHTML = '';
    
    App.navigate('tournament-match');
    
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
             Animations.playPitchAnimation(runs, 'tournament');
          }
        }
        // Preserve local history
        const localHistory = matchState && matchState.history ? matchState.history : [];
        matchState = updatedData;
        matchState.history = localHistory;
        updateScoreboard();
        renderPlayerList();
        if (updatedData.isMatchOver) {
          showMatchEnd();
        }
      }
    };
    FirebaseSync.listenMatch(matchState.id, matchListener);
  }

  /**
   * Handle scoring action
   */
  function handleAction(action) {
    if (!matchState || matchState.isMatchOver) return;

    let animType = null;

    switch (action) {
      case 'dot':  CricketEngine.addRuns(matchState, 0); Animations.playPitchAnimation(0, 'tournament'); break;
      case '1':    CricketEngine.addRuns(matchState, 1); Animations.playPitchAnimation(1, 'tournament'); break;
      case '2':    CricketEngine.addRuns(matchState, 2); Animations.playPitchAnimation(2, 'tournament'); break;
      case '3':    CricketEngine.addRuns(matchState, 3); Animations.playPitchAnimation(3, 'tournament'); break;
      case '4':    CricketEngine.addRuns(matchState, 4); Animations.playPitchAnimation(4, 'tournament'); animType = 'four'; break;
      case '5':    CricketEngine.addRuns(matchState, 5); break;
      case '6':    CricketEngine.addRuns(matchState, 6); Animations.playPitchAnimation(6, 'tournament'); animType = 'six'; break;
      case 'wide': CricketEngine.addWide(matchState, 0); animType = 'wide'; break;
      case 'noball': CricketEngine.addNoBall(matchState, 0); animType = 'noball'; break;
      case 'out':  CricketEngine.addWicket(matchState); Animations.playPitchAnimation('out', 'tournament'); animType = 'out'; break;
      case 'extrarun': CricketEngine.addExtraRun(matchState); break;
      case 'undo': 
        if (CricketEngine.undo(matchState)) {
          // Trigger basic animation reflow to indicate an update happened
          const runsEl = el('tournament-runs');
          if (runsEl) {
            runsEl.classList.remove('animate');
            void runsEl.offsetWidth;
            runsEl.classList.add('animate');
          }
        }
        break;
      default: return;
    }

    if (animType) Animations.show(animType);

    const runsEl = el('tournament-runs');
    if (runsEl) {
      runsEl.classList.remove('animate');
      void runsEl.offsetWidth;
      runsEl.classList.add('animate');
    }

    updateScoreboard();

    if (isAuthenticated) {
      if (animType) {
        matchState.lastEvent = { type: animType, timestamp: Date.now() };
      }
      FirebaseSync.syncState(matchState);

      if (action !== 'undo') {
        AI.generateCommentary(matchState, 'tournament');
      }

      if (matchState.isMatchOver && !matchState.historySaved) {
        matchState.historySaved = true;
        FirebaseSync.saveMatchHistory(matchState);
      }
    }

    if (matchState.isMatchOver) {
      setTimeout(() => showMatchEnd(), 1200);
    }
  }

  /**
   * Update scoreboard
   */
  function updateScoreboard() {
    if (!matchState) return;

    const team = CricketEngine.getBattingTeam(matchState);
    const bowlingTeam = CricketEngine.getBowlingTeam(matchState);
    const innings = matchState.currentInnings;

    // Tournament title
    el('tournament-display-name').textContent = matchState.tournamentName || 'Tournament';

    // Team badges
    el('tournament-sb-teamA').textContent = matchState.teams[0].name;
    el('tournament-sb-teamB').textContent = matchState.teams[1].name;
    el('tournament-sb-captainA').textContent = matchState.teams[0].captain ? `C: ${matchState.teams[0].captain}` : '';
    el('tournament-sb-captainB').textContent = matchState.teams[1].captain ? `C: ${matchState.teams[1].captain}` : '';

    const emblemA = el('tournament-emblem-teamA');
    const emblemB = el('tournament-emblem-teamB');
    if (emblemA) emblemA.textContent = matchState.teams[0].emblem || '🦁';
    if (emblemB) emblemB.textContent = matchState.teams[1].emblem || '🐯';

    // Badge borders and batting indicators
    const badgeA = el('tournament-teamA-badge');
    const badgeB = el('tournament-teamB-badge');
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

    // Style runners with batting team colors
    const runnerA = el('tournament-runner-a');
    const runnerB = el('tournament-runner-b');
    [runnerA, runnerB].forEach(runner => {
      if (runner) {
        runner.querySelectorAll('.p-head, .p-cap, .p-torso, .p-arm').forEach(part => {
          part.style.backgroundColor = team.color || '#3b82f6';
        });
      }
    });

    // Style Bowler, Keeper, and Outfield fielders with bowling team colors
    const fielders = document.querySelectorAll('#tournament-pitch-container .pitch-fielder, #tournament-pitch-container .field-fielder');
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

    el('tournament-innings-label').textContent = innings === 0 ? '1st Innings' : '2nd Innings';

    el('tournament-runs').textContent = team.runs;
    el('tournament-wickets').textContent = team.wickets;
    el('tournament-overs-display').textContent = CricketEngine.getOversDisplay(matchState);
    el('tournament-total-overs').textContent = matchState.totalOvers;

    el('tournament-players-remaining').textContent = CricketEngine.getPlayersRemaining(matchState);
    el('tournament-run-rate').textContent = CricketEngine.getRunRate(matchState);

    const showTarget = innings === 1 && matchState.target !== null;
    el('tournament-target-section').style.display = showTarget ? '' : 'none';
    el('tournament-required-section').style.display = showTarget ? '' : 'none';
    el('tournament-reqrate-section').style.display = showTarget ? '' : 'none';

    if (showTarget) {
      el('tournament-target').textContent = matchState.target;
      const reqRuns = CricketEngine.getRequiredRuns(matchState);
      const remBalls = CricketEngine.getRemainingBalls(matchState);
      el('tournament-required').textContent = `${reqRuns} off ${remBalls}`;
      el('tournament-req-rate').textContent = CricketEngine.getRequiredRate(matchState) || '0.00';
    }

    // Wicket indicator
    updateWicketIndicator('tournament-wicket-indicator', team.wickets, matchState.maxWickets);

    // Current over
    updateCurrentOver('tournament-current-over', team.currentOver);

    // Recent overs
    updateRecentOvers('tournament-recent-overs-container', 'tournament-recent-overs', team.overSummaries);

    // Extras
    const extrasEl = el('tournament-extras');
    if (extrasEl) extrasEl.textContent = matchState.extras || 0;

    // Show/hide extra run button (only for authenticated scorer)
    const extraRunBtn = el('tournament-extra-run-btn');
    if (extraRunBtn) extraRunBtn.style.display = isAuthenticated ? 'block' : 'none';

    // Update Win Probability Predictor
    const winProbSection = el('tournament-win-prob-section');
    const winProbA = el('tournament-win-prob-a');
    const winProbB = el('tournament-win-prob-b');
    const winProbAText = el('tournament-win-prob-a-text');
    const winProbBText = el('tournament-win-prob-b-text');

    if (winProbSection && winProbA && winProbB && winProbAText && winProbBText) {
      const totalBallsBowled = matchState.teams[0].balls + matchState.teams[1].balls;
      if (totalBallsBowled > 0) {
        winProbSection.style.display = 'block';
        const probs = CricketEngine.getWinProbability(matchState);

        const colorA = matchState.teams[0].color || '#3b82f6';
        const colorB = matchState.teams[1].color || '#ef4444';
        winProbSection.style.setProperty('--team-a-color', colorA);
        winProbSection.style.setProperty('--team-b-color', colorB);

        winProbA.style.width = `${probs.teamA}%`;
        winProbB.style.width = `${probs.teamB}%`;

        winProbAText.textContent = `${matchState.teams[0].name}: ${probs.teamA}%`;
        winProbBText.textContent = `${probs.teamB}% :${matchState.teams[1].name}`;

        winProbAText.style.visibility = probs.teamA < 12 ? 'hidden' : 'visible';
        winProbBText.style.visibility = probs.teamB < 12 ? 'hidden' : 'visible';
      } else {
        winProbSection.style.display = 'none';
      }
    }

    // Update AI Commentary display
    const aiCommentarySection = el('tournament-ai-commentary-section');
    const aiCommentaryText = el('tournament-ai-commentary-text');
    if (aiCommentarySection && aiCommentaryText) {
      if (matchState.aiCommentary) {
        aiCommentarySection.style.display = 'block';
        aiCommentaryText.textContent = matchState.aiCommentary;
        const isUndo = matchState.lastEvent && matchState.lastEvent.type === 'undo';
        AI.speakIfEnabled(matchState.aiCommentary, isUndo);
      } else {
        const battingTeam = CricketEngine.getBattingTeam(matchState);
        if (battingTeam.ballHistory && battingTeam.ballHistory.length > 0) {
          aiCommentarySection.style.display = 'block';
          aiCommentaryText.textContent = "Waiting for the next ball...";
        } else {
          aiCommentarySection.style.display = 'none';
        }
      }
    }

    // Draw/update stats charts
    App.updateCharts(matchState, 'tournament');
  }

  function updateWicketIndicator(id, wickets, max) {
    const c = el(id);
    if (!c) return;
    c.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const d = document.createElement('div');
      d.className = 'wicket-dot' + (i < wickets ? ' out' : '');
      c.appendChild(d);
    }
  }

  function updateCurrentOver(id, overBalls) {
    const c = el(id);
    if (!c) return;
    c.innerHTML = '';
    (overBalls || []).forEach(b => {
      const t = document.createElement('span');
      t.className = 'ball-tag ' + (b.class || '');
      t.textContent = b.label;
      c.appendChild(t);
    });
  }

  /**
   * Render recent/previous completed overs
   */
  function updateRecentOvers(containerId, listId, overSummaries) {
    const container = el(containerId);
    const list = el(listId);
    if (!container || !list) return;

    const completedOvers = overSummaries || [];
    if (completedOvers.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    list.innerHTML = '';

    // Show the last 4 completed overs (scrollable if more)
    const recent = completedOvers.slice(-4);
    const startIndex = completedOvers.length - recent.length + 1;

    recent.forEach((over, idx) => {
      const overNum = startIndex + idx;
      let overRuns = 0;
      over.forEach(ball => {
        if (ball.label === 'W') {
          // Wicket (0 runs in summary unless extras)
        } else if (ball.label.startsWith('WD')) {
          const parts = ball.label.split('+');
          const bonus = parts.length > 1 ? parseInt(parts[1]) : 0;
          overRuns += 1 + bonus;
        } else if (ball.label.startsWith('NB')) {
          const parts = ball.label.split('+');
          const bonus = parts.length > 1 ? parseInt(parts[1]) : 0;
          overRuns += 1 + bonus;
        } else {
          const r = parseInt(ball.label);
          if (!isNaN(r)) overRuns += r;
        }
      });

      const overBlock = document.createElement('div');
      overBlock.className = 'recent-over-block';

      const numSpan = document.createElement('span');
      numSpan.className = 'recent-over-number';
      numSpan.textContent = `Ov ${overNum}`;

      const ballsDiv = document.createElement('div');
      ballsDiv.className = 'recent-over-balls';
      over.forEach(ball => {
        const span = document.createElement('span');
        span.className = 'mini-ball ' + (ball.class || '');
        span.textContent = ball.label;
        ballsDiv.appendChild(span);
      });

      const runsSpan = document.createElement('span');
      runsSpan.className = 'recent-over-runs';
      runsSpan.textContent = `${overRuns}R`;

      overBlock.appendChild(numSpan);
      overBlock.appendChild(ballsDiv);
      overBlock.appendChild(runsSpan);

      list.appendChild(overBlock);
    });

    list.scrollLeft = list.scrollWidth;
  }

  /**
   * Render player list on scoreboard
   */
  function renderPlayerList() {
    const section = el('tournament-player-list');
    if (!section || !matchState) return;

    const battingIdx = matchState.currentInnings;
    const battingTeam = matchState.teams[battingIdx];
    const players = battingTeam.players || [];

    if (players.length === 0) {
      section.innerHTML = '';
      return;
    }

    let html = `<h4>${escapeHTML(battingTeam.name)} — Squad</h4><div class="player-list-grid">`;
    players.forEach((p, i) => {
      html += `<div class="player-item"><span class="player-num">${i + 1}.</span> ${escapeHTML(p)}</div>`;
    });
    html += '</div>';
    section.innerHTML = html;
  }

  function showMatchEnd() {
    if (!matchState) return;
    document.getElementById('winner-title').textContent = matchState.winMessage || 'Match Over';

    const teamNameEl = document.getElementById('winner-team-name');
    teamNameEl.textContent  = '';
    teamNameEl.dataset.team = matchState.winner || '';

    const scoresHTML = matchState.teams.map(t => {
      const o = Math.floor(t.balls / 6);
      const b = t.balls % 6;
      const recentOvers = (t.overSummaries || []).slice(-6);
      const firstOverNumber = Math.max(1, (t.overSummaries || []).length - recentOvers.length + 1);
      const overRows = recentOvers.map((over, idx) => {
        const ballsHtml = over.map(ball => `<span class="mini-ball ${ball.class || ''}">${escapeHTML(ball.label)}</span>`).join('');
        return `<div class="scorecard-over"><span>Over ${firstOverNumber + idx}</span><div>${ballsHtml}</div></div>`;
      }).join('');
      return `<div class="final-score-line"><span>${escapeHTML(t.name)}</span> — ${t.runs}/${t.wickets} (${o}.${b} overs)</div>${overRows}`;
    }).join('');
    document.getElementById('final-scores').innerHTML = scoresHTML;

    const congrats = document.getElementById('congrats-msg');
    if (congrats) { congrats.style.opacity = '0'; congrats.style.transform = 'scale(0.7)'; congrats.style.transition = ''; }

    App.navigate('match-end');
    Animations.celebrate();
  }

  function updateAuthBanner() {
    const banner = el('tournament-auth-banner');
    if (!banner) return;
    const container = document.querySelector('#screen-tournament-match .match-container');
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

  async function authenticate(code) {
    const codeHash = await hashSecret(code);
    if (matchState && (codeHash === matchState.hostPasswordHash || code === matchState.hostPassword)) {
      isAuthenticated = true;
      updateAuthBanner();
      if (matchState) FirebaseSync.syncState(matchState);
      return true;
    }
    return false;
  }

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

  function getIsAuthenticated() { return isAuthenticated; }
  function getState() { return matchState; }

  return {
    initSetup, startMatch, joinLiveMatch, handleAction, authenticate, deleteMatch,
    getIsAuthenticated, getState, updateScoreboard, showMatchEnd, updateAuthBanner, renderPlayerList
  };
})();
