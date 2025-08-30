const enterARBtn = document.getElementById('enterARBtn');
const arReticle = document.getElementById('arReticle');
const scene = document.querySelector('a-scene');
const scoreVal = document.getElementById('scoreVal');
const toast = document.getElementById('toast');

// Three.js WebXR objects
let xrSession = null;
let xrRefSpace = null;
let xrHitTestSource = null;

// Separate AR state so it doesn’t conflict with VR flow
const arState = {
  score: 0,
  running: false,
  orbInterval: null,
  dangerInterval: null
};

// Show AR button if supported
if (navigator.xr && enterARBtn){
  navigator.xr.isSessionSupported('immersive-ar').then(supported=>{
    if(supported) enterARBtn.style.display='block';
  }).catch(()=>{});
}

//
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
  orb.classList.add('interactable'); // allow gaze if desired
  orb.dataset.gaze = 'collect';
  orb.setAttribute('radius', '0.22');
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
  danger.dataset.gaze = 'danger';
  danger.setAttribute('width','0.3'); danger.setAttribute('height','0.3'); danger.setAttribute('depth','0.3');
  danger.setAttribute('color','#d43b3b');
  danger.setAttribute('position', `${p.x + (Math.random()-0.5)*0.6} ${p.y} ${p.z + (Math.random()-0.5)*0.6}`);
  danger.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur: 4200; loop:true; easing:linear');
  scene.appendChild(danger);
}

// Optional: tap screen to attempt collect/hit object at center of view (fallback)
function onARSelect(){
  if(!arState.running) return;
  // We’ll simply spawn an orb at reticle on tap to keep it playful.
  arSpawnOrb();
}

// ---------------- AR Game Loop ----------------
function startARGame(){
   if(arState.running) return;
  arState.running = true;
  setScore(0);
  showToast("AR Game Started!");

  // Spawn initial objects - seed and continue to spawn near reticle
  for(let i=0;i<4;i++) spawnAROrb();
  for(let i=0;i<2;i++) spawnARDanger();

  // Continuous spawn
  arState.orbInterval = setInterval(()=>{ if(arState.running) spawnAROrb(); }, 1800);
  arState.dangerInterval = setInterval(()=>{ if(arState.running) spawnARDanger(); }, 3500);
  
  // Ensure the VR round timer is running if the player started from the menu
  // (If you prefer separate AR timer, you can fork state here.)
}

function stopARGame(){
  arState.running=false;
  clearInterval(arState.orbInterval);
  clearInterval(arState.dangerInterval);
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
    // Request AR session with hit-test and (optional) DOM overlay (HUD)
    xrSession = await navigator.xr.requestSession('immersive-ar', { requiredFeatures:['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

    // Hand session to A-Frame / three.js
    const threeXR = sceneEl.renderer.xr;
    await threeXR.setSession(xrSession);

    xrRefSpace = await xrSession.requestReferenceSpace('local');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

    // AR reticle visible
    arReticle.setAttribute('visible', 'true');

    // Input
    xrSession.addEventListener('select', onARSelect);
    xrSession.addEventListener('end', ()=>{
      stopARGame();
      arReticle.setAttribute('visible','false');
      xrSession = null;
      hitTestSource = null;
      xrRefSpace = null;
    });

    // Start the game loop & animation frames
    startARGame();
    xrSession.requestAnimationFrame(onXRFrame);

  }catch(err){
    console.error('AR init failed:', err);
    alert('Unable to start AR on this device/browser.');
  }
}

// ---------------- AR Frame : Per-frame AR update (hit-test -> reticle pose) ----------------
function onXRFrame(time, frame){
  const session = frame.session;
  session.requestAnimationFrame(onXRFrame);

  if(!hitTestSource || !xrRefSpace) return;
  const results = frame.getHitTestResults(xrHitTestSource);
  if(results.length > 0){
    const pose = results[0].getPose(xrRefSpace);
    arReticle.object3D.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    // Keep reticle flat on surface (already -90 on X). If you want surface normals, compute quaternion here.
    arReticle.object3D.updateMatrixWorld(true);
    }else{
    // Could hide reticle if no surface; we keep it visible to encourage scan.
  }
}

// ---------------- UI Wire AR Button ----------------
enterARBtn.style.display='block';
enterARBtn.addEventListener('click', initAR);
