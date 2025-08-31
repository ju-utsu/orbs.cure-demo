// ---------------- State & refs ----------------
const state = {
  running: false,
  paused: true,
  score: 0,
  orbGazeMs: 150,
  dangerGazeMs: 500,
  timers: new Map(),
  roundTime: 6000,
  roundTimer: null,
  intervals: { orb: null, danger: null },
};

const scoreVal = document.getElementById('scoreVal');
const timeVal = document.getElementById('timeVal');
const toast = document.getElementById('toast');
const overlay = document.getElementById('menuOverlay');
const orbInput = document.getElementById('orbGazeInput');
const dangerInput = document.getElementById('dangerGazeInput');
const vrScore = document.getElementById('vrScore');
const startBtn = document.getElementById('startGameBtn');
const saveBtn = document.getElementById('saveSettings');
const restartBtnHtml = document.getElementById('restartBtn');
const openMenuBtn = document.getElementById('openMenuBtn');

const collectSpawner = document.getElementById('collect-spawner');
const dangerSpawner = document.getElementById('danger-spawner');
const ray = document.getElementById('ray');
const reticle = document.getElementById('reticle');
const sceneEl  = document.getElementById('scene');

// --------- UI helpers ---------
function showToast(msg, ms=1200){
  toast.textContent=msg; toast.style.display='block';
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>toast.style.display='none', ms);
}
function setScore(v){
  state.score=v;
  scoreVal.textContent=v;
  if(vrScore) vrScore.setAttribute('value', `Score: ${v}`);
}

// ---------------- Spawning ----------------
function randPos(){
  const r = 3 + Math.random()*8;
  const a = Math.random()*Math.PI*2;
  const y = 0.9 + Math.random()*1.8;
  return {x: Math.cos(a)*r, y, z: Math.sin(a)*r};
}

