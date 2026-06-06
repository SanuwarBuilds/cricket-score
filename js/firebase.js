/* ============================
   Firebase Sync Module
   ============================ */

const FirebaseSync = (() => {
  const firebaseConfig = {
    apiKey: "AIzaSyDcrIULzcnp4hqj7jL7v9VWtaC0jhIGyNo",
    authDomain: "cricket-score-2dd6e.firebaseapp.com",
    databaseURL: "https://cricket-score-2dd6e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cricket-score-2dd6e",
    storageBucket: "cricket-score-2dd6e.firebasestorage.app",
    messagingSenderId: "346158439568",
    appId: "1:346158439568:web:8df1ee903ed354c597cc15"
  };

  let db = null;
  let activeMatchesRef = null;
  
  // Single match listening
  let currentMatchRef = null;
  let isListeningMatch = false;
  let matchListener = null;
  let matchCallbacks = [];

  // All matches listening
  let isListeningAll = false;
  let allMatchesListener = null;
  let allMatchesCallbacks = [];

  /**
   * Initialize Firebase
   */
  function init() {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.database();
      activeMatchesRef = db.ref('matches/current');
    } catch (e) {
      console.warn('Firebase init failed:', e);
    }
  }

  /**
   * Push match state to Firebase (only authenticated devices should call)
   */
  async function syncState(state) {
    if (!db || !state || !state.id) return false;
    try {
      // Create a lightweight copy to avoid uploading large history array
      const syncData = { ...state };
      delete syncData.history; // Only needed locally on scoring device
      
      await db.ref('matches/current/' + state.id).set(syncData);
      return true;
    } catch (e) {
      console.warn('Firebase sync failed:', e);
      return false;
    }
  }

  /**
   * Push completed match to history
   */
  function saveMatchHistory(state) {
    if (!db || !state) return;
    try {
      const details = JSON.parse(JSON.stringify(state));
      delete details.history; // Remove large undo history array to optimize space
      
      const historyData = {
        teamA: state.teams[0]?.name || 'Team A',
        teamB: state.teams[1]?.name || 'Team B',
        runsA: state.teams[0]?.runs || 0,
        wicketsA: state.teams[0]?.wickets || 0,
        runsB: state.teams[1]?.runs || 0,
        wicketsB: state.teams[1]?.wickets || 0,
        overs: state.totalOvers || 5,
        winner: state.winner || 'Unknown',
        date: Date.now(),
        fullDetails: details
      };
      db.ref('score/history').push(historyData);
      
      // We can also let the live match slowly expire naturally 
      // instead of deleting it instantly so viewers see the end screen.
    } catch (e) {
      console.warn('History save failed:', e);
    }
  }

  /**
   * Listen for real-time updates (allows multiple listeners)
   */
  function listenMatch(matchId, callback) {
    if (!db || !matchId) return;
    
    // Switch to new match if different
    if (currentMatchRef && currentMatchRef.key !== matchId) {
      stopListeningMatch();
    }
    
    currentMatchRef = db.ref('matches/current/' + matchId);
    
    // Add callback to the pool
    if (!matchCallbacks.includes(callback)) {
      matchCallbacks.push(callback);
    }
    
    // Attach Firebase listener if not already active
    if (!isListeningMatch) {
      isListeningMatch = true;
      matchListener = currentMatchRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) Object.assign(data, { id: snapshot.key }); // Ensure ID is present
        matchCallbacks.forEach(cb => cb(data)); // pass data, even if null (deleted)
      });
    }
  }

  /**
   * Listen for all active matches (for home screen)
   */
  function listenAllMatches(callback) {
    if (!activeMatchesRef) return;
    
    if (!allMatchesCallbacks.includes(callback)) {
      allMatchesCallbacks.push(callback);
    }
    
    if (!isListeningAll) {
      isListeningAll = true;
      allMatchesListener = activeMatchesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const matches = [];
        if (data) {
          Object.keys(data).forEach(key => {
            const m = data[key];
            m.id = key;
            matches.push(m);
          });
        }
        allMatchesCallbacks.forEach(cb => cb(matches));
      });
    }
  }

  function removeMatchCallback(callback) {
    matchCallbacks = matchCallbacks.filter(cb => cb !== callback);
    if (matchCallbacks.length === 0 && currentMatchRef && matchListener) {
      currentMatchRef.off('value', matchListener);
      matchListener = null;
      isListeningMatch = false;
    }
  }

  function stopListeningMatch() {
    if (currentMatchRef && matchListener) {
      currentMatchRef.off('value', matchListener);
      matchListener = null;
      isListeningMatch = false;
      matchCallbacks = [];
    }
  }

  function stopListeningAll() {
    if (activeMatchesRef && allMatchesListener) {
      activeMatchesRef.off('value', allMatchesListener);
      allMatchesListener = null;
      isListeningAll = false;
      allMatchesCallbacks = [];
    }
  }

  function resetMatch(matchId) {
    if (!db || !matchId) return;
    try {
      db.ref('matches/current/' + matchId).remove();
    } catch (e) {
      console.warn('Firebase reset failed:', e);
    }
  }

  // ===== Session Tracking (for Admin Analytics) =====
  function trackSession(sessionData) {
    if (!db || !sessionData || !sessionData.sessionId) return;
    try {
      db.ref('analytics/sessions/' + sessionData.sessionId).set(sessionData);
    } catch(e) {
      console.warn('Session track failed:', e);
    }
  }

  function removeSession(sessionId) {
    if (!db || !sessionId) return;
    try {
      db.ref('analytics/sessions/' + sessionId).remove();
    } catch(e) {
      console.warn('Session remove failed:', e);
    }
  }

  function updateSessionMatch(sessionId, matchLabel) {
    if (!db || !sessionId) return;
    try {
      db.ref('analytics/sessions/' + sessionId + '/matchViewed').set(matchLabel);
    } catch(e) {
      console.warn('Session update failed:', e);
    }
  }

  return { 
    init, syncState, getDb: () => db,
    listenMatch, removeMatchCallback, stopListeningMatch, 
    listenAllMatches, stopListeningAll,
    resetMatch,
    trackSession, removeSession, updateSessionMatch,
    saveMatchHistory
  };
})();
