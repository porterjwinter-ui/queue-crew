// Spectrum (everyone on one team): one player sees a hidden target on a scale and gives a clue.
// The team turns the needle. Closer = more points.
import { h, view, btn, mount, holdToPeek, enable, ic, avatar } from '../core/ui.js';
import { spectrumStream } from '../core/db.js';
import { randInt } from '../core/rng.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, coopResults } from '../core/flow.js';
import { art, glyph } from '../core/tutorial.js';

const CARDS = 7;
const BANDS = [[14, 2], [9, 3], [4, 4]]; // [within N points of the target, score]
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
    <path d="M82 158 A78 78 0 0 1 238 158 Z" fill="#fff" stroke="#1d1530" stroke-width="3"/>
    <g transform="rotate(30 160 158)">${bandsSvg(160, 158, 76, 50)}</g>
    <g class="a lid"><path d="M80 159 A80 80 0 0 1 240 159 Z" fill="#a55eea" stroke="#1d1530" stroke-width="3"/><g transform="translate(160 126)">${glyph('question-mark', 34, '#fff')}</g></g>
    <g class="a needle"><path d="M157 158 L160 92 L163 158 Z" fill="#1d1530"/></g>
    <circle cx="160" cy="158" r="7" fill="#1d1530"/>
    ${art.icon('lti', 66, 180, 'snowflake', { size: 16, color: '#3867d6' })}${art.text('lt', 94, 180, 'Cold', { fs: 14 })}
    ${art.text('rt', 228, 180, 'Hot', { fs: 14 })}${art.icon('rti', 252, 180, 'flame', { size: 16, color: '#ff5a1f' })}
    ${art.person('psy', 34, 96, '#a55eea', { scale: 0.62 })}
    ${art.person('t0', 268, 96, '#20bf6b', { scale: 0.56 })}
    ${art.person('t1', 300, 96, '#ff9f1c', { scale: 0.56 })}
    ${art.icon('eye', 34, 62, 'eye', { size: 16, color: '#fff', bg: '#1d1530' })}
    ${art.icon('ph', 34, 132, 'device-mobile', { size: 18, color: '#fff', bg: '#1d1530' })}
    ${art.bubble('clue', 96, 40, 'Soup!', { w: 64, fs: 15, tail: 'left' })}
    ${art.icon('hush', 34, 62, 'message-circle-off', { size: 16, color: '#fff', bg: '#ff3b3b' })}
    ${art.text('pts', 160, 44, '+4', { fs: 30, fill: '#ff3b6b' })}
  `,
  css: `
    .tut-spectrum .eye, .tut-spectrum .clue, .tut-spectrum .pts, .tut-spectrum .hush { transform: scale(0); }
    .tut-spectrum .needle, .tut-spectrum .lid { transform-origin: 50% 100%; }
    .tut-spectrum[data-s="0"] .lid { animation: spPeek 2.4s .3s ease-in-out both; }
    @keyframes spPeek { 0% { opacity: 1; } 25%,75% { opacity: .08; } 100% { opacity: 1; } }
    .tut-spectrum[data-s="0"] .eye { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-spectrum[data-s="0"] .t0, .tut-spectrum[data-s="0"] .t1 { opacity: .3; }
    .tut-spectrum[data-s="1"] .clue { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-spectrum[data-s="2"] .ph { animation: spHand 1.5s .3s ease-in-out both; }
    @keyframes spHand { 0% { transform: none; } 50% { transform: translate(118px, -60px); } 100% { transform: translate(250px, 0px); } }
    .tut-spectrum[data-s="3"] .ph, .tut-spectrum[data-s="4"] .ph { transform: translate(250px, 0px); }
    .tut-spectrum[data-s="3"] .needle { animation: spTurn 2.2s .2s ease-in-out both; }
    @keyframes spTurn { 0% { transform: rotate(0deg); } 40% { transform: rotate(50deg); } 70% { transform: rotate(22deg); } 100% { transform: rotate(32deg); } }
    .tut-spectrum[data-s="3"] .t0, .tut-spectrum[data-s="3"] .t1 { animation: tBounce .4s infinite alternate; }
    .tut-spectrum[data-s="3"] .hush { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-spectrum[data-s="4"] .needle { transform: rotate(32deg); }
    .tut-spectrum[data-s="4"] .lid { opacity: 0; }
    .tut-spectrum[data-s="4"] .pts { animation: tPop .4s .5s both cubic-bezier(.3,1.6,.5,1); }
  `,
  steps: [
    { c: 'One player secretly sees the target', t: 3000 },
    { c: 'They say ONE clue out loud', t: 2200 },
    { c: 'Then they hand the phone to the team', t: 2400 },
    { c: 'The team moves the needle', t: 2800 },
    { c: 'Closer = more points', t: 2400 },
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
  const labels = h('div', { class: 'dial-labels' }, h('span', null, ic('arrow-left'), left), h('span', null, right, ic('arrow-right')));
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
  id: 'spectrum', name: 'Spectrum', icon: 'target', color: '#a55eea', min: 2, tut,
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
      const team = P.filter((p) => p !== psychic);
      passTo(ctx, psychic, () => peek(), { note: h('span', { class: 'jx-not' }, ic('eye-off'), 'Everyone else looks away') });

      // Only the clue-giver sees this.
      function peek() {
        const d = dial({ left: L, right: R, target });
        const done = btn('Done', handOff, { icon: 'check', disabled: true });
        mount(view({
          color: ctx.color, back: ctx.quit, title: psychic,
          body: h('div', { class: 'sp-peek' }, holdToPeek(d.el, () => enable(done, true)), h('div', { class: 'sp-tip' }, ic('bulb'), 'Think of ONE clue')),
          actions: [done],
        }));
      }

      // Clue-giver says the clue, then gives the phone away. They don't touch the needle.
      function handOff() {
        mount(view({
          color: ctx.color, back: ctx.quit, title: psychic,
          body: h('div', { class: 'sp-hand' },
            h('div', { class: 'sp-hand-pic' },
              h('span', { class: 'sp-hand-who' }, avatar(psychic, 'm'), h('span', { class: 'sp-hand-bubble' }, ic('message-circle'))),
              h('span', { class: 'sp-hand-phone' }, ic('device-mobile')),
              h('span', { class: 'sp-hand-team' }, team.map((t) => avatar(t, 'm')))),
            h('ol', { class: 'sp-hand-steps' },
              h('li', null, ic('message-circle'), 'Say your clue'),
              h('li', null, ic('device-mobile'), 'Give the phone to the team'))),
          actions: [btn('Team has it', guessScreen, { icon: 'users' })],
        }));
      }

      function guessScreen() {
        const d = dial({ left: L, right: R, draggable: true, onMove: () => enable(lock, true) });
        const lock = btn('Lock in', () => reveal(d), { icon: 'lock' });
        mount(view({
          color: ctx.color, back: ctx.quit, title: 'Team',
          body: h('div', { class: 'sp-guess' },
            h('div', { class: 'sp-team' }, team.map((t) => avatar(t, 's'))),
            d.el,
            h('div', { class: 'sp-tip' }, ic('hand-finger'), 'Move the needle together'),
            h('div', { class: 'sp-quiet' }, ic('message-circle-off'), psychic, ' stays quiet')),
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
          color: ctx.color, back: ctx.quit, title: `Score: ${score}`,
          body: h('div', { class: 'sp-guess' }, ptsEl, d.el),
          actions: [btn(idx >= CARDS ? 'Results' : 'Next', next, { icon: idx >= CARDS ? 'flag' : 'arrow-right' })],
        }));
      }
    }
  },
};
