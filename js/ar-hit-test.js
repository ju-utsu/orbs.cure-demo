// js/ar-hit-test.js
// AR hit-test helper — improved: hides A-Frame environment while AR runs,
// sets renderer alpha/transparent canvas so camera passthrough is visible,
// restores state on session end.

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

  // Keep references so we can restore on end
  let _prevRendererClearColor = null;
  let _prevRendererClearAlpha = null;
  let _prevCanvasBg = null;
  let _envEl = null;
  let _envWasVisible = true;

  function log(...args){ console.log('[AR-HIT]', ...args); }
  function showToast(msg, ms = 1200){ if(!toast){ console.log('[TOAST]', msg); return; } toast.textContent=msg; toast.style.display='block'; clearTimeout(toast._t); toast._t=setTimeout(()=>toast.style.display='none', ms); }
  function setArStatus(text, color='#9fdfff'){ if(arStatus){ arStatus.textContent=text; arStatus.style.color=color; } else console.log('[AR STATUS]', text); }
  function enableARBtn(label='Enter AR'){ if(!enterARBtn) return; enterARBtn.disabled=false; enterARBtn.style.pointerEvents='auto'; enterARBtn.textContent=label; enterARBtn.style.display='inline-block'; }
  function disableARBtn(label){ if(!enterARBtn) return; enterARBtn.disabled=true; enterARBtn.style.pointerEvents='none'; if(label) enterARBtn.textContent=label; }

  function hideOverlayForce(){
    if(!overlayEl) return;
    // remember if overlay was visible
    _overlayWasVisible = !(overlayEl.getAttribute('aria-hidden') === 'true');
    // set display:none to absolutely prevent blocking camera preview
    overlayEl.style.display = 'none';
    overlayEl.setAttribute('aria-hidden','true');
    log('Overlay hidden (force)');
  }
  function restoreOverlayForce(){
    if(!overlayEl) return;
    overlayEl.style.display = 'block';
    // restore previous aria-hidden state: if overlay was visible before AR, reopen; otherwise keep hidden.
    // We saved only boolean presence of visibility; if unknown, default to hidden=false (open)
    if(typeof _overlayWasVisible !== 'undefined' && !_overlayWasVisible) {
      overlayEl.setAttribute('aria-hidden','true');
      overlayEl.style.pointerEvents = 'none';
    } else {
      overlayEl.setAttribute('aria-hidden','false');
      overlayEl.style.pointerEvents = 'auto';
    }
    log('Overlay restored');
  }

  async function waitForSceneRenderer(){
    return new Promise((resolve) => {
      if(!sceneEl){ resolve(null); return; }
      if(sceneEl.renderer) return resolve(sceneEl.renderer);
      sceneEl.addEventListener('loaded', ()=> setTimeout(()=> resolve(sceneEl.renderer), 50), { once:true });
    });
  }

  function spawnOrbAtPosition(pos){
    if(!pos) return;
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable','collectable');
    orb.dataset.gaze = 'collect';
    orb.setAttribute('radius','0.18');
    orb.setAttribute('color','#ffd84d');
    orb.setAttribute('emissive','#ffeb99');
    orb.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
    orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random()*900)}; to: ${pos.x} ${pos.y + 0.18} ${pos.z}; loop: true; easing: easeInOutSine`);
    orb.addEventListener('click', ()=> {
      try{ document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch(_){}
      orb.parentNode && orb.parentNode.removeChild(orb);
      if(typeof window.setScore === 'function'){
        try{
          const cur = (window.state && window.state.score) ? window.state.score : 0;
          window.setScore(cur + 1);
        }catch(e){ console.warn('setScore failed', e); }
      }
    });
    (collectSpawner || sceneEl).appendChild(orb);
  }

  // Hit-test frame loop
  function onXRFrame(time, frame){
    if(!xrSession) return;
    xrAnim = xrSession.requestAnimationFrame(onXRFrame);

    if(!hitTestSource || !xrRefSpace) return;
    const results = frame.getHitTestResults(hitTestSource);
    if(results && results.length > 0){
      const pose = results[0].getPose(xrRefSpace);
      if(pose && arReticle && arReticle.object3D){
        const p = pose.transform.position;
        arReticle.object3D.position.set(p.x, p.y, p.z);
        arReticle.object3D.updateMatrixWorld(true);
        arReticle.setAttribute('visible','true');
      }
    } else {
      if(arReticle) arReticle.setAttribute('visible','false');
    }
  }

  // MAIN: init AR but ensure scene/environment doesn't overpaint camera
  async function initAR(){
    if(!('xr' in navigator)){ alert('WebXR not available in this browser.'); setArStatus('WebXR unavailable','#ff8080'); return; }
    if(xrSession){ console.warn('XR session already running'); return; }

    disableARBtn('Starting AR...');
    setArStatus('Requesting AR session...');

    // force hide overlay so it won't block camera feed
    try { hideOverlayForce(); } catch(e){}

    try {
      // request session WITHOUT dom-overlay (dom-overlay often keeps DOM in front)
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor']
      });

      // renderer binding
      const renderer = await waitForSceneRenderer();
      if(!renderer) throw new Error('A-Frame renderer unavailable');

      // store previous renderer clear color & alpha (if available) so we can restore later
      try {
        if(typeof renderer.getClearColor === 'function'){ _prevRendererClearColor = renderer.getClearColor().getHex(); }
        if(typeof renderer.getClearAlpha === 'function'){ _prevRendererClearAlpha = renderer.getClearAlpha(); }
      } catch(e){ /* ignore */ }

      // set transparent clear so camera feed shows through (best-effort)
      try {
        renderer.setClearColor && renderer.setClearColor(0x000000, 0);
        if(renderer.domElement) { _prevCanvasBg = renderer.domElement.style.background || ''; renderer.domElement.style.background = 'transparent'; }
        // also try scene background attribute (A-Frame)
        try { sceneEl && sceneEl.setAttribute && sceneEl.setAttribute('background', 'color: transparent'); } catch(_) {}
        log('Renderer clear alpha set to 0 and canvas background set to transparent');
      } catch(e){ log('Failed to set renderer clear alpha:', e); }

      // hide environment entity if present (so ground/sky don't occlude camera)
      _envEl = sceneEl ? sceneEl.querySelector('[environment]') : null;
      if(_envEl){
        _envWasVisible = !(_envEl.getAttribute('visible') === 'false');
        _envEl.setAttribute('visible','false');
        log('Environment hidden for AR');
      }

      // attach XR session to renderer (preferred)
      if(renderer.xr && typeof renderer.xr.setSession === 'function'){
        await renderer.xr.setSession(xrSession);
      } else {
        const gl = renderer.getContext && renderer.getContext();
        if(gl) xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      }

      xrRefSpace = await xrSession.requestReferenceSpace('local');
      const viewerSpace = await xrSession.requestReferenceSpace('viewer');
      hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

      setArStatus('AR active — move device to detect surfaces', '#9fffb3');
      showToast('AR session started', 1200);

      disableARBtn('AR active');

      // spawn on select
      xrSession.addEventListener('select', () => {
        const pos = (arReticle && arReticle.object3D) ? arReticle.object3D.position : null;
        if(pos) spawnOrbAtPosition({ x: pos.x, y: pos.y, z: pos.z });
      });

      xrSession.addEventListener('end', () => {
        try {
          if(arReticle) arReticle.setAttribute('visible','false');
          if(hitTestSource){ try{ hitTestSource.cancel && hitTestSource.cancel(); } catch(_){} hitTestSource = null; }
          xrRefSpace = null;
          xrSession = null;
          xrAnim = null;

          // restore renderer clear color & canvas bg
          try {
            const renderer = sceneEl && sceneEl.renderer;
            if(renderer){
              if(_prevRendererClearColor !== null && typeof renderer.setClearColor === 'function'){
                renderer.setClearColor(_prevRendererClearColor, _prevRendererClearAlpha !== null ? _prevRendererClearAlpha : 1);
              }
              if(renderer.domElement && typeof _prevCanvasBg === 'string') renderer.domElement.style.background = _prevCanvasBg;
            }
            // restore environment visibility
            if(_envEl) { _envEl.setAttribute('visible', _envWasVisible ? 'true' : 'false'); }
          } catch(e){ console.warn('Restore renderer/env failed', e); }

          setArStatus('AR session ended', '#ffd880');
          showToast('AR session ended', 1000);
        } finally {
          // allow re-entry
          enableARBtn('Enter AR');
          restoreOverlayForce();
        }
      });

      // start loop
      xrAnim = xrSession.requestAnimationFrame(onXRFrame);

    } catch (err) {
      console.error('initAR failed:', err);
      setArStatus('Failed to start AR — see console', '#ff8080');
      showToast('Failed to start AR — see console', 2500);
      enableARBtn('Enter AR');
      try { restoreOverlayForce(); } catch(e){}
    }
  }

  // capability check + wire VR button
  function setup() {
    if(!enterARBtn){ setArStatus('AR UI missing', '#ffd880'); } else { enterARBtn.style.display='none'; setArStatus('Checking WebXR availability...'); }

    if(!('xr' in navigator)){
      setArStatus('navigator.xr missing — AR not available', '#ff8080');
      if(enterARBtn) enterARBtn.style.display='none';
    } else if(typeof navigator.xr.isSessionSupported === 'function'){
      navigator.xr.isSessionSupported('immersive-ar').then(supported=>{
        if(supported){ setArStatus('AR supported — tap Enter AR', '#9fffb3'); if(enterARBtn) enableARBtn('Enter AR'); }
        else { setArStatus('AR not advertised — try Enter AR (may still work)', '#ffd880'); if(enterARBtn) enableARBtn('Enter AR'); }
      }).catch(err=>{
        console.warn('isSessionSupported failed', err);
        setArStatus('AR check failed — try Enter AR', '#ffd880');
        if(enterARBtn) enableARBtn('Enter AR');
      });
    } else {
      setArStatus('AR check unavailable — try Enter AR', '#ffd880');
      if(enterARBtn) enableARBtn('Enter AR');
    }

    if(enterARBtn) enterARBtn.addEventListener('click', () => { if(!xrSession) initAR(); });

    if(enterVRBtn && sceneEl) {
      enterVRBtn.addEventListener('click', ()=>{
        try { if(typeof sceneEl.enterVR === 'function') sceneEl.enterVR(); } catch(e){ console.warn('enterVR failed', e); }
      });
    }

    // debug helper ?arforce=1
    try {
      const u = new URL(window.location.href);
      if(u.searchParams.get('arforce') === '1'){
        const dbg = document.createElement('div');
        dbg.style = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:8px 10px;background:rgba(0,0,0,0.7);color:#9ff;font-family:monospace;border-radius:8px;white-space:pre-line;font-size:12px;max-width:320px';
        dbg.textContent = 'AR probe...';
        document.body.appendChild(dbg);
        (async ()=>{
          dbg.textContent = 'navigator.xr: ' + (!!navigator.xr) + '\n';
          if(navigator.xr && typeof navigator.xr.isSessionSupported === 'function'){
            try{ const s = await navigator.xr.isSessionSupported('immersive-ar'); dbg.textContent += 'immersive-ar: ' + s + '\n'; } catch(e){ dbg.textContent += 'isSessionSupported error: ' + (e.message||e) + '\n'; }
          } else dbg.textContent += 'isSessionSupported: N/A\n';
          if(enterARBtn){ enterARBtn.style.display='inline-block'; enableARBtn('Enter AR'); dbg.textContent += '\nForced AR button visible.'; }
        })();
      }
    } catch(_) {}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();

  // expose helpers for debug
  window._arHelpers = { initAR, spawnOrbAtPosition };
})();

