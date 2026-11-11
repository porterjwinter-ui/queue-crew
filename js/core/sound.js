// All sounds are synthesized with Web Audio, so there are no audio files to load.
import { store } from './store.js';

let ctx = null;
let master = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio on this device */ }
}

function on() { return ctx && store.get('sound', true); }

function tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, delay = 0, attack = 0.005 } = {}) {
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.3, delay = 0, filter = 1200 } = {}) {
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filter, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  tap: () => tone(660, 0.05, { type: 'triangle', vol: 0.12 }),
  good: () => { tone(784, 0.12, { type: 'triangle' }); tone(1175, 0.18, { type: 'triangle', delay: 0.09 }); },
  pass: () => tone(420, 0.22, { type: 'sine', slide: -220, vol: 0.2 }),
  tick: (hi) => tone(hi ? 1500 : 1100, 0.03, { type: 'square', vol: 0.06 }),
  count: () => tone(880, 0.12, { type: 'square', vol: 0.12 }),
  go: () => { tone(1320, 0.28, { type: 'square', vol: 0.14 }); },
  buzzer: () => { tone(190, 0.55, { type: 'sawtooth', vol: 0.22 }); tone(140, 0.55, { type: 'square', vol: 0.1 }); },
  boom: () => { noise(0.9, { vol: 0.9, filter: 2400 }); tone(90, 0.7, { type: 'sine', slide: -50, vol: 0.5 }); },
  bleep: () => { tone(1000, 0.45, { type: 'sine', vol: 0.3 }); },
  jinx: () => { tone(300, 0.12, { type: 'square', vol: 0.12 }); tone(240, 0.2, { type: 'square', vol: 0.12, delay: 0.12 }); },
  pop: () => tone(520, 0.08, { type: 'sine', slide: 500, vol: 0.18 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.11, vol: 0.2 })),
  whoosh: () => noise(0.3, { vol: 0.25, filter: 3000 }),
  // Bright two-note ding for a right answer. Pure tones only, so it can't be mistaken for the BOOM.
  chime: () => { tone(1319, 0.12, { type: 'sine', vol: 0.22 }); tone(1976, 0.22, { type: 'sine', vol: 0.18, delay: 0.08 }); },
};

export function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ }
}

export function soundOn() { return store.get('sound', true); }
export function setSound(v) { store.set('sound', v); }
