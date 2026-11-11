// Spectrum (everyone on one team): one player sees a hidden target on a scale and gives a clue.
// The team turns the needle. Closer = more points.
import { h, view, btn, mount, holdToPeek, enable } from '../core/ui.js';
import { spectrumStream } from '../core/db.js';
import { randInt } from '../core/rng.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, coopResults } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const CARDS = 7;
const BANDS = [[14, 2], [9, 3], [4, 4]]; // within ±N points of the target → score
const BAND_COLORS = { 2: '#ffd32a', 3: '#ff9f1c', 4: '#ff3b6b' };

const pt = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
function wedge(cx, cy, r, a1, a2) {
  const [x1, y1] = pt(cx, cy, r, a1), [x2, y2] = pt(cx, cy, r, a2);
  return `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 0 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}
const vToDeg = (v) => 180 - v * 1.8;

function bandsSvg(cx, cy, r, v) {
  const a = vToDeg(v);
  const wedges = BANDS.map(([w, p]) =>
    `<path d="${wedge(cx, cy, r, Math.max(0, a - w * 1.8), Math.min(180, a + w * 1.8))}" fill="${BAND_COLORS[p]}"/>`).join('');
  const [x, y] = pt(cx, cy, r * 0.8, a);
  return wedges + `<text x="${x.toFixed(1)}" y="${(y + r * 0.05).toFixed(1)}" text-anchor="middle" font-size="${(r * 0.13).toFixed(1)}" font-weight="900" fill="#fff">4</text>`;
}

const tut = {
  id: 'spectrum',
  svg: `
    <path d="M60 150 A100 100 0 0 1 260 150 Z" fill="#fff" stroke="#1d1530" stroke-width="3"/>
    <g transform="rotate(30 160 150)">${bandsSvg(160, 150, 98, 50)}</g>
    <g class="a lid"><path d="M58 151 A102 102 0 0 1 262 151 Z" fill="#a55eea" stroke="#1d1530" stroke-width="3"/><text x="160" y="118" text-anchor="middle" font-size="34">❓</text></g>
    <g class="a needle"><path d="M157 150 L160 62 L163 150 Z" fill="#1d1530"/></g>
    <circle cx="160" cy="150" r="9" fill="#1d1530"/>
    ${art.text('lt', 60, 172, '🥶 Cold', { fs: 15 })}${art.text('rt', 260, 172, 'Hot 🥵', { fs: 15 })}
    ${art.person('psy', 34, 64, '#a55eea', { scale: 0.6 })}
    ${art.emoji('eye', 34, 26, '👀', 24)}
    ${art.bubble('clue', 104, 30, 'Soup!', { w: 64, fs: 15, tail: 'left' })}
    ${art.text('pts', 252, 40, '+4 🎯', { fs: 22, fill: '#ff3b6b' })}
  `,
  css: `
    .tut-spectrum .eye, .tut-spectrum .clue, .tut-spectrum .pts { transform: scale(0); }
    .tut-spectrum .needle { transform-origin: 50% 100%; }
    .tut-spectrum .lid { transform-origin: 50% 100%; }
    .tut-spectrum[data-s="0"] .lid { animation: spPeek 2.2s .3s ease-in-out both; }
    @keyframes spPeek { 0% { opacity: 1; } 25%,75% { opacity: .08; } 100% { opacity: 1; } }
    .tut-spectrum[data-s="0"] .eye { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-spectrum[data-s="1"] .clue { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-spectrum[data-s="2"] .needle { animation: spTurn 2.2s .2s ease-in-out both; }
    @keyframes spTurn { 0% { transform: rotate(0deg); } 40% { transform: rotate(50deg); } 70% { transform: rotate(22deg); } 100% { transform: rotate(32deg); } }
    .tut-spectrum[data-s="3"] .needle { transform: rotate(32deg); }
    .tut-spectrum[data-s="3"] .lid { opacity: 0; }
    .tut-spectrum[data-s="3"] .pts { animation: tPop .4s .6s both cubic-bezier(.3,1.6,.5,1); }
  `,
  steps: [
    { c: '👀 One player sees the target', t: 2800 },
    { c: '🗣️ They say ONE clue', t: 2000 },
    { c: '🎯 Team moves the needle', t: 2800 },
    { c: '🎉 Closer = more points', t: 2400 },
  ],
};

// Interactive dial. Returns { el, value, setTarget(v), reveal() }.
function dial({ left, right, target = null, draggable = false, onMove }) {
  const W = 220, cx = 110, cy = 112, r = 100;
  const svgNS = 'http://www.w3.org/2000/svg';
  const wrap = h('div', { class: 'dial' });
  wrap.innerHTML = `<svg viewBox="0 0 ${W} 128">
    <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="#fff" stroke="#1d1530" stroke-width="3"/>
    <g class="dial-bands">${target != null ? bandsSvg(cx, cy, r - 2, target) : ''}</g>
    <g class="dial-needle"><path d="M${cx - 3.5} ${cy} L${cx} ${cy - r + 8} L${cx + 3.5} ${cy} Z" fill="#1d1530"/></g>
    <circle cx="${cx}" cy="${cy}" r="8" fill="#1d1530"/>
  </svg>`;
  const labels = h('div', { class: 'dial-labels' }, h('span', null, '⬅\u00a0', left), h('span', null, right, '\u00a0➡'));
  const el = h('div', { class: 'dial-wrap' }, wrap, labels);
  const svg = wrap.querySelector('svg');
  const needle = wrap.querySelector('.dial-needle');
  const bands = wrap.querySelector('.dial-bands');
  let value = 50;
  const setNeedle = (v) => {
    value = Math.max(0, Math.min(100, v));
    needle.setAttribute('transform', `rotate(${(value - 50) * 1.8} ${cx} ${cy})`);
  };
  setNeedle(50);
  if (draggable) {
    svg.style.touchAction = 'none';
    const fromEvent = (e) => {
      const b = svg.getBoundingClientRect();
      const x = ((e.clientX - b.left) / b.width) * W;
      const y = ((e.clientY - b.top) / b.height) * 128;
      let deg = Math.atan2(cy - y, x - cx) * 180 / Math.PI;
      if (deg < 0) deg = x < cx ? 180 : 0;
      return (180 - deg) / 1.8;
    };
    let dragging = false, lastTick = 50;
    svg.addEventListener('pointerdown', (e) => { dragging = true; try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ } setNeedle(fromEvent(e)); onMove && onMove(value); });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setNeedle(fromEvent(e));
      if (Math.abs(value - lastTick) >= 5) { lastTick = value; sfx.tick(); }
      onMove && onMove(value);
    });
    const up = () => (dragging = false);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  }
  return {
    el,
    get value() { return value; },
    reveal(t) { bands.innerHTML = bandsSvg(cx, cy, r - 2, t); bands.classList.add('pop'); svg.appendChild(needle); svg.appendChild(svg.querySelector('circle')); },
  };
}

export default {
  id: 'spectrum', name: 'Spectrum', emoji: '🎯', color: '#a55eea', min: 2, tut,
  start(ctx) {
    const P = ctx.players;
    const specs = spectrumStream();
    let idx = 0;
    let score = 0;
    next();

    function next() {
      if (idx >= CARDS) return coopResults(ctx, score, CARDS * 4);
      const psychic = P[idx % P.length];
      const [L, R] = specs.next();
      const target = randInt(5, 95);
      passTo(ctx, psychic, () => peek());

      function peek() {
        const d = dial({ left: L, right: R, target });
        const done = btn('Done', guessScreen, { emoji: '✅', disabled: true });
        mount(view({
          color: ctx.color, back: ctx.quit, title: `${idx + 1} / ${CARDS}`,
          body: h('div', { class: 'sp-peek' }, holdToPeek(d.el, () => enable(done, true)), h('div', { class: 'sp-tip' }, '🤫 Think of a clue')),
          actions: [done],
        }));
      }

      function guessScreen() {
        const d = dial({ left: L, right: R, draggable: true, onMove: () => enable(lock, true) });
        const lock = btn('Lock in', () => reveal(d), { emoji: '🔒' });
        mount(view({
          color: ctx.color, back: ctx.quit, title: `${idx + 1} / ${CARDS}`,
          body: h('div', { class: 'sp-guess' }, h('div', { class: 'sp-say' }, '🗣️ ', h('b', null, psychic), ': say a clue!'), d.el, h('div', { class: 'sp-tip' }, '👆 drag the needle')),
          actions: [lock],
        }));
      }

      function reveal(d) {
        const diff = Math.abs(d.value - target);
        const pts = (BANDS.slice().reverse().find(([w]) => diff <= w) || [0, 0])[1];
        score += pts;
        idx += 1;
        d.reveal(target);
        if (pts >= 3) { sfx.win(); buzz([40, 30, 80]); } else if (pts) sfx.good(); else sfx.pass();
        const ptsEl = h('div', { class: `sp-pts p${pts}` }, pts ? `+${pts}` : '0');
        mount(view({
          color: ctx.color, back: ctx.quit, title: `⭐ ${score}`,
          body: h('div', { class: 'sp-guess' }, ptsEl, d.el),
          actions: [btn(idx >= CARDS ? 'Results' : 'Next', next, { emoji: idx >= CARDS ? '🏁' : '➡️' })],
        }));
      }
    }
  },
};
