const enterARBtn = document.getElementById('enterARBtn');
const arReticle = document.getElementById('arReticle');
const scene = document.querySelector('a-scene');
const scoreVal = document.getElementById('scoreVal');
const toast = document.getElementById('toast');

let xrSession = null;
let xrRefSpace = null;
let xrHitTestSource = null;
let state = {
  score: 0,
  running: false,
  orbInterval: null,
  dangerInterval: null
};

function showToast(msg, ms=1200){
  toast.textContent = msg; toast.style.display='block';
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>toast.style.display='none', ms);
}

function setScore(v){ state.score=v; scoreVal.textContent=v; }

// ---------------- Spawn AR objects ----------------
function spawnAROrb(){
  const p = arReticle.object3D.position;
  const orb = document.createElement('a-sphere');
  orb.classList.add('ar-collectable');
  orb.setAttribute('radius', '0.15');
  orb.setAttribute('color', '#ffd84d');
  orb.setAttribute('emissive', '#ffeb99');
  orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
  orb.setAttribute('animation__float', `property: position; dir: alternate; dur: 2000; to: ${p.x} ${p.y+0.2} ${p.z}; loop: true; easing: easeInOutSine`);
  scene.appendChild(orb);
}

function spawnARDanger(){
  const p = arReticle.object3D.position;
  const danger = document.createElement('a-box');
  danger.classList.add('ar-danger');
  danger.setAttribute('width','0.3'); danger.setAttribute('height','0.3'); danger.setAttribute('depth','0.3');
  danger.setAttribute('color','#d43b3b');
  danger.setAttribute('position', `${p.x + (Math.random()-0.5)*0.5} ${p.y} ${p.z + (Math.random()-0.5)*0.5}`);
  danger.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur: 4000; loop:true; easing:linear');
  scene.appendChild(danger);
}

// ---------------- AR Game Loop ----------------
function startARGame(){
  state.running = true;
  setScore(0);
  showToast("AR Game Started!");

  // Spawn initial objects
  for(let i=0;i<4;i++) spawnAROrb();
  for(let i=0;i<2;i++) spawnARDanger();

  // Continuous spawn
  state.orbInterval = setInterval(()=>{ if(state.running) spawnAROrb(); }, 1500);
  state.dangerInterval = setInterval(()=>{ if(state.running) spawnARDanger(); }, 3500);
}

function stopARGame(){
  state.running=false;
  clearInterval(state.orbInterval);
  clearInterval(state.dangerInterval);
  document.querySelectorAll('.ar-collectable, .ar-danger').forEach(el=>el.remove());
  showToast("Game Over");
}

// ---------------- AR Hit Detection ----------------
function onARSelect(){
  if(!state.running) return;
  // Check intersections
  const hits = document.elementsFromPoint(window.innerWidth/2, window.innerHeight/2);
  for(const el of hits){
    if(el.classList.contains('ar-collectable')){
      setScore(state.score+1);
      el.parentNode && el.parentNode.removeChild(el);
      showToast("+1");
      return;
    }
    if(el.classList.contains('ar-danger')){
      stopARGame();
      return;
    }
  }
}

// ---------------- Initialize AR ----------------
async function initAR(){
  if(!navigator.xr){ alert("WebXR not supported"); return; }
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', { requiredFeatures:['hit-test'] });
    xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, scene.renderer.getContext()) });
    xrRefSpace = await xrSession.requestReferenceSpace('local');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
    xrSession.requestAnimationFrame(onXRFrame);
    arReticle.setAttribute('visible', true);
    xrSession.addEventListener('select', onARSelect);
    startARGame();
  } catch(e){ console.error("AR init failed", e); }
}

// ---------------- AR Frame ----------------
function onXRFrame(time, frame){
  const session = frame.session;
  session.requestAnimationFrame(onXRFrame);
  const results = frame.getHitTestResults(xrHitTestSource);
  if(results.length > 0){
    const pose = results[0].getPose(xrRefSpace);
    arReticle.object3D.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    arReticle.object3D.updateMatrixWorld(true);
  }
}

// ---------------- UI ----------------
enterARBtn.style.display='block';
enterARBtn.addEventListener('click', initAR);
