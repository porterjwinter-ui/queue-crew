// Hot Potato: say a word, pass the phone. A hidden fuse goes off — whoever holds it gets a strike.
import { h, view, btn, mount, nameTag, pauseMenu, setBack, keepAwake, onCleanup, closeOverlay, flash, ic } from '../core/ui.js';
import { hotWordStream, letterChunk } from '../core/db.js';
import { randInt } from '../core/rng.js';
import { timer, onHidden } from '../core/timer.js';
import { sfx, buzz } from '../core/sound.js';
import { results, scoreStrip } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const X = [52, 124, 196, 268];
const potatoSvg = (cls = 'potato') => `<g class="a ${cls}">
  <ellipse cx="0" cy="0" rx="20" ry="15" class="${cls}-body" fill="#d9a35b" stroke="#1d1530" stroke-width="2.5"/>
  <circle cx="-7" cy="-3" r="2" fill="#8a5a2b"/><circle cx="6" cy="4" r="2.2" fill="#8a5a2b"/><circle cx="9" cy="-6" r="1.6" fill="#8a5a2b"/>
</g>`;

const tut = {
  id: 'hotpotato',
  svg: `
    ${X.map((x, i) => art.person('p' + i, x, 128, ['#3867d6', '#20bf6b', '#8854d0', '#e84393'][i], { scale: 0.78 })).join('')}
    ${art.at(52, 120, potatoSvg('pot'))}
    ${art.bubble('say1', 52, 64, 'Banana!', { w: 78, fs: 14 })}
    ${art.bubble('say2', 124, 64, 'Bagel!', { w: 70, fs: 14 })}
    ${art.icon('heat', 196, 70, 'flame', { size: 34, color: '#ff5a1f' })}
    ${art.icon('boom', 196, 112, 'boom', { size: 64, color: '#fff', bg: '#ff3b1f' })}
    ${art.cross('x', 196, 62, 18)}
  `,
  css: `
    .tut-hotpotato .say1, .tut-hotpotato .say2, .tut-hotpotato .heat, .tut-hotpotato .boom, .tut-hotpotato .x { transform: scale(0); }
    .tut-hotpotato[data-s="0"] .pot { animation: hpHop1 2.2s .2s ease-in-out both; }
    @keyframes hpHop1 { 0% { transform: none; } 35% { transform: translate(36px, -34px); } 50%,100% { transform: translate(72px, 0px); } }
    .tut-hotpotato[data-s="1"] .pot { animation: hpHop2 2.4s .1s ease-in-out both; }
    @keyframes hpHop2 { 0%,45% { transform: none; } 70% { transform: translate(36px, -34px); } 85%,100% { transform: translate(72px, 0px); } }
    .tut-hotpotato[data-s="1"] .say1 { animation: tPop .35s .1s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="1"] .say2 { animation: tPop .35s 1.6s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="1"] .p0 { transform: translate(0px, 0px); }
    .tut-hotpotato[data-s="2"] .pot, .tut-hotpotato[data-s="3"] .pot { transform: translate(144px, 0px); }
    .tut-hotpotato[data-s="2"] .pot-body { fill: #ff5a3c; transition: fill 1.6s; }
    .tut-hotpotato[data-s="2"] .pot { animation: hpShake .12s .4s infinite; }
    @keyframes hpShake { 0% { transform: translate(142px, 0px) rotate(-8deg); } 50% { transform: translate(146px, -2px) rotate(8deg); } 100% { transform: translate(142px, 0px) rotate(-8deg); } }
    .tut-hotpotato[data-s="2"] .heat { animation: tPop .4s .3s both; }
    .tut-hotpotato[data-s="3"] .pot { opacity: 0; }
    .tut-hotpotato[data-s="3"] .boom { animation: hpBoom .6s .1s both cubic-bezier(.3,1.6,.5,1); }
    @keyframes hpBoom { 0% { transform: scale(0) rotate(-30deg); } 100% { transform: scale(1) rotate(0deg); } }
    .tut-hotpotato[data-s="3"] .x { animation: tPop .4s .7s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="3"] .p2 { animation: tShake .35s .3s 3; }
  `,
  steps: [
    { c: 'Pass the phone around', t: 2600 },
    { c: 'Say a word, then pass it', t: 2800 },
    { c: 'It gets hotter and hotter', t: 2400 },
    { c: 'Holding it at BOOM? That\'s a strike', t: 2600 },
  ],
};

