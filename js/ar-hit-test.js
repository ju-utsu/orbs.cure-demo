// js/ar-hit-test.js — cleaned & corrected version
// Robust AR hit-test + spawn-on-tap logic for Tomato VR/AR project

/* DOM refs (may be null if HTML missing elements) */
const enterARBtn = document.getElementById('enterARBtn');
const arStatus   = document.getElementById('arStatus');
const arReticle  = document.getElementById('arReticle');
const sceneEl    = document.querySelector('a-scene');
const collectSpawner = document.getElementById('collect-spawner');
const toast = document.getElementById('toast');

/* XR state */
let xrSession = null;
let xrRefSpace = null;
let hitTestSource = null;

/* Small helper toast/log */
function showToast(msg, ms = 1500){
  if (!toast) { console.log('[TOAST]', msg); return; }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> toast.style.display = 'none', ms);
}

/* AR status UI helper (was missing in original file) */
function setArStatus(text, color = '#9fdfff'){
  if (arStatus) { arStatus.textContent = text; arStatus.style.color = color; }
  else console.log('[AR STATUS]', text);
}

/* Wait for A-Frame scene renderer to exist */
function waitForSceneRenderer() {
  return new Promise((resolve) => {
    if (sceneEl && sceneEl.renderer) return resolve(sceneEl.renderer);
    if (!sceneEl) {
      console.warn('A-Frame scene element not found.');
      return resolve(null);
    }
    sceneEl.addEventListener('loaded', () => {
      // short delay to let renderer initialize
      setTimeout(()=> resolve(sceneEl.renderer), 50);
    }, { once: true });
  });
}

/* Setup AR button visibility & status text */
function setupARButtonAndStatus() {
  if (!enterARBtn) {
    setArStatus('AR UI not available (missing Enter AR button)', '#ffd880');
    return;
  }

  enterARBtn.style.display = 'none';
  setArStatus('Checking WebXR availability...');

  if (!('xr' in navigator)) {
    setArStatus('AR not available in this browser (navigator.xr missing)', '#ff8080');
    enterARBtn.style.display = 'none';
    return;
  }

  setArStatus('navigator.xr found — checking immersive-ar support...');

  if (navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) {
          setArStatus('AR supported — tap Enter AR', '#9fffb3');
          enterARBtn.style.display = 'block';
        } else {
          // show optimistic button so user can still try
          setArStatus('AR not reported as supported — you may still try (tap Enter AR)', '#ffd880');
          enterARBtn.style.display = 'block';
        }
      })
      .catch((err) => {
        console.warn('isSessionSupported failed:', err);
        setArStatus('AR support check failed — tap Enter AR to try (see console)', '#ffd880');
        enterARBtn.style.display = 'block';
      });
  } else {
    setArStatus('Browser missing isSessionSupported — tap Enter AR to try', '#ffd880');
    enterARBtn.style.display = 'block';
  }
}

/* Spawn an orb at the given world position (pos = {x,y,z}) */
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

/* Spawn a danger box near a position */
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

/* Seed a few AR objects around the reticle (called once AR active) */
function seedARObjectsAroundReticle() {
  if (!arReticle) return;
  const p = arReticle.object3D.position;
  for (let i=0; i<3; i++) spawnOrbAtPosition({ x: p.x + (Math.random()-0.5)*0.5, y: p.y, z: p.z + (Math.random()-0.5)*0.5 });
  for (let i=0; i<1; i++) spawnARDangerAt({ x: p.x + (Math.random()-0.5)*0.5, y: p.y, z: p.z + (Math.random()-0.5)*0.5 });
}

/* Initialize & start AR session (hit-test) */
async function initAR() {
  if (!('xr' in navigator)) { alert('WebXR not supported in this browser'); return; }

  showToast('Requesting AR session...');
  setArStatus('Requesting AR session...');

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

    // make renderer clear so camera feed shows through (best-effort)
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

    if (arReticle) arReticle.setAttribute('visible', 'true');
    setArStatus('AR active — move device to detect surfaces', '#9fffb3');
    showToast('AR session started');

    xrSession.addEventListener('select', () => {
      const pos = arReticle && arReticle.object3D ? arReticle.object3D.position : null;
      if (pos) spawnOrbAtPosition(pos);
    });

    xrSession.addEventListener('end', () => {
      if (arReticle) arReticle.setAttribute('visible', 'false');
      hitTestSource = null;
      xrRefSpace = null;
      xrSession = null;
      showToast('AR session ended', 1250);
      setArStatus('AR session ended', '#ffd880');
    });

    seedARObjectsAroundReticle();
    xrSession.requestAnimationFrame(onXRFrame);
  } catch (err) {
    console.error('initAR failed:', err);
    setArStatus('AR failed to start — check console', '#ff8080');
    showToast('AR failed to start — see console', 2500);
  }
}

/* per-frame hit-test -> update reticle */
function onXRFrame(time, frame) {
  if (!xrSession) return;
  xrSession.requestAnimationFrame(onXRFrame);
  if (!hitTestSource || !xrRefSpace) return;
  const results = frame.getHitTestResults(hitTestSource);
  if (results.length > 0) {
    const pose = results[0].getPose(xrRefSpace);
    const p = pose.transform.position;
    if (arReticle && arReticle.object3D) {
      arReticle.object3D.position.set(p.x, p.y, p.z);
      arReticle.object3D.updateMatrixWorld(true);
      arReticle.setAttribute('visible', 'true');
    }
  } else {
    if (arReticle) arReticle.setAttribute('visible', 'false');
  }
}

/* Bootstrap */
function bootstrapAR() {
  setupARButtonAndStatus();
  if (enterARBtn) enterARBtn.addEventListener('click', initAR);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapAR);
} else {
  bootstrapAR();
}
