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

// small helper to show on-screen messages
function showToast(msg, ms=1500){
  if(!toast) { console.log('[TOAST]', msg); return; }
  toast.textContent = msg; toast.style.display='block';
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>toast.style.display='none', ms);
}

function setScore(v){ state.score=v; scoreVal.textContent=v; }

// Wait for A-Frame scene renderer to be ready
function waitForSceneRenderer() {
  return new Promise((resolve) => {
    if (sceneEl && sceneEl.renderer && sceneEl.renderer.xr) return resolve(sceneEl.renderer);
    // A-Frame fires 'loaded' when scene is ready and renderer exists
    sceneEl.addEventListener('loaded', () => {
      // renderer may still be initializing — small timeout guards timing issues
      setTimeout(()=> resolve(sceneEl.renderer), 50);
    }, { once: true });
  });
}

// AR support detection & button visibility (optimistic)
function setupARButton() {
  if (!enterARBtn) return;
  if (!navigator.xr) {
    console.warn('navigator.xr not available — AR likely not supported by this browser.');
    // don't show button if navigator.xr doesn't exist
    enterARBtn.style.display = 'none';
    return;
  }

  // Hide then show only when we determine it's likely supported
  enterARBtn.style.display = 'none';
  // Try the spec check but show the button optimistically so user can try
  // (some browsers/devices return false erroneously)
  navigator.xr.isSessionSupported && navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
    if (supported) {
      enterARBtn.style.display = 'block';
      console.log('immersive-ar supported: showing AR button');
    } else {
      // Not reported as supported — still show button (user can try) but warn
      console.warn('immersive-ar reported unsupported; showing button optimistically for manual testing.');
      enterARBtn.style.display = 'block';
    }
  }).catch((err)=>{
    console.warn('isSessionSupported failed:', err);
    // fallback: show button if navigator.xr exists
    enterARBtn.style.display = 'block';
  });

  // As additional fallback: if isSessionSupported is not present, still allow trying
  if (!navigator.xr.isSessionSupported) {
    console.log('navigator.xr.isSessionSupported missing — showing AR button for manual try');
    enterARBtn.style.display = 'block';
  }
}


// Spawn an orb at the given position into the collect-spawner so it participates in VR logic
function spawnOrbAtPosition(pos) {
  if (!collectSpawner) {
    console.warn('collectSpawner not found — appending to scene instead');
  }
  const orb = document.createElement('a-sphere');
  orb.classList.add('interactable','collectable'); // allow gaze if desired
  orb.dataset.gaze = 'collect';
  orb.setAttribute('radius', '0.22');
  orb.setAttribute('color', '#ffd84d');
  orb.setAttribute('emissive', '#ffeb99');
  orb.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
  orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800+Math.floor(Math.random()*900)}; to: ${pos.x} ${pos.y+0.18} ${pos.z}; loop: true; easing: easeInOutSine`);
  orb.dataset.gaze = 'collect';
  // Attach click handler to allow immediate collection in AR via cursor/select as well
  orb.addEventListener('click', ()=>{
    try { document.getElementById('collectSound').play().catch(()=>{}); } catch(e){}
    // create small particle feedback
    const p = document.createElement('a-sphere');
    p.setAttribute('radius','0.04');
    p.setAttribute('color','#fff');
    p.object3D.position.set(pos.x,pos.y,pos.z);
    sceneEl.appendChild(p);
    setTimeout(()=> p.parentNode && p.parentNode.removeChild(p), 600);
    orb.parentNode && orb.parentNode.removeChild(orb);
    // Attempt to update score if global setScore exists
    if (typeof window.setScore === 'function') window.setScore((window.state && window.state.score) ? window.state.score + 1 : 1);
  });

  if (collectSpawner) collectSpawner.appendChild(orb);
  else sceneEl.appendChild(orb);
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

  showToast('Starting AR session...');
  try {
    // Request AR session with hit-test and (optional) DOM overlay (HUD)
    xrSession = await navigator.xr.requestSession('immersive-ar', { requiredFeatures:['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

     // wait for A-Frame renderer to exist
    const renderer = await waitForSceneRenderer();
    if (!renderer) throw new Error('Renderer not available after scene loaded');

    // set renderer clear so camera shows through
    // For AR we want transparent background so the camera feed is visible
    try { renderer.setClearColor && renderer.setClearColor(0x000000, 0); } catch(e){/* ignore */ }


    // Hand session to A-Frame / three.js renderer
    if (renderer.xr && typeof renderer.xr.setSession === 'function') {
      await threeXR.setSession(xrSession);
    } else {
      // fallback: try setting baseLayer manually (rare)
      const gl = renderer.getContext && renderer.getContext();
      if (gl) {
        xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
        console.warn('Used manual XRWebGLLayer fallback; prefer renderer.xr.setSession in A-Frame');
      } else {
        console.warn('Could not get GL context from renderer; AR may not render properly');
      }
    }

    // reference spaces & hit-test source
    xrRefSpace = await xrSession.requestReferenceSpace('local');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

    // AR reticle visible
    arReticle.setAttribute('visible', 'true');
    showToast('AR ready — move camera to find surfaces');

    // listen for select (tap) to spawn orb
    xrSession.addEventListener('select', () => {
      const pos = arReticle.object3D.position;
      spawnOrbAtPosition(pos);
    });

    // run frame loop
    xrSession.requestAnimationFrame(onXRFrame);

    // 
    xrSession.addEventListener('end', ()=>{
      arReticle.setAttribute('visible','false');
      xrSession = null;
      hitTestSource = null;
      xrRefSpace = null;
      showToast('AR session ended', 1250);
    });

    

  }catch(err){
    console.error('Failed to start AR session:', err);
    showToast('AR failed to start — check console for details', 2500);
    // helpful hint for the user / dev
    console.warn('AR start error (common causes): insecure origin, WebXR flags disabled, or browser does not expose immersive-ar.');
    // keep the button available for retry
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
    const p = pose.transform.position;
    arReticle.object3D.position.set(p.x, p.y, p.z);
    arReticle.object3D.updateMatrixWorld(true);
    arReticle.setAttribute('visible', 'true');
  } else {
    arReticle.setAttribute('visible', 'false');
    // Could hide reticle if no surface; we keep it visible to encourage scan.
  }
}

// Wire button (run setup after DOM ready)
document.addEventListener('DOMContentLoaded', () => {
  setupARButton();
  if (enterARBtn) enterARBtn.addEventListener('click', enterAR);
});
