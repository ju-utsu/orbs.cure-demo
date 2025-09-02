//// Robust gaze-based orb collector (uses A-Frame raycaster events, stable spawners, HUD updates)

// ==============================
// Background music manager (non-invasive)
// ==============================
const musicManager = (function () {
  const basePath = 'assets/audio/';
  const defaultTracks = [
    { file: 'bg1.mp3', title: 'Cornfield Chase' },
    { file: 'bg2.mp3', title: 'Running Out' },
    { file: 'bg3.mp3', title: 'Stay' },
    { file: 'bg4.mp3', title: 'Coward' },
    { file: 'bg5.mp3', title: 'S.T.A.Y' },
    { file: 'bg6.mp3', title: 'Wormhole' },
    { file: 'bg7.mp3', title: 'Dust' },
    { file: 'bg8.mp3', title: 'Detach' },
    { file: 'bg9.mp3', title: 'Mountains' },
    { file: 'bg10.mp3', title: "Where We're Going" },
    { file: 'bg11.mp3', title: "Day One" },
    { file: 'bg.mp3', title: 'Afraid of Time' }
  ];

  let audio = null;
  let tracks = defaultTracks.slice();
  let currentIndex = 0;
  let isPlaying = false;

  const savedIndex = parseInt(localStorage.getItem('orbs_bg_index'));
  const savedVol = parseFloat(localStorage.getItem('orbs_bg_vol'));
  if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < tracks.length) currentIndex = savedIndex;
  const initialVol = (!isNaN(savedVol) ? savedVol : 0.6);

  function createAudio() {
    if (audio) return;
    audio = new Audio();
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    audio.volume = initialVol;
    audio.preload = 'auto';
    audio.addEventListener('ended', () => { isPlaying = false; updateUI(); });
    audio.addEventListener('play', () => { isPlaying = true; updateUI(); });
    audio.addEventListener('pause', () => { isPlaying = false; updateUI(); });
  }

  function updateUI() {
    const btn = document.getElementById('playPauseMusic');
    const sel = document.getElementById('bgSelect');
    const label = document.getElementById('musicLabel');
    if (btn) btn.textContent = isPlaying ? 'Pause' : 'Play';
    if (sel) sel.selectedIndex = currentIndex;
    if (label && audio) label.textContent = Math.round(audio.volume * 100) + '%';
  }

  function loadTrack(index) {
    createAudio();
    if (index < 0) index = 0;
    if (index >= tracks.length) index = tracks.length - 1;
    currentIndex = index;
    audio.src = basePath + tracks[currentIndex].file;
    localStorage.setItem('orbs_bg_index', currentIndex);
    updateUI();
  }

  function play() {
    createAudio();
    if (!audio.src) loadTrack(currentIndex);
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(()=>{ isPlaying = true; updateUI(); }).catch((e)=>{
        console.warn('Music play blocked (requires user gesture):', e);
        isPlaying = false; updateUI();
      });
    } else {
      isPlaying = true; updateUI();
    }
  }

  function pause() {
    if (audio) audio.pause();
    isPlaying = false;
    updateUI();
  }

  function toggle() {
    if (!audio || audio.paused) play(); else pause();
  }

  function next() { loadTrack((currentIndex + 1) % tracks.length); if (isPlaying) play(); }
  function prev() { loadTrack((currentIndex - 1 + tracks.length) % tracks.length); if (isPlaying) play(); }
  function setVolume(v) {
    createAudio();
    audio.volume = Math.max(0, Math.min(1, parseFloat(v)));
    localStorage.setItem('orbs_bg_vol', audio.volume);
    updateUI();
  }

  function initUIBindings() {
    const sel = document.getElementById('bgSelect');
    const playBtn = document.getElementById('playPauseMusic');
    const nextBtn = document.getElementById('nextTrack');
    const prevBtn = document.getElementById('prevTrack');
    const vol = document.getElementById('musicVol');

    if (sel) {
      sel.innerHTML = '';
      tracks.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = t.file;
        opt.textContent = t.title;
        sel.appendChild(opt);
      });
      sel.selectedIndex = currentIndex;
      sel.addEventListener('change', (e) => {
        const idx = sel.selectedIndex;
        loadTrack(idx);
        try { play(); } catch (_) {}
      });
    }

    if (playBtn) playBtn.addEventListener('click', () => { toggle(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); });
    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); });

    if (vol) {
      vol.value = (audio ? audio.volume : initialVol);
      const label = document.getElementById('musicLabel');
      vol.addEventListener('input', () => {
        setVolume(vol.value);
        if (label) label.textContent = Math.round(vol.value * 100) + '%';
      });
    }

    updateUI();
  }

  return {
    init: function () {
      createAudio();
      loadTrack(currentIndex);
      initUIBindings();
    },
    play,
    pause,
    toggle,
    next,
    prev,
    setVolume,
    isPlaying: ()=> isPlaying,
    getCurrent: ()=> tracks[currentIndex]
  };
})();
window.musicManager = musicManager;

