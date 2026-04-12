// Music manager + gaze-based VR/AR shared gameplay (validated)

/* --------------- Music manager ---------------- */
const musicManager = (function () {
  const basePath = 'assets/audio/';
  const tracks = [
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
    { file: 'bg11.mp3', title: 'Day One' },
    { file: 'bg.mp3', title: 'Afraid of Time' }
  ];

  let audio = null;
  // ✨ WITH THIS: Pick a random track on load!
  let index = Math.floor(Math.random() * tracks.length);
  let playing = false;
  const storageKey = 'orbs_bg_vol';

  function createAudio() {
    if (audio) return;
    audio = new Audio();
    audio.loop = false;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    const saved = parseFloat(localStorage.getItem(storageKey));
    audio.volume = Number.isFinite(saved) ? saved : 0.6;
    audio.addEventListener('play', () => { playing = true; updateUI(); });
    audio.addEventListener('pause', () => { playing = false; updateUI(); });
                                          
    // ✨ NEW: Shuffle play when the track ends
    audio.addEventListener('ended', () => { 
      let nextIndex;
      do {
        // Pick a random track index
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === index && tracks.length > 1); // Ensure it doesn't play the same track twice in a row
      
      load(nextIndex);
      play();
    });
  }

  
  function updateUI() {
    const btn = document.getElementById('playPauseMusic');
    const sel = document.getElementById('bgSelect');
    const label = document.getElementById('musicLabel');
    const now = document.getElementById('nowPlaying');
    if (btn) btn.textContent = playing ? 'Pause' : 'Play';
    if (sel) sel.selectedIndex = index;
    if (label && audio) label.textContent = Math.round(audio.volume * 100) + '%';
    if (now) now.textContent = `Now: ${tracks[index] ? tracks[index].title : '—'}`;
  }

  function load(i) {
    createAudio();
    index = Math.max(0, Math.min(i, tracks.length - 1));
    audio.src = basePath + tracks[index].file;
    updateUI();
  }

  function play() {
    createAudio();
    if (!audio.src) load(index);
    const p = audio.play();
    if (p && typeof p.then === 'function') p.catch(e => console.warn('Playback blocked:', e));
  }
  function pause() { if (audio) audio.pause(); }
  function toggle() { if (!audio || audio.paused) play(); else pause(); }
  function next() { load((index + 1) % tracks.length); if (audio && !audio.paused) play(); }
  function prev() { load((index - 1 + tracks.length) % tracks.length); if (audio && !audio.paused) play(); }
  function setVol(v) { createAudio(); audio.volume = Math.max(0, Math.min(1, parseFloat(v))); localStorage.setItem(storageKey, audio.volume); updateUI(); }

  function bindUI() {
    const sel = document.getElementById('bgSelect');
    const playBtn = document.getElementById('playPauseMusic');
    const nextBtn = document.getElementById('nextTrack');
    const prevBtn = document.getElementById('prevTrack');
    const vol = document.getElementById('musicVol');

    if (sel) {
      // repopulate safely (keeps HTML in sync)
      sel.innerHTML = '';
      tracks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.file;
        opt.textContent = t.title;
        sel.appendChild(opt);
      });
      sel.selectedIndex = index;
      sel.addEventListener('change', () => { load(sel.selectedIndex); play(); });
    }
    if (playBtn) playBtn.addEventListener('click', toggle);
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (vol) {
      // ensure slider has a numeric value and event
      vol.value = audio ? audio.volume : 0.6;
      vol.addEventListener('input', () => setVol(vol.value));
    }
    updateUI();
  }

  return {
    init: () => { createAudio(); load(index); bindUI(); },
    play, pause, toggle, next, prev, setVol,
    isPlaying: () => !!(audio && !audio.paused)
  };
})();

window.musicManager = musicManager;