function spawnOrb(){
  const p = randPos();
  const orb = document.createElement('a-sphere');
  orb.classList.add('interactable','collectable');
  orb.setAttribute('radius','0.28');
  orb.setAttribute('color','#ffd84d');
  orb.setAttribute('emissive','#ffeb99');
  orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
  orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${2200+Math.floor(Math.random()*1000)}; to: ${p.x} ${p.y+0.25} ${p.z}; loop: true; easing: easeInOutSine`);
  orb.dataset.gaze = 'collect';
  collectSpawner.appendChild(orb);
}

function spawnDanger(){
  const p = randPos();
  const bad = document.createElement('a-box');
  bad.classList.add('interactable','danger');
  bad.setAttribute('width','0.5'); bad.setAttribute('height','0.5'); bad.setAttribute('depth','0.5');
  bad.setAttribute('color','#d43b3b');
  bad.setAttribute('position', `${p.x} ${Math.max(0.5,p.y-0.6)} ${p.z}`);
  bad.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur: 6000; loop:true; easing:linear');
  bad.dataset.gaze = 'danger';
  dangerSpawner.appendChild(bad);
}

const MAX_ORBS_ON_SCREEN = 300;
const MAX_DANGER_ON_SCREEN = 85;

function startContinuousSpawns(){
  stopContinuousSpawns();
  state.intervals.orb = setInterval(()=>{
    if(!state.running || state.paused) return;
    if(collectSpawner.children.length < MAX_ORBS_ON_SCREEN) spawnOrb();
  }, 800);
  state.intervals.danger = setInterval(()=>{
    if(!state.running || state.paused) return;
    if(dangerSpawner.children.length < MAX_DANGER_ON_SCREEN) spawnDanger();
  }, 2000);
}
function stopContinuousSpawns(){
  if(state.intervals.orb) clearInterval(state.intervals.orb);
  if(state.intervals.danger) clearInterval(state.intervals.danger);
  state.intervals.orb = state.intervals.danger = null;
}

// ---------------- Gaze logic ----------------
let hovered = null;
ray.addEventListener('raycaster-intersection', (e)=>{
  const els = e.detail.els || (e.detail.intersections && e.detail.intersections.map(i=>i.object.el));
  const el = els && els.length ? els[0] : null;
  if(el && el !== hovered){ if(hovered) clearHover(hovered); startHover(el); hovered = el; }
});
ray.addEventListener('raycaster-intersection-cleared', ()=>{
  if(hovered) clearHover(hovered);
  hovered = null;
  reticle.setAttribute('color','#bfe5ff');
  reticle.setAttribute('scale','1 1 1');
});

function startHover(el){
  const kind = el.dataset && el.dataset.gaze ? el.dataset.gaze : null;
  if(!kind) return;
  if(kind==='collect') reticle.setAttribute('color','#ffd84d');
  else if(kind==='danger') reticle.setAttribute('color','#ff4d4d');
  reticle.setAttribute('scale','1.6 1.6 1');

  if(!state.running || state.paused) return;
  const ms = (kind==='collect') ? (parseInt(orbInput.value)||state.orbGazeMs)
                                : (parseInt(dangerInput.value)||state.dangerGazeMs);
  const to = setTimeout(()=>{
    if(!state.running || state.paused) return;
    if(kind==='collect'){
      const pos = el.object3D.position; particleBurst(pos);
      document.getElementById('collectSound').play().catch(()=>{});
      el.parentNode && el.parentNode.removeChild(el);
      setScore(state.score+1);
    } else if(kind==='danger'){
      document.getElementById('dangerSound').play().catch(()=>{});
      triggerGameOver('Gazed at danger');
    }
  }, ms);
  state.timers.set(el, to);
}

function clearHover(el){
  const to = state.timers.get(el);
  if(to){ clearTimeout(to); state.timers.delete(el);}
}

// --------- Particles ---------
function particleBurst(pos){
  for(let i=0;i<10;i++){
    const p=document.createElement('a-sphere');
    p.setAttribute('radius','0.04'); p.setAttribute('color','#fff');
    p.object3D.position.set(pos.x,pos.y,pos.z);
    document.querySelector('a-scene').appendChild(p);
    const dx=pos.x+(Math.random()-0.5)*0.6; const dy=pos.y+Math.random()*0.8; const dz=pos.z+(Math.random()-0.5)*0.6;
    p.setAttribute('animation__m', `property: position; to: ${dx} ${dy} ${dz}; dur: 520; easing: easeOutQuad`);
    p.setAttribute('animation__f', `property: material.opacity; to:0; dur:520; delay:180`);
    setTimeout(()=>{ p.parentNode && p.parentNode.removeChild(p); },720);
  }
}

// ---------------- Menu / game flow ----------------
function openMenu(){ state.paused = true; overlay.style.display = 'block'; overlay.setAttribute('aria-hidden','false');
                    showToast('Menu opened'); }
function closeMenuSave(){
    // ensure overlay is hidden and UI unblocked
try {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden','true');
  } catch(e){ console.warn('closeMenuSave overlay hide failed', e);
  state.orbGazeMs = parseInt(orbInput.value)||state.orbGazeMs;
  state.dangerGazeMs = parseInt(dangerInput.value)||state.dangerGazeMs;
  showToast('Settings saved');
}

function startRound(){
  clearInterval(state.roundTimer);
  state.roundTime = 6000;
  timeVal.textContent = state.roundTime;
  state.roundTimer = setInterval(()=>{
    if(!state.running || state.paused) return;
    state.roundTime -= 1;
    timeVal.textContent = state.roundTime;
    if(state.roundTime<=0){ clearInterval(state.roundTimer); triggerGameOver("Time's up"); }
  }, 1000);
}

function startGame(){// defensive: attempt to hide overlay even if earlier code failed
  try { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden','true'); } catch(e){}

  closeMenuSave();  // still call to be safe
  state.running = true; state.paused = false; setScore(0);
  // seed a few objects
  for(let i=0;i<6;i++) spawnOrb();
  for(let i=0;i<3;i++) spawnDanger();
  startContinuousSpawns();
  startRound();
  showToast('Game Started!');
}

function triggerGameOver(msg){
  state.running=false; state.paused=true; stopContinuousSpawns();
  const panel=document.getElementById('gameOverPanel'); document.getElementById('gameOverText').setAttribute('value', msg);
  panel.setAttribute('visible','true'); showToast('Game Over');
}

function restart(){
  state.timers.forEach(t=>clearTimeout(t)); state.timers.clear();
  Array.from(collectSpawner.children).forEach(c=>c.remove());
  Array.from(dangerSpawner.children).forEach(d=>d.remove());
  document.getElementById('gameOverPanel').setAttribute('visible','false');
  startGame();
}

// ---------------- UI wiring ----------------
startBtn.addEventListener('click', startGame);
saveBtn.addEventListener('click', closeMenuSave);
restartBtnHtml.addEventListener('click', restart);
openMenuBtn.addEventListener('click', openMenu);
window.addEventListener('keydown', (e)=>{ if(e.key.toLowerCase()==='m') openMenu(); });

// On load
overlay.style.display='block';
overlay.setAttribute('aria-hidden','false');
setScore(0); timeVal.textContent = 60;
