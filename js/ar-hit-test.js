// js/ar-hit-test.js
// Robust AR hit-test code for Orbs.cure
// - Defensive startup/teardown
// - Renderer binding for A-Frame
// - Hit-test -> reticle placement
// - Spawn orb on select (tap)
// - Helpful UI/status updates and a debug probe when ?arforce=1 is present

(function () {
  const enterARBtn = document.getElementById('enterARBtn');
  const arStatus = document.getElementById('arStatus');
  const arReticle = document.getElementById('arReticle');
  const sceneEl = document.getElementById('scene');
  const collectSpawner = document.getElementById('collect-spawner');
  const toast = document.getElementById('toast');
  const overlayEl = document.getElementById('menuOverlay');

  // XR state
  let xrSession = null;
  let xrRefSpace = null;
  let hitTestSource = null;
  let xrAnimationFrame = null;

  // ---- tiny UI helpers ----
  function showToast(msg, ms = 1500) {
    if (!toast) { console.log('[TOAST]', msg); return; }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toast.style.display = 'none'), ms);
  }
  function setArStatus(text, color = '#9fdfff') {
    if (arStatus) { arStatus.textContent = text; arStatus.style.color = color; }
    else console.log('[AR STATUS]', text);
  }
  function disableARButton(reasonText) {
    if (!enterARBtn) return;
    enterARBtn.disabled = true;
    if (reasonText) enterARBtn.textContent = reasonText;
    enterARBtn.style.pointerEvents = 'none';
  }
  function enableARButton(label = 'Enter AR') {
    if (!enterARBtn) return;
    enterARBtn.disabled = false;
    enterARBtn.textContent = label;
    enterARBtn.style.pointerEvents = 'auto';
  }

  // ---- wait for A-Frame renderer (safe) ----
  function waitForSceneRenderer() {
    return new Promise((resolve) => {
      if (sceneEl && sceneEl.renderer) return resolve(sceneEl.renderer);
      if (!sceneEl) {
        console.warn('A-Frame <a-scene> not found (expected id="scene")');
        return resolve(null);
      }
      sceneEl.addEventListener('loaded', () => setTimeout(() => resolve(sceneEl.renderer), 50), { once: true });
    });
  }

  // ---- spawn helpers used in AR (keeps parity with VR spawns) ----
  function spawnOrbAtPosition(pos) {
    if (!pos) return;
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable', 'collectable');
    orb.dataset.gaze = 'collect';
    orb.setAttribute('radius', '0.18');
    orb.setAttribute('color', '#ffd84d');
    orb.setAttribute('emissive', '#ffeb99');
    orb.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
    orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random()*900)}; to: ${pos.x} ${pos.y + 0.18} ${pos.z}; loop: true; easing: easeInOutSine`);
    orb.addEventListener('click', () => {
      try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch(_) {}
      orb.parentNode && orb.parentNode.removeChild(orb);
      if (typeof window.setScore === 'function') {
        try {
          const cur = (window.state && window.state.score) ? window.state.score : 0;
          window.setScore(cur + 1);
        } catch (e) { console.warn('setScore failed', e); }
      }
    });
    if (collectSpawner) collectSpawner.appendChild(orb);
    else sceneEl && sceneEl.appendChild(orb);
  }

  // ---- reticle/hit-test frame loop ----
  function onXRFrame(time, frame) {
    // loop guard
    if (!xrSession) return;

    xrAnimationFrame = xrSession.requestAnimationFrame(onXRFrame);

    if (!hitTestSource || !xrRefSpace) return;

    const results = frame.getHitTestResults(hitTestSource);
    if (results && results.length > 0) {
      const pose = results[0].getPose(xrRefSpace);
      if (pose && arReticle && arReticle.object3D) {
        const p = pose.transform.position;
        arReticle.object3D.position.set(p.x, p.y, p.z);
        arReticle.object3D.updateMatrixWorld(true);
        arReticle.setAttribute('visible', 'true');
      }
    } else {
      if (arReticle) arReticle.setAttribute('visible', 'false');
    }
  }

  // ---- main AR init ----
  async function initAR() {
    // prevent duplicate requests
    if (xrSession) { console.warn('XR session already active'); return; }

    if (!('xr' in navigator)) {
      alert('WebXR not available in this browser.');
      setArStatus('WebXR unavailable', '#ff8080');
      return;
    }

    disableARButton('Starting AR...');
    setArStatus('Requesting AR session...');

    // hide HTML settings overlay so camera feed isn't blocked
    try { if (overlayEl) { overlayEl.setAttribute('aria-hidden', 'true'); overlayEl.style.pointerEvents = 'none'; } } catch(e){}

    try {
      // Request an immersive-ar session with hit-test + optional dom-overlay (dom overlay helps if supported)
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor'],
        domOverlay: { root: document.body }
      });

      // get renderer and attach the session
      const renderer = await waitForSceneRenderer();
      if (!renderer) throw new Error('A-Frame renderer unavailable');

      // Make the GL clear transparent so the camera feed shows through (best-effort)
      try { renderer.setClearColor && renderer.setClearColor(0x000000, 0); } catch(_) {}

      // Preferred path: let renderer handle XR session
      if (renderer.xr && typeof renderer.xr.setSession === 'function') {
        await renderer.xr.setSession(xrSession);
      } else {
        // fallback: create XRWebGLLayer manually and attach to session
        const gl = renderer.getContext && renderer.getContext();
        if (gl) {
          xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
        } else {
          console.warn('Cannot get WebGL context for XR; AR visuals may not render correctly.');
        }
      }

      // create reference spaces
      xrRefSpace = await xrSession.requestReferenceSpace('local');
      const viewerSpace = await xrSession.requestReferenceSpace('viewer');

      // request hit-test source (viewer-based)
      hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

      // UI updates
      setArStatus('AR active — move device to detect surfaces', '#9fffb3');
      showToast('AR session started', 1200);

      // disable button while active (prevent double taps), keep it visible so user can end via UI if you want
      disableARButton('AR active');

      // when user 'select's (tap), spawn an orb at reticle position
      xrSession.addEventListener('select', () => {
        const pos = arReticle && arReticle.object3D ? arReticle.object3D.position : null;
        if (pos) spawnOrbAtPosition({ x: pos.x, y: pos.y, z: pos.z });
      });

      // on end: cleanup
      xrSession.addEventListener('end', () => {
        try {
          if (arReticle) arReticle.setAttribute('visible', 'false');
          if (hitTestSource) { hitTestSource.cancel && hitTestSource.cancel(); hitTestSource = null; }
          xrRefSpace = null;
          xrSession = null;
          if (xrAnimationFrame) { xrAnimationFrame = null; }
          setArStatus('AR session ended', '#ffd880');
          showToast('AR session ended', 1000);
        } finally {
          enableARButton('Enter AR');
          // restore overlay behavior; keep it hidden but interactive only if menu was open previously
        }
      });

      // start the hit-test animation loop
      xrAnimationFrame = xrSession.requestAnimationFrame(onXRFrame);
    } catch (err) {
      console.error('initAR failed:', err);
      setArStatus('Failed to start AR — see console', '#ff8080');
      showToast('Failed to start AR — see console', 2500);
      // re-enable AR button so user can retry after error
      enableARButton('Enter AR');

      // restore overlay if session not started
      try { if (overlayEl) overlayEl.setAttribute('aria-hidden', 'false'); } catch(e) {}
    }
  }

  // ---- setup: check support and show button if available ----
  function setupARButtonAndStatus() {
    if (!enterARBtn) {
      setArStatus('AR UI missing (enterARBtn not found)', '#ffd880');
      return;
    }

    // intentionally hidden until we check
    enterARBtn.style.display = 'none';
    setArStatus('Checking WebXR availability...');

    if (!('xr' in navigator)) {
      setArStatus('navigator.xr missing — AR unavailable', '#ff8080');
      enterARBtn.style.display = 'none';
      return;
    }

    if (navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          if (supported) {
            setArStatus('AR supported — tap Enter AR', '#9fffb3');
            enterARBtn.style.display = 'inline-block';
            enableARButton('Enter AR');
          } else {
            // some devices might still succeed even if isSessionSupported returns false, show optimistic button
            setArStatus('AR not advertised — you can still try (tap Enter AR)', '#ffd880');
            enterARBtn.style.display = 'inline-block';
            enableARButton('Enter AR');
          }
        })
        .catch((err) => {
          console.warn('isSessionSupported failed', err);
          setArStatus('AR check failed — try Enter AR (see console)', '#ffd880');
          enterARBtn.style.display = 'inline-block';
          enableARButton('Enter AR');
        });
    } else {
      // fallback: show button so user can try manually
      setArStatus('AR support check unavailable — try Enter AR', '#ffd880');
      enterARBtn.style.display = 'inline-block';
      enableARButton('Enter AR');
    }

    // wire click
    enterARBtn.addEventListener('click', () => {
      // prevent double start
      if (xrSession) {
        console.warn('XR session already running');
        return;
      }
      initAR();
    });

    // optional debug mode: if URL contains ?arforce=1, show a small probe and force button visible
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('arforce') === '1') {
        const dbg = document.createElement('div');
        dbg.id = 'xr-debug';
        dbg.style = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:8px 10px;background:rgba(0,0,0,0.7);color:#9ff;font-family:monospace;border-radius:8px;white-space:pre-line;font-size:12px;max-width:320px';
        dbg.textContent = 'AR probe: probing...';
        document.body.appendChild(dbg);
        (async () => {
          dbg.textContent = 'navigator.xr: ' + (!!navigator.xr) + '\n';
          if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
            try {
              const s = await navigator.xr.isSessionSupported('immersive-ar');
              dbg.textContent += 'immersive-ar: ' + s + '\n';
            } catch (e) { dbg.textContent += 'isSessionSupported error: ' + (e.message || e) + '\n'; }
          } else dbg.textContent += 'isSessionSupported: N/A\n';
          // force button visible for quick testing
          enterARBtn.style.display = 'inline-block';
          enableARButton('Enter AR');
          dbg.textContent += '\nForced AR button enabled (debug).';
        })();
      }
    } catch (_) {}
  }

  // bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupARButtonAndStatus);
  } else {
    setupARButtonAndStatus();
  }

  // expose for dev/debug
  window._arHelpers = { initAR, spawnOrbAtPosition };
})();