/* ---------------- Game module ---------------- */
const game = (function () {
  const state = {
    running: false,
    paused: true,
    score: 0,
    highScore: 0,
    storageKey: 'orbs_cure_highscore',
    mode: 'vr',
    orbGazeMs: 150,
    dangerGazeMs: 500,
    timers: new Map(),
    roundTimer: null,
    roundTime: 360,
    spawnIntervals: { orb: null, danger: null },
    // ✨ NEW ARCADE STATE VARIABLES
    wave: 1,
    combo: 0,
    comboTimer: null,
    shieldActive: false,
    isFrozen: false,
    freezeTimer: null
  };
  window.state = state; // for debugging

  // DOM refs
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
  const enterVRBtn = document.getElementById('enterVRBtn');
  const enterARBtn = document.getElementById('enterARBtn');
  const sceneEl = document.querySelector('a-scene');
  const sceneRoot = sceneEl;
  
  
  state.mode = 'vr';
  
  sceneEl?.addEventListener('enter-vr', () => {
    const session = sceneEl.renderer?.xr?.getSession?.();
    const isAR = session && session.environmentBlendMode === 'alpha-blend';
    
    state.mode = isAR ? 'ar' : 'vr';
    console.log('Mode:', state.mode);
  });

  
  const collectSpawner = document.getElementById('collect-spawner');
  const dangerSpawner = document.getElementById('danger-spawner');
  const ray = document.getElementById('cursor');
  const reticle = document.getElementById('reticle');

  // helpers
  function showToast(msg, ms = 1200) {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.display = 'none'; toast.hidden = true; }, ms);
  }

  function setScore(v) {
    state.score = v;
    if (scoreVal) scoreVal.textContent = String(v);

    // Update VR HUD
    const vrScore = document.getElementById('vrScore');
    if (vrScore) vrScore.setAttribute('value', `Score: ${v}`);

    // ✨ NEW: High Score Logic
    if (v > state.highScore) {
      state.highScore = v;
      localStorage.setItem(state.storageKey, v);
      if (document.getElementById('bestVal')) {
        document.getElementById('bestVal').textContent = String(v);
      }
    }
  }
  window.setScore = setScore;

  // spawn helpers
  function randPosAroundPlayer(minR = 3, maxR = 8) {
    const r = minR + Math.random() * (maxR - minR);
    const a = Math.random() * Math.PI * 2;
    const y = 0.9 + Math.random() * 1.6;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  }

  // ✨ NEW: Floating 3D Arcade Text
  function spawnFloatingText(pos, text, color = '#fff') {
    const txt = document.createElement('a-text');
    txt.setAttribute('value', text);
    txt.setAttribute('color', color);
    txt.setAttribute('align', 'center');
    txt.setAttribute('width', '3');
    txt.setAttribute('position', `${pos.x} ${pos.y + 0.3} ${pos.z}`);
    txt.setAttribute('animation__pos', `property: position; to: ${pos.x} ${pos.y + 1.2} ${pos.z}; dur: 1200; easing: easeOutQuad`);
    txt.setAttribute('animation__opa', `property: opacity; to: 0; dur: 1200; easing: easeInQuad`);
    sceneRoot.appendChild(txt);
    setTimeout(() => txt.parentNode && txt.remove(), 1250);
  }

  // ✨ NEW: Power-Up Spawner
  function spawnPowerUp() {
    const p = randPosAroundPlayer();
    const power = document.createElement('a-sphere');
    power.classList.add('interactable', 'powerup', 'collectable');
    power.setAttribute('radius', '0.25');
    
    const type = Math.random();
    let pType = 'time'; let color = '#4dff88'; // Green
    if (type > 0.66) { pType = 'freeze'; color = '#4dffff'; } // Blue
    else if (type > 0.33) { pType = 'shield'; color = '#d94dff'; } // Purple
    
    power.dataset.gaze = 'powerup';
    power.dataset.ptype = pType;
    power.setAttribute('material', 'shader: standard; emissiveIntensity: 2');
    power.setAttribute('color', color);
    power.setAttribute('emissive', color);
    power.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    power.setAttribute('animation__float', `property: position; dir: alternate; dur: 800; to: ${p.x} ${p.y + 0.3} ${p.z}; loop: true`);
    
    (collectSpawner || sceneRoot).appendChild(power);
    refreshRaycaster();
  }


  
  function attachInteraction(el) {
    el.addEventListener('click', () => {
      if (!state.running || state.paused) return;
      if (!el.parentNode) return;
      
      const kind = el.dataset.gaze;
      const pos = el.object3D ? el.object3D.position : null;
      
      if (kind === 'collect') {
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
        if (pos) particleBurst(pos);
      el.remove();

      // ✨ COMBOS & SCORING FOR TAPS
      state.combo++;
      clearTimeout(state.comboTimer);
      state.comboTimer = setTimeout(() => { state.combo = 0; }, 4000);
        
      const pts = 1 * state.combo;
      setScore(state.score + pts);
      if (pos) spawnFloatingText(pos, state.combo > 1 ? `+${pts} (x${state.combo})` : `+${pts}`, state.combo > 1 ? "#ffd84d" : "#fff");

      // ✨ WAVE PROGRESSION
      if (state.score >= 40 && state.wave === 2) {
        state.wave = 3; showToast("WAVE 3: Moving Dangers!", 3000); startSpawners();
      } else if (state.score >= 15 && state.wave === 1) {
        state.wave = 2; showToast("WAVE 2: Speed Up!", 3000); startSpawners();
      }
    
    } else if (kind === 'powerup') {
      try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
      const pType = el.dataset.ptype; el.remove();
      
      if (pType === 'time') {
        state.roundTime += 15;
        if (pos) spawnFloatingText(pos, "+15s Time!", "#4dff88");
      } else if (pType === 'freeze') {
        state.isFrozen = true;
        if (pos) spawnFloatingText(pos, "Time Freeze!", "#4dffff");
        document.querySelectorAll('.danger').forEach(d => d.pause());
        clearTimeout(state.freezeTimer);
        state.freezeTimer = setTimeout(() => {
          state.isFrozen = false;
          if(state.running && !state.paused) document.querySelectorAll('.danger').forEach(d => d.play());
        }, 5000);
      } else if (pType === 'shield') {
        state.shieldActive = true;
        if (pos) spawnFloatingText(pos, "Shield Active!", "#d94dff");
      }
    
    } else if (kind === 'danger') {
      if (state.shieldActive) {
        state.shieldActive = false;
        el.remove();
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
        if (pos) spawnFloatingText(pos, "Shield Broken!", "#ff6b6b");
      } else {
        try { document.getElementById('dangerSound')?.play()?.catch(()=>{}); } catch (_) {}
        triggerGameOver('Tapped danger');
      }
    }
  });
}

      


  function spawnOrb() {
    const p = randPosAroundPlayer();
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable', 'collectable');
    orb.setAttribute('radius', '0.33');
    orb.setAttribute('material', 'shader: standard; emissiveIntensity: 1.5');
    orb.setAttribute('color', '#ffd84d');
    orb.setAttribute('emissive', '#ffeb99');
    orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random() * 900)}; to: ${p.x} ${p.y + 0.22} ${p.z}; loop: true; easing: easeInOutSine`);
    orb.dataset.gaze = 'collect';
    (collectSpawner || sceneRoot).appendChild(orb);
    refreshRaycaster();
    attachInteraction(orb);

    return orb;
  }

  function spawnDanger() {
    const p = randPosAroundPlayer();
    const bad = document.createElement('a-box');
    bad.classList.add('interactable', 'danger');
    bad.dataset.gaze = 'danger';
    bad.setAttribute('width', '0.7');
    bad.setAttribute('height', '0.7');
    bad.setAttribute('depth', '0.7');
    bad.setAttribute('color', '#d43b3b');
    bad.setAttribute('position', `${p.x} ${Math.max(0.5, p.y - 0.6)} ${p.z}`);
    bad.setAttribute('animation__rot', 'property: rotation; to: 0 360 0; dur: 6000; loop:true; easing:linear');

    // ✨ WAVES: Moving Danger Cubes!
    if (state.wave >= 3) {
      bad.setAttribute('animation__move', `property: position; dir: alternate; dur: 3000; loop: true; easing: easeInOutSine; to: ${p.x + (Math.random() > 0.5 ? 1.5 : -1.5)} ${p.y} ${p.z + (Math.random() > 0.5 ? 1.5 : -1.5)}`);
    }
    
    (collectSpawner || sceneRoot).appendChild(bad);
    refreshRaycaster();
    
    attachInteraction(bad);
    return bad;
  }

  
  function refreshRaycaster() {
    setTimeout(() => {
      if (ray && ray.components && ray.components.raycaster) ray.components.raycaster.refreshObjects();
    }, 50);
  }


  const MAX_ORBS_ON_SCREEN = 84;
  const MAX_DANGER_ON_SCREEN = 63;
  

  function startSpawners() {
    stopSpawners();
    // ✨ WAVES: Faster spawns as you progress
    let orbRate = state.wave === 3 ? 500 : state.wave === 2 ? 650 : 800;
    let dangerRate = state.wave === 3 ? 1200 : state.wave === 2 ? 1500 : 1800;
    
    state.spawnIntervals.orb = setInterval(() => {
      if (!state.running || state.paused) return;
      const count = collectSpawner ? collectSpawner.children.length : document.querySelectorAll('.collectable').length;
      if (count < MAX_ORBS_ON_SCREEN) {
        if (Math.random() < 0.1) spawnPowerUp(); // 10% chance
        else spawnOrb();
      }
    }, orbRate);

    state.spawnIntervals.danger = setInterval(() => {
      if (!state.running || state.paused || state.isFrozen) return; // Don't spawn if time is frozen!
      const count = document.querySelectorAll('.danger').length;
      if (count < MAX_DANGER_ON_SCREEN) spawnDanger();
    }, dangerRate);
  }
    

  function stopSpawners() {
    if (state.spawnIntervals.orb) clearInterval(state.spawnIntervals.orb);
    if (state.spawnIntervals.danger) clearInterval(state.spawnIntervals.danger);
    state.spawnIntervals.orb = state.spawnIntervals.danger = null;
  }

  // gaze handling
  let hovered = null;
  if (ray) {
    ray.addEventListener('raycaster-intersection', (e) => {
      const intersections = e.detail.intersections;
      const el = intersections && intersections.length ? intersections[0].object.el : null;
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
      let rColor = '#fff';
      if (kind === 'collect') rColor = '#ffd84d';
      else if (kind === 'danger') rColor = state.shieldActive ? '#d94dff' : '#ff6b6b'; // Reticle turns purple if shield is active!
      else if (kind === 'powerup') rColor = el.getAttribute('color');
      reticle.setAttribute('color', rColor);
      // Add blue color for the restart button
      reticle.setAttribute('color', (kind === 'collect') ? '#ffd84d' : '#ff6b6b');
    }

    // 🧠 CRITICAL FIX: Allow the restart button to be gazed at even if paused!
    if (kind !== 'restart' && (!state.running || state.paused)) return;

    // Default UI buttons (like restart) to a 1000ms gaze time
    const ms = kind === 'collect' ? (parseInt(orbInput.value) || state.orbGazeMs) : 
               kind === 'danger' ? (parseInt(dangerInput.value) || state.dangerGazeMs) : 1000;

    const timeout = setTimeout(() => {
      if (kind !== 'restart' && (!state.running || state.paused)) return;
      if (!el.parentNode && kind !== 'restart') return;

      const pos = el.object3D ? el.object3D.position : null;

      if (kind === 'collect') {
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
        const pos = el.object3D.position;
        particleBurst(pos); el.remove();

        // ✨ COMBOS & SCORING
        state.combo++;
        clearTimeout(state.comboTimer);
        state.comboTimer = setTimeout(() => { state.combo = 0; }, 4000); // 4 seconds to keep combo alive
        
        const pts = 1 * state.combo;
        setScore(state.score + pts);
        spawnFloatingText(pos, state.combo > 1 ? `+${pts} (x${state.combo})` : `+${pts}`, state.combo > 1 ? "#ffd84d" : "#fff");

        // ✨ WAVE PROGRESSION
        if (state.score >= 40 && state.wave === 2) {
          state.wave = 3; showToast("WAVE 3: Moving Dangers!", 3000); startSpawners();
        } else if (state.score >= 15 && state.wave === 1) {
          state.wave = 2; showToast("WAVE 2: Speed Up!", 3000); startSpawners();
        }

      } else if (kind === 'powerup') {
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
        const pType = el.dataset.ptype; el.remove();
        
        if (pType === 'time') {
          state.roundTime += 15;
          spawnFloatingText(pos, "+15s Time!", "#4dff88");
        } else if (pType === 'freeze') {
          state.isFrozen = true;
          spawnFloatingText(pos, "Time Freeze!", "#4dffff");
          document.querySelectorAll('.danger').forEach(d => d.pause()); // Freeze animations
          clearTimeout(state.freezeTimer);
          state.freezeTimer = setTimeout(() => {
            state.isFrozen = false;
            if(state.running && !state.paused) document.querySelectorAll('.danger').forEach(d => d.play());
          }, 5000);
        } else if (pType === 'shield') {
          state.shieldActive = true;
          spawnFloatingText(pos, "Shield Active!", "#d94dff");
        }

      } else if (kind === 'danger') {
        // ✨ SHIELD SAVIOR
        if (state.shieldActive) {
          state.shieldActive = false;
          el.remove();
          try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
          spawnFloatingText(pos, "Shield Broken!", "#ff6b6b");
          
        
        } else {
          try { document.getElementById('dangerSound')?.play()?.catch(()=>{}); } catch (_) {}
          triggerGameOver('Gazed at danger');
        }
      } else if (kind === 'restart') {
        // ✨ Trigger restart from inside VR!
        try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (_) {}
        restartGame();
      }
    }, ms);

    state.timers.set(el, timeout);
  }

  
  function clearHover(el) {
    const to = state.timers.get(el);
    if (to) { clearTimeout(to); state.timers.delete(el); }
  }

  // particles
  function particleBurst(pos) {
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('a-sphere');
      p.setAttribute('radius', '0.04');
      p.setAttribute('color', '#fff');
      p.object3D.position.set(pos.x, pos.y, pos.z);
      sceneRoot.appendChild(p);
      const dx = pos.x + (Math.random() - 0.5) * 0.6;
      const dy = pos.y + Math.random() * 0.8;
      const dz = pos.z + (Math.random() - 0.5) * 0.6;
      p.setAttribute('animation__m', `property: position; to: ${dx} ${dy} ${dz}; dur: 540; easing: easeOutQuad`);
      p.setAttribute('animation__f', `property: material.opacity; to:0; dur:540; delay:180`);
      setTimeout(() => p.parentNode && p.parentNode.removeChild(p), 800);
    }
  }

  // menu / flow
  function openMenu() {
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.pointerEvents = 'auto';
    // disable scene interactions while menu is open
    document.body.classList.remove('scene-interactive');
    state.paused = true;
    if (state.isFrozen) document.querySelectorAll('.danger').forEach(d => d.pause());
    showToast('Menu opened');
  }

  function closeMenuSave() {
    if (!overlay) return;

    // ✨ FIX: Remove browser focus from the clicked button before hiding the menu
    if (document.activeElement) {
      document.activeElement.blur(); 
    }
    
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.pointerEvents = 'none';
    state.paused = false;
    // enable scene interactions when menu is closed (game active)
    document.body.classList.add('scene-interactive');
    state.orbGazeMs = parseInt(orbInput.value) || state.orbGazeMs;
    state.dangerGazeMs = parseInt(dangerInput.value) || state.dangerGazeMs;
    showToast('Settings saved');
    if (!state.isFrozen) document.querySelectorAll('.danger').forEach(d => d.play());
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
    closeMenuSave();
    state.running = true;
    state.paused = false;

    // ✨ Reset Arcade Stats
    state.wave = 1;
    state.combo = 0;
    state.shieldActive = false;
    state.isFrozen = false;
    clearTimeout(state.freezeTimer);
    setScore(0);

    for (let i = 0; i < 6; i++) spawnOrb();
    for (let i = 0; i < 3; i++) spawnDanger();

    startSpawners();
    startRoundTimer();
    showToast('Game started');

    // try to enter pointer lock for better mouselook (user gesture required)
    try {
      const canvas = document.querySelector('a-scene canvas') || document.querySelector('canvas');
      if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    } catch (e) {
      // not critical — pointer lock may fail (mobile browsers often don't support it)
      console.debug('pointer lock request failed or unsupported', e);
    }
  }
              

              
  function triggerGameOver(msg) {
    state.running = false;
    state.paused = true;
    stopSpawners();
    state.timers.forEach(t => clearTimeout(t));
    state.timers.clear();

    const bstTxt = document.getElementById('bestScoreText');
    if (bstTxt) bstTxt.setAttribute('value', `Personal Best: ${state.highScore}`);
    
    const panel = document.getElementById('gameOverPanel');
    if (panel) {
      panel.setAttribute('visible', 'true');
      panel.setAttribute('position', '0 0 0'); // ✨ Bring panel down to eye level
    }
    
    const got = document.getElementById('gameOverText');
    if (got) got.setAttribute('value', msg);
    showToast(msg); openMenu();
    refreshRaycaster(); // Refresh raycaster so it notices the newly moved button
  }
  



              
  function restartGame() {
    // This single line safely deletes all orbs, dangers, and powerups!
    document.querySelectorAll('.collectable, .danger').forEach(e => e.remove());
    
    const panel = document.getElementById('gameOverPanel');
    if (panel) {
      panel.setAttribute('visible', 'false');
      panel.setAttribute('position', '0 999 0'); // ✨ Banish panel back to the sky
    }
    startGame();
  }

  // UI wiring
  function wireUI() {
    if (enterVRBtn) {
      enterVRBtn.addEventListener('click', async () => {
        console.log('VR button clicked');
        
        const scene = document.querySelector('a-scene');
        if (!scene) return;

    //  allow interaction📱
        document.body.classList.add('scene-interactive');

    //  iOS/Android motion permission 
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
          try {
            await DeviceMotionEvent.requestPermission();
          } catch (e) {}
        }

    // ENTER/exit VR DIRECTLY (no timeout needed)
        try {
          if (scene.is('vr-mode')) {
            scene.exitVR();
          } else {
            scene.enterVR(true); // 👈 mobile magic fix
          }
        } catch (e) {
          console.warn('VR failed:', e);
        }
      });
    }
    
    if (startBtn) startBtn.addEventListener('click', () => {
      console.log('Start Game clicked');
      try { musicManager.init(); musicManager.play(); } catch (e) { console.warn('music start failed', e); }
      startGame();
    });
    
    if (saveBtn) saveBtn.addEventListener('click', () => {
      console.log('Save clicked');
      closeMenuSave();
      try { musicManager.init(); musicManager.play(); } catch (e) {console.warn(e);}
    });
    
    if (restartBtn) restartBtn.addEventListener('click',  () => {
      console.log('Restart clicked');
      restartGame();
    });
      
    if (openMenuBtn) openMenuBtn.addEventListener('click', openMenu);
  }

  
  // init
  document.addEventListener('DOMContentLoaded', () => {
    state.paused = true;
    state.running = false;

    try {
      musicManager.init();
    } catch (e) { /* silent */ }
    
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'false');
    }
    
    setScore(0);
    
    if (timeVal) timeVal.textContent = state.roundTime;
    wireUI();
    
    // ✨ NEW: The Autoplay Workaround (Starts music on first click/tap anywhere)
    const unlockAudio = () => {
      // If it's already playing, do nothing
      if (musicManager.isPlaying()) return; 
      
      try {
        musicManager.init();
        musicManager.play();
      } catch (e) { console.warn('Audio unlock failed:', e); }
      
      // Remove listeners immediately so this only runs once!
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };

    // Attach the one-time listeners to the whole document
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    // ✨ Load High Score from LocalStorage
    const savedBest = localStorage.getItem(state.highScoreKey || 'orbs_cure_highscore');
    state.highScore = parseInt(savedBest) || 0;
    if (document.getElementById('bestVal')) {
      document.getElementById('bestVal').textContent = String(state.highScore);
    }

    
    
    // 🧠 SAFE XR CHECK
    const arBtn = enterARBtn;
    
    if (arBtn && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          if (!supported) {
            enterARBtn.style.display = 'none';
          }
        })
        .catch(() => {
          arBtn.style.display = 'none';
        });
    } else if (arBtn) {
      arBtn.style.display = 'none';
    }
  });
      

// debug helpers
  window._orbsGame = {
    startGame,
    restartGame,
    state,
    spawnOrb,
    spawnDanger,
    triggerGameOver
  };
  
  return state;

})(); //  This correctly closes and immediately invokes the game module!              
