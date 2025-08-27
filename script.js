/* script.js
   Final working game logic:
   - builds neon grid + stars
   - spawns orbs and danger objects
   - gaze collection using A-Frame cursor fuse (click event)
   - background music + SFX with master volume
   - back-to-menu and menu controls
*/

const state = {
  running: false,
  paused: true,
  score: 0,
  orbGazeMs: 600,
  dangerGazeMs: 800,
  roundTime: 60,
  roundTimer: null,
  spawnIntervals: { orb: null, danger: null }
};

const refs = {};
document.addEventListener('DOMContentLoaded', () => {
  // DOM refs
  refs.scoreVal = document.getElementById('scoreVal');
  refs.timeVal = document.getElementById('timeVal');
  refs.toast = document.getElementById('toast');
  refs.overlay = document.getElementById('menuOverlay');
  refs.orbInput = document.getElementById('orbGazeInput');
  refs.dangerInput = document.getElementById('dangerGazeInput');
  refs.numOrbs = document.getElementById('numOrbs');
  refs.numDangers = document.getElementById('numDangers');
  refs.masterVol = document.getElementById('masterVolume');
  refs.startBtn = document.getElementById('startGameBtn');
  refs.saveBtn = document.getElementById('saveSettingsBtn');
  refs.restartBtn = document.getElementById('restartBtn');
  refs.openMenuBtn = document.getElementById('openMenuBtn');
  refs.backMenuBtn = document.getElementById('backMenuBtn');

  // A-Frame refs
  refs.scene = document.querySelector('a-scene');
  refs.collectSpawner = document.getElementById('collect-spawner');
  refs.dangerSpawner = document.getElementById('danger-spawner');
  refs.neonGrid = document.getElementById('neonGrid');
  refs.stars = document.getElementById('stars');
  refs.ray = document.getElementById('ray');
  refs.reticle = document.getElementById('reticle');
  refs.vrScoreText = document.getElementById('vrScoreText');

  // Audio elements from assets
  refs.bgMusic = document.getElementById('bgMusic');
  refs.collectSfx = document.getElementById('collectSfx');
  refs.dangerSfx = document.getElementById('dangerSfx');

  // Wire UI
  refs.startBtn.addEventListener('click', startGame);
  refs.saveBtn.addEventListener('click', () => { saveSettings(); closeOverlay(); });
  refs.restartBtn.addEventListener('click', restart);
  refs.openMenuBtn.addEventListener('click', openOverlay);
  refs.backMenuBtn.addEventListener('click', backToMenu);
  window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'm') openOverlay(); });

  // Master volume control
  refs.masterVol.addEventListener('input', () => {
    setMasterVolume(parseFloat(refs.masterVol.value));
  });

  // Build environment visuals
  buildNeonGrid();
  buildStars();

  // Setup gaze ray handlers (safety: ensure ray exists)
  if (refs.ray) {
    refs.ray.addEventListener('raycaster-intersection', rayIntersectHandler);
    refs.ray.addEventListener('raycaster-intersection-cleared', () => {
      if (refs.reticle) { refs.reticle.setAttribute('color', '#8ff0ff'); refs.reticle.setAttribute('scale', '1 1 1'); }
    });
  }

  // Initial UI states
  refs.overlay.style.display = 'block';
  refs.overlay.setAttribute('aria-hidden', 'false');
  setScore(0);
  refs.timeVal.textContent = state.roundTime;

  // Ensure master volume default
  setMasterVolume(parseFloat(refs.masterVol.value || 0.9));
});

/* ---------------- Environment builders ---------------- */
function buildNeonGrid(){
  const neonGrid = refs.neonGrid;
  while (neonGrid.firstChild) neonGrid.removeChild(neonGrid.firstChild);
  const size = 40, step = 1, half = size / 2;
  for (let i = -half; i <= half; i += step){
    const lineX = document.createElement('a-box');
    lineX.setAttribute('width', `${size}`);
    lineX.setAttribute('height', '0.01');
    lineX.setAttribute('depth', '0.02');
    lineX.setAttribute('position', `0 0.001 ${i}`);
    lineX.setAttribute('material', `color: #0ff; emissive: #0ff; opacity:${(i%5===0?0.16:0.07)}`);
    neonGrid.appendChild(lineX);

    const lineZ = document.createElement('a-box');
    lineZ.setAttribute('width', '0.02');
    lineZ.setAttribute('height', '0.01');
    lineZ.setAttribute('depth', `${size}`);
    lineZ.setAttribute('position', `${i} 0.001 0`);
    lineZ.setAttribute('material', `color: #9f7bff; emissive: #9f7bff; opacity:${(i%5===0?0.12:0.05)}`);
    neonGrid.appendChild(lineZ);
  }
  const glow = document.createElement('a-plane');
  glow.setAttribute('rotation', '-90 0 0');
  glow.setAttribute('width', '80'); glow.setAttribute('height', '80');
  glow.setAttribute('position', '0 0.0005 0');
  glow.setAttribute('material', 'color:#001524; shader: flat; opacity:0.6');
  neonGrid.appendChild(glow);
}

