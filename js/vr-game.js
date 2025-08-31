/*
   Core logic for Orbs.Cure VR Game:
   - Handles state, HUD updates, spawner logic
   - Menu toggling, gaze collection, danger detection
*/

window.state = {
  score: 0,
  time: 0,
  playing: false,
  gazeCollectTime: 150,   // ms default
  gazeDangerTime: 300,    // ms for danger
  gazeTarget: null,
  gazeStart: 0
};

const hudScore = document.getElementById('hudScore');
const hudTime  = document.getElementById('hudTime');
const menuOverlay = document.getElementById('menuOverlay');
const startBtn = document.getElementById('startGameBtn');
const closeMenuBtn = document.getElementById('closeMenuBtn');
const gazeCollectInput = document.getElementById('gazeCollectTime');
const toast = document.getElementById('toast');

let gameInterval = null;
let orbs = [];
let dangers = [];

function showToast(msg, ms=1500){
  if (!toast){ console.log(msg); return; }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> toast.style.display='none', ms);
}

function setScore(v){
  window.state.score = v;
  if (hudScore) hudScore.textContent = v;
}
window.setScore = setScore;

function setTime(v){
  window.state.time = v;
  if (hudTime) hudTime.textContent = v + 's';
}

function resetGame(){
  setScore(0);
  setTime(0);
  window.state.playing = false;
  if (gameInterval) clearInterval(gameInterval);
}

function startGame(){
  // Apply custom gaze timer
  const customVal = parseInt(gazeCollectInput.value.trim(), 10);
  if (!isNaN(customVal) && customVal > 50) window.state.gazeCollectTime = customVal;

  resetGame();
  window.state.playing = true;

  // Hide overlay
  menuOverlay.setAttribute('aria-hidden','true');

  // Start timer
  gameInterval = setInterval(()=>{
    if (window.state.playing){
      window.state.time++;
      setTime(window.state.time);
    }
  }, 1000);

  // Spawn initial orbs and dangers
  spawnInitialObjects();
  showToast('Game started');
}

function spawnInitialObjects(){
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // Clear old ones
  orbs.forEach(o=>o.remove());
  dangers.forEach(d=>d.remove());
  orbs=[]; dangers=[];

  for(let i=0;i<8;i++) spawnOrb(scene);
  for(let i=0;i<3;i++) spawnDanger(scene);
}

function spawnOrb(scene){
  const orb = document.createElement('a-sphere');
  orb.classList.add('interactable');
  orb.dataset.gaze = 'collect';
  orb.setAttribute('radius','0.25');
  orb.setAttribute('color','#ffd84d');
  orb.setAttribute('emissive','#ffeb99');
  const x=(Math.random()-0.5)*6, y=1+Math.random()*0.8, z=-2-(Math.random()*6);
  orb.setAttribute('position',`${x} ${y} ${z}`);
  orb.setAttribute('animation__float',`property: position; dir: alternate; dur:${1500+Math.floor(Math.random()*800)}; to:${x} ${y+0.2} ${z}; loop:true; easing:easeInOutSine`);
  scene.appendChild(orb);
  orbs.push(orb);
}

function spawnDanger(scene){
  const box = document.createElement('a-box');
  box.classList.add('interactable');
  box.dataset.gaze='danger';
  const x=(Math.random()-0.5)*6, y=1+Math.random()*0.8, z=-2-(Math.random()*6);
  box.setAttribute('width','0.36'); box.setAttribute('height','0.36'); box.setAttribute('depth','0.36');
  box.setAttribute('color','#d43b3b');
  box.setAttribute('position',`${x} ${y} ${z}`);
  box.setAttribute('animation__rot','property: rotation; to: 0 360 0; dur:4200; loop:true; easing:linear');
  scene.appendChild(box);
  dangers.push(box);
}

function closeMenu(){
  menuOverlay.setAttribute('aria-hidden','true');
}
function openMenu(){
  menuOverlay.setAttribute('aria-hidden','false');
}

startBtn.addEventListener('click', startGame);
closeMenuBtn.addEventListener('click', closeMenu);
document.getElementById('openMenuBtn')?.addEventListener('click', openMenu);

/* ===== GAZE LOGIC ===== */
const camera = document.querySelector('[camera]');
function tickGaze(){
  if (!window.state.playing){ requestAnimationFrame(tickGaze); return; }

  const cam = camera.object3D;
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3(0,0,-1);
  direction.applyQuaternion(cam.quaternion);
  raycaster.set(cam.position, direction);

  const intersects = raycaster.intersectObjects(orbs.map(o=>o.object3D).concat(dangers.map(d=>d.object3D)), true);
  if (intersects.length>0){
    const hit = intersects[0].object.el; // A-Frame entity
    if (window.state.gazeTarget !== hit){
      window.state.gazeTarget = hit;
      window.state.gazeStart = performance.now();
    } else {
      const elapsed = performance.now()-window.state.gazeStart;
      if (hit.dataset.gaze==='collect' && elapsed>=window.state.gazeCollectTime){
        setScore(window.state.score+1);
        hit.remove();
        orbs = orbs.filter(o=>o!==hit);
      }
      if (hit.dataset.gaze==='danger' && elapsed>=window.state.gazeDangerTime){
        endGame('Game Over: Looked at danger!');
      }
    }
  } else {
    window.state.gazeTarget=null;
  }

  requestAnimationFrame(tickGaze);
}
function endGame(reason){
  window.state.playing=false;
  if (gameInterval) clearInterval(gameInterval);
  showToast(reason);
  openMenu();
}
requestAnimationFrame(tickGaze);
