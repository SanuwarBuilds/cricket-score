/* ============================
   Lightweight Event & Win Animations
   ============================ */

const Animations = (() => {
  const overlay = () => document.getElementById('animation-overlay');
  const content = () => document.getElementById('animation-content');

  const events = {
    four:   { text: 'FOUR!',    sub: '4 runs',          cssClass: 'four-text' },
    six:    { text: 'SIX!',     sub: '6 runs — Maximum!', cssClass: 'six-text' },
    out:    { text: 'OUT!',     sub: 'Wicket falls',     cssClass: 'out-text' },
    wide:   { text: 'WIDE',     sub: '+1 run',           cssClass: 'wide-text' },
    noball: { text: 'NO BALL',  sub: '+1 run',           cssClass: 'noball-text' }
  };

  let animTimeout = null;
  let fireworkRAF  = null;

  /* ───────────────────────────────────────────────
     Ball / Delivery Event Animation (unchanged API)
  ─────────────────────────────────────────────── */
  function show(type) {
    const cfg = events[type];
    if (!cfg) return;
    const ol = overlay();
    const ct = content();
    if (!ol || !ct) return;
    if (animTimeout) { clearTimeout(animTimeout); animTimeout = null; }
    ol.classList.remove('active');
    void ol.offsetWidth;
    ct.innerHTML = `
      <div class="event-text ${cfg.cssClass}">${cfg.text}</div>
      <div class="event-sub">${cfg.sub}</div>
    `;
    ol.classList.add('active');
    animTimeout = setTimeout(() => {
      ol.classList.remove('active');
      animTimeout = null;
    }, 1100);
  }

  /* ───────────────────────────────────────────────
     MAIN WIN CELEBRATION
  ─────────────────────────────────────────────── */
  function celebrate() {
    _spawnConfetti();
    _startFireworks();
    _animateTeamName();
    _showCongrats();
  }

  /* ── 1. Confetti particles ─────────────────────── */
  function _spawnConfetti() {
    const bg = document.getElementById('celebration-bg');
    if (!bg) return;
    bg.innerHTML = '';
    const colors = ['#facc15','#f97316','#ef4444','#a855f7','#22c55e','#00e5ff','#ec4899','#fff'];
    const count  = 70;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'celebration-particle';
      const w = 4 + Math.random() * 10;
      p.style.cssText = [
        `left:${Math.random()*100}%`,
        `background:${colors[Math.floor(Math.random()*colors.length)]}`,
        `animation-duration:${2.5 + Math.random()*3}s`,
        `animation-delay:${Math.random()*2}s`,
        `width:${w}px`,
        `height:${w * (Math.random() > 0.5 ? 1 : 2.5)}px`,
        `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
        `opacity:${0.7 + Math.random()*0.3}`
      ].join(';');
      bg.appendChild(p);
    }
  }

  /* ── 2. Canvas Fireworks ───────────────────────── */
  function _startFireworks() {
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) return;

    // size canvas to window
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const particles = [];
    const COLORS  = ['#facc15','#f97316','#ef4444','#a855f7','#22c55e','#00e5ff','#fff','#ec4899'];
    let   launches = 0;
    const MAX_LAUNCHES = 18;

    function newBurst() {
      const x  = 50 + Math.random() * (canvas.width  - 100);
      const y  = 40 + Math.random() * (canvas.height * 0.65);
      const hue = COLORS[Math.floor(Math.random()*COLORS.length)];
      const n = 55 + Math.floor(Math.random() * 30);
      for (let i = 0; i < n; i++) {
        const angle  = (Math.PI * 2 / n) * i + (Math.random() - 0.5) * 0.5;
        const speed  = 2 + Math.random() * 5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color: hue,
          size: 2 + Math.random() * 3,
          decay: 0.013 + Math.random() * 0.012,
          gravity: 0.06
        });
      }
    }

    // stagger launches over time
    const launchTimers = [];
    for (let i = 0; i < MAX_LAUNCHES; i++) {
      launchTimers.push(setTimeout(() => newBurst(), i * 320));
    }

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x     += p.vx;
        p.y     += p.vy;
        p.vy    += p.gravity;
        p.vx    *= 0.97;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      fireworkRAF = requestAnimationFrame(loop);
    }

    // stop after 8 s
    fireworkRAF = requestAnimationFrame(loop);
    setTimeout(() => {
      cancelAnimationFrame(fireworkRAF);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      launchTimers.forEach(clearTimeout);
    }, 8000);
  }

  /* ── 3. Letter-by-letter team name animation ───── */
  function _animateTeamName() {
    const el = document.getElementById('winner-team-name');
    if (!el) return;

    const teamName = el.dataset.team || el.textContent.trim();
    el.innerHTML   = '';
    el.dataset.team = teamName;

    const letters = teamName.split('');
    letters.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className   = 'letter-drop';
      span.textContent = ch === ' ' ? '\u00A0' : ch;   // preserve spaces
      span.style.animationDelay = (0.08 * i) + 's';
      el.appendChild(span);
    });
  }

  /* ── 4. Congratulations text ───────────────────── */
  function _showCongrats() {
    const el = document.getElementById('congrats-msg');
    if (!el) return;
    el.style.opacity   = '0';
    el.style.transform = 'scale(0.7)';
    // delay until after letters finish
    const teamEl   = document.getElementById('winner-team-name');
    const letters  = teamEl ? teamEl.dataset.team?.length || 6 : 6;
    const delay    = 80 * letters + 600;
    setTimeout(() => {
      el.style.transition = 'opacity 0.7s ease, transform 0.7s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.opacity    = '1';
      el.style.transform  = 'scale(1)';
    }, delay);
  }

  /* ───────────────────────────────────────────────
     Pitch Runner Animation (unchanged)
  ─────────────────────────────────────────────── */
  function playPitchAnimation(runs, modePrefix) {
    const runnerA    = document.getElementById(modePrefix + '-runner-a');
    const runnerB    = document.getElementById(modePrefix + '-runner-b');
    const eventOverlay = document.getElementById(modePrefix + '-pitch-event');
    const ball = document.getElementById(modePrefix + '-pitch-ball');
    const bowler = document.getElementById(modePrefix + '-bowler-avatar');
    const leftStumps = document.querySelector('#' + modePrefix + '-pitch-container .left-stumps');

    if (!runnerA || !runnerB || !eventOverlay) return;

    eventOverlay.className = 'pitch-event-overlay';
    eventOverlay.innerHTML = '';

    // Wicket (Out) Animation: Stumps LED flashing and ball deflection
    if (runs === 'out') {
      if (leftStumps) {
        leftStumps.classList.remove('led-glow');
        void leftStumps.offsetWidth;
        leftStumps.classList.add('led-glow');
        setTimeout(() => leftStumps.classList.remove('led-glow'), 2500);
      }
      
      if (bowler) {
        bowler.classList.remove('is-bowling');
        void bowler.offsetWidth;
        bowler.classList.add('is-bowling');
        setTimeout(() => bowler.classList.remove('is-bowling'), 1100);
      }

      if (ball) {
        ball.style.display = 'block';
        ball.style.right = '12%';
        ball.style.left = 'auto';
        ball.style.top = '48%';
        ball.style.transform = 'scale(1)';
        ball.style.transition = 'none';
        
        setTimeout(() => {
          ball.style.transition = 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.4s ease-out';
          ball.style.left = '15%'; // hits stumps
          ball.style.top = '50%';
          
          setTimeout(() => {
            ball.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
            ball.style.left = '9%';
            ball.style.top = '32%'; // deflecting up
            setTimeout(() => { ball.style.display = 'none'; }, 300);
          }, 400);
        }, 400);
      }
      return;
    }

    // Dot ball animation (bowler to batsman to keeper)
    if (runs === 0 || runs === 'dot') {
      if (bowler) {
        bowler.classList.remove('is-bowling');
        void bowler.offsetWidth;
        bowler.classList.add('is-bowling');
        setTimeout(() => bowler.classList.remove('is-bowling'), 1100);
      }

      if (ball) {
        ball.style.display = 'block';
        ball.style.right = '12%';
        ball.style.left = 'auto';
        ball.style.top = '48%';
        ball.style.transform = 'scale(1)';
        ball.style.transition = 'none';
        
        setTimeout(() => {
          ball.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          ball.style.left = '18%'; // batsman crease
          
          setTimeout(() => {
            ball.style.transition = 'left 0.25s linear';
            ball.style.left = '6%'; // keeper hands
            setTimeout(() => { ball.style.display = 'none'; }, 250);
          }, 450);
        }, 400);
      }
      return;
    }

    // Boundary (4 or 6) animations
    if (runs === 4 || runs === 6) {
      eventOverlay.innerHTML = runs === 4 ? 'FOUR' : 'SIX';
      eventOverlay.classList.add(runs === 4 ? 'show-four' : 'show-six');
      
      if (bowler) {
        bowler.classList.remove('is-bowling');
        void bowler.offsetWidth;
        bowler.classList.add('is-bowling');
        setTimeout(() => bowler.classList.remove('is-bowling'), 1100);
      }
      
      if (ball) {
        ball.style.display = 'block';
        ball.style.right = '12%';
        ball.style.left = 'auto';
        ball.style.top = '48%';
        ball.style.transform = 'scale(1)';
        ball.style.transition = 'none';
        
        setTimeout(() => {
          ball.style.transition = 'left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.35s ease-out';
          ball.style.left = '18%';
          
          setTimeout(() => {
            ball.style.transition = 'left 0.4s ease-in, top 0.4s cubic-bezier(0.1, 0.8, 0.3, 1), transform 0.4s ease-out';
            ball.style.left = '-100px';
            ball.style.top = runs === 6 ? '-100px' : '120px';
            ball.style.transform = 'scale(1.8)';
            setTimeout(() => { ball.style.display = 'none'; }, 400);
          }, 350);
        }, 400);
      }
      return;
    }

    // Normal runs (1-3)
    if (typeof runs === 'number' && runs >= 1 && runs <= 3) {
      if (bowler) {
        bowler.classList.remove('is-bowling');
        void bowler.offsetWidth;
        bowler.classList.add('is-bowling');
        setTimeout(() => bowler.classList.remove('is-bowling'), 1100);
      }

      if (ball) {
        ball.style.display = 'block';
        ball.style.right = '12%';
        ball.style.left = 'auto';
        ball.style.top = '48%';
        ball.style.transform = 'scale(1)';
        ball.style.transition = 'none';
        
        setTimeout(() => {
          ball.style.transition = 'left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          ball.style.left = '18%';
          
          setTimeout(() => {
            ball.style.transition = 'left 0.6s ease-out, top 0.6s ease-out, transform 0.6s ease';
            ball.style.left = '45%';
            ball.style.top = '10%';
            ball.style.transform = 'scale(0.6)';
            setTimeout(() => { ball.style.display = 'none'; }, 600);
          }, 350);
        }, 400);
      }

      runnerA.classList.add('is-running');
      runnerB.classList.add('is-running');
      if (!runnerA.dataset.pos) runnerA.dataset.pos = 'left';
      if (!runnerB.dataset.pos) runnerB.dataset.pos = 'right';

      const swapOnce = () => {
        if (runnerA.dataset.pos === 'left') { runnerA.dataset.pos = 'right'; runnerA.style.left = '85%'; runnerA.dataset.dir = 'right'; }
        else                                { runnerA.dataset.pos = 'left';  runnerA.style.left = '5%';  runnerA.dataset.dir = 'left'; }
        if (runnerB.dataset.pos === 'right') { runnerB.dataset.pos = 'left';  runnerB.style.left = '5%';  runnerB.dataset.dir = 'left'; }
        else                                 { runnerB.dataset.pos = 'right'; runnerB.style.left = '85%'; runnerB.dataset.dir = 'right'; }
      };

      swapOnce();
      if (runs > 1) setTimeout(() => swapOnce(), 1100);
      if (runs > 2) setTimeout(() => swapOnce(), 2200);

      setTimeout(() => {
        runnerA.classList.remove('is-running');
        runnerB.classList.remove('is-running');
        runnerA.dataset.dir = runnerA.dataset.pos === 'left' ? 'right' : 'left';
        runnerB.dataset.dir = runnerB.dataset.pos === 'left' ? 'right' : 'left';
      }, runs * 1100);
    }
  }

  return { show, celebrate, playPitchAnimation };
})();
