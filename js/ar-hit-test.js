
// DOM refs
const enterARBtn = document.getElementById('enterARBtn');
const arReticle  = document.getElementById('arReticle');
const sceneEl    = document.querySelector('a-scene');
const collectSpawner = document.getElementById('collect-spawner');
const toast = document.getElementById('toast');

// XR state
let xrSession = null;
let xrRefSpace = null;
let hitTestSource = null;

// small helper toast/log
function showToast(msg, ms = 1500){
  if (!toast) { console.log('[TOAST]', msg); return; }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> toast.style.display = 'none', ms);
}

// Wait for A-Frame scene renderer to exist (resolves with renderer)
function waitForSceneRenderer() {
  return new Promise((resolve) => {
    if (sceneEl && sceneEl.renderer) return resolve(sceneEl.renderer);
    if (!sceneEl) {
      console.warn('A-Frame scene element not found.');
      return resolve(null);
    }
    sceneEl.addEventListener('loaded', () => {
      // small delay to let renderer init
      setTimeout(()=> resolve(sceneEl.renderer), 50);
    }, { once: true });
  });
}

// Show AR button if navigator.xr exists (optimistic)
function setupARButton() {
  if (!enterARBtn) return;
  if (!('xr' in navigator)) {
    console.warn('navigator.xr not present — AR likely not available in this browser build.');
    enterARBtn.style.display = 'none';
    return;
  }

  enterARBtn.style.display = 'none';

  if (navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) {
          enterARBtn.style.display = 'block';
          console.log('immersive-ar supported — showing AR button.');
        } else {
          console.warn('immersive-ar reported unsupported; showing button optimistically for manual try.');
          enterARBtn.style.display = 'block';
        }
      })
      .catch((err) => {
        console.warn('isSessionSupported check failed:', err, '— showing AR button optimistically.');
        enterARBtn.style.display = 'block';
      });
  } else {
    console.log('navigator.xr.isSessionSupported not present — showing AR button for manual try.');
    enterARBtn.style.display = 'block';
  }
}

// spawn an orb at the given world position (pos is THREE-like {x,y,z})
function spawnOrbAtPosition(pos) {
  if (!pos) return;
  const orb = document.createElement('a-sphere');
  orb.classList.add('interactable','collectable');
  orb.dataset.gaze = 'collect';
  orb.setAttribute('radius', '0.18');
  orb.setAttribute('color', '#ffd84d');
  orb.setAttribute('emissive', '#ffeb99');
  orb.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
  orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random()*900)}; to: ${pos.x} ${pos.y + 0.18} ${pos.z}; loop: true; easing: easeInOutSine`);

  orb.addEventListener('click', ()=>{
    try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch(_) {}
    const p = document.createElement('a-sphere');
    p.setAttribute('radius', '0.04');
    p.setAttribute('color', '#fff');
    p.object3D.position.set(pos.x, pos.y, pos.z);
    (sceneEl || document.body).appendChild(p);
    setTimeout(()=> p.parentNode && p.parentNode.removeChild(p), 600);
    orb.parentNode && orb.parentNode.removeChild(orb);
    if (typeof window.setScore === 'function') {
      try {
        const current = (window.state && window.state.score) ? window.state.score : 0;
        window.setScore(current + 1);
      } catch(e){ console.warn('setScore call failed', e); }
    }
  });

  if (collectSpawner) collectSpawner.appendChild(orb);
  else sceneEl.appendChild(orb);
}

// spawn a danger box slightly around the reticle (used in AR)
function spawnARDangerAt(pos) {
  if (!pos) return;
  const dx = (Math.random()-0.5)*0.6;
  const dz = (Math.random()-0.5)*0.6;
  const bad = document.createElement('a-box');
  bad.classList.add('interactable');
  bad.dataset.gaze = 'danger';
  bad.setAttribute('width','0.36'); bad.setAttribute('height','0.36'); bad.setAttribute('depth','0.36');
  bad.setAttribute('color','#d43b3b');
  bad.setAttribute('position', `${pos.x + dx} ${pos.y} ${pos.z + dz}`);
  bad.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur: 4200; loop:true; easing:linear');
  sceneEl.appendChild(bad);
}

// optional: spawn a few AR objects around reticle
function seedARObjects() {
  if (!arReticle) return;
  const p = arReticle.object3D.position;
  for(let i=0;i<3;i++) spawnOrbAtPosition({ x: p.x + (Math.random()-0.5)*0.5, y: p.y, z: p.z + (Math.random()-0.5)*0.5 });
  for(let i=0;i<1;i++) spawnARDangerAt({ x: p.x + (Math.random()-0.5)*0.5, y: p.y, z: p.z + (Math.random()-0.5)*0.5 });
}

// initialize & start AR session (hit-test)
async function initAR() {
  if (!('xr' in navigator)) { alert('WebXR not supported in this browser'); return; }

  showToast('Requesting AR session...');
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

    const renderer = await waitForSceneRenderer();
    if (!renderer) {
      throw new Error('A-Frame renderer not available');
    }

    try { renderer.setClearColor && renderer.setClearColor(0x000000, 0); } catch(e){}

    if (renderer.xr && typeof renderer.xr.setSession === 'function') {
      await renderer.xr.setSession(xrSession);
    } else {
      const gl = renderer.getContext && renderer.getContext();
      if (gl) xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      else console.warn('Could not get GL context to attach XR session');
    }

    xrRefSpace = await xrSession.requestReferenceSpace('local');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

    arReticle.setAttribute('visible', 'true');
    showToast('AR ready — move camera to detect surfaces');

    xrSession.addEventListener('select', () => {
      const pos = arReticle.object3D.position;
      spawnOrbAtPosition(pos);
    });

    xrSession.addEventListener('end', () => {
      arReticle.setAttribute('visible', 'false');
      hitTestSource = null;
      xrRefSpace = null;
      xrSession = null;
      showToast('AR session ended', 1200);
    });

    seedARObjects();
    xrSession.requestAnimationFrame(onXRFrame);
  } catch (err) {
    console.error('initAR failed:', err);
    showToast('AR failed to start — see console', 2500);
  }
}

// per-frame hit-test -> update reticle
function onXRFrame(time, frame) {
  if (!xrSession) return;
  xrSession.requestAnimationFrame(onXRFrame);

  if (!hitTestSource || !xrRefSpace) return;
  const results = frame.getHitTestResults(hitTestSource);
  if (results.length > 0) {
    const pose = results[0].getPose(xrRefSpace);
    const p = pose.transform.position;
    arReticle.object3D.position.set(p.x, p.y, p.z);
    arReticle.object3D.updateMatrixWorld(true);
    arReticle.setAttribute('visible', 'true');
  } else {
    arReticle.setAttribute('visible', 'false');
  }
}

// wire up the AR button after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupARButton();
  if (enterARBtn) enterARBtn.addEventListener('click', initAR);
});
