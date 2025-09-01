# HOWTO — Quick edits & where to change things

This short HOWTO shows the exact places to edit common gameplay/visual settings.

## File locations (repo root)
- `index.html` — main page (UI, scene, asset references)
- `style.css` — all styles (overlay, HUD, menus)
- `js/vr-game.js` — VR game logic (spawning, gaze collection)
- `js/ar-hit-test.js` — AR logic (hit-test, anchors, AR spawn)
- `assets/` — audio, screenshots, demo media

---

## 1) Change gaze timers (orb & danger)
Edit either the UI default values in `index.html` or the runtime defaults in `js/vr-game.js` and `js/ar-hit-test.js`.

### index.html (UI defaults)

<input id="orbGazeInput" type="number" min="50" step="50" value="150">
<input id="dangerGazeInput" type="number" min="50" step="50" value="500">

### js/vr-game.js (fallback defaults)
// near top of file
let orbGazeTime = 150;     // milliseconds
let dangerGazeTime = 500;  // milliseconds

### js/ar-hit-test.js (AR fallback)
// near top of file
const DEFAULT_ORB_GAZE = 150;
const DEFAULT_DANGER_GAZE = 500;

## 2) Change spawn counts & caps

In js/vr-game.js and js/ar-hit-test.js adjust these constants.

// vr-game.js
const MAX_OBJECTS = 21;       // maximum combined on-screen objects (VR or AR)
const SPAWN_INTERVAL = 2500;  // ms between auto-spawns

// ar-hit-test.js
const MAX_AR_OBJECTS = 21;

-- Adjust numbers to tune performance (use lower values for older phones).


## 3) Tweak spawn behavior (stagger, probabilities)

Search for spawnOrb() and spawnDanger() functions in both JS files. Modify logic that decides whether to spawn an orb or danger (e.g., change probability from 0.7 to 0.6).

Example:
// change line like:
if (Math.random() < 0.7) spawnOrb(); else spawnDanger();

// to:
if (Math.random() < 0.6) spawnOrb(); else spawnDanger();


## 4) Replace or tweak audio

Files: /assets/audio/click.ogg and /assets/audio/explosion.ogg

Replace with new files of same name to keep code unchanged, or change id/src in index.html and references in JS.


## 5) Change visual grid / environment

Edit environment attributes in index.html (a-entity with environment component):

<a-entity environment="preset: starry; ground: grid; gridColor: #00ffff; groundColor: #071428; dressingAmount: 8"></a-entity>


- Change preset, gridColor, or dressingAmount to tune aesthetics.

- For full custom ground textures use groundTexture: url(assets/textures/your.png) (ensure file in assets).


## 6) Performance tuning

- Lower MAX_OBJECTS, increase SPAWN_INTERVAL.

- Reduce geometry complexity (smaller radius, fewer particles).

- Use compressed textures and 720p videos for demo media.

- Test on a mid-range phone and observe memory/CPU.


## 7) Local testing & AR checklist

- For VR development: python3 -m http.server 8000 and open http://localhost:8000.

- For AR testing: use GitHub Pages (HTTPS) or create local HTTPS server (mkcert/ngrok).

- On Android: use Chrome (latest), enable WebXR flags if needed.

- Ensure camera permission is granted and move device slowly for hit-test detection.


## 8) Useful search terms in the codebase:

orbGaze, dangerGaze, spawnOrb, spawnDanger, MAX, hitTest, createAnchor
