/* ============================
   Lightweight Event & Win Animations
   ============================ */

const Animations = (() => {
  const overlay = () => document.getElementById('animation-overlay');
  const content = () => document.getElementById('animation-content');

  let animTimeout = null;
  let fireworkRAF = null;
  let canvasInterval = null;
  let particleLoopId = null;
  let currentParticles = [];

  // Setup click to dismiss instantly
  document.addEventListener('DOMContentLoaded', () => {
    const ol = overlay();
    if (ol) {
      ol.style.pointerEvents = 'auto'; // allow clicks
      ol.addEventListener('click', () => {
        dismiss();
      });
    }
  });

  /**
   * Dismiss current animation
   */
  function dismiss() {
    const ol = overlay();
    const ct = content();
    if (ol) {
      ol.classList.remove('active');
    }
    if (ct) {
      ct.innerHTML = '';
    }
    
    // Clear timeouts
    if (animTimeout) {
      clearTimeout(animTimeout);
      animTimeout = null;
    }
    if (canvasInterval) {
      clearTimeout(canvasInterval);
      canvasInterval = null;
    }
    if (particleLoopId) {
      cancelAnimationFrame(particleLoopId);
      particleLoopId = null;
    }
    currentParticles = [];
  }

  /**
   * Run particle system loop on Canvas
   */
  function runParticleSystem(canvas, ctx) {
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = currentParticles.length - 1; i >= 0; i--) {
        const p = currentParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;
        
        // Add slow-motion air resistance drag
        p.vx *= 0.982;
        p.vy *= 0.982;
        
        if (p.alpha <= 0) {
          currentParticles.splice(i, 1);
          continue;
        }
        
        ctx.save();
        ctx.globalAlpha = p.alpha;
        
        // Draw glow effect for particles
        if (p.glow) {
          ctx.shadowBlur = p.size * 1.5;
          ctx.shadowColor = p.color;
        }

        ctx.fillStyle = p.color;
        
        if (p.shape === 'star') {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - p.size);
          ctx.lineTo(p.x + p.size/3, p.y - p.size/3);
          ctx.lineTo(p.x + p.size, p.y);
          ctx.lineTo(p.x + p.size/3, p.y + p.size/3);
          ctx.lineTo(p.x, p.y + p.size);
          ctx.lineTo(p.x - p.size/3, p.y + p.size/3);
          ctx.lineTo(p.x - p.size, p.y);
          ctx.lineTo(p.x - p.size/3, p.y - p.size/3);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'splinter') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillRect(-p.size, -p.size/3, p.size * 2, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.restore();
      }
      
      if (currentParticles.length > 0) {
        particleLoopId = requestAnimationFrame(tick);
      }
    }
    
    tick();
  }

  /**
   * Spawn explosion particles
   */
  function spawnExplosion(canvas, x, y, count, type) {
    const colors = {
      six: ['#ffe600', '#ff5e00', '#ff0077', '#a855f7', '#00e5ff'],
      four: ['#00ff66', '#22c55e', '#00e5ff', '#a855f7'],
      out: ['#e0a96d', '#b88b5c', '#916d48', '#ef4444', '#7f1d1d'],
    }[type] || ['#fff'];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + (type === 'out' ? 1.5 : 2.5);
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      if (type === 'out' && (color.startsWith('#ef') || color.startsWith('#7f'))) {
        // Red smoke puff (slow decay, slow float)
        currentParticles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * (speed * 0.4),
          vy: Math.sin(angle) * (speed * 0.4) - 0.6,
          size: Math.random() * 12 + 6,
          color: color,
          alpha: 0.9,
          decay: Math.random() * 0.005 + 0.003,
          gravity: -0.008,
          glow: true,
          shape: 'circle'
        });
      } else {
        // Sparks / Splinters (slow motion gravity and decay)
        currentParticles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * (type === 'out' ? 5 : 6) + 2,
          color: color,
          alpha: 1.0,
          decay: Math.random() * 0.006 + 0.004,
          gravity: type === 'out' ? 0.05 : 0.015,
          glow: type !== 'out',
          shape: type === 'out' ? 'splinter' : (Math.random() > 0.5 ? 'star' : 'circle'),
          angle: Math.random() * Math.PI
        });
      }
    }
  }

  /**
   * Helper to set up animation canvas sizing
   */
  function setupCanvas(ol) {
    const canvas = document.createElement('canvas');
    canvas.className = 'animation-canvas';
    ol.appendChild(canvas);
    
    const dpr = window.devicePixelRatio || 1;
    const rect = ol.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    return { canvas, ctx, width: rect.width, height: rect.height };
  }

  /**
   * Show premium event animation
   */
  function show(type) {
    dismiss();

    const ol = overlay();
    const ct = content();
    if (!ol || !ct) return;

    void ol.offsetWidth;
    ol.classList.add('active');

    const canvasInfo = setupCanvas(ol);

    if (type === 'six') {
      ct.innerHTML = `
        <div class="premium-ball-wrapper animate-six-ball">
          <div class="premium-ball"></div>
        </div>
        <div class="fairy-six-text">SIX!</div>
        <div class="premium-event-sub">6 runs — Maximum!</div>
      `;

      // Slow Motion: triggers explosion when ball reaches center (1000ms)
      canvasInterval = setTimeout(() => {
        spawnExplosion(canvasInfo.canvas, canvasInfo.width / 2, canvasInfo.height / 2, 70, 'six');
        runParticleSystem(canvasInfo.canvas, canvasInfo.ctx);
      }, 1000);

      // Slow Motion: dismiss after 4.2 seconds
      animTimeout = setTimeout(() => {
        dismiss();
      }, 4200);

    } else if (type === 'four') {
      ct.innerHTML = `
        <div class="boundary-flash" id="four-flash"></div>
        <div class="premium-ball-wrapper animate-four-ball">
          <div class="premium-ball"></div>
        </div>
        <div class="fairy-four-text">FOUR!</div>
        <div class="premium-event-sub">4 Runs — Boundary</div>
      `;

      // Slow Motion: triggers explosion at 1100ms
      canvasInterval = setTimeout(() => {
        const flash = document.getElementById('four-flash');
        if (flash) flash.classList.add('active-boundary-flash');
        spawnExplosion(canvasInfo.canvas, canvasInfo.width / 2, canvasInfo.height / 2, 50, 'four');
        runParticleSystem(canvasInfo.canvas, canvasInfo.ctx);
      }, 1100);

      animTimeout = setTimeout(() => {
        dismiss();
      }, 4200);

    } else if (type === 'out') {
      ct.innerHTML = `
        <div class="wicket-wrapper">
          <div class="stump-container">
            <div class="stump left" id="stump-l"></div>
            <div class="stump middle" id="stump-m"></div>
            <div class="stump middle-bottom" id="stump-mb"></div>
            <div class="stump middle-top" id="stump-mt"></div>
            <div class="stump right" id="stump-r"></div>
            <div class="bail-container">
              <div class="bail left-bail" id="bail-l"></div>
              <div class="bail right-bail" id="bail-r"></div>
            </div>
          </div>
          <div class="out-ball animate-out-ball"></div>
          <div class="wicket-impact-flash" id="wicket-flash"></div>
        </div>
        <div class="shattered-out-text">OUT!</div>
        <div class="premium-event-sub">Wicket Falls</div>
      `;

      // Slow Motion: triggers collision shatter at 950ms
      canvasInterval = setTimeout(() => {
        const m = document.getElementById('stump-m');
        const mb = document.getElementById('stump-mb');
        const mt = document.getElementById('stump-mt');
        if (m) m.style.display = 'none';
        if (mb) mb.style.display = 'block';
        if (mt) mt.style.display = 'block';

        document.getElementById('stump-l')?.classList.add('shatter-left-stump');
        document.getElementById('stump-r')?.classList.add('shatter-right-stump');
        document.getElementById('stump-mt')?.classList.add('shatter-middle-top');
        document.getElementById('bail-l')?.classList.add('shatter-left-bail');
        document.getElementById('bail-r')?.classList.add('shatter-right-bail');
        document.getElementById('wicket-flash')?.classList.add('animate-wicket-flash');

        const impactX = canvasInfo.width / 2;
        const impactY = canvasInfo.height / 2 + 10;
        spawnExplosion(canvasInfo.canvas, impactX, impactY, 45, 'out');
        runParticleSystem(canvasInfo.canvas, canvasInfo.ctx);
      }, 950);

      animTimeout = setTimeout(() => {
        dismiss();
      }, 4600);

    } else if (type === 'wide') {
      const isLeft = Math.random() < 0.5;
      const pathClass = isLeft ? 'animate-wide-path-left' : 'animate-wide-path-right';

      ct.innerHTML = `
        <div class="crease-wireframe">
          <div class="crease-danger-line"></div>
          <div class="crease-wide-line-left" style="${isLeft ? 'background: #facc15; box-shadow: 0 0 15px #facc15;' : ''}"></div>
          <div class="crease-wide-line-right" style="${!isLeft ? 'background: #facc15; box-shadow: 0 0 15px #facc15;' : ''}"></div>
          <div class="wide-ball-path ${pathClass}"></div>
        </div>
        <div class="neon-wide-text">WIDE</div>
        <div class="premium-event-sub">+1 Extra Run</div>
      `;

      animTimeout = setTimeout(() => {
        dismiss();
      }, 3800);

    } else if (type === 'noball') {
      ct.innerHTML = `
        <div class="crease-wireframe">
          <div class="crease-danger-line active"></div>
          <div class="noball-foot animate-noball-foot"></div>
        </div>
        <div class="neon-noball-text">NO BALL</div>
        <div class="premium-event-sub">Crease Crossed — +1 Run</div>
      `;

      animTimeout = setTimeout(() => {
        dismiss();
      }, 3800);
    }
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
    const keeper = document.getElementById(modePrefix + '-keeper-avatar');
    const leftStumps = document.querySelector('#' + modePrefix + '-pitch-container .left-stumps');

    if (!runnerA || !runnerB || !eventOverlay) return;

    eventOverlay.className = 'pitch-event-overlay';
    eventOverlay.innerHTML = '';

    // Trigger bowler action
    if (bowler) {
      bowler.classList.remove('is-bowling');
      void bowler.offsetWidth;
      bowler.classList.add('is-bowling');
      setTimeout(() => bowler.classList.remove('is-bowling'), 1100);
    }

    // Trigger wicketkeeper catch action (if ball reaches keeper)
    if (keeper && (runs === 0 || runs === 'dot' || runs === 'out')) {
      setTimeout(() => {
        keeper.classList.remove('is-catching');
        void keeper.offsetWidth;
        keeper.classList.add('is-catching');
      }, 350);
      setTimeout(() => keeper.classList.remove('is-catching'), 1500);
    }

    // Wicket (Out) Animation: Stumps LED flashing
    if (runs === 'out') {
      setTimeout(() => {
        if (leftStumps) {
          leftStumps.classList.remove('led-glow');
          void leftStumps.offsetWidth;
          leftStumps.classList.add('led-glow');
          setTimeout(() => leftStumps.classList.remove('led-glow'), 2500);
        }
      }, 700);
    }

    // Boundary event text overlay
    if (runs === 4 || runs === 6) {
      setTimeout(() => {
        eventOverlay.innerHTML = runs === 4 ? 'FOUR' : 'SIX';
        eventOverlay.classList.add(runs === 4 ? 'show-four' : 'show-six');
      }, 700);
    }

    // Ball Animation (CSS-Powered 3D Bounces)
    if (ball) {
      ball.style.display = 'block';
      // Clear inline placement to allow CSS keyframe animations control
      ball.style.left = '';
      ball.style.right = '';
      ball.style.top = '';
      ball.style.transform = '';
      ball.style.transition = '';
      ball.className = 'pitch-ball';
      void ball.offsetWidth; // trigger reflow

      // Add appropriate animation class
      if (runs === 0 || runs === 'dot') {
        ball.classList.add('animate-dot');
      } else if (runs === 'out') {
        ball.classList.add('animate-out');
      } else if (runs === 4) {
        ball.classList.add('animate-four');
      } else if (runs === 6) {
        ball.classList.add('animate-six');
      } else {
        ball.classList.add('animate-runs');
      }

      // Hide ball when animation completes
      setTimeout(() => {
        ball.style.display = 'none';
        ball.className = 'pitch-ball';
      }, 1500);
    }

    // Normal runs (1-3) runner animation
    if (typeof runs === 'number' && runs >= 1 && runs <= 3) {
      runnerA.classList.add('is-running');
      runnerB.classList.add('is-running');
      if (!runnerA.dataset.pos) runnerA.dataset.pos = 'left';
      if (!runnerB.dataset.pos) runnerB.dataset.pos = 'right';

      const swapOnce = () => {
        if (runnerA.dataset.pos === 'left') { runnerA.dataset.pos = 'right'; runnerA.style.left = '80%'; runnerA.dataset.dir = 'right'; }
        else                                { runnerA.dataset.pos = 'left';  runnerA.style.left = '18%';  runnerA.dataset.dir = 'left'; }
        if (runnerB.dataset.pos === 'right') { runnerB.dataset.pos = 'left';  runnerB.style.left = '18%';  runnerB.dataset.dir = 'left'; }
        else                                 { runnerB.dataset.pos = 'right'; runnerB.style.left = '80%'; runnerB.dataset.dir = 'right'; }
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
