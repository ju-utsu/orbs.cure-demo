// js/ar-hit-test.js
// Anchors-enabled AR placement for Orbs.cure
// - Places spawned objects as XR anchors when possible so they stick to real surfaces
// - Falls back to fixed-pose placement if anchors aren't supported
// - Updates anchored objects each XR frame using frame.getPose(anchor.anchorSpace, xrRefSpace)

(function () {
  const enterARBtn = document.getElementById('enterARBtn');
  const enterVRBtn  = document.getElementById('enterVRBtn');
  const arStatus    = document.getElementById('arStatus');
  const arReticle   = document.getElementById('arReticle');
  const sceneEl     = document.getElementById('scene');
  const collectSpawner = document.getElementById('collect-spawner');
  const overlayEl   = document.getElementById('menuOverlay');
  const toast       = document.getElementById('toast');

  let xrSession = null;
  let xrRefSpace = null;
  let hitTestSource = null;
  let xrAnimHandle = null;
  let latestHit = null;        // latest XRHitTestResult (from last frame)
  let latestHitPose = null;    // last hit pose (XRSpace-relative pose)

  // Anchors tracked by us: { anchor: XRAnchor, el: A-Frame-entity }
  const anchors = [];

  // Fallback static placements (when anchors unsupported): { pose: {x,y,z,orientation}, el }
  const fixedPlacements = [];

  // UI helpers
  function showToast(msg, ms = 1500){ if(!toast){ console.log('[TOAST]', msg); return; } toast.textContent = msg; toast.style.display='block'; clearTimeout(toast._t); toast._t = setTimeout(()=> toast.style.display='none', ms); }
  function setArStatus(text, color='#9fdfff'){ if(arStatus){ arStatus.textContent = text; arStatus.style.color = color; } else console.log('[AR STATUS]', text); }
  function enableARBtn(text='Enter AR'){ if(!enterARBtn) return; enterARBtn.disabled=false; enterARBtn.style.pointerEvents='auto'; enterARBtn.style.display='inline-block'; enterARBtn.textContent = text; }
  function disableARBtn(label='Starting AR...'){ if(!enterARBtn) return; enterARBtn.disabled=true; enterARBtn.style.pointerEvents='none'; if(label) enterARBtn.textContent = label; }

  // hide overlay absolutely (display:none) while AR runs so camera feed isn't blocked
  let _overlayWasVisible = true;
  function hideOverlayForce(){
    if(!overlayEl) return;
    _overlayWasVisible = !(overlayEl.getAttribute('aria-hidden') === 'true');
    overlayEl.style.display = 'none';
    overlayEl.setAttribute('aria-hidden','true');
  }
  function restoreOverlayForce(){
    if(!overlayEl) return;
    overlayEl.style.display = 'block';
    if(_overlayWasVisible) {
      overlayEl.setAttribute('aria-hidden','false');
      overlayEl.style.pointerEvents = 'auto';
    } else {
      overlayEl.setAttribute('aria-hidden','true');
      overlayEl.style.pointerEvents = 'none';
    }
  }

  // Wait for A-Frame renderer to be ready
  function waitForSceneRenderer(){
    return new Promise((resolve)=>{
      if(!sceneEl){ resolve(null); return; }
      if(sceneEl.renderer) return resolve(sceneEl.renderer);
      sceneEl.addEventListener('loaded', ()=> setTimeout(()=> resolve(sceneEl.renderer), 50), { once:true });
    });
  }

  // spawn helper: creates an A-Frame orb and appends to scene or collectSpawner
  function createOrbEntityAt(position, quaternion=null){
    const orb = document.createElement('a-sphere');
    orb.classList.add('interactable','collectable');
    orb.dataset.gaze = 'collect';
    orb.setAttribute('radius','0.18');
    orb.setAttribute('color','#ffd84d');
    orb.setAttribute('emissive','#ffeb99');
    orb.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
    if(quaternion){
      // set rotation from quaternion (A-Frame uses rotation attribute but we will set object3D quaternion later)
      // We'll also set object3D.quaternion in the update loop if needed.
    }
    orb.setAttribute('animation__float', `property: position; dir: alternate; dur: ${1800 + Math.floor(Math.random()*900)}; to: ${position.x} ${position.y + 0.18} ${position.z}; loop: true; easing: easeInOutSine`);
    orb.addEventListener('click', ()=>{
      try{ document.getElementById('collectSound')?.play()?.catch(()=>{}); } catch(_) {}
      orb.parentNode && orb.parentNode.removeChild(orb);
      if(typeof window.setScore === 'function'){
        try{ const cur = (window.state && window.state.score) ? window.state.score : 0; window.setScore(cur + 1); } catch(e){ console.warn('setScore failed', e); }
      }
    });
    (collectSpawner || sceneEl).appendChild(orb);
    return orb;
  }

  // Called every XR frame: update reticle, record latest hit, update anchors/fixed placements
  function onXRFrame(time, frame){
    if(!xrSession) return;
    xrAnimHandle = xrSession.requestAnimationFrame(onXRFrame);

    // Update anchors/fixed placements first
    if(frame && xrRefSpace){
      // update anchors
      if(frame.trackedAnchors && typeof frame.trackedAnchors.forEach === 'function'){
        // Use frame.trackedAnchors to iterate; our anchors array contains anchor objects returned by createAnchor()
        for(let i = anchors.length - 1; i >= 0; i--){
          const item = anchors[i];
          try {
            const pose = frame.getPose(item.anchor.anchorSpace, xrRefSpace);
            if(pose && item.el && item.el.object3D){
              const p = pose.transform.position;
              const o = pose.transform.orientation;
              item.el.object3D.position.set(p.x, p.y, p.z);
              item.el.object3D.quaternion.set(o.x, o.y, o.z, o.w);
              item.el.object3D.updateMatrixWorld(true);
            }
          } catch(e){
            // anchor might be deleted or not tracked yet; if anchor becomes invalid remove it
            console.warn('anchor update error', e);
          }
        }
      } else {
        // fallback: anchors not tracked by frame.trackedAnchors — use our anchors list if possible
        for(let i = anchors.length - 1; i >= 0; i--){
          const item = anchors[i];
          try {
            if(item.anchor && item.el && item.el.object3D){
              const pose = frame.getPose(item.anchor.anchorSpace, xrRefSpace);
              if(pose){
                const p = pose.transform.position;
                const o = pose.transform.orientation;
                item.el.object3D.position.set(p.x, p.y, p.z);
                item.el.object3D.quaternion.set(o.x, o.y, o.z, o.w);
                item.el.object3D.updateMatrixWorld(true);
              }
            }
          } catch(e){ /* ignore */ }
        }
      }

      // update fixed placements (no anchors)
      for(let i = fixedPlacements.length - 1; i >= 0; i--){
        const item = fixedPlacements[i];
        if(item && item.pose && item.el && item.el.object3D){
          const p = item.pose.position;
          const o = item.pose.orientation;
          item.el.object3D.position.set(p.x, p.y, p.z);
          if(o) item.el.object3D.quaternion.set(o.x, o.y, o.z, o.w);
          item.el.object3D.updateMatrixWorld(true);
        }
      }
    }

    // Hit-test to move the reticle and capture the latest hit result for selecting anchors
    if(hitTestSource && frame){
      const results = frame.getHitTestResults(hitTestSource);
      if(results && results.length > 0){
        // choose first result
        latestHit = results[0];
        // compute pose relative to xrRefSpace
        const pose = latestHit.getPose(xrRefSpace);
        if(pose){
          latestHitPose = pose;
          const p = pose.transform.position;
          if(arReticle && arReticle.object3D){
            arReticle.object3D.position.set(p.x, p.y, p.z);
            arReticle.object3D.updateMatrixWorld(true);
            arReticle.setAttribute('visible','true');
          }
        } else {
          latestHitPose = null;
          if(arReticle) arReticle.setAttribute('visible','false');
        }
      } else {
        latestHit = null;
        latestHitPose = null;
        if(arReticle) arReticle.setAttribute('visible','false');
      }
    }
  }

  // When user taps (select) while in AR, create anchor (preferred) or fallback placement.
  async function onSelect(){
    // prefer latestHit (attached to real-world surface)
    if(!xrSession){
      console.warn('no xrSession for select');
      return;
    }

    if(latestHit && typeof latestHit.createAnchor === 'function'){
      // Best: create anchor from hit test result
      try {
        const anchor = await latestHit.createAnchor(); // XRAnchor
        // create an AF entity and associate with anchor
        const pose = await new Promise((res)=> setTimeout(res, 0)); // ensure anchor available in next frame
        // create at origin for now; actual pose will be set in onXRFrame update loop via frame.getPose(anchor.anchorSpace, xrRefSpace)
        const provisionalPose = latestHitPose ? latestHitPose.transform.position : { x:0, y:0, z:0 };
        const el = createOrbEntityAt({ x: provisionalPose.x, y: provisionalPose.y, z: provisionalPose.z });
        anchors.push({ anchor, el });
        showToast('Placed anchored orb');
        return;
      } catch (err) {
        console.warn('createAnchor from hit failed, falling back:', err);
        // fall through to fallback placement
      }
    }

    // If we don't have createAnchor or it failed, try XRFrame.createAnchor if available within a frame.
    // We'll use the latestHitPose if available.
    if(latestHitPose && typeof xrSession.requestAnimationFrame === 'function'){
      // We need to create anchor via the XRFrame.createAnchor API which is available on an XRFrame.
      // Do a one-frame request to access the frame.
      try {
        await new Promise((resolve, reject) => {
          xrSession.requestAnimationFrame((time, frame) => {
            try {
              if(typeof frame.createAnchor === 'function'){
                // create an anchor at the hit pose
                frame.createAnchor(latestHitPose.transform, xrRefSpace).then((anchor) => {
                  const p = latestHitPose.transform.position;
                  const el = createOrbEntityAt({ x: p.x, y: p.y, z: p.z });
                  anchors.push({ anchor, el });
                  showToast('Placed anchored orb');
                  resolve();
                }).catch((err)=> {
                  console.warn('frame.createAnchor failed:', err);
                  // fallback: create fixed placement at pose
                  const p = latestHitPose.transform.position;
                  const q = latestHitPose.transform.orientation;
                  const el = createOrbEntityAt({ x: p.x, y: p.y, z: p.z }, q);
                  fixedPlacements.push({ pose: { position:{x:p.x,y:p.y,z:p.z}, orientation:{x:q.x,y:q.y,z:q.z,w:q.w} }, el });
                  showToast('Placed fixed orb (no anchors)');
                  resolve();
                });
              } else {
                // frame.createAnchor not available - fallback
                const p = latestHitPose.transform.position;
                const q = latestHitPose.transform.orientation;
                const el = createOrbEntityAt({ x: p.x, y: p.y, z: p.z }, q);
                fixedPlacements.push({ pose: { position:{x:p.x,y:p.y,z:p.z}, orientation:{x:q.x,y:q.y,z:q.z,w:q.w} }, el });
                showToast('Placed fixed orb (no anchors)');
                resolve();
              }
            } catch(e){ console.error('createAnchor frame callback error', e); resolve(); }
          });
        });
        return;
      } catch(e){ console.warn('anchor fallback error', e); }
    }

    // Final fallback: if we don't have hit pose or anchors API, place at reticle's visible position (if any)
    if(latestHitPose){
      const p = latestHitPose.transform.position;
      const q = latestHitPose.transform.orientation;
      const el = createOrbEntityAt({ x: p.x, y: p.y, z: p.z }, q);
      fixedPlacements.push({ pose: { position:{x:p.x,y:p.y,z:p.z}, orientation:{x:q.x,y:q.y,z:q.z,w:q.w} }, el });
      showToast('Placed fixed orb (fallback)');
      return;
    }

    showToast('No surface to place on');
  }

  // Setup and start session / hit-test
  async function initAR(){
    if(!('xr' in navigator)){ alert('WebXR not available'); setArStatus('WebXR unavailable', '#ff8080'); return; }
    if(xrSession) return;

    disableARBtn('Starting AR...');
    setArStatus('Requesting AR session...');

    // hide HTML overlay to ensure camera passthrough visible
    try { hideOverlayForce(); } catch(_) {}

    try {
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor']
      });

      const renderer = await waitForSceneRenderer();
      if(!renderer) throw new Error('Renderer unavailable');

      // try to enable renderer transparency if possible (best-effort)
      try { renderer.setClearColor && renderer.setClearColor(0x000000, 0); if(renderer.domElement) renderer.domElement.style.background='transparent'; } catch(_) {}

      // hide environment (if any) so it won't occlude camera feed
      const env = sceneEl ? sceneEl.querySelector('[environment]') : null;
      if(env) env.setAttribute('visible','false');

      // attach session to renderer
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
      showToast('AR started', 1200);
      disableARBtn('AR Active');

      // wire select
      xrSession.addEventListener('select', onSelect);

      xrSession.addEventListener('end', ()=> {
        // cleanup anchors
        anchors.forEach(item => { try{ item.anchor.delete && item.anchor.delete(); } catch(_){} if(item.el) item.el.parentNode && item.el.parentNode.removeChild(item.el); });
        anchors.length = 0;
        // cleanup fixed placements
        fixedPlacements.forEach(item => { if(item.el) item.el.parentNode && item.el.parentNode.removeChild(item.el); });
        fixedPlacements.length = 0;

        latestHit = null;
        latestHitPose = null;
        hitTestSource = null;
        xrRefSpace = null;
        xrSession = null;
        if(arReticle) arReticle.setAttribute('visible','false');

        // restore environment visibility
        try { const env = sceneEl ? sceneEl.querySelector('[environment]') : null; if(env) env.setAttribute('visible','true'); } catch(_) {}
        setArStatus('AR session ended', '#ffd880');
        showToast('AR ended', 1000);
        enableARBtn('Enter AR');
        try{ restoreOverlayForce(); } catch(_) {}
      });

      xrAnimHandle = xrSession.requestAnimationFrame(onXRFrame);
    } catch (err) {
      console.error('initAR failed:', err);
      setArStatus('Failed to start AR — see console', '#ff8080');
      showToast('Failed to start AR — see console', 2500);
      enableARBtn('Enter AR');
      try{ restoreOverlayForce(); } catch(_) {}
    }
  }

  // Setup capability checks, buttons
  function setup() {
    if(!enterARBtn){ setArStatus('AR UI missing', '#ffd880'); } else { enterARBtn.style.display='none'; setArStatus('Checking WebXR availability...'); }

    if(!('xr' in navigator)){
      setArStatus('navigator.xr missing — AR not available', '#ff8080');
      if(enterARBtn) enterARBtn.style.display='none';
    } else if(typeof navigator.xr.isSessionSupported === 'function'){
      navigator.xr.isSessionSupported('immersive-ar').then((supported)=>{
        if(supported){ setArStatus('AR supported — tap Enter AR', '#9fffb3'); if(enterARBtn) enableARBtn('Enter AR'); }
        else { setArStatus('AR not advertised — try Enter AR (may still work)', '#ffd880'); if(enterARBtn) enableARBtn('Enter AR'); }
      }).catch(err => {
        console.warn('isSessionSupported error', err);
        setArStatus('AR check failed — try Enter AR', '#ffd880');
        if(enterARBtn) enableARBtn('Enter AR');
      });
    } else {
      setArStatus('AR check unavailable — try Enter AR', '#ffd880');
      if(enterARBtn) enableARBtn('Enter AR');
    }

    if(enterARBtn) enterARBtn.addEventListener('click', ()=> { if(!xrSession) initAR(); });
    if(enterVRBtn && sceneEl) enterVRBtn.addEventListener('click', ()=> { try{ if(typeof sceneEl.enterVR === 'function') sceneEl.enterVR(); } catch(e){ console.warn('enterVR failed', e); } });

    // debug: ?arforce=1 to force the button and debug info
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

  // expose for debug
  window._arAnchors = { initAR, createOrbEntityAt, anchors, fixedPlacements };
})();
