// Doodle Chain: draw the prompt, the next player guesses the drawing, the next draws that guess…
import { h, view, btn, mount, enable, avatar, confetti, ic } from '../core/ui.js';
import { doodlePrompt } from '../core/db.js';
import { awardAll } from '../core/store.js';
import { sameAnswer } from '../core/text.js';
import { sfx } from '../core/sound.js';
import { passTo, tix } from '../core/flow.js';
import { art, glyph } from '../core/tutorial.js';

const INKS = ['#1d1530', '#ff3b3b', '#3867d6', '#20bf6b'];

const frame = (cls, x, y, inner) => art.at(x, y, `<g class="a ${cls}"><rect x="-48" y="-36" width="96" height="72" rx="8" fill="#fff" stroke="#1d1530" stroke-width="3"/>${inner}</g>`);

const tut = {
  id: 'doodle',
  svg: `
    ${art.at(160, 28, `<g class="a prompt"><rect x="-82" y="-16" width="164" height="32" rx="12" fill="#f7b731" stroke="#1d1530" stroke-width="2.5"/><g transform="translate(-60 0)">${glyph('lock', 16)}</g><text x="8" y="6" text-anchor="middle" font-size="15" font-weight="900" fill="#1d1530">sleepy dragon</text></g>`)}
    ${frame('d1', 82, 112, `<path class="ink1" d="M-30 14 q8 -26 26 -14 q10 -16 22 -2 q14 4 4 18 q-14 10 -30 4 q-14 6 -22 -6 M-12 -6 l-3 -10 M4 -8 l2 -10 M-2 2 h6" fill="none" stroke="#1d1530" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="320" stroke-dashoffset="320"/>`)}
    ${art.bubble('g1', 238, 72, 'lazy dinosaur?', { w: 112, fs: 12 })}
    ${frame('d2', 238, 140, `<path class="ink2" d="M-28 16 q4 -30 30 -24 q22 2 22 22 M-6 -6 l-6 -12 M8 -8 l4 -12 M-30 16 h56" fill="none" stroke="#3867d6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="260" stroke-dashoffset="260"/>`)}
    ${art.icon('pen', 110, 100, 'pencil', { size: 30, color: '#1d1530' })}
    ${art.icon('lol', 160, 190, 'mood-crazy-happy', { size: 34, color: '#e8a400' })}
  `,
  css: `
    .tut-doodle .d1, .tut-doodle .g1, .tut-doodle .d2, .tut-doodle .lol, .tut-doodle .pen { transform: scale(0); }
    .tut-doodle[data-s="0"] .prompt { animation: tPop .45s .15s both cubic-bezier(.3,1.6,.5,1); }
    .tut-doodle[data-s="1"] .d1, .tut-doodle[data-s="2"] .d1, .tut-doodle[data-s="3"] .d1, .tut-doodle[data-s="4"] .d1 { transform: scale(1); }
    .tut-doodle[data-s="1"] .ink1 { animation: dcInk 2s .3s ease-in-out both; }
    .tut-doodle[data-s="2"] .ink1, .tut-doodle[data-s="3"] .ink1, .tut-doodle[data-s="4"] .ink1 { stroke-dashoffset: 0; }
    @keyframes dcInk { to { stroke-dashoffset: 0; } }
    .tut-doodle[data-s="1"] .pen { animation: tPop .2s .1s both, dcPen 2s .3s ease-in-out both; }
    @keyframes dcPen { 0% { transform: translate(-40px, 10px); } 50% { transform: translate(-10px, -10px); } 100% { transform: translate(10px, 14px); } }
    .tut-doodle[data-s="2"] .g1, .tut-doodle[data-s="3"] .g1, .tut-doodle[data-s="4"] .g1 { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-doodle[data-s="3"] .d2, .tut-doodle[data-s="4"] .d2 { transform: scale(1); }
    .tut-doodle[data-s="3"] .ink2 { animation: dcInk 1.8s .3s ease-in-out both; }
    .tut-doodle[data-s="4"] .ink2 { stroke-dashoffset: 0; }
    .tut-doodle[data-s="4"] .lol { animation: tPop .4s .2s both cubic-bezier(.3,1.6,.5,1), tBounce .4s .7s infinite alternate; }
  `,
  steps: [
    { c: 'Secret prompt', t: 1800 },
    { c: 'Draw it!', t: 2600 },
    { c: 'Next player guesses', t: 2200 },
    { c: 'Next player draws THAT', t: 2400 },
    { c: 'See how it changed', t: 2400 },
  ],
};

// Finger drawing pad with color + undo. The canvas fills its frame and re-fits when the frame resizes.
function pad() {
  const canvas = h('canvas', { class: 'pad' });
  const frame = h('div', { class: 'pad-wrap' }, canvas);
  const strokes = [];
  let ink = 0;
  let cur = null;
  let g = null;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = frame.clientWidth, hgt = frame.clientHeight;
    if (!w || !hgt) return;
    const W = Math.round(w * dpr), H = Math.round(hgt * dpr);
    if (canvas.width === W && canvas.height === H && g) return;
    canvas.width = W;
    canvas.height = H;
    g = canvas.getContext('2d');
    redraw();
  };
  const redraw = () => {
    if (!g) return;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(paint);
  };
  const paint = (s) => {
    g.strokeStyle = s.color;
    g.lineWidth = Math.max(4, Math.min(canvas.width, canvas.height) * 0.018);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    const p = s.pts.map(([x, y]) => [x * canvas.width, y * canvas.height]);
    g.moveTo(p[0][0], p[0][1]);
    if (p.length === 1) g.lineTo(p[0][0] + 0.1, p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      g.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    if (p.length > 1) g.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
    g.stroke();
  };
  const pos = (e) => {
    const b = canvas.getBoundingClientRect();
    return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fit();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    cur = { color: INKS[ink], pts: [pos(e)] };
    strokes.push(cur);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    cur.pts.push(pos(e));
    redraw();
  });
  const up = () => { cur = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(frame);
  else window.addEventListener('resize', fit);
  requestAnimationFrame(() => requestAnimationFrame(fit));
  return {
    el: frame,
    canvas,
    undo() { strokes.pop(); redraw(); },
    nextInk() { ink = (ink + 1) % INKS.length; return INKS[ink]; },
    get ink() { return INKS[ink]; },
    get empty() { return strokes.length === 0; },
    image() {
      // Downscale so a long chain doesn't eat memory.
      const max = 700;
      const k = Math.min(1, max / canvas.width);
      const c = document.createElement('canvas');
      c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    },
  };
}

export default {
  id: 'doodle', name: 'Doodle Chain', icon: 'pencil', color: '#f7b731', min: 2, tut,
  start(ctx) {
    const P = ctx.players;
    const steps = Math.max(4, P.length + (P.length % 2)); // even, so the chain ends on a guess
    const prompt = doodlePrompt(ctx.level);
    const chain = [{ type: 'text', text: prompt.text, by: null }];
    stepTo(0);

    function stepTo(k) {
      if (k >= steps) return reveal(0);
      const name = P[k % P.length];
      const prev = chain[chain.length - 1];
      passTo(ctx, name, () => (prev.type === 'text' ? drawScreen(name, prev.text, k) : guessScreen(name, prev.img, k)));
    }

    function drawScreen(name, text, k) {
      const p = pad();
      const done = btn('Done', () => {
        chain.push({ type: 'img', img: p.image(), by: name });
        sfx.pop();
        stepTo(k + 1);
      }, { icon: 'check', disabled: true });
      p.canvas.addEventListener('pointerup', () => enable(done, !p.empty));
      const dot = h('span', { class: 'ink-dot', style: { background: p.ink } });
      mount(view({
        color: ctx.color, back: ctx.quit, title: name, cls: 'dc',
        body: h('div', { class: 'dc-draw' }, h('div', { class: 'dc-prompt' }, ic(k === 0 ? 'lock' : 'pencil'), text), p.el),
        actions: [
          btn('', () => { dot.style.background = p.nextInk(); }, { kind: 'ghost', icon: 'palette', cls: 'ink-btn' }),
          btn('Undo', () => { p.undo(); enable(done, !p.empty); }, { kind: 'ghost', icon: 'arrow-back-up' }),
          done,
        ],
      }));
      document.querySelector('.ink-btn .btn-ico').append(dot);
    }

    function guessScreen(name, img, k) {
      const input = h('input', { class: 'big-input', type: 'text', maxlength: 50, autocomplete: 'off', enterkeyhint: 'done', placeholder: 'What is it?' });
      const lock = btn('Lock in', () => submit(), { icon: 'lock', disabled: true });
      input.addEventListener('input', () => enable(lock, input.value.trim().length > 1));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      function submit() {
        const v = input.value.trim();
        if (v.length < 2) return;
        input.blur();
        chain.push({ type: 'text', text: v, by: name });
        sfx.pop();
        stepTo(k + 1);
      }
      mount(view({
        color: ctx.color, back: ctx.quit, title: name,
        body: h('div', { class: 'dc-guess' }, h('img', { class: 'dc-img', src: img, alt: 'drawing' }), input),
        actions: [lock],
      }));
    }

    function reveal(i) {
      const item = chain[i];
      const last = i === chain.length - 1;
      const card = item.type === 'img'
        ? h('img', { class: 'dc-img', src: item.img, alt: 'drawing' })
        : h('div', { class: `dc-text ${i === 0 ? 'first' : ''}` }, item.text);
      mount(view({
        color: ctx.color, back: ctx.quit, title: `${i + 1} / ${chain.length}`,
        body: h('div', { class: 'dc-reveal' },
          h('div', { class: 'dc-by' }, item.by ? avatar(item.by, 's') : ic('lock'), item.by ? h('span', null, item.by) : h('span', null, 'Start')),
          h('div', { class: 'dc-slide' }, card)),
        actions: [
          i > 0 ? btn('', () => reveal(i - 1), { kind: 'ghost', icon: 'arrow-left' }) : null,
          last ? btn('Done', ending, { icon: 'flag' }) : btn('Next', () => { sfx.whoosh(); reveal(i + 1); }, { icon: 'arrow-right' }),
        ],
      }));
    }

    function ending() {
      const finalText = [...chain].reverse().find((c) => c.type === 'text' && c.by);
      const survived = finalText && (sameAnswer(finalText.text, prompt.text) || sameAnswer(finalText.text, prompt.noun) || finalText.text.toLowerCase().includes(prompt.noun.toLowerCase()));
      const n = survived ? 2 : 1;
      awardAll(P, n);
      sfx.win(); confetti();
      mount(view({
        color: ctx.color, back: ctx.exit, title: ctx.name,
        body: h('div', { class: 'results' },
          h('div', { class: 'res-trophy' }, ic(survived ? 'confetti' : 'mood-crazy-happy')),
          h('div', { class: 'res-title' }, survived ? 'It survived!' : 'Total chaos!'),
          h('div', { class: 'dc-pair' }, h('div', { class: 'dc-text first' }, prompt.text), h('div', { class: 'dc-arrow' }, ic('arrow-down')), h('div', { class: 'dc-text' }, finalText ? finalText.text : '')),
          h('div', { class: 'res-tix-all' }, tix(n), h('span', null, 'each'))),
        actions: [btn('Home', ctx.exit, { kind: 'ghost', icon: 'home' }), btn('Again', ctx.again, { icon: 'refresh' })],
      }));
    }
  },
};
