// js/ar-hit-test.js - AR hit-test + diagnostics
(function(){
  const enterARBtn = document.getElementById('enterARBtn');
  const arStatus = document.getElementById('arStatus');
  const arReticle = document.getElementById('arReticle');
  const sceneEl = document.getElementById('scene');
  const collectSpawner = document.getElementById('collect-spawner');
  const toast = document.getElementById('toast');

  let xrSession = null;
  let xrRefSpace = null;
  let hitTestSource = null;

  function showToast(msg, ms = 1500){
    if (!toast) { console.log('[TOAST]', msg); return; }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> toast.style.display = 'none', ms);
  }
  function setArStatus(text, color = '#9fdfff'){
    if (arStatus) { arStatus.textContent = text; arStatus.style.color = color; }
    else console.log('[AR STATUS]', text);
  }

  function waitForSceneRenderer() {
    return new Promise((resolve) => {
      if (sceneEl && sceneEl.renderer) return resolve(sceneEl.renderer);
      if (!sceneEl) {
        console.warn('A-Frame scene element not found.');
        return resolve(null);
      }
      sceneEl.addEventListener('loaded', () => {
        setTimeout(()=> resolve(sceneEl.renderer), 50);
      }, { once: true });
    });
  }

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
            setArStatus('AR not reported supported — you may still try (tap Enter AR)', '#ffd880');
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

  // spawn orb for AR mode
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

  function seedARObjectsAroundReticle() {
    if (!arReticle) return;
    const p = arReticle.object3D.position;
    for (let i=0; i<3; i++) spawnOrbAtPosition({ x: p.x + (Math.random()-0.5)*0.5, y: p.y, z: p.z + (Math.random()-0.5)*0.5 });
    for (let i=0; i<1; i++) spawnARDangerAt({ x: p.x + (Math.random()-0.5)*0.5, y: p.y, z: p.z + (Math.random()-0.5)*0.5 });
  }

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
      if (!renderer) throw new Error('A-Frame renderer not available');

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

      if (arReticle) arReticle.setAttribute('visible', 'true');
      setArStatus('AR active — move device to detect surfaces', '#9fffb3');
      showToast('AR session started');

      xrSession.addEventListener('select', () => {
        const pos = arReticle && arReticle.object3D ? arReticle.object3D.position : null;
        if (pos) spawnOrbAtPosition(pos);
      });

      xrSession.addEventListener('end', () => {
        if (arReticle) arReticle.setAttribute('visible', 'false');
        hitTestSource = null; xrRefSpace = null; xrSession = null;
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

  function waitForSceneRenderer() {
    return new Promise((resolve) => {
      if (sceneEl && sceneEl.renderer) return resolve(sceneEl.renderer);
      if (!sceneEl) { console.warn('A-Frame scene not found'); return resolve(null); }
      sceneEl.addEventListener('loaded', () => setTimeout(()=> resolve(sceneEl.renderer), 50), { once: true });
    });
  }

  function setupAR() {
    setupARButtonAndStatus();
    if (enterARBtn) enterARBtn.addEventListener('click', initAR);
  }

  function setupARButtonAndStatus() {
    if (!enterARBtn) { setArStatus('AR UI not available', '#ffd880'); return; }
    enterARBtn.style.display = 'none';
    setArStatus('Checking WebXR availability...');
    if (!('xr' in navigator)) {
      setArStatus('navigator.xr not present', '#ff8080');
      enterARBtn.style.display = 'none';
      return;
    }
    if (navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-ar').then(supported=>{
        if (supported) {
          setArStatus('AR supported — tap Enter AR', '#9fffb3');
          enterARBtn.style.display = 'block';
        } else {
          setArStatus('AR not reported supported — you may still try', '#ffd880');
          enterARBtn.style.display = 'block';
        }
      }).catch(err=>{
        console.warn('isSessionSupported error', err);
        setArStatus('AR check failed — try Enter AR (see console)', '#ffd880');
        enterARBtn.style.display = 'block';
      });
    } else {
      setArStatus('isSessionSupported not present — try Enter AR', '#ffd880');
      enterARBtn.style.display = 'block';
    }

    // quick debug forcing option: add ?arforce=1 to URL to force show + debug box
    const url = new URL(window.location.href);
    if (url.searchParams.get('arforce') === '1') {
      // show debug box and ensure button visible
      const dbg = document.createElement('div');
      dbg.style = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:8px 10px;background:rgba(0,0,0,0.7);color:#9ff;font-family:monospace;border-radius:8px;white-space:pre-line;font-size:12px;max-width:320px';
      dbg.id = 'xr-debug';
      dbg.textContent = 'AR debug: probing...';
      document.body.appendChild(dbg);
      (async ()=>{
        dbg.textContent = 'navigator.xr: ' + (!!navigator.xr) + '\n';
        if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
          try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            dbg.textContent += 'immersive-ar supported: ' + supported + '\n';
          } catch(e){ dbg.textContent += 'isSessionSupported error: ' + (e.message||e) + '\n'; }
        } else {
          dbg.textContent += 'isSessionSupported: N/A\n';
        }
        if (enterARBtn) { enterARBtn.style.display = 'block'; dbg.textContent += '\nForced AR button visible for testing.'; }
      })();
    }
  }

  // bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAR);
  } else {
    setupAR();
  }

  // expose some helpers for debug
  window._arTestHelpers = { spawnOrbAtPosition, spawnARDangerAt, initAR };
})();