function buildStars(){
  const stars = refs.stars;
  while (stars.firstChild) stars.removeChild(stars.firstChild);
  for (let i=0;i<120;i++){
    const s = document.createElement('a-sphere');
    const rx = (Math.random()-0.5)*140;
    const ry = 4 + Math.random()*40;
    const rz = (Math.random()-0.5)*140;
    s.setAttribute('position', `${rx} ${ry} ${rz}`);
    s.setAttribute('radius', `${0.02 + Math.random()*0.06}`);
    s.setAttribute('material', 'color: #dff6ff; shader: flat; opacity:0.85');
    stars.appendChild(s);
  }
}

/* ---------------- Spawning ---------------- */
function randPos(){
  const a = Math.random()*Math.PI*2;
  const r = 3 + Math.random()*8;
  const y = 0.9 + Math.random()*1.6;
  return { x: Math.cos(a)*r, y, z: Math.sin(a)*r };
}

function spawnOrb(){
  const p = randPos();
  const orb = document.createElement('a-sphere');
  orb.classList.add('interactable', 'collectable');
  orb.setAttribute('radius', '0.28');
  orb.setAttribute('color', '#ffd84d');
  orb.setAttribute('emissive', '#ffeb99');
  orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
  orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${2000+Math.floor(Math.random()*1000)}; to: ${p.x} ${p.y+0.25} ${p.z}; loop: true; easing: easeInOutSine`);
  orb.dataset.gaze = 'collect';
  // click event fired by A-Frame cursor after fuse
  orb.addEventListener('click', (ev) => {
    // play sfx and particle
    refs.collectSfx.play().catch(()=>{});
    particleBurst(orb.object3D.position);
    orb.parentNode && orb.parentNode.removeChild(orb);
    setScore(state.score + 1);
  });
  refs.collectSpawner.appendChild(orb);
}

function spawnDanger(){
  const p = randPos();
  const bad = document.createElement('a-box');
  bad.classList.add('interactable', 'danger');
  bad.setAttribute('width','0.45'); bad.setAttribute('height','0.45'); bad.setAttribute('depth','0.45');
  bad.setAttribute('color','#d43b3b');
  bad.setAttribute('position', `${p.x} ${Math.max(0.5,p.y-0.6)} ${p.z}`);
  bad.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur: 6000; loop:true; easing:linear');
  bad.dataset.gaze = 'danger';
  bad.addEventListener('click', ()=>{
    refs.dangerSfx.play().catch(()=>{});
    triggerGameOver('Gazed at a danger');
  });
  refs.dangerSpawner.appendChild(bad);
}

function startContinuousSpawns(){
  stopContinuousSpawns();
  state.spawnIntervals.orb = setInterval(()=>{
    if(!state.running || state.paused) return;
    const maxOrbs = parseInt(refs.numOrbs.value) || 12;
    if(refs.collectSpawner.children.length < maxOrbs) spawnOrb();
  }, 700);
  state.spawnIntervals.danger = setInterval(()=>{
    if(!state.running || state.paused) return;
    const maxDanger = parseInt(refs.numDangers.value) || 5;
    if(refs.dangerSpawner.children.length < maxDanger) spawnDanger();
  }, 1800);
}
function stopContinuousSpawns(){
  if(state.spawnIntervals.orb) clearInterval(state.spawnIntervals.orb);
  if(state.spawnIntervals.danger) clearInterval(state.spawnIntervals.danger);
  state.spawnIntervals.orb = state.spawnIntervals.danger = null;
}

/* ---------------- Gaze reticle intersection helper (additional feedback) ---------------- */
function rayIntersectHandler(evt){
  const els = evt.detail.els || (evt.detail.intersections && evt.detail.intersections.map(i=>i.object.el));
  const el = els && els.length ? els[0] : null;
  if(!el) return;
  const kind = el.dataset && el.dataset.gaze ? el.dataset.gaze : null;
  if(kind === 'collect' && refs.reticle) refs.reticle.setAttribute('color', '#ffd84d');
  else if(kind === 'danger' && refs.reticle) refs.reticle.setAttribute('color', '#ff4d4d');
  if(refs.reticle) refs.reticle.setAttribute('scale', '1.6 1.6 1');
}

/* ---------------- Particles ---------------- */
function particleBurst(pos){
  for(let i=0;i<10;i++){
    const p = document.createElement('a-sphere');
    p.setAttribute('radius','0.04'); p.setAttribute('color','#fff');
    p.object3D.position.set(pos.x,pos.y,pos.z);
    document.querySelector('a-scene').appendChild(p);
    const dx = pos.x + (Math.random()-0.5)*0.6;
    const dy = pos.y + Math.random()*0.8;
    const dz = pos.z + (Math.random()-0.5)*0.6;
    p.setAttribute('animation__m', `property: position; to: ${dx} ${dy} ${dz}; dur: 520; easing: easeOutQuad`);
    p.setAttribute('animation__f', `property: material.opacity; to:0; dur:520; delay:180`);
    setTimeout(()=>{ p.parentNode && p.parentNode.removeChild(p); }, 720);
  }
}

/* ---------------- Menu & game flow ---------------- */
function openOverlay(){
  state.paused = true;
  refs.overlay.style.display = 'block';
  refs.overlay.setAttribute('aria-hidden','false');
  showToast('Menu opened');
}
function closeOverlay(){
  refs.overlay.style.display = 'none';
  refs.overlay.setAttribute('aria-hidden','true');
}
function saveSettings(){
  state.orbGazeMs = parseInt(refs.orbInput.value) || state.orbGazeMs;
  state.dangerGazeMs = parseInt(refs.dangerInput.value) || state.dangerGazeMs;
  showToast('Settings saved');
}
function startGame(){
  saveSettings();
  closeOverlay();
  state.paused = false;
  state.running = true;
  setScore(0);
  // seed a few objects
  for(let i=0;i<6;i++) spawnOrb();
  for(let i=0;i<3;i++) spawnDanger();
  startContinuousSpawns();
  startRound();
  // play background music
  refs.bgMusic.loop = true;
  refs.bgMusic.play().catch(()=>{ /* autoplay may require user gesture */});
  showToast('Game started');
}
function triggerGameOver(msg){
  state.running = false; state.paused = true;
  stopContinuousSpawns();
  const panel = document.getElementById('gameOverPanel');
  document.getElementById('gameOverText').setAttribute('value', msg);
  panel.setAttribute('visible','true');
  refs.bgMusic.pause();
  showToast('Game Over');
}
function restart(){
  state.timers && state.timers.forEach(t=>clearTimeout(t));
  state.timers = new Map();
  Array.from(refs.collectSpawner.children).forEach(c=>c.remove());
  Array.from(refs.dangerSpawner.children).forEach(d=>d.remove());
  document.getElementById('gameOverPanel').setAttribute('visible','false');
  // show overlay to let user start again
  refs.overlay.style.display = 'block';
  refs.overlay.setAttribute('aria-hidden','false');
  state.running = false;
  state.paused = true;
  setScore(0);
}
function backToMenu(){
  // stop game and show menu
  state.running = false; state.paused = true;
  stopContinuousSpawns();
  refs.bgMusic.pause();
  refs.overlay.style.display = 'block';
  refs.overlay.setAttribute('aria-hidden','false');
  showToast('Returned to menu');
}

/* ---------------- Round timer ---------------- */
function startRound(){
  clearInterval(state.roundTimer);
  state.roundTime = 60;
  refs.timeVal.textContent = state.roundTime;
  state.roundTimer = setInterval(()=>{
    if(!state.running || state.paused) return;
    state.roundTime -= 1;
    refs.timeVal.textContent = state.roundTime;
    if(state.roundTime <= 0){
      clearInterval(state.roundTimer);
      triggerGameOver("Time's up");
    }
  }, 1000);
}

/* ---------------- Utilities ---------------- */
function setScore(n){ state.score = n; refs.scoreVal.textContent = n; if(refs.vrScoreText) refs.vrScoreText.setAttribute('value', `Score: ${n}`); }
function showToast(msg, ms = 1200){ refs.toast.textContent = msg; refs.toast.style.display = 'block'; clearTimeout(refs.toast._t); refs.toast._t = setTimeout(()=> refs.toast.style.display = 'none', ms); }
function setMasterVolume(v){
  try {
    if (refs.bgMusic) refs.bgMusic.volume = v;
    if (refs.collectSfx) refs.collectSfx.volume = v;
    if (refs.dangerSfx) refs.dangerSfx.volume = v;
  } catch(e){}
}

/* Expose start/controls to global for quick testing (optional) */
window.startGame = startGame;
window.openMenu = openOverlay;
window.backToMenu = backToMenu;