function mix(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((sh) => Math.round(((pa >> sh) & 255) * (1 - f) + ((pb >> sh) & 255) * f));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export default {
  id: 'hotpotato', name: 'Hot Potato', icon: 'flame', color: '#ff9f1c', min: 2, tut,
  modes: [
    { id: 'words', label: 'Describe', icon: 'message-circle', art: ['i:cards', 'i:arrow-right', 'i:message-circle'] },
    { id: 'letters', label: 'Letters', icon: 'abc', art: ['CH', 'i:arrow-right', 'i:cheese'] },
  ],
  start(ctx) {
    const P = ctx.players;
    const strikes = Object.fromEntries(P.map((p) => [p, 0]));
    const out = new Set();
    const letters = ctx.mode === 'letters';
    const words = letters ? null : hotWordStream(ctx.level);
    let holder = randInt(0, P.length - 1);
    let round = 0;
    const alive = () => P.filter((p) => !out.has(p));
    const nextIdx = (i) => { do { i = (i + 1) % P.length; } while (out.has(P[i])); return i; };
    newRound();

    function newRound() {
      if (alive().length <= 1) return results(ctx, strikes, { lowWins: true, note: 'Fewest strikes wins' });
      round += 1;
      if (round > 1 || out.has(P[holder])) holder = nextIdx(holder);
      const chunk = letters ? letterChunk(ctx.level) : null;
      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round}`,
        body: h('div', { class: 'hp-intro' },
          chunk ? chunkView(chunk) : h('div', { class: 'hp-big-ico' }, ic('flame')),
          h('div', { class: 'hp-first' }, nameTag(P[holder]), h('span', null, ' starts')),
          scoreStrip(strikes, Object.fromEntries([...out].map((p) => [p, 'x'])))),
        actions: [btn('Light it', () => play(chunk), { icon: 'flame' })],
      }));
    }

    function chunkView(c) {
      const blank = h('span', { class: 'blank' }, '…');
      return h('div', { class: 'chunk' },
        c.pos !== 'start' ? blank.cloneNode(true) : null,
        h('b', null, c.text),
        c.pos !== 'end' ? blank : null,
        c.pos === 'any' ? null : h('div', { class: 'chunk-pos' }, c.pos === 'start' ? 'starts with' : 'ends with'));
    }

    function play(chunk) {
      const fuse = randInt(20, 50);
      let paused = false;
      let tickTimer = 0;
      let heat = 0;

      const potato = h('div', { class: 'hp-potato', html: `<svg viewBox="-27 -22 54 44">${potatoSvg('hp')}</svg>` });
      const who = h('div', { class: 'hp-who' });
      const word = h('div', { class: 'hp-word' });
      const setWho = () => { who.replaceChildren(nameTag(P[holder])); };
      const newWord = () => { if (words) word.textContent = words.next().w; };

      const passBtn = btn(letters ? 'Said one!' : 'Got it', () => pass(), { icon: 'check', silent: true });
      const skipBtn = letters ? null : btn('Skip', () => { newWord(); sfx.pass(); }, { kind: 'ghost', icon: 'arrow-forward-up' });

      const scr = view({
        color: ctx.color, cls: 'hp-play',
        body: h('div', { class: 'hp-stage' }, potato, who, letters ? chunkView(chunk) : word),
        actions: [skipBtn, passBtn],
      });
      setBack(() => doPause());
      mount(scr);
      potato.addEventListener('click', () => doPause());
      keepAwake.want = true; keepAwake(true);
      onCleanup(() => { keepAwake.want = false; keepAwake(false); clearTimeout(tickTimer); });
      setWho(); newWord();
      const body = potato.querySelector('.hp-body');

      const t = timer(fuse, {
        onTick: (_, frac) => {
          heat = frac;
          scr.style.setProperty('--heat', frac.toFixed(3));
          body.setAttribute('fill', mix('#d9a35b', '#ff2a1a', Math.min(1, frac * 1.15)));
        },
        onEnd: () => boom(),
      });
      onHidden(() => doPause());

      const tick = () => {
        if (t.done) return;
        if (!paused) { sfx.tick(heat > 0.7); potato.classList.toggle('tk'); }
        tickTimer = setTimeout(tick, 620 - 500 * Math.pow(heat, 1.3));
      };
      tick();

      function pass() {
        if (paused || t.done) return;
        holder = nextIdx(holder);
        sfx.whoosh(); buzz(25);
        potato.classList.remove('fly'); void potato.offsetWidth; potato.classList.add('fly');
        setWho(); newWord();
      }

      function doPause() {
        if (paused || t.done) return;
        paused = true; t.pause();
        pauseMenu({ color: ctx.color, onResume: () => { paused = false; t.resume(); setBack(() => doPause()); }, onQuit: ctx.exit });
      }

      function boom() {
        closeOverlay();
        clearTimeout(tickTimer);
        sfx.boom(); buzz([300, 80, 300]);
        flash('#ff3b3b');
        const name = P[holder];
        strikes[name] += 1;
        if (strikes[name] >= 3) out.add(name);
        mount(view({
          color: '#ff3b3b', back: ctx.quit, title: '',
          body: h('div', { class: 'hp-boom' },
            h('div', { class: 'hp-boom-ico' }, ic('boom')),
            nameTag(name),
            h('div', { class: 'hp-strikes' }, [0, 1, 2].map((k) => h('span', { class: k < strikes[name] ? 'on' : '' }, ic('circle-x')))),
            out.has(name) ? h('div', { class: 'hp-boom-text' }, 'Out!') : null),
          actions: [btn('Next', newRound, { icon: 'arrow-right' })],
        }));
      }
    }
  },
};
