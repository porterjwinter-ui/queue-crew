// Hot Potato: say a word, pass the phone. A hidden fuse goes off — whoever holds it gets a strike.
import { h, view, btn, mount, nameTag, avatar, pauseMenu, setBack, keepAwake, onCleanup, closeOverlay, flash, ic } from '../core/ui.js';
import { hotWordStream, letterChunk } from '../core/db.js';
import { randInt, rand } from '../core/rng.js';
import { timer, onHidden } from '../core/timer.js';
import { sfx, buzz } from '../core/sound.js';
import { results, scoreStrip, crossOut } from '../core/flow.js';
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
    ${art.bubble('say0', 66, 62, 'Yellow fruit...', { w: 112, fs: 12 })}
    ${art.bubble('say2', 196, 62, 'Banana!', { w: 78, fs: 14 })}
    ${art.icon('safe', 196, 26, 'shield-check', { size: 26, color: '#fff', bg: '#20bf6b' })}
    ${art.icon('heat', 268, 70, 'flame', { size: 34, color: '#ff5a1f' })}
    ${art.icon('boom', 268, 112, 'boom', { size: 60, color: '#fff', bg: '#ff3b1f' })}
    ${art.cross('x', 268, 62, 18)}
  `,
  css: `
    .tut-hotpotato .say0, .tut-hotpotato .say2, .tut-hotpotato .safe, .tut-hotpotato .heat, .tut-hotpotato .boom, .tut-hotpotato .x { transform: scale(0); }
    .tut-hotpotato[data-s="0"] .say0 { animation: tPop .35s .3s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="1"] .say2 { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="1"] .safe, .tut-hotpotato[data-s="2"] .safe { animation: tPop .4s .8s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="2"] .safe { animation-delay: 0s; }
    /* the potato skips the guesser and lands on someone who didn't guess */
    .tut-hotpotato[data-s="2"] .pot { animation: hpSkip 1.6s .3s ease-in-out both; }
    @keyframes hpSkip { 0% { transform: none; } 50% { transform: translate(108px, -60px); } 100% { transform: translate(216px, 0px); } }
    .tut-hotpotato[data-s="3"] .pot, .tut-hotpotato[data-s="4"] .pot { transform: translate(216px, 0px); }
    .tut-hotpotato[data-s="3"] .pot-body { fill: #ff5a3c; transition: fill 1.6s; }
    .tut-hotpotato[data-s="3"] .pot { animation: hpShake .12s .4s infinite; }
    @keyframes hpShake { 0% { transform: translate(214px, 0px) rotate(-8deg); } 50% { transform: translate(218px, -2px) rotate(8deg); } 100% { transform: translate(214px, 0px) rotate(-8deg); } }
    .tut-hotpotato[data-s="3"] .heat { animation: tPop .4s .3s both; }
    .tut-hotpotato[data-s="4"] .pot { opacity: 0; }
    .tut-hotpotato[data-s="4"] .boom { animation: hpBoom .6s .1s both cubic-bezier(.3,1.6,.5,1); }
    @keyframes hpBoom { 0% { transform: scale(0) rotate(-30deg); } 100% { transform: scale(1) rotate(0deg); } }
    .tut-hotpotato[data-s="4"] .x { animation: tPop .4s .7s both cubic-bezier(.3,1.6,.5,1); }
    .tut-hotpotato[data-s="4"] .p3 { animation: tShake .35s .3s 3; }
  `,
  steps: [
    { c: 'Describe the word on the phone', t: 2400 },
    { c: 'Guess it right and you\'re safe', t: 2600 },
    { c: 'It goes to someone who didn\'t guess', t: 2600 },
    { c: 'It gets hotter and hotter', t: 2200 },
    { c: 'Holding it at BOOM? That\'s a strike', t: 2600 },
  ],
};

// Weighted draw for the next holder: each candidate's weight is everyone else's points
// (never below 1), so more correct guesses = less likely to be handed the potato.
export function pickHolder(cands, points, rnd = rand) {
  const total = cands.reduce((n, c) => n + points[c], 0);
  const weights = cands.map((c) => Math.max(total - points[c], 1));
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < cands.length; k++) { r -= weights[k]; if (r < 0) return cands[k]; }
  return cands[cands.length - 1];
}

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

    // Secret guess points: every correct guess earns one. Who gets the potato next is a random
    // draw where more points = smaller chance. With two people at 3 and 1 points, the 3-point
    // player is handed it 1 time in 4 and the 1-point player 3 times in 4. Nobody's chance is zero.
    const guesses = Object.fromEntries(P.map((p) => [p, 0]));
    const drawNext = (exclude = new Set()) => {
      const cands = P.filter((p, i) => i !== holder && !exclude.has(p) && !out.has(p));
      return cands.length ? P.indexOf(pickHolder(cands, guesses)) : null;
    };
    newRound();

    function newRound() {
      if (alive().length <= 1) return results(ctx, strikes, { lowWins: true, note: 'Last one standing wins', crossed: out });
      round += 1;
      if (round > 1 || out.has(P[holder])) { const d = drawNext(); holder = d === null ? nextIdx(holder) : d; }
      const chunk = letters ? letterChunk(ctx.level) : null;
      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round}`,
        body: h('div', { class: 'hp-intro' },
          chunk ? chunkView(chunk) : h('div', { class: 'hp-big-ico' }, ic('flame')),
          h('div', { class: 'hp-first' }, nameTag(P[holder]), h('span', null, ' starts')),
          scoreStrip(strikes, {}, out)),
        actions: [btn(`I'm ${P[holder]}`, () => play(chunk), { icon: 'flame' })],
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
      const todo = h('div', { class: 'hp-todo' }, letters ? 'Say a word with these letters' : 'Describe it');
      const setWho = () => { who.replaceChildren(nameTag(P[holder])); };
      const newWord = () => { if (words) word.textContent = words.next().w; };
      // Describe mode: while the phone is passed, only the word is covered. The potato stays on
      // screen, heating up, flashing and ticking, and the new holder taps their name to see the word.
      let covered = false;
      const slot = h('div', { class: 'hp-slot' }, word);
      const showCover = () => {
        const name = P[holder];
        covered = true;
        scr.classList.add('passing');
        who.replaceChildren(h('span', { class: 'hp-passto' }, 'Pass to'), nameTag(name));
        slot.replaceChildren(h('button', {
          class: 'hp-reveal', type: 'button',
          onclick: () => {
            if (paused || t.done) return;
            sfx.tap(); buzz(10);
            covered = false;
            scr.classList.remove('passing');
            setWho(); newWord(); renderGot();
            slot.replaceChildren(word);
          },
        }, ic('hand-stop'), h('span', null, `I'm ${name}`)));
      };

      // Describe mode: tap whoever guessed it. They're safe; the phone goes to someone who didn't guess.
      const gotRow = h('div', { class: 'hp-got' });
      const renderGot = () => {
        if (letters) return;
        gotRow.replaceChildren(h('div', { class: 'hp-got-label' }, 'Who got it?'),
          h('div', { class: 'hp-got-avs' }, P.filter((p, i) => i !== holder && !out.has(p)).map((name) =>
            h('button', { class: 'hp-got-btn', type: 'button', onclick: () => guessed(name) }, avatar(name, 'm'), h('span', null, name)))));
      };
      const guessed = (name) => {
        if (paused || covered || t.done) return;
        guesses[name] += 1;
        const next = drawNext(new Set([name])); // the guesser is safe this time
        pass(next === null ? P.indexOf(name) : next); // only 2 players left: nobody else to give it to
      };

      const passBtn = letters ? btn('Said one!', () => pass(nextIdx(holder)), { icon: 'check', silent: true }) : null;
      // Describe mode: Skip sits right next to the word; the Who got it? players sit at the bottom.
      const skipBtn = letters ? null : h('button', {
        class: 'hp-skip', type: 'button', 'aria-label': 'Skip this word',
        onclick: () => { if (!covered && !paused) { newWord(); sfx.pass(); } },
      }, ic('arrow-forward-up'), h('span', null, 'Skip'));

      const scr = view({
        color: ctx.color, cls: 'hp-play',
        body: h('div', { class: 'hp-stage' }, potato, who, todo, letters ? chunkView(chunk) : h('div', { class: 'hp-wordrow' }, slot, skipBtn)),
        actions: letters ? [passBtn] : [gotRow],
      });
      setBack(() => doPause());
      mount(scr);
      potato.addEventListener('click', () => doPause());
      keepAwake.want = true; keepAwake(true);
      onCleanup(() => { keepAwake.want = false; keepAwake(false); clearTimeout(tickTimer); });
      setWho(); newWord(); renderGot();
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
        if (!paused) {
          sfx.tick(heat > 0.7);
          // Flash on every tick; ticks speed up as the fuse burns down.
          potato.classList.add('flash');
          setTimeout(() => potato.classList.remove('flash'), 110);
        }
        tickTimer = setTimeout(tick, 620 - 500 * Math.pow(heat, 1.3));
      };
      tick();

      function pass(to) {
        if (paused || covered || t.done) return;
        holder = to;
        sfx.chime(); buzz(25); // a guess or a word said: always a happy sound, never a noise burst
        potato.classList.remove('fly'); void potato.offsetWidth; potato.classList.add('fly');
        if (letters) { setWho(); return; } // the letters are the same for everyone, nothing to hide
        showCover();
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
            crossOut(nameTag(name), out.has(name)),
            h('div', { class: 'hp-strikes' }, [0, 1, 2].map((k) => h('span', { class: k < strikes[name] ? 'on' : '' }, ic('circle-x')))),
            out.has(name) ? h('div', { class: 'hp-boom-text' }, 'Out!') : null),
          actions: [btn('Next', newRound, { icon: 'arrow-right' })],
        }));
      }
    }
  },
};
