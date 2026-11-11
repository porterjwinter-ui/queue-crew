// Guess the Wait: everyone guesses how many minutes until you board. Closest without going over wins.
// The clock keeps running in the background while you play other games.
import { h, view, btn, mount, avatar, nameTag, person, onCleanup, confetti, confirmBox, ic } from '../core/ui.js';
import { store, awardRanking } from '../core/store.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, tix } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const X = [70, 160, 250];
const tut = {
  id: 'wait',
  svg: `
    ${X.map((x, i) => art.person('p' + i, x, 136, ['#ff5a5f', '#20bf6b', '#3867d6'][i], { scale: 0.72 })).join('')}
    ${['20', '35', '45'].map((n, i) => art.bubble('g' + i, X[i], 90, n + ' min', { w: 70, fs: 14 })).join('')}
    <g transform="translate(160 40)"><g class="a clock">
      <circle r="26" fill="#fff" stroke="#1d1530" stroke-width="3.5"/>
      <g class="a hand"><path d="M-2 0 L0 -20 L2 0 Z" fill="#1d1530"/></g>
      <circle r="3.5" fill="#1d1530"/>
    </g></g>
    ${art.text('actual', 160, 40, '38 min', { fs: 22, fill: '#4b6584' })}
    ${art.icon('crown', 160, 62, 'crown-filled', { size: 28, color: '#f7b731' })}
    ${art.cross('over', 250, 62, 14)}
  `,
  css: `
    .tut-wait .g0, .tut-wait .g1, .tut-wait .g2, .tut-wait .actual, .tut-wait .crown, .tut-wait .over { transform: scale(0); }
    .tut-wait .hand { transform-origin: 50% 100%; }
    ${[0, 1, 2].map((i) => `.tut-wait[data-s="0"] .g${i} { animation: tPop .35s ${0.2 + i * 0.4}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    .tut-wait[data-s="1"] .g0, .tut-wait[data-s="1"] .g1, .tut-wait[data-s="1"] .g2, .tut-wait[data-s="2"] .g0, .tut-wait[data-s="2"] .g1, .tut-wait[data-s="2"] .g2 { transform: scale(1); }
    .tut-wait[data-s="1"] .hand { animation: wtSpin .6s linear infinite; }
    @keyframes wtSpin { to { transform: rotate(360deg); } }
    .tut-wait[data-s="2"] .clock { opacity: 0; }
    .tut-wait[data-s="2"] .actual { animation: tPop .4s .1s both cubic-bezier(.3,1.6,.5,1); }
    .tut-wait[data-s="2"] .crown { animation: tPop .4s 1s both cubic-bezier(.3,1.6,.5,1); }
    .tut-wait[data-s="2"] .over { animation: tPop .4s .6s both cubic-bezier(.3,1.6,.5,1); }
    .tut-wait[data-s="2"] .p1 { animation: tBounce .4s 1.2s 3 alternate; }
  `,
  steps: [
    { c: 'Everyone guesses the wait in minutes', t: 2400 },
    { c: 'The clock starts', t: 2000 },
    { c: 'Closest guess without going over wins', t: 3200 },
  ],
};

export function waitRunning() {
  const w = store.get('wait', null);
  return w && w.start && !w.done ? w : null;
}

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export default {
  id: 'wait', name: 'Guess the Wait', icon: 'stopwatch', color: '#4b6584', min: 1, tut,
  start(ctx) {
    const running = waitRunning();
    if (running) return clock(running);
    const guesses = {};
    let i = 0;
    ask();

    function ask() {
      if (i >= ctx.players.length) {
        const w = { start: Date.now(), guesses, done: false };
        store.set('wait', w);
        sfx.go();
        return clock(w);
      }
      const name = ctx.players[i];
      passTo(ctx, name, () => pickScreen(name));
    }

    function pickScreen(name) {
      let v = 30;
      const num = h('div', { class: 'wt-num' }, String(v), h('small', null, ' min'));
      const slider = h('input', { class: 'wt-slider', type: 'range', min: 1, max: 120, step: 1, value: v });
      slider.addEventListener('input', () => {
        v = Number(slider.value);
        num.firstChild.textContent = String(v);
        if (v % 5 === 0) sfx.tick();
      });
      mount(view({
        color: ctx.color, back: ctx.quit, title: name,
        body: h('div', { class: 'wt-pick' }, h('div', { class: 'wt-q' }, 'Minutes until we ride?'), num, slider),
        actions: [btn('Lock in', () => { guesses[name] = v; i += 1; sfx.pop(); ask(); }, { icon: 'lock' })],
      }));
    }

    function clock(w) {
      const big = h('div', { class: 'wt-clock' }, fmt(Date.now() - w.start));
      const id = setInterval(() => { big.textContent = fmt(Date.now() - w.start); }, 1000);
      onCleanup(() => clearInterval(id));
      mount(view({
        color: ctx.color, back: ctx.exit, title: ctx.name,
        body: h('div', { class: 'wt-run' }, big,
          h('div', { class: 'wt-avs' }, Object.keys(w.guesses).map((n) => h('span', { class: 'wt-av' }, person(n, 'm'), h('b', null, '?')))),
          h('div', { class: 'wt-tip' }, ic('home'), 'Play other games. It keeps counting.')),
        actions: [
          btn('Cancel', () => confirmBox({ color: ctx.color, icon: 'trash', text: 'Stop the clock?', onYes: () => { store.del('wait'); ctx.exit(); } }), { kind: 'ghost', icon: 'x' }),
          btn("We're on!", () => finish(w), { icon: 'circle-check' }),
        ],
      }));
    }

    function finish(w) {
      const actual = Math.max(1, Math.round((Date.now() - w.start) / 60000));
      store.set('wait', { ...w, done: true });
      // Closest without going over; if everyone went over, closest wins.
      const anyUnder = Object.values(w.guesses).some((g) => g <= actual);
      const eff = Object.fromEntries(Object.entries(w.guesses).map(([n, g]) => [n, g <= actual ? -(actual - g) : (anyUnder ? -1000 : 0) - (g - actual)]));
      const awards = awardRanking(eff);
      const sorted = Object.keys(eff).sort((a, b) => eff[b] - eff[a]);
      const maxG = Math.max(actual, ...Object.values(w.guesses));
      sfx.win(); confetti(); buzz([60, 40, 120]);
      mount(view({
        color: ctx.color, back: ctx.exit, title: ctx.name,
        body: h('div', { class: 'results' },
          h('div', { class: 'wt-actual' }, `${actual}`, h('small', null, ' min')),
          h('div', { class: 'wt-bars' }, sorted.map((n, k) => {
            const g = w.guesses[n];
            return h('div', { class: `wt-bar ${k === 0 ? 'win' : ''} ${g > actual ? 'over' : ''}` },
              nameTag(n, k === 0 ? ic('crown-filled', 'gold') : null),
              h('div', { class: 'wt-track' }, h('div', { class: 'wt-fill', style: { width: `${(g / maxG) * 100}%` } }), h('div', { class: 'wt-line', style: { left: `${(actual / maxG) * 100}%` } })),
              h('b', null, `${g}`),
              tix(awards[n]));
          }))),
        actions: [btn('Home', () => { store.del('wait'); ctx.exit(); }, { icon: 'home' })],
      }));
    }
  },
};
