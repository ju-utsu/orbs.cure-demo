// Robust AR hit-test + VR entry helper for Orbs.cure
// - Shows/hides AR button depending on capability (or via ?arforce=1 debug)
// - Starts an immersive-ar session with hit-test, positions #arReticle
// - Spawns orbs on select (tap) at reticle
// - Disables duplicate session starts and restores UI when session ends
// - Also wires Enter VR button to scene.enterVR()

(function () {
  // --- DOM refs (IDs must match index.html) ---
  const enterARBtn = document.getElementById('enterARBtn');
  const enterVRBtn = document.getElementById('enterVRBtn');
  const arStatus = document.getElementById('arStatus');
  const arReticle = document.getElementById('arReticle');
  const sceneEl = document.getElementById('scene'); // <a-scene id="scene">
  const collectSpawner = document.getElementById('collect-spawner');
  const overlayEl = document.getElementById('menuOverlay');
  const toast = document.getElementById('toast');

  // XR state
  let xrSession = null;
  let xrRefSpace = null;
  let hitTestSource = null;
  let xrAnimationHandle = null;
  let overlayWasHiddenBeforeAR = false;

  // --- small UI helpers ---
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
  function disableARButton(label) {
    if (!enterARBtn) return;
    enterARBtn.disabled = true;
    if (label) enterARBtn.textContent = label;
    enterARBtn.style.pointerEvents = 'none';
  }
  function enableARButton(text = 'Enter AR') {
    if (!enterARBtn) return;
    enterARBtn.disabled = false;
    enterARBtn.textContent = text;
    enterARBtn.style.pointerEvents = 'auto';
    enterARBtn.style.display = 'inline-block';
  }
  function hideOverlayForAR() {
    if (!overlayEl) return;
    overlayWasHiddenBeforeAR = overlayEl.getAttribute('aria-hidden') === 'true';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.style.pointerEvents = 'none';
  }
  function restoreOverlayAfterAR() {
    if (!overlayEl) return;
    // restore previous visible state (if menu was closed before AR, keep closed)
    if (!overlayWasHiddenBeforeAR) {
      overlayEl.setAttribute('aria-hidden', 'false');
      overlayEl.style.pointerEvents = 'auto';
    }
  }

  // --- wait until a-scene.renderer is available ---
  function waitForSceneRenderer() {
    return new Promise((resolve) => {
      if (!sceneEl) { resolve(null); return; }
      if (sceneEl.renderer) return resolve(sceneEl.renderer);
      sceneEl.addEventListener('loaded', () => {
        // small delay to allow three.js renderer init
        setTimeout(() => resolve(sceneEl.renderer), 50);
      }, { once: true });
    });
  }

  // --- spawn helpers (mirror VR spawn style) ---
  function spawnOrbAtPosition(pos) {
    if (!pos) return;
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable', 'collectable');
    orb.dataset.gaze = 'collect';
    orb.setAttribute('radius', '0.18');
    orb.setAttribute('color', '#ffd84d');
    orb.setAttribute('emissive', '#ffeb99');
    orb.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
    orb.setAttribute('animation__float',
      `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random()*900)}; to: ${pos.x} ${pos.y + 0.18} ${pos.z}; loop: true; easing: easeInOutSine`);
    orb.addEventListener('click', () => {
      try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (e) {}
      orb.parentNode && orb.parentNode.removeChild(orb);
      if (typeof window.setScore === 'function') {
        try {
          const cur = (window.state && window.state.score) ? window.state.score : 0;
          window.setScore(cur + 1);
        } catch (e) { console.warn('setScore failed', e); }
      }
    });
    if (collectSpawner) collectSpawner.appendChild(orb);
    else if (sceneEl) sceneEl.appendChild(orb);
  }

  // --- per-frame hit-test -> update reticle ---
  function onXRFrame(time, frame) {
    if (!xrSession) return;
    xrAnimationHandle = xrSession.requestAnimationFrame(onXRFrame);

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

  // --- start XR session and hit-test source ---
  async function initAR() {
    if (!('xr' in navigator)) {
      alert('WebXR not available in this browser.');
      setArStatus('WebXR unavailable', '#ff8080');
      return;
    }
    if (xrSession) { console.warn('XR session already active'); return; }
    disableARButton('Starting AR...');
    setArStatus('Requesting AR session...');

    // hide overlay so camera view is unobstructed
    try { hideOverlayForAR(); } catch (e) {}

    try {
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor'],
        domOverlay: { root: document.body }
      });

      const renderer = await waitForSceneRenderer();
      if (!renderer) throw new Error('A-Frame renderer not available');

      // try to make clear background so camera shows through
      try { renderer.setClearColor && renderer.setClearColor(0x000000, 0); } catch (e) {}

      // attach session to renderer (preferred)
      if (renderer.xr && typeof renderer.xr.setSession === 'function') {
        await renderer.xr.setSession(xrSession);
      } else {
        // fallback to manual XRWebGLLayer binding
        const gl = (typeof renderer.getContext === 'function') ? renderer.getContext() : (renderer.context || null);
        if (gl) {
          xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
        } else {
          console.warn('Could not obtain GL context to attach XR session.');
        }
      }

      // create ref spaces and hit test source
      xrRefSpace = await xrSession.requestReferenceSpace('local');
      const viewerSpace = await xrSession.requestReferenceSpace('viewer');
      hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

      // UI updates
      setArStatus('AR active — move device to detect surfaces', '#9fffb3');
      showToast('AR session started');

      // prevent re-entry
      disableARButton('AR active');

      // spawn on select (tap)
      xrSession.addEventListener('select', () => {
        const pos = (arReticle && arReticle.object3D) ? arReticle.object3D.position : null;
        if (pos) spawnOrbAtPosition({ x: pos.x, y: pos.y, z: pos.z });
      });

      xrSession.addEventListener('end', () => {
        try {
          if (arReticle) arReticle.setAttribute('visible', 'false');
          if (hitTestSource) { if (hitTestSource.cancel) try { hitTestSource.cancel(); } catch(_) {} hitTestSource = null; }
          xrRefSpace = null;
          xrSession = null;
          if (xrAnimationHandle) { xrAnimationHandle = null; }
          setArStatus('AR session ended', '#ffd880');
          showToast('AR session ended', 1200);
        } finally {
          // re-enable button for another try
          enableARButton('Enter AR');
          // restore overlay state (don't force-open if it was closed earlier)
          restoreOverlayAfterAR();
        }
      });

      // start animation loop for hit-test
      xrAnimationHandle = xrSession.requestAnimationFrame(onXRFrame);
    } catch (err) {
      console.error('initAR failed:', err);
      setArStatus('Failed to start AR — see console', '#ff8080');
      showToast('Failed to start AR — see console', 2500);
      enableARButton('Enter AR');
      // restore overlay so user can change settings
      try { restoreOverlayAfterAR(); } catch (e) {}
    }
  }

  // --- setup & capability detection ---
  function setupARButtonAndStatus() {
    if (!enterARBtn) {
      setArStatus('AR UI missing', '#ffd880');
    } else {
      enterARBtn.style.display = 'none';
      setArStatus('Checking WebXR availability...');
    }

    if (!('xr' in navigator)) {
      setArStatus('navigator.xr missing — AR unavailable', '#ff8080');
      if (enterARBtn) enterARBtn.style.display = 'none';
    } else if (typeof navigator.xr.isSessionSupported === 'function') {
      navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
        if (supported) {
          setArStatus('AR supported — tap Enter AR', '#9fffb3');
          if (enterARBtn) enableARButton('Enter AR');
        } else {
          setArStatus('AR not advertised — try Enter AR (may still work)', '#ffd880');
          if (enterARBtn) enableARButton('Enter AR');
        }
      }).catch((err) => {
        console.warn('isSessionSupported failed', err);
        setArStatus('AR check failed — try Enter AR (see console)', '#ffd880');
        if (enterARBtn) enableARButton('Enter AR');
      });
    } else {
      // old browser: show optimistic button
      setArStatus('AR session check unavailable — try Enter AR', '#ffd880');
      if (enterARBtn) enableARButton('Enter AR');
    }

    // wire enterAR click (defensive)
    if (enterARBtn) {
      enterARBtn.addEventListener('click', () => {
        if (xrSession) { console.warn('XR session already active'); return; }
        initAR();
      });
    }

    // wire VR button to A-Frame scene.enterVR (simple UX)
    if (enterVRBtn && sceneEl) {
      enterVRBtn.addEventListener('click', () => {
        try {
          // A-Frame exposes sceneEl.enterVR()
          if (typeof sceneEl.enterVR === 'function') sceneEl.enterVR();
          else if (sceneEl && sceneEl.sceneEl && typeof sceneEl.sceneEl.enterVR === 'function') sceneEl.sceneEl.enterVR();
          else console.warn('enterVR not available on sceneEl');
        } catch (e) {
          console.warn('enterVR failed', e);
        }
      });
    }

    // optional debug forcing via ?arforce=1
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('arforce') === '1') {
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
          if (enterARBtn) {
            enterARBtn.style.display = 'inline-block';
            enableARButton('Enter AR');
            dbg.textContent += '\nForced AR button (debug).';
          }
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

  // expose debug helpers (optional)
  window._arHelpers = { initAR, spawnOrbAtPosition };
})();
