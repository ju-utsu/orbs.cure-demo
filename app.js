/* app.js
   Game logic for Neon Grid Orb Collector (A-Frame).
   Put this file next to index.html and style.css.
*/

/* ----------------- State & DOM refs ----------------- */
const state = {
  running: false,
  paused: true,
  score: 0,
  orbGazeMs: 500,
  dangerGazeMs: 500,
  timers: new Map(),
  roundTime: 60,
  roundTimer: null,
  maxOrbsOnScreen: 12,
  maxDangerOnScreen: 5,
  spawnIntervals: { orb: null, danger: null }
};

const hudScoreElem = document.getElementById('scoreVal');
const hudTimeElem  = document.getElementById('timeVal');
const toastElem    = document.getElementById('toast');
const overlay      = document.getElementById('menuOverlay');
const orbInput     = document.getElementById('orbGazeInput');
const dangerInput  = document.getElementById('dangerGazeInput');
const numOrbsInput = document.getElementById('numOrbs');
const numDangerInput = document.getElementById('numDanger');
const startBtn     = document.getElementById('startGameBtn');
const saveBtn      = document.getElementById('saveSettingsBtn');
const restartBtn   = document.getElementById('restartBtn');
const openMenuBtn  = document.getElementById('openMenuBtn');
const sceneElem    = document.querySelector('a-scene');
const neonGrid     = document.getElementById('neonGrid');
const starsElem    = document.getElementById('stars');
const collectSpawner = document.getElementById('collect-spawner');
const dangerSpawner  = document.getElementById('danger-spawner');
const ray           = document.getElementById('ray');
const reticle       = document.getElementById('reticle');

const xrButtonsContainer = document.getElementById('xrButtons');
const enterVRBtn = document.getElementById('enterVRBtn');
const enterARBtn = document.getElementById('enterARBtn');

/* ----------------- Small helpers ----------------- */
function showToast(msg, ms=1200){
  toastElem.textContent = msg;
  toastElem.style.display = 'block';
  clearTimeout(toastElem._t);
  toastElem._t = setTimeout(()=> { toastElem.style.display='none'; }, ms);
}
function setScore(n){
  state.score = n;
  hudScoreElem.textContent = n;
}

/* ----------------- Build neon grid & stars ----------------- */
function buildNeonGrid(){
  while(neonGrid.firstChild) neonGrid.removeChild(neonGrid.firstChild);
  const size = 40, step = 1, half = size/2;
  for(let i=-half;i<=half;i+=step){
    // X lines
    const lineX = document.createElement('a-box');
    lineX.setAttribute('width', `${size}`);
    lineX.setAttribute('height', '0.01');
    lineX.setAttribute('depth', '0.02');
    lineX.setAttribute('position', `0 0.001 ${i}`);
    lineX.setAttribute('material', `color: #0ff; emissive: #0ff; opacity:${(i%5===0?0.16:0.07)}`);
    neonGrid.appendChild(lineX);
    // Z lines
    const lineZ = document.createElement('a-box');
    lineZ.setAttribute('width', '0.02');
    lineZ.setAttribute('height', '0.01');
    lineZ.setAttribute('depth', `${size}`);
    lineZ.setAttribute('position', `${i} 0.001 0`);
    lineZ.setAttribute('material', `color: #9f7bff; emissive: #9f7bff; opacity:${(i%5===0?0.12:0.05)}`);
    neonGrid.appendChild(lineZ);
  }
  const glow = document.createElement('a-plane');
  glow.setAttribute('rotation','-90 0 0');
  glow.setAttribute('width','80'); glow.setAttribute('height','80');
  glow.setAttribute('position','0 0.0005 0');
  glow.setAttribute('material','color:#001524; shader: flat; opacity:0.6');
  neonGrid.appendChild(glow);
}

function buildStars(){
  while(starsElem.firstChild) starsElem.removeChild(starsElem.firstChild);
  for(let i=0;i<120;i++){
    const s = document.createElement('a-sphere');
    const rx = (Math.random()-0.5)*140;
    const ry = 4 + Math.random()*40;
    const rz = (Math.random()-0.5)*140;
    s.setAttribute('position', `${rx} ${ry} ${rz}`);
    s.setAttribute('radius', `${0.02 + Math.random()*0.06}`);
    s.setAttribute('material', 'color: #dff6ff; shader: flat; opacity:0.85');
    starsElem.appendChild(s);
  }
}

