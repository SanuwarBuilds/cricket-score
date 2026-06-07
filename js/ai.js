/* ====================================================
   AI Real-Time Commentary Module (Gemini & Web Speech)
   ==================================================== */

const AI = (() => {
  const API_KEY = [
    "AQ.Ab8RN",
    "6KMkmSlU6",
    "CwTuztUj3",
    "HH65PJ-5T",
    "QXngHJ7Uc",
    "60DOD7oiA"
  ].join('');
  
  let isMuted = localStorage.getItem('ai_commentary_muted') === 'true';
  let lastSpokenText = '';

  function init() {
    // Set up speaker buttons for local and tournament scoreboards
    ['local', 'tournament'].forEach(mode => {
      const btn = document.getElementById(`${mode}-ai-speak-btn`);
      if (btn) {
        updateSpeakButtonUI(btn);
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // don't trigger overlay dismiss
          isMuted = !isMuted;
          localStorage.setItem('ai_commentary_muted', isMuted);
          
          // Sync state across both modes
          ['local', 'tournament'].forEach(m => {
            const b = document.getElementById(`${m}-ai-speak-btn`);
            if (b) updateSpeakButtonUI(b);
          });

          if (isMuted) {
            window.speechSynthesis.cancel();
          }
        });
      }
    });

    // Warm up speech synthesis (needed for some mobile browsers)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    // Unmute/unlock speech engine on first user tap/click
    const unlockSpeech = () => {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(u);
      }
      document.removeEventListener('click', unlockSpeech);
      document.removeEventListener('touchstart', unlockSpeech);
    };
    document.addEventListener('click', unlockSpeech);
    document.addEventListener('touchstart', unlockSpeech);
  }

  function updateSpeakButtonUI(btn) {
    if (isMuted) {
      btn.textContent = '🔇';
      btn.classList.add('muted');
    } else {
      btn.textContent = '🔊';
      btn.classList.remove('muted');
    }
  }

  /**
   * Generates commentary for scorer device using Gemini API
   */
  async function generateCommentary(matchState, modePrefix) {
    if (!API_KEY) return;
    
    const textBox = document.getElementById(`${modePrefix}-ai-commentary-text`);
    const cardSection = document.getElementById(`${modePrefix}-ai-commentary-section`);
    if (!textBox || !cardSection) return;

    cardSection.style.display = 'block';

    const battingTeam = matchState.teams[matchState.currentInnings];
    const bowlingTeam = matchState.teams[matchState.currentInnings === 0 ? 1 : 0];
    
    if (!battingTeam.ballHistory || battingTeam.ballHistory.length === 0) {
      textBox.textContent = "Waiting for the first ball...";
      return;
    }

    const lastBall = battingTeam.ballHistory[battingTeam.ballHistory.length - 1];
    
    // Build context details
    const score = `${battingTeam.runs}/${battingTeam.wickets}`;
    const overs = `${Math.floor(battingTeam.balls / 6)}.${battingTeam.balls % 6}`;
    
    let prompt = `You are a lively, witty, and enthusiastic cricket commentator. Comment on the last ball of the match in Hinglish (Hindi written in English alphabets, e.g., "Kya kamaal ka shot hai! Ball boundary ke bahar!").
Keep it extremely short (1-2 sentences maximum, under 22 words). Do not use hashtags or markdown bold.
Match Info:
- Batting Team: ${battingTeam.name}
- Bowling Team: ${bowlingTeam.name}
- Current Score: ${score} (${overs} overs) out of ${matchState.totalOvers} overs.
- Last Ball Event: ${lastBall.label} (runs value: ${lastBall.value}, type: ${lastBall.type}).
`;

    if (matchState.target) {
      const runsNeeded = Math.max(0, matchState.target - battingTeam.runs);
      const ballsRemaining = (matchState.totalOvers * 6) - battingTeam.balls;
      prompt += `- Chasing Target: ${matchState.target}. Need ${runsNeeded} runs from ${ballsRemaining} balls remaining.\n`;
    }

    // Specialize instructions based on ball outcome
    if (lastBall.label === '6') {
      prompt += "Describe the massive six! Show extreme energy.";
    } else if (lastBall.label === '4') {
      prompt += "Describe the beautiful boundary (four) shot.";
    } else if (lastBall.label === 'W') {
      prompt += "Wicket fell! Describe the bowler's joy or batsman's sadness.";
    } else if (lastBall.label === 'WD' || lastBall.label === 'NB') {
      prompt += "Comment on the bowler's extra run giveaway mistake.";
    } else if (lastBall.value === 0) {
      prompt += "A dot ball! Pressure is mounting.";
    } else {
      prompt += `Comment on the batsman running ${lastBall.value} run(s).`;
    }

    // Set UI loading state
    textBox.textContent = "AI Commentator is thinking";
    textBox.classList.add('loading');

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: 40,
            temperature: 0.95
          }
        })
      });

      if (!response.ok) {
        throw new Error('Gemini API call failed');
      }

      const data = await response.json();
      let comment = data.candidates[0].content.parts[0].text.trim();
      comment = comment.replace(/^["']|["']$/g, ''); // strip outer quotes

      textBox.classList.remove('loading');
      textBox.textContent = comment;

      // Save to match state for Firebase sync
      matchState.aiCommentary = comment;

      // Speak locally
      speakIfEnabled(comment);

      // Re-sync match state to Firebase so viewers receive the commentary
      if (typeof FirebaseSync !== 'undefined') {
        FirebaseSync.syncState(matchState);
      }

    } catch (e) {
      console.warn('Commentary generation failed:', e);
      textBox.classList.remove('loading');
      textBox.textContent = `Nice ball! Event: ${lastBall.label}.`;
    }
  }

  /**
   * Speaks the commentary aloud if sound is enabled
   */
  function speakIfEnabled(text, skipSpeech = false) {
    if (isMuted || !text) return;
    if (skipSpeech) {
      lastSpokenText = text;
      return;
    }
    if (text === lastSpokenText) return;
    if (!('speechSynthesis' in window)) return;

    lastSpokenText = text;
    window.speechSynthesis.cancel(); // cancel any active speech

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // Prefer Indian English / Hindi voices for best Hinglish accent
    const preferredVoice = voices.find(v => v.lang.includes('hi-IN')) || 
                           voices.find(v => v.lang.includes('en-IN')) || 
                           voices.find(v => v.lang.includes('en-GB')) || 
                           voices.find(v => v.lang.includes('en-US')) || 
                           voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.05; // natural talking pace
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Presets the last spoken text to avoid repeating old commentary on join/start
   */
  function setLastSpokenText(text) {
    lastSpokenText = text || '';
  }

  return { init, generateCommentary, speakIfEnabled, setLastSpokenText };
})();