(function () {
  // ---------------- state ----------------
  const state = {
    running: false,
    paused: true,
    score: 0,
    orbGazeMs: 150,
    dangerGazeMs: 500,
    timers: new Map(),
    roundTimer: null,
    roundTime: 360,
    spawnIntervals: { orb: null, danger: null }
  };
  window.state = state; // for debug & AR

  // ---------------- DOM refs ----------------
  const scoreVal = document.getElementById('scoreVal');
  const timeVal = document.getElementById('timeVal');
  const toast = document.getElementById('toast');
  const overlay = document.getElementById('menuOverlay');
  const orbInput = document.getElementById('orbGazeInput');
  const dangerInput = document.getElementById('dangerGazeInput');
  const startBtn = document.getElementById('startGameBtn');
  const saveBtn = document.getElementById('saveSettings');
  const restartBtn = document.getElementById('restartBtn');
  const openMenuBtn = document.getElementById('openMenuBtn');

  const collectSpawner = document.getElementById('collect-spawner');
  const dangerSpawner = document.getElementById('danger-spawner');
  const ray = document.getElementById('ray');
  const reticle = document.getElementById('reticle');

  // ---------------- helpers ----------------
  function showToast(msg, ms = 1200) {
    if (!toast) { console.log('[TOAST]', msg); return; }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.style.display = 'none', ms);
  }
  function setScore(v) {
    state.score = v;
    if (scoreVal) scoreVal.textContent = String(v);
    const vrScore = document.getElementById('vrScore');
    if (vrScore) vrScore.setAttribute('value', `Score: ${v}`);
    window.state && (window.state.score = v);
  }
  window.setScore = setScore;

  // ---------------- spawn logic ----------------
  function randPosAroundPlayer(minR = 3, maxR = 8) {
    const r = minR + Math.random() * (maxR - minR);
    const a = Math.random() * Math.PI * 2;
    const y = 0.9 + Math.random() * 1.6;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  }

  function spawnOrb() {
    const p = randPosAroundPlayer();
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable', 'collectable');
    orb.setAttribute('radius', '0.28');
    orb.setAttribute('color', '#ffd84d');
    orb.setAttribute('emissive', '#ffeb99');
    orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random() * 900)}; to: ${p.x} ${p.y + 0.22} ${p.z}; loop: true; easing: easeInOutSine`);
    orb.dataset.gaze = 'collect';
    (collectSpawner || document.querySelector('a-scene')).appendChild(orb);
    return orb;
  }

  function spawnDanger() {
    const p = randPosAroundPlayer();
    const bad = document.createElement('a-box');
    bad.classList.add('interactable', 'danger');
    bad.setAttribute('width', '0.5');
    bad.setAttribute('height', '0.5');
    bad.setAttribute('depth', '0.5');
    bad.setAttribute('color', '#d43b3b');
    bad.setAttribute('position', `${p.x} ${Math.max(0.5, p.y - 0.6)} ${p.z}`);
    bad.setAttribute('animation__rot', 'property: rotation; to: 0 360 0; dur: 6000; loop:true; easing:linear');
    bad.dataset.gaze = 'danger';
    (dangerSpawner || document.querySelector('a-scene')).appendChild(bad);
    return bad;
  }

  const MAX_ORBS_ON_SCREEN = 42;
  const MAX_DANGER_ON_SCREEN = 21;

  function startSpawners() {
    stopSpawners();
    state.spawnIntervals.orb = setInterval(() => {
      if (!state.running || state.paused) return;
      const count = collectSpawner ? collectSpawner.children.length : document.querySelectorAll('.collectable').length;
      if (count < MAX_ORBS_ON_SCREEN) spawnOrb();
    }, 700);
    state.spawnIntervals.danger = setInterval(() => {
      if (!state.running || state.paused) return;
      const count = dangerSpawner ? dangerSpawner.children.length : document.querySelectorAll('.danger').length;
      if (count < MAX_DANGER_ON_SCREEN) spawnDanger();
    }, 2200);
  }
  function stopSpawners() {
    if (state.spawnIntervals.orb) clearInterval(state.spawnIntervals.orb);
    if (state.spawnIntervals.danger) clearInterval(state.spawnIntervals.danger);
    state.spawnIntervals.orb = state.spawnIntervals.danger = null;
  }

  // ---------------- gaze using A-Frame raycaster events ----------------
  let hoveredEl = null;
  ray && ray.addEventListener('raycaster-intersection', (evt) => {
    const els = evt.detail.els || (evt.detail.intersections && evt.detail.intersections.map(i => i.object.el));
    const el = els && els.length ? els[0] : null;
    if (!el) return;
    if (el === hoveredEl) return;
    if (hoveredEl) clearHover(hoveredEl);
    startHover(el);
    hoveredEl = el;
  });

  ray && ray.addEventListener('raycaster-intersection-cleared', (evt) => {
    if (hoveredEl) clearHover(hoveredEl);
    hoveredEl = null;
    if (reticle) { reticle.setAttribute('color', '#bfe5ff'); reticle.setAttribute('scale', '1 1 1'); }
  });

  function startHover(el) {
    const kind = el && el.dataset && el.dataset.gaze ? el.dataset.gaze : null;
    if (!kind) return;
    // visual feedback
    if (reticle) {
      reticle.setAttribute('scale', '1.6 1.6 1');
      reticle.setAttribute('color', (kind === 'collect') ? '#ffd84d' : '#ff6b6b');
    }

    if (!state.running || state.paused) return;

    const ms = (kind === 'collect') ? (parseInt(orbInput.value) || state.orbGazeMs) : (parseInt(dangerInput.value) || state.dangerGazeMs);

    const timeout = setTimeout(() => {
      if (!state.running || state.paused) return;
      if (!el.parentNode) return; // already removed

      if (kind === 'collect') {
        // collect
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch(_) {}
        const pos = el.object3D.position;
        particleBurst(pos);
        el.parentNode && el.parentNode.removeChild(el);
        setScore(state.score + 1);
      } else if (kind === 'danger') {
        try { document.getElementById('dangerSound')?.play()?.catch(()=>{}); } catch(_) {}
        triggerGameOver('Gazed at danger');
      }
    }, ms);

    state.timers.set(el, timeout);
  }

  function clearHover(el) {
    const to = state.timers.get(el);
    if (to) { clearTimeout(to); state.timers.delete(el); }
    // reset reticle colors handled on intersection-cleared event
  }

  // ---------------- particle FX ----------------
  function particleBurst(pos) {
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('a-sphere');
      p.setAttribute('radius', '0.04');
      p.setAttribute('color', '#fff');
      p.object3D.position.set(pos.x, pos.y, pos.z);
      document.querySelector('a-scene').appendChild(p);
      const dx = pos.x + (Math.random() - 0.5) * 0.6;
      const dy = pos.y + Math.random() * 0.8;
      const dz = pos.z + (Math.random() - 0.5) * 0.6;
      p.setAttribute('animation__m', `property: position; to: ${dx} ${dy} ${dz}; dur: 540; easing: easeOutQuad`);
      p.setAttribute('animation__f', `property: material.opacity; to:0; dur:540; delay:180`);
      setTimeout(() => p.parentNode && p.parentNode.removeChild(p), 800);
    }
  }

  // ---------------- game flow ----------------
  function showOverlay() {
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    state.paused = true;
  }
  function hideOverlay() {
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    state.paused = false;
  }

  function startRoundTimer() {
    clearInterval(state.roundTimer);
    state.roundTime = 360;
    if (timeVal) timeVal.textContent = state.roundTime;
    state.roundTimer = setInterval(() => {
      if (!state.running || state.paused) return;
      state.roundTime -= 1;
      if (timeVal) timeVal.textContent = state.roundTime;
      if (state.roundTime <= 0) { clearInterval(state.roundTimer); triggerGameOver("Time's up"); }
    }, 1000);
  }

  function startGame() {
    // apply saved inputs
    state.orbGazeMs = parseInt(orbInput.value) || state.orbGazeMs;
    state.dangerGazeMs = parseInt(dangerInput.value) || state.dangerGazeMs;

    // reset timers and state
    state.timers.forEach(t => clearTimeout(t));
    state.timers.clear();
    state.running = true;
    state.paused = false;
    setScore(0);
    hideOverlay();

    // seed initial objects
    for (let i = 0; i < 6; i++) spawnOrb();
    for (let i = 0; i < 3; i++) spawnDanger();

    startSpawners();
    startRoundTimer();
    showToast('Game started');
  }

  function triggerGameOver(msg) {
    state.running = false;
    state.paused = true;
    stopSpawners();
    state.timers.forEach(t => clearTimeout(t));
    state.timers.clear();
    const panel = document.getElementById('gameOverPanel');
    if (panel) panel.setAttribute('visible', 'true');
    const got = document.getElementById('gameOverText');
    if (got) got.setAttribute('value', msg);
    showToast(msg);
    // re-open menu so player can restart
    showOverlay();
  }

  function restartGame() {
    // remove all spawned entities
    const cs = collectSpawner ? Array.from(collectSpawner.children) : Array.from(document.querySelectorAll('.collectable'));
    cs.forEach(c => c.remove && c.remove());
    const ds = dangerSpawner ? Array.from(dangerSpawner.children) : Array.from(document.querySelectorAll('.danger'));
    ds.forEach(d => d.remove && d.remove());
    // hide gameOver
    const panel = document.getElementById('gameOverPanel');
    if (panel) panel.setAttribute('visible', 'false');
    startGame();
  }

  // Start music (attempt) — user gesture allows playback
  try { musicManager.init(); musicManager.play(); } catch(e){ console.warn('Music play failed', e); }
});

openMenuBtn.addEventListener('click', () => {
  showMenu(true);
  try { musicManager.init(); } catch(e){}
});


  // ---------------- UI wiring ----------------
  startBtn && startBtn.addEventListener('click', startGame);
  saveBtn && saveBtn.addEventListener('click', () => {
    state.orbGazeMs = parseInt(orbInput.value) || state.orbGazeMs;
    state.dangerGazeMs = parseInt(dangerInput.value) || state.dangerGazeMs;
    showToast('Settings saved');
  });
  restartBtn && restartBtn.addEventListener('click', restartGame);
  openMenuBtn && openMenuBtn.addEventListener('click', showOverlay);

  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { musicManager.init(); } catch(e){} });
} else { try { musicManager.init(); } catch(e){} }

  // ensure overlay initially visible for settings
  if (overlay) {
    overlay.style.display = 'block';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.pointerEvents = 'auto';
  }

  // expose helpers for debug in console
  window._orbsGame = {
    startGame, restartGame, state, spawnOrb, spawnDanger, triggerGameOver
  };
})();