/* ----------------- Spawn logic ----------------- */
function randPos(){
  const a = Math.random()*Math.PI*2;
  const r = 3 + Math.random()*8;
  const y = 0.9 + Math.random()*1.6;
  return { x: Math.cos(a)*r, y, z: Math.sin(a)*r };
}

function spawnOrb(){
  const p = randPos();
  const orb = document.createElement('a-sphere');
  orb.classList.add('interactable','collectable');
  orb.setAttribute('radius','0.28');
  orb.setAttribute('color','#ffd84d');
  orb.setAttribute('emissive','#ffeb99');
  orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
  orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${2000+Math.floor(Math.random()*1000)}; to: ${p.x} ${p.y+0.25} ${p.z}; loop: true; easing: easeInOutSine`);
  orb.dataset.gaze = 'collect';
  collectSpawner.appendChild(orb);
}

function spawnDanger(){
  const p = randPos();
  const bad = document.createElement('a-box');
  bad.classList.add('interactable','danger');
  bad.setAttribute('width','0.45'); bad.setAttribute('height','0.45'); bad.setAttribute('depth','0.45');
  bad.setAttribute('color','#d43b3b');
  bad.setAttribute('position', `${p.x} ${Math.max(0.5,p.y-0.6)} ${p.z}`);
  bad.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur: 6000; loop:true; easing:linear');
  bad.dataset.gaze = 'danger';
  dangerSpawner.appendChild(bad);
}

function startContinuousSpawns(){
  stopContinuousSpawns();
  state.spawnIntervals.orb = setInterval(()=>{
    if(!state.running || state.paused) return;
    const maxOrbs = parseInt(numOrbsInput.value) || state.maxOrbsOnScreen;
    if(collectSpawner.children.length < maxOrbs) spawnOrb();
  }, 700);
  state.spawnIntervals.danger = setInterval(()=>{
    if(!state.running || state.paused) return;
    const maxDanger = parseInt(numDangerInput.value) || state.maxDangerOnScreen;
    if(dangerSpawner.children.length < maxDanger) spawnDanger();
  }, 1800);
}
function stopContinuousSpawns(){
  if(state.spawnIntervals.orb) clearInterval(state.spawnIntervals.orb);
  if(state.spawnIntervals.danger) clearInterval(state.spawnIntervals.danger);
  state.spawnIntervals.orb = state.spawnIntervals.danger = null;
}

/* ----------------- Gaze handling ----------------- */
let hovered = null;
if (ray) {
  ray.addEventListener('raycaster-intersection', (evt) => {
    const els = evt.detail.els || (evt.detail.intersections && evt.detail.intersections.map(i=>i.object.el));
    const el = els && els.length ? els[0] : null;
    if(el && el !== hovered){ if(hovered) clearHover(hovered); startHover(el); hovered = el; }
  });
  ray.addEventListener('raycaster-intersection-cleared', ()=> {
    if(hovered) clearHover(hovered);
    hovered = null;
    if(reticle) { reticle.setAttribute('color','#8ff0ff'); reticle.setAttribute('scale','1 1 1'); }
  });
}

function startHover(el){
  const kind = el.dataset && el.dataset.gaze ? el.dataset.gaze : null;
  if(!kind) return;
  if(kind==='collect' && reticle) reticle.setAttribute('color','#ffd84d');
  else if(kind==='danger' && reticle) reticle.setAttribute('color','#ff4d4d');
  if(reticle) reticle.setAttribute('scale','1.6 1.6 1');

  if(!state.running || state.paused) return;

  const ms = (kind==='collect') ? (parseInt(orbInput.value) || state.orbGazeMs)
                               : (parseInt(dangerInput.value) || state.dangerGazeMs);

  const to = setTimeout(()=>{
    if(!state.running || state.paused) return;
    if(kind==='collect'){
      const pos = el.object3D.position;
      particleBurst(pos);
      document.getElementById('collectSound').play().catch(()=>{});
      el.parentNode && el.parentNode.removeChild(el);
      setScore(state.score + 1);
    } else if(kind==='danger'){
      document.getElementById('dangerSound').play().catch(()=>{});
      triggerGameOver('Gazed at danger');
    }
  }, ms);
  state.timers.set(el, to);
}

function clearHover(el){
  const to = state.timers.get(el);
  if(to){ clearTimeout(to); state.timers.delete(el); }
}

/* ----------------- Particles ----------------- */
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

/* ----------------- Menu & game flow ----------------- */
function openMenu(){
  state.paused = true;
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden','false');
  showToast('Menu opened');
}
function saveSettings(){
  state.orbGazeMs = parseInt(orbInput.value) || state.orbGazeMs;
  state.dangerGazeMs = parseInt(dangerInput.value) || state.dangerGazeMs;
  state.maxOrbsOnScreen = parseInt(numOrbsInput.value) || state.maxOrbsOnScreen;
  state.maxDangerOnScreen = parseInt(numDangerInput.value) || state.maxDangerOnScreen;
  showToast('Settings saved');
}
function closeMenuAndStart(){
  saveSettings();
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden','true');
  state.paused = false;
  state.running = true;
  setScore(0);
  for(let i=0;i<6;i++) spawnOrb();
  for(let i=0;i<3;i++) spawnDanger();
  startContinuousSpawns();
  startRound();
  showToast('Game started');
}
function triggerGameOver(msg){
  state.running = false;
  state.paused = true;
  stopContinuousSpawns();
  const panel = document.getElementById('gameOverPanel');
  document.getElementById('gameOverText').setAttribute('value', msg);
  panel.setAttribute('visible','true');
  showToast('Game Over');
}
function restart(){
  state.timers.forEach(t=>clearTimeout(t)); state.timers.clear();
  Array.from(collectSpawner.children).forEach(c=>c.remove());
  Array.from(dangerSpawner.children).forEach(d=>d.remove());
  document.getElementById('gameOverPanel').setAttribute('visible','false');
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden','false');
  state.running = false;
  state.paused = true;
  setScore(0);
}

/* ----------------- Round timer ----------------- */
function startRound(){
  clearInterval(state.roundTimer);
  state.roundTime = 60;
  hudTimeElem.textContent = state.roundTime;
  state.roundTimer = setInterval(()=>{
    if(!state.running || state.paused) return;
    state.roundTime -= 1;
    hudTimeElem.textContent = state.roundTime;
    if(state.roundTime <= 0){
      clearInterval(state.roundTimer);
      triggerGameOver("Time's up");
    }
  }, 1000);
}

/* ----------------- Helpers ----------------- */
function setScore(n){ state.score = n; hudScoreElem.textContent = n; }

/* ----------------- XR buttons helper ----------------- */
function setupXRButtons(){
  // Show manual container
  if(!xrButtonsContainer) return;
  xrButtonsContainer.style.display = 'flex';

  // VR manual button — uses A-Frame's enterVR if available
  if(enterVRBtn) enterVRBtn.addEventListener('click', ()=> {
    const s = document.querySelector('a-scene');
    if(s && s.enterVR) s.enterVR();
    else showToast('VR not available');
  });

  // AR detection & manual request
  if(enterARBtn && navigator.xr && navigator.xr.isSessionSupported){
    navigator.xr.isSessionSupported('immersive-ar').then((supported)=>{
      if(supported){
        enterARBtn.style.display = 'inline-block';
        enterARBtn.addEventListener('click', async ()=>{
          try{
            // Try to start an immersive-ar session; A-Frame will normally manage the renderer session when available,
            // but we attempt a simple request to force permission prompt and start an AR session when possible.
            const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: [] });
            showToast('AR session started (device dependent).');
            // A-Frame will attach session automatically in many browsers; otherwise the session object is available here.
            // We don't programmatically attach it to the A-Frame renderer to avoid interfering with A-Frame internals.
          }catch(err){
            console.error('AR start failed:', err);
            showToast('AR not available or permission denied');
          }
        });
      }
    }).catch(()=>{/* ignore */});
  }
}

/* ----------------- Wire UI events ----------------- */
if (startBtn) startBtn.addEventListener('click', closeMenuAndStart);
if (saveBtn) saveBtn.addEventListener('click', ()=>{ saveSettings(); overlay.style.display='none'; overlay.setAttribute('aria-hidden','true'); state.paused=false; });
if (restartBtn) restartBtn.addEventListener('click', restart);
if (openMenuBtn) openMenuBtn.addEventListener('click', openMenu);
window.addEventListener('keydown', (e)=>{ if(e.key && e.key.toLowerCase()==='m') openMenu(); });

/* ----------------- Init ----------------- */
buildNeonGrid();
buildStars();
setScore(0);
hudTimeElem.textContent = state.roundTime;
try { setupXRButtons(); } catch(err){ console.warn('XR buttons setup failed', err); }

/* Note:
 - If AR still doesn't enter after camera permission: open the browser console, copy errors and share them with me.
 - For best AR compatibility use Chrome on ARCore-enabled Android devices; iOS has limited WebXR AR support.
*/
