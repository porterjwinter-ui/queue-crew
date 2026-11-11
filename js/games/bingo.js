// I Spy Bingo: spot things around you and mark them. Get a line for BINGO.
import { h, view, btn, mount, confetti, overlay, closeOverlay, confirmBox, ic } from '../core/ui.js';
import { spotItems } from '../core/db.js';
import { store } from '../core/store.js';
import { sfx, buzz } from '../core/sound.js';
import { art, glyph } from '../core/tutorial.js';

const cell = (i, x, y, e) => art.at(x, y, `<g class="a c${i}"><rect x="-22" y="-22" width="44" height="44" rx="9" fill="#fff" stroke="#1d1530" stroke-width="2.5"/>${glyph(e, 24, '#1d1530')}
  <circle class="m${i}" r="19" fill="#a3cb38" opacity="0"/><g class="m${i}" opacity="0">${glyph('check', 24, '#fff')}</g></g>`);
const E = ['balloon', 'sunglasses', 'ice-cream', 'umbrella', 'butterfly', 'backpack', 'baby-carriage', 'camera', 'cake'];

const tut = {
  id: 'bingo',
  svg: `
    ${E.map((e, i) => cell(i, 160 + ((i % 3) - 1) * 50, 112 + (Math.floor(i / 3) - 1) * 50, e)).join('')}
    ${art.icon('spy', 52, 70, 'binoculars', { size: 36, color: '#1d1530' })}
    ${art.icon('balloon', 272, 60, 'balloon', { size: 40, color: '#ff3b6b' })}
    ${art.icon('tap', 130, 80, 'hand-finger', { size: 30, color: '#1d1530' })}
    ${art.text('bingo', 160, 112, 'BINGO!', { fs: 44, fill: '#ff3b6b' })}
  `,
  css: `
    .tut-bingo .tap, .tut-bingo .bingo, .tut-bingo .balloon { transform: scale(0); }
    .tut-bingo[data-s="0"] .c0, .tut-bingo[data-s="0"] .c4, .tut-bingo[data-s="0"] .c8 { animation: tPop .4s both cubic-bezier(.3,1.6,.5,1); }
    .tut-bingo[data-s="1"] .balloon { animation: tPop .4s .2s both cubic-bezier(.3,1.6,.5,1), tBounce .5s .6s infinite alternate; }
    .tut-bingo[data-s="1"] .spy { animation: tShake .4s .3s 3; }
    .tut-bingo[data-s="2"] .tap { animation: bgTap 1.6s .2s ease-in-out both; }
    @keyframes bgTap { 0% { transform: scale(1) translate(0, 0); } 40% { transform: scale(1) translate(-12px, 14px); } 60% { transform: scale(.85) translate(-12px, 14px); } 100% { transform: scale(1) translate(-12px, 14px); } }
    .tut-bingo[data-s="2"] .m0 { opacity: .95; transition-delay: .9s; }
    .tut-bingo[data-s="3"] .m0, .tut-bingo[data-s="3"] .m4, .tut-bingo[data-s="3"] .m8 { opacity: .95; }
    .tut-bingo[data-s="3"] .m4 { transition-delay: .3s; } .tut-bingo[data-s="3"] .m8 { transition-delay: .6s; }
    .tut-bingo[data-s="3"] .bingo { animation: tPop .5s 1s both cubic-bezier(.3,1.6,.5,1); }
  `,
  steps: [
    { c: 'You get a card', t: 1800 },
    { c: 'Spot it around you', t: 2200 },
    { c: 'Tap to mark it', t: 2200 },
    { c: 'Get a line = BINGO!', t: 2800 },
  ],
};

function lines(n) {
  const L = [];
  for (let r = 0; r < n; r++) L.push([...Array(n)].map((_, c) => r * n + c));
  for (let c = 0; c < n; c++) L.push([...Array(n)].map((_, r) => r * n + c));
  L.push([...Array(n)].map((_, i) => i * n + i));
  L.push([...Array(n)].map((_, i) => i * n + (n - 1 - i)));
  return L;
}

export default {
  id: 'bingo', name: 'I Spy Bingo', icon: 'eye', color: '#a3cb38', min: 0, tut,
  start(ctx) {
    const size = ctx.level === 1 ? 3 : ctx.level === 2 ? 4 : 5;
    let card = store.get('bingo', null);
    if (!card || card.size !== size || card.v !== 2) card = newCard();
    render();

    function newCard() {
      const n = size * size;
      const free = size === 5 ? 12 : -1;
      const items = spotItems(n);
      if (free >= 0) items[free] = ['star-filled', 'Free'];
      const c = { v: 2, size, items, marks: items.map((_, i) => i === free), done: 0 };
      store.set('bingo', c);
      return c;
    }

    function render() {
      const n = card.size;
      const grid = h('div', { class: `bingo g${n}` }, card.items.map(([e, label], i) =>
        h('button', {
          class: `bcell ${card.marks[i] ? 'on' : ''}`,
          onclick: () => toggle(i),
        }, h('span', { class: 'bcell-i' }, ic(e)), h('span', { class: 'bcell-t' }, label), card.marks[i] ? h('span', { class: 'bcell-check' }, ic('check')) : null)));
      mount(view({
        color: ctx.color, back: ctx.exit, title: ctx.name,
        body: h('div', { class: 'bingo-wrap' }, grid),
        actions: [btn('New card', () => confirmBox({ color: ctx.color, icon: 'refresh', text: 'New card?', onYes: () => { card = newCard(); render(); } }), { kind: 'ghost', icon: 'refresh' })],
      }));
    }

    function toggle(i) {
      card.marks[i] = !card.marks[i];
      if (card.marks[i]) { sfx.pop(); buzz(15); } else sfx.tap();
      const complete = lines(card.size).filter((l) => l.every((k) => card.marks[k])).length;
      const all = card.marks.every(Boolean);
      const wasDone = card.done || 0;
      card.done = complete;
      store.set('bingo', card);
      render();
      if (complete > wasDone || all) {
        sfx.win(); confetti(all ? 140 : 70); buzz([60, 40, 120]);
        overlay(h('div', { class: 'stack center' },
          h('div', { class: 'bingo-shout' }, all ? 'BLACKOUT!' : 'BINGO!'),
          h('div', { class: 'huge-ico' }, ic(all ? 'trophy' : 'confetti')),
          h('div', { class: 'actions n1 inline' }, btn('Keep going', () => closeOverlay(), { icon: 'eye' }))), { color: ctx.color });
      }
    }
  },
};
