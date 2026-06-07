/* ============================
   Cricket Logic Engine
   ============================ */

const CricketEngine = (() => {

  /**
   * Create initial match state
   */
  function createMatch(config) {
    const maxWickets = config.playersPerTeam - 1;
    const batFirst = config.batFirst || 0; // 0 for Team A, 1 for Team B

    // Determine initial teams based on who bats first
    const teamAConfig = batFirst === 0 ? {
      name: config.teamA,
      captain: config.captainA || '',
      players: config.playersA || [],
      color: config.colorA || '#3b82f6',
      emblem: config.logoA || '🦁'
    } : {
      name: config.teamB,
      captain: config.captainB || '',
      players: config.playersB || [],
      color: config.colorB || '#ef4444',
      emblem: config.logoB || '🐯'
    };

    const teamBConfig = batFirst === 0 ? {
      name: config.teamB,
      captain: config.captainB || '',
      players: config.playersB || [],
      color: config.colorB || '#ef4444',
      emblem: config.logoB || '🐯'
    } : {
      name: config.teamA,
      captain: config.captainA || '',
      players: config.playersA || [],
      color: config.colorA || '#3b82f6',
      emblem: config.logoA || '🦁'
    };

    return {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      mode: config.mode || 'local', // 'local' or 'tournament'
      tournamentName: config.tournamentName || '',
      totalOvers: config.totalOvers || 5,
      playersPerTeam: config.playersPerTeam,
      maxWickets: maxWickets,
      currentInnings: 0, // 0 = first innings (team index 0 bats), 1 = second innings
      isMatchOver: false,
      winner: null,
      winMessage: '',
      target: null,
      matchCode: config.matchCode || '',
      // Extra run tracking
      extras: 0,
      // Toggle flags (set from setup screen)
      noBallRunEnabled: config.noBallRunEnabled || false,
      wideRunEnabled: config.wideRunEnabled || false,
      teams: [
        {
          name: teamAConfig.name,
          captain: teamAConfig.captain,
          players: teamAConfig.players,
          color: teamAConfig.color,
          emblem: teamAConfig.emblem,
          runs: 0,
          wickets: 0,
          balls: 0,
          overs: 0,
          ballHistory: [],    // full history
          currentOver: [],    // current over balls
          overSummaries: []   // summary per over
        },
        {
          name: teamBConfig.name,
          captain: teamBConfig.captain,
          players: teamBConfig.players,
          color: teamBConfig.color,
          emblem: teamBConfig.emblem,
          runs: 0,
          wickets: 0,
          balls: 0,
          overs: 0,
          ballHistory: [],
          currentOver: [],
          overSummaries: []
        }
      ],
      // Security
      hostPasswordHash: config.hostPasswordHash || ''
    };
  }

  /**
   * Get current batting team
   */
  function getBattingTeam(state) {
    return state.teams[state.currentInnings];
  }

  /**
   * Get bowling team
   */
  function getBowlingTeam(state) {
    return state.teams[state.currentInnings === 0 ? 1 : 0];
  }

  /**
   * Save strict state deep clone for undo functionality
   */
  function pushHistory(state) {
    if (!state.history) state.history = [];
    // Destructure to omit history from clone object payload
    const { history, ...stateData } = state;
    state.history.push(JSON.parse(JSON.stringify(stateData)));
    if (state.history.length > 5) {
      state.history.shift();
    }
  }

  /**
   * Revert state to last saved point
   */
  function undo(state) {
    if (!state.history || state.history.length === 0) return false;
    const prevState = state.history.pop();
    const historyRef = state.history;
    
    // Clear current fields
    for (let k in state) {
      delete state[k];
    }
    // Re-assign previous state fields
    Object.assign(state, prevState);
    state.history = historyRef;
    
    // Assign a silent event to trigger an update locally, but without celebrating
    state.lastEvent = { type: 'undo', timestamp: Date.now() };
    return true;
  }

  /**
   * Add runs (1-6 or 0 for dot)
   */
  function addRuns(state, runs) {
    if (state.isMatchOver) return state;
    pushHistory(state);
    const team = getBattingTeam(state);
    team.runs += runs;
    team.balls += 1;

    const ballLabel = runs === 0 ? '0' : String(runs);
    let ballClass = '';
    if (runs === 4) ballClass = 'four';
    else if (runs === 6) ballClass = 'six';

    team.currentOver.push({ label: ballLabel, class: ballClass });
    team.ballHistory.push({ label: ballLabel, class: ballClass, type: 'runs', value: runs });

    checkOverComplete(state);
    checkInningsEnd(state);
    checkChaseComplete(state);
    return state;
  }

  /**
   * Add wide — behaviour controlled by wideRunEnabled toggle:
   *   ON  → +1 base run + extraRuns (from pending mode), ball NOT counted
   *   OFF → 0 runs, no state change (animation only via caller)
   */
  function addWide(state, extraRuns) {
    if (state.isMatchOver) return state;
    // Toggle OFF: no score, no history — animation handled by caller
    if (!state.wideRunEnabled) return state;

    pushHistory(state);
    const team = getBattingTeam(state);
    const bonusRuns = extraRuns || 0;
    const totalRuns = 1 + bonusRuns;
    team.runs += totalRuns;
    state.extras = (state.extras || 0) + totalRuns;
    const label = bonusRuns > 0 ? `WD+${bonusRuns}` : 'WD';
    team.currentOver.push({ label, class: 'wide' });
    team.ballHistory.push({ label, class: 'wide', type: 'wide', value: totalRuns });
    checkChaseComplete(state);
    return state;
  }

  /**
   * Add no ball — behaviour controlled by noBallRunEnabled toggle:
   *   ON  → +1 base run + extraRuns (from pending mode), ball NOT counted
   *   OFF → 0 runs, no state change (animation only via caller)
   */
  function addNoBall(state, extraRuns) {
    if (state.isMatchOver) return state;
    // Toggle OFF: no score, no history — animation handled by caller
    if (!state.noBallRunEnabled) return state;

    pushHistory(state);
    const team = getBattingTeam(state);
    const bonusRuns = extraRuns || 0;
    const totalRuns = 1 + bonusRuns;
    team.runs += totalRuns;
    state.extras = (state.extras || 0) + totalRuns;
    const label = bonusRuns > 0 ? `NB+${bonusRuns}` : 'NB';
    team.currentOver.push({ label, class: 'noball' });
    team.ballHistory.push({ label, class: 'noball', type: 'noball', value: totalRuns });
    checkChaseComplete(state);
    return state;
  }

  /**
   * Add +1 extra run — NOT a ball, does NOT affect over/striker
   */
  function addExtraRun(state) {
    if (state.isMatchOver) return state;
    pushHistory(state);
    const team = getBattingTeam(state);
    team.runs += 1;
    state.extras = (state.extras || 0) + 1;
    checkChaseComplete(state);
    return state;
  }

  /**
   * Add wicket — +1 wicket, +1 ball
   */
  function addWicket(state) {
    if (state.isMatchOver) return state;
    pushHistory(state);
    const team = getBattingTeam(state);
    team.wickets += 1;
    team.balls += 1;
    team.currentOver.push({ label: 'W', class: 'wicket' });
    team.ballHistory.push({ label: 'W', class: 'wicket', type: 'out', value: 0 });

    checkOverComplete(state);
    checkInningsEnd(state);
    return state;
  }

  /**
   * Check if over is complete (6 legal balls)
   */
  function checkOverComplete(state) {
    const team = getBattingTeam(state);
    if (team.balls > 0 && team.balls % 6 === 0) {
      team.overs = team.balls / 6;
      // Save over summary
      team.overSummaries.push([...team.currentOver]);
      team.currentOver = [];
    } else {
      team.overs = Math.floor(team.balls / 6);
    }
  }

  /**
   * Check if innings should end
   */
  function checkInningsEnd(state) {
    const team = getBattingTeam(state);
    const totalBalls = state.totalOvers * 6;
    const allOut = team.wickets >= state.maxWickets;
    const oversComplete = team.balls >= totalBalls;

    if (allOut || oversComplete) {
      if (state.currentInnings === 0) {
        // Switch to second innings
        // Save remaining current over
        if (team.currentOver.length > 0) {
          team.overSummaries.push([...team.currentOver]);
          team.currentOver = [];
        }
        state.target = team.runs + 1;
        state.currentInnings = 1;
      } else {
        // Match over — batting team (chasing) lost
        endMatch(state);
      }
    }
  }

  /**
   * Check if chasing team has reached or passed target
   */
  function checkChaseComplete(state) {
    if (state.currentInnings === 1 && state.target !== null) {
      const team = getBattingTeam(state);
      if (team.runs >= state.target) {
        endMatch(state);
      }
    }
  }

  /**
   * End the match and determine winner
   */
  function endMatch(state) {
    state.isMatchOver = true;
    const teamA = state.teams[0];
    const teamB = state.teams[1];

    if (teamB.runs > teamA.runs) {
      const wicketsLeft = state.maxWickets - teamB.wickets;
      state.winner = teamB.name;
      state.winMessage = `${teamB.name} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
    } else if (teamA.runs > teamB.runs) {
      const diff = teamA.runs - teamB.runs;
      state.winner = teamA.name;
      state.winMessage = `${teamA.name} won by ${diff} run${diff !== 1 ? 's' : ''}`;
    } else {
      state.winner = 'Tie';
      state.winMessage = 'Match Tied!';
    }

    // Save remaining current over
    const team = getBattingTeam(state);
    if (team.currentOver.length > 0) {
      team.overSummaries.push([...team.currentOver]);
      team.currentOver = [];
    }
  }

  /**
   * Calculate current run rate
   */
  function getRunRate(state) {
    const team = getBattingTeam(state);
    if (team.balls === 0) return '0.00';
    const overs = team.balls / 6;
    return (team.runs / overs).toFixed(2);
  }

  /**
   * Calculate required run rate
   */
  function getRequiredRate(state) {
    if (state.currentInnings !== 1 || state.target === null) return null;
    const team = getBattingTeam(state);
    const totalBalls = state.totalOvers * 6;
    const remainingBalls = totalBalls - team.balls;
    if (remainingBalls <= 0) return '∞';
    const remainingOvers = remainingBalls / 6;
    const required = state.target - team.runs;
    if (required <= 0) return '0.00';
    return (required / remainingOvers).toFixed(2);
  }

  /**
   * Get remaining balls in innings
   */
  function getRemainingBalls(state) {
    const team = getBattingTeam(state);
    return (state.totalOvers * 6) - team.balls;
  }

  /**
   * Get required runs
   */
  function getRequiredRuns(state) {
    if (state.target === null) return null;
    const team = getBattingTeam(state);
    return Math.max(0, state.target - team.runs);
  }

  /**
   * Get players remaining
   */
  function getPlayersRemaining(state) {
    const team = getBattingTeam(state);
    return state.maxWickets - team.wickets;
  }

  /**
   * Get overs display string (e.g. "4.3")
   */
  function getOversDisplay(state) {
    const team = getBattingTeam(state);
    const fullOvers = Math.floor(team.balls / 6);
    const extraBalls = team.balls % 6;
    return `${fullOvers}.${extraBalls}`;
  }

  /**
   * Calculate Win Probability
   * Returns { teamA: number, teamB: number } (percentages)
   */
  function getWinProbability(state) {
    if (!state || !state.teams) return { teamA: 50, teamB: 50 };

    // If match is over
    if (state.isMatchOver) {
      if (state.winner === 'teamA' || (state.winMessage && state.winMessage.includes(state.teams[0].name))) {
        return { teamA: 100, teamB: 0 };
      }
      if (state.winner === 'teamB' || (state.winMessage && state.winMessage.includes(state.teams[1].name))) {
        return { teamA: 0, teamB: 100 };
      }
      return { teamA: 50, teamB: 50 };
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const getParRate = (overs) => {
      if (overs <= 5) return 8.5;
      if (overs <= 10) return 8.0;
      return 7.5;
    };

    const innings = state.currentInnings;
    const battingIdx = innings; // index of team currently batting (0 or 1)

    const battingTeam = state.teams[battingIdx];
    const maxWickets = Math.max(1, state.maxWickets || 1);
    const totalOvers = Math.max(1, state.totalOvers || 1);
    const totalBalls = totalOvers * 6;
    const parRate = getParRate(totalOvers);
    const parScore = parRate * totalOvers;

    // Standard baseline
    let battingProb = 50;

    if (innings === 0) {
      // 1st innings: estimate projected score against a format-aware par score.
      const ballsBowled = battingTeam.balls;
      if (ballsBowled === 0) {
        return { teamA: 50, teamB: 50 };
      }

      const progress = clamp(ballsBowled / totalBalls, 0, 1);
      const wicketsFallen = battingTeam.wickets;
      const wicketRatio = clamp(wicketsFallen / maxWickets, 0, 1);

      // Early balls are noisy, so project the rest of the innings at par rate.
      const ballsRemaining = Math.max(0, totalBalls - ballsBowled);
      const projectedScore = battingTeam.runs + (parRate * ballsRemaining / 6);
      const wicketPenaltyRuns = wicketRatio * parScore * (0.16 + progress * 0.28);
      const scoreAdvantage = projectedScore - wicketPenaltyRuns - parScore;
      const runImpact = 45 / Math.max(18, parScore);

      battingProb = 50 + scoreAdvantage * runImpact;
    } else {
      // 2nd innings: compare required rate with par and increase pressure near the end.
      const target = state.target;
      if (target === null) return { teamA: 50, teamB: 50 };

      const runsNeeded = Math.max(0, target - battingTeam.runs);
      const ballsRemaining = Math.max(0, totalBalls - battingTeam.balls);
      const wicketsRemaining = Math.max(0, maxWickets - battingTeam.wickets);

      if (runsNeeded === 0) {
        battingProb = 100;
      } else if (ballsRemaining === 0 || wicketsRemaining === 0) {
        battingProb = 0;
      } else {
        const rrr = (runsNeeded / ballsRemaining) * 6;
        const progress = clamp(1 - (ballsRemaining / totalBalls), 0, 1);
        const lostWicketRatio = clamp(battingTeam.wickets / maxWickets, 0, 1);
        const ratePressure = (parRate - rrr) / parRate;
        const pressureMultiplier = 42 * (1 + progress * 1.15);
        const wicketPenalty = lostWicketRatio * 34 * (0.45 + progress * 0.75);

        battingProb = 50 + ratePressure * pressureMultiplier - wicketPenalty;
      }
    }

    // Keep between 1% and 99% unless mathematically settled
    battingProb = Math.max(1, Math.min(99, battingProb));
    battingProb = Math.round(battingProb);

    const bowlingProb = 100 - battingProb;

    // Return mapped to team indexes (0 = Team A, 1 = Team B)
    if (battingIdx === 0) {
      return { teamA: battingProb, teamB: bowlingProb };
    } else {
      return { teamA: bowlingProb, teamB: battingProb };
    }
  }

  return {
    createMatch,
    getBattingTeam,
    getBowlingTeam,
    addRuns,
    addWide,
    addNoBall,
    addWicket,
    addExtraRun,
    getRunRate,
    getRequiredRate,
    getRemainingBalls,
    getRequiredRuns,
    getPlayersRemaining,
    getOversDisplay,
    getWinProbability,
    undo
  };
})();
