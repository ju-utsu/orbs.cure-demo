// Updated AR flow: DOES NOT request dom-overlay, hides overlay via display:none when AR starts,
// restores overlay after AR ends. Also wires Enter VR button.

(function () {
  const enterARBtn = document.getElementById('enterARBtn');
  const enterVRBtn = document.getElementById('enterVRBtn');
  const arStatus = document.getElementById('arStatus');
  const arReticle = document.getElementById('arReticle');
  const sceneEl = document.getElementById('scene');
  const collectSpawner = document.getElementById('collect-spawner');
  const overlayEl = document.getElementById('menuOverlay');
  const toast = document.getElementById('toast');

  let xrSession = null;
  let xrRefSpace = null;
  let hitTestSource = null;
  let xrAnim = null;
  let overlayWasVisible = true;

  function showToast(msg, ms = 1200) {
    if (!toast) { console.log('[TOAST]', msg); return; }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toast.style.display = 'none'), ms);
  }
  function setArStatus(txt, color = '#9fdfff') {
    if (arStatus) { arStatus.textContent = txt; arStatus.style.color = color; } else console.log('[AR STATUS]', txt);
  }
  function disableARBtn(label) {
    if (!enterARBtn) return;
    enterARBtn.disabled = true;
    if (label) enterARBtn.textContent = label;
    enterARBtn.style.pointerEvents = 'none';
  }
  function enableARBtn(text = 'Enter AR') {
    if (!enterARBtn) return;
    enterARBtn.disabled = false;
    enterARBtn.textContent = text;
    enterARBtn.style.pointerEvents = 'auto';
    enterARBtn.style.display = 'inline-block';
  }

  function hideOverlayForce() {
    if (!overlayEl) return;
    overlayWasVisible = !(overlayEl.getAttribute('aria-hidden') === 'true');
    // set display none to absolutely prevent it blocking camera
    overlayEl.style.display = 'none';
    overlayEl.setAttribute('aria-hidden', 'true');
  }
  function restoreOverlayForce() {
    if (!overlayEl) return;
    if (overlayWasVisible) {
      overlayEl.style.display = 'block';
      overlayEl.setAttribute('aria-hidden', 'false');
    } else {
      overlayEl.style.display = 'block'; // keep in DOM but hidden by aria if user closed earlier
      overlayEl.setAttribute('aria-hidden', 'true');
    }
  }

  function waitForSceneRenderer() {
    return new Promise((resolve) => {
      if (!sceneEl) { resolve(null); return; }
      if (sceneEl.renderer) return resolve(sceneEl.renderer);
      sceneEl.addEventListener('loaded', () => setTimeout(() => resolve(sceneEl.renderer), 50), { once: true });
    });
  }

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
      try { document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch (e) {}
      orb.parentNode && orb.parentNode.removeChild(orb);
      if (typeof window.setScore === 'function') {
        try {
          const cur = (window.state && window.state.score) ? window.state.score : 0;
          window.setScore(cur + 1);
        } catch (e) {}
      }
    });
    (collectSpawner || sceneEl).appendChild(orb);
  }

  function onXRFrame(time, frame) {
    if (!xrSession) return;
    xrAnim = xrSession.requestAnimationFrame(onXRFrame);
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

  async function initAR() {
    if (!('xr' in navigator)) {
      alert('WebXR not available');
      setArStatus('WebXR unavailable', '#ff8080');
      return;
    }
    if (xrSession) return;

    disableARBtn('Starting AR...');
    setArStatus('Requesting AR session...');

    // aggressively hide overlay so camera feed is visible
    try { hideOverlayForce(); } catch (e) {}

    try {
      // NOTE: don't request dom-overlay here — it can keep HTML overlays visible and block camera feed.
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor']
      });

      const renderer = await waitForSceneRenderer();
      if (!renderer) throw new Error('Renderer unavailable');

      // Try to let renderer show camera feed behind scene
      try { renderer.setClearColor && renderer.setClearColor(0x000000, 0); } catch(e){}

      if (renderer.xr && typeof renderer.xr.setSession === 'function') {
        await renderer.xr.setSession(xrSession);
      } else {
        const gl = renderer.getContext && renderer.getContext();
        if (gl) xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      }

      xrRefSpace = await xrSession.requestReferenceSpace('local');
      const viewerSpace = await xrSession.requestReferenceSpace('viewer');
      hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

      setArStatus('AR active — move device to detect surfaces', '#9fffb3');
      showToast('AR started');

      disableARBtn('AR active');

      xrSession.addEventListener('select', () => {
        const pos = arReticle && arReticle.object3D ? arReticle.object3D.position : null;
        if (pos) spawnOrbAtPosition({ x: pos.x, y: pos.y, z: pos.z });
      });

      xrSession.addEventListener('end', () => {
        try {
          if (arReticle) arReticle.setAttribute('visible', 'false');
          if (hitTestSource) { try { hitTestSource.cancel && hitTestSource.cancel(); } catch(_) {} hitTestSource = null; }
          xrRefSpace = null;
          xrSession = null;
          xrAnim = null;
          setArStatus('AR ended', '#ffd880');
          showToast('AR ended', 1000);
        } finally {
          enableARBtn('Enter AR');
          restoreOverlayForce();
        }
      });

      xrAnim = xrSession.requestAnimationFrame(onXRFrame);
    } catch (err) {
      console.error('initAR failed:', err);
      setArStatus('Failed to start AR — see console', '#ff8080');
      showToast('Failed to start AR — see console', 2500);
      enableARBtn('Enter AR');
      try { restoreOverlayForce(); } catch (e) {}
    }
  }

  // capability check & wiring
  function setup() {
    if (!enterARBtn) {
      setArStatus('AR UI missing', '#ffd880');
    } else {
      enterARBtn.style.display = 'none';
      setArStatus('Checking WebXR availability...');
    }

    if (!('xr' in navigator)) {
      setArStatus('navigator.xr missing — AR not available', '#ff8080');
      if (enterARBtn) enterARBtn.style.display = 'none';
    } else if (typeof navigator.xr.isSessionSupported === 'function') {
      navigator.xr.isSessionSupported('immersive-ar').then(supported => {
        if (supported) {
          setArStatus('AR supported — tap Enter AR', '#9fffb3');
          if (enterARBtn) enableARBtn('Enter AR');
        } else {
          setArStatus('AR not advertised — try Enter AR (may still work)', '#ffd880');
          if (enterARBtn) enableARBtn('Enter AR');
        }
      }).catch(err => {
        console.warn('isSessionSupported error', err);
        setArStatus('AR check failed — try Enter AR', '#ffd880');
        if (enterARBtn) enableARBtn('Enter AR');
      });
    } else {
      setArStatus('AR check unavailable — try Enter AR', '#ffd880');
      if (enterARBtn) enableARBtn('Enter AR');
    }

    if (enterARBtn) enterARBtn.addEventListener('click', () => { if (!xrSession) initAR(); });

    if (enterVRBtn && sceneEl) {
      enterVRBtn.addEventListener('click', () => {
        try { if (typeof sceneEl.enterVR === 'function') sceneEl.enterVR(); } catch(e) { console.warn('enterVR failed', e); }
      });
    }

    // debug force: ?arforce=1
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('arforce') === '1') {
        const dbg = document.createElement('div');
        dbg.style = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:8px 10px;background:rgba(0,0,0,0.7);color:#9ff;font-family:monospace;border-radius:8px;white-space:pre-line;font-size:12px;max-width:320px';
        dbg.textContent = 'AR probe...';
        document.body.appendChild(dbg);
        (async () => {
          dbg.textContent = 'navigator.xr: ' + (!!navigator.xr) + '\n';
          if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
            try {
              const s = await navigator.xr.isSessionSupported('immersive-ar');
              dbg.textContent += 'immersive-ar: ' + s + '\n';
            } catch (e) { dbg.textContent += 'isSessionSupported error: ' + (e.message || e) + '\n'; }
          } else dbg.textContent += 'isSessionSupported: N/A\n';
          if (enterARBtn) { enterARBtn.style.display = 'inline-block'; enableARBtn('Enter AR'); dbg.textContent += '\nForced AR button visible.'; }
        })();
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();

  window._arHelpers = { initAR, spawnOrbAtPosition };
})();
