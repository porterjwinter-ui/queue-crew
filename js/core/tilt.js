// Motion sensing for Forehead.
//
// We turn the sensor reading into one vector: which way is "up" in the phone's own
// coordinates (x = right edge, y = top edge, z = out of the screen). That stays smooth in
// every grip, unlike raw Euler angles, which jump around when the phone is held sideways.
//
//   screen facing the sky   -> up.z = +1
//   screen facing the floor -> up.z = -1   (you nodded: "got it")
//   phone upright on head   -> up.z ≈  0

let permission = 'unknown';

// iOS 13+ requires asking, and the ask must happen inside a tap. Call this first thing in a click handler.
export function requestMotion() {
  try {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      if (permission === 'granted') return Promise.resolve(true);
      return DOE.requestPermission()
        .then((r) => { permission = r; return r === 'granted'; })
        .catch(() => false);
    }
  } catch { /* fall through */ }
  return Promise.resolve(true);
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Streams the smoothed "up" vector to cb({x,y,z}). Returns a stop function.
export function watchUp(cb) {
  let gotOrientation = false;
  let s = null;
  const emit = (v) => {
    if (!s) s = v;
    else s = { x: s.x + (v.x - s.x) * 0.4, y: s.y + (v.y - s.y) * 0.4, z: s.z + (v.z - s.z) * 0.4 };
    const n = Math.hypot(s.x, s.y, s.z) || 1;
    cb({ x: s.x / n, y: s.y / n, z: s.z / n });
  };
  const onOri = (e) => {
    if (e.beta == null || e.gamma == null) return;
    gotOrientation = true;
    const b = e.beta * RAD, g = e.gamma * RAD;
    emit({ x: -Math.sin(g) * Math.cos(b), y: Math.sin(b), z: Math.cos(g) * Math.cos(b) });
  };
  const onMot = (e) => {
    if (gotOrientation) return; // orientation is more reliable across browsers
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const n = Math.hypot(a.x, a.y, a.z);
    if (n < 2) return;
    emit({ x: a.x / n, y: a.y / n, z: a.z / n });
  };
  window.addEventListener('deviceorientation', onOri);
  window.addEventListener('devicemotion', onMot);
  return () => {
    window.removeEventListener('deviceorientation', onOri);
    window.removeEventListener('devicemotion', onMot);
  };
}

export const pitchOf = (u) => Math.asin(Math.max(-1, Math.min(1, u.z))) * DEG;

// Is the phone standing up (like on a forehead) rather than lying flat?
export const isUpright = (u) => Math.abs(u.z) < 0.5 && Math.hypot(u.x, u.y) > 0.8;

// How much to rotate the page so the word reads upright to the people watching,
// even when the phone's rotation lock is on.
export function screenFix(u) {
  if (Math.hypot(u.x, u.y) < 0.55) return null; // too flat to tell
  const physical = Math.round((Math.atan2(u.x, u.y) * DEG) / 90) * 90;
  let browser = 0;
  try {
    if (screen.orientation && typeof screen.orientation.angle === 'number') browser = screen.orientation.angle;
    else if (typeof window.orientation === 'number') browser = window.orientation;
  } catch { /* ignore */ }
  let r = ((physical - browser) % 360 + 360) % 360;
  if (r === 270) r = -90;
  return r;
}

// Turns a stream of up-vectors into "down" (got it) and "up" (pass) events.
export function tiltDetector({ onDown, onUp, threshold = 32, reset = 15, hold = 90 }) {
  let neutral = null;
  let armed = false;
  let dir = 0;
  let since = 0;
  return {
    calibrate(u) { neutral = pitchOf(u); armed = true; dir = 0; },
    get calibrated() { return neutral != null; },
    feed(u) {
      if (neutral == null) return 0;
      const now = performance.now();
      const ang = pitchOf(u) - neutral;
      if (armed) {
        const d = ang <= -threshold ? -1 : ang >= threshold ? 1 : 0;
        if (d !== 0 && d === dir) {
          if (now - since >= hold) {
            armed = false;
            if (d < 0) onDown(); else onUp();
          }
        } else { dir = d; since = now; }
      } else if (Math.abs(ang) < reset) {
        armed = true; dir = 0;
      }
      return ang;
    },
  };
}
