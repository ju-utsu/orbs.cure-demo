// Orb collector — gaze mechanics, spawners, HUD, menu overlay handling.

(function () {
  // ---------------- State (single source of truth) ----------------
  const state = {
    running: false,
    paused: true,
    score: 0,
    orbGazeMs: 150,
    dangerGazeMs: 500,
    timers: new Map(),
    roundTime: 60,
    roundTimer: null,
    intervals: { orb: null, danger: null },
  };
  // expose for quick debugging from console
  window.state = state;

  // ---------------- DOM refs (must match index.html IDs) -------------
  const scoreVal = document.getElementById('scoreVal');
  const timeVal = document.getElementById('timeVal');
  const toast = document.getElementById('toast');
  const overlay = document.getElementById('menuOverlay');
  const orbInput = document.getElementById('orbGazeInput');
  const dangerInput = document.getElementById('dangerGazeInput');
  const startBtn = document.getElementById('startGameBtn');
  const saveBtn = document.getElementById('saveSettings');
  const restartBtnHtml = document.getElementById('restartBtn');
  const openMenuBtn = document.getElementById('openMenuBtn');

  const collectSpawner = document.getElementById('collect-spawner');
  const dangerSpawner = document.getElementById('danger-spawner');
  const ray = document.getElementById('ray');
  const reticle = document.getElementById('reticle');

  // make setScore global so AR script can call it
  function setScore(v) {
    state.score = v;
    if (scoreVal) scoreVal.textContent = v;
    const vrScore = document.getElementById('vrScore');
    if (vrScore) vrScore.setAttribute('value', `Score: ${v}`);
    // mirror in window.state
    window.state && (window.state.score = v);
  }
  window.setScore = setScore;

  // ---------------- UI helpers ----------------
  function showToast(msg, ms = 1200) {
    if (!toast) { console.log('[TOAST]', msg); return; }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.display = 'none'; }, ms);
  }

  // ---------------- Spawn logic ----------------
  function randPos() {
    const r = 3 + Math.random() * 8;
    const a = Math.random() * Math.PI * 2;
    const y = 0.9 + Math.random() * 1.8;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  }

  function spawnOrb() {
    const p = randPos();
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable', 'collectable');
    orb.setAttribute('radius', '0.28');
    orb.setAttribute('color', '#ffd84d');
    orb.setAttribute('emissive', '#ffeb99');
    orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${2200 + Math.floor(Math.random() * 1000)}; to: ${p.x} ${p.y + 0.25} ${p.z}; loop: true; easing: easeInOutSine`);
    orb.dataset.gaze = 'collect';
    if (collectSpawner) collectSpawner.appendChild(orb);
    else document.querySelector('a-scene').appendChild(orb);
  }

  function spawnDanger() {
    const p = randPos();
    const bad = document.createElement('a-box');
    bad.classList.add('interactable', 'danger');
    bad.setAttribute('width', '0.5'); bad.setAttribute('height', '0.5'); bad.setAttribute('depth', '0.5');
    bad.setAttribute('color', '#d43b3b');
    bad.setAttribute('position', `${p.x} ${Math.max(0.5, p.y - 0.6)} ${p.z}`);
    bad.setAttribute('animation__rot', 'property: rotation; to: 0 360 0; dur: 6000; loop:true; easing:linear');
    bad.dataset.gaze = 'danger';
    if (dangerSpawner) dangerSpawner.appendChild(bad);
    else document.querySelector('a-scene').appendChild(bad);
  }

  const MAX_ORBS_ON_SCREEN = 40;
  const MAX_DANGER_ON_SCREEN = 10;

  function startContinuousSpawns() {
    stopContinuousSpawns();
    state.intervals.orb = setInterval(() => {
      if (!state.running || state.paused) return;
      if (collectSpawner && collectSpawner.children.length < MAX_ORBS_ON_SCREEN) spawnOrb();
    }, 800);
    state.intervals.danger = setInterval(() => {
      if (!state.running || state.paused) return;
      if (dangerSpawner && dangerSpawner.children.length < MAX_DANGER_ON_SCREEN) spawnDanger();
    }, 2000);
  }

  function stopContinuousSpawns() {
    if (state.intervals.orb) clearInterval(state.intervals.orb);
    if (state.intervals.danger) clearInterval(state.intervals.danger);
    state.intervals.orb = state.intervals.danger = null;
  }

  // ---------------- Gaze interaction ----------------
  let hovered = null;

  if (ray) {
    ray.addEventListener('raycaster-intersection', (e) => {
      const els = e.detail.els || (e.detail.intersections && e.detail.intersections.map(i => i.object.el));
      const el = els && els.length ? els[0] : null;
      if (el && el !== hovered) { if (hovered) clearHover(hovered); startHover(el); hovered = el; }
    });

    ray.addEventListener('raycaster-intersection-cleared', () => {
      if (hovered) clearHover(hovered);
      hovered = null;
      if (reticle) { reticle.setAttribute('color', '#bfe5ff'); reticle.setAttribute('scale', '1 1 1'); }
    });
  }

  function startHover(el) {
    const kind = el && el.dataset && el.dataset.gaze ? el.dataset.gaze : null;
    if (!kind) return;
    if (reticle) {
      reticle.setAttribute('scale', '1.6 1.6 1');
      if (kind === 'collect') reticle.setAttribute('color', '#ffd84d');
      else if (kind === 'danger') reticle.setAttribute('color', '#ff4d4d');
    }

    if (!state.running || state.paused) return;

    // read live inputs so user can adjust without restarting
    const ms = (kind === 'collect') ? (parseInt(orbInput.value) || state.orbGazeMs) : (parseInt(dangerInput.value) || state.dangerGazeMs);

    const to = setTimeout(() => {
      if (!state.running || state.paused) return;
      if (kind === 'collect') {
        const pos = el.object3D.position;
        particleBurst(pos);
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch(_) {}
        el.parentNode && el.parentNode.removeChild(el);
        setScore(state.score + 1);
      } else if (kind === 'danger') {
        try { document.getElementById('dangerSound')?.play()?.catch(()=>{}); } catch(_) {}
        triggerGameOver('Gazed at danger');
      }
    }, ms);

    state.timers.set(el, to);
  }

  function clearHover(el) {
    const to = state.timers.get(el);
    if (to) { clearTimeout(to); state.timers.delete(el); }
  }

  // ---------- particle fx ----------
  function particleBurst(pos) {
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('a-sphere');
      p.setAttribute('radius', '0.04'); p.setAttribute('color', '#fff');
      p.object3D.position.set(pos.x, pos.y, pos.z);
      document.querySelector('a-scene').appendChild(p);
      const dx = pos.x + (Math.random() - 0.5) * 0.6; const dy = pos.y + Math.random() * 0.8; const dz = pos.z + (Math.random() - 0.5) * 0.6;
      p.setAttribute('animation__m', `property: position; to: ${dx} ${dy} ${dz}; dur: 520; easing: easeOutQuad`);
      p.setAttribute('animation__f', `property: material.opacity; to:0; dur:520; delay:180`);
      setTimeout(() => { p.parentNode && p.parentNode.removeChild(p); }, 720);
    }
  }

  // ---------------- Menu / game flow ----------------
  function showOverlay() {
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    state.paused = true;
    showToast('Menu opened');
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    state.paused = false;
  }

  function openMenu() { showOverlay(); }

  function closeMenuSave() {
    // save inputs defensively, then hide
    state.orbGazeMs = parseInt(orbInput.value) || state.orbGazeMs;
    state.dangerGazeMs = parseInt(dangerInput.value) || state.dangerGazeMs;
    showToast('Settings saved');
    hideOverlay();
  }

  function startRound() {
    clearInterval(state.roundTimer);
    state.roundTime = 60;
    if (timeVal) timeVal.textContent = state.roundTime;
    state.roundTimer = setInterval(() => {
      if (!state.running || state.paused) return;
      state.roundTime -= 1;
      if (timeVal) timeVal.textContent = state.roundTime;
      if (state.roundTime <= 0) { clearInterval(state.roundTimer); triggerGameOver("Time's up"); }
    }, 1000);
  }

  function startGame() {
    // hide overlay first (important for AR start)
    try { hideOverlay(); } catch (e) { /* ignore */ }

    state.running = true; state.paused = false;
    setScore(0);

    // seed scene
    for (let i = 0; i < 6; i++) spawnOrb();
    for (let i = 0; i < 3; i++) spawnDanger();
    startContinuousSpawns();
    startRound();
    showToast('Game Started!');
  }

  function triggerGameOver(msg) {
    state.running = false; state.paused = true;
    stopContinuousSpawns();
    const panel = document.getElementById('gameOverPanel'); if (panel) panel.setAttribute('visible', 'true');
    const got = document.getElementById('gameOverText'); if (got) got.setAttribute('value', msg);
    showToast('Game Over');
  }

  function restart() {
    // clear timers and objects
    state.timers.forEach(t => clearTimeout(t)); state.timers.clear();
    if (collectSpawner) Array.from(collectSpawner.children).forEach(c => c.remove());
    if (dangerSpawner) Array.from(dangerSpawner.children).forEach(d => d.remove());
    const panel = document.getElementById('gameOverPanel'); if (panel) panel.setAttribute('visible', 'false');
    startGame();
  }

  // ---------------- UI wiring (defensive) ----------------
  startBtn && startBtn.addEventListener('click', startGame);
  saveBtn && saveBtn.addEventListener('click', closeMenuSave);
  restartBtnHtml && restartBtnHtml.addEventListener('click', restart);
  openMenuBtn && openMenuBtn.addEventListener('click', openMenu);
  window.addEventListener('keydown', (e) => { if (e.key && e.key.toLowerCase() === 'm') openMenu(); });

  // initial state on load
  if (overlay) { overlay.style.display = 'block'; overlay.setAttribute('aria-hidden', 'false'); overlay.style.pointerEvents = 'auto'; }
  setScore(0);
  if (timeVal) timeVal.textContent = 60;

  // Expose for debugging in console
  window._orbsGame = { startGame, restart, state, spawnOrb, spawnDanger };
})();
