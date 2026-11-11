// Jinx (everyone on one team): each player writes a one-word clue. Matching clues cancel out!
import { h, view, btn, mount, avatar, enable, fitText } from '../core/ui.js';
import { jinxStream } from '../core/db.js';
import { sameAnswer, containsWord, titleCase } from '../core/text.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, coopResults } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const DECK = 13;

const clueCard = (cls, x, y, word) => art.at(x, y, `<g class="a ${cls}"><rect x="-25" y="-14" width="50" height="28" rx="8" fill="#fff" stroke="#1d1530" stroke-width="2.5"/>
  <text x="0" y="5" text-anchor="middle" font-size="13" font-weight="900" fill="#1d1530">${word}</text>
  <g class="a ${cls}-stamp"><rect x="-24" y="-10" width="48" height="20" rx="5" fill="#fff" fill-opacity=".6" stroke="#ff3b3b" stroke-width="3" transform="rotate(-12)"/>
  <text x="0" y="5" text-anchor="middle" font-size="12" font-weight="900" fill="#ff3b3b" transform="rotate(-12)">JINX</text></g></g>`);

const tut = {
  id: 'jinx',
  svg: `
    ${art.person('gs', 56, 112, '#3867d6', { scale: 0.85 })}
    ${art.emoji('eyes', 56, 104, '🙈', 30)}
    ${[178, 232, 286].map((x, i) => art.person('c' + i, x, 136, ['#20bf6b', '#ff9f1c', '#e84393'][i], { scale: 0.62 })).join('')}
    ${art.emoji('dog', 232, 40, '🐶', 30)}
    ${clueCard('k0', 178, 94, 'bark')}${clueCard('k1', 232, 94, 'pet')}${clueCard('k2', 286, 94, 'bark')}
    ${art.bubble('say', 124, 84, 'Dog!', { w: 64, fs: 16, tail: 'left' })}
    ${art.check('ok', 172, 84, 15)}
  `,
  css: `
    .tut-jinx .k0, .tut-jinx .k1, .tut-jinx .k2, .tut-jinx .k0-stamp, .tut-jinx .k2-stamp, .tut-jinx .say, .tut-jinx .ok, .tut-jinx .dog { transform: scale(0); }
    .tut-jinx .k1-stamp { opacity: 0; }
    .tut-jinx[data-s="0"] .eyes { animation: tPop .4s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-jinx[data-s="0"] .dog { animation: tPop .4s .7s both cubic-bezier(.3,1.6,.5,1); }
    .tut-jinx[data-s="1"] .dog, .tut-jinx[data-s="2"] .dog { transform: scale(1); }
    ${[0, 1, 2].map((i) => `.tut-jinx[data-s="1"] .k${i} { animation: tPop .35s ${0.2 + i * 0.45}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    .tut-jinx[data-s="2"] .k0, .tut-jinx[data-s="2"] .k1, .tut-jinx[data-s="2"] .k2, .tut-jinx[data-s="3"] .k1 { transform: scale(1); }
    .tut-jinx[data-s="2"] .k0-stamp, .tut-jinx[data-s="2"] .k2-stamp { animation: tStamp .35s .5s both; }
    @keyframes tStamp { from { transform: scale(2.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .tut-jinx[data-s="2"] .k0, .tut-jinx[data-s="2"] .k2 { animation: tShake .3s 1s 2; }
    .tut-jinx[data-s="3"] .k1 { transform: translate(-176px, -50px) scale(1.25); }
    .tut-jinx[data-s="3"] .eyes { transform: scale(0); }
    .tut-jinx[data-s="3"] .say { animation: tPop .35s 1s both cubic-bezier(.3,1.6,.5,1); }
    .tut-jinx[data-s="3"] .ok { animation: tPop .35s 1.4s both cubic-bezier(.3,1.6,.5,1); }
    .tut-jinx[data-s="3"] .gs { animation: tBounce .4s 1.4s 3 alternate; }
  `,
  steps: [
    { c: '🙈 Guesser looks away', t: 2200 },
    { c: '✍️ Everyone writes ONE word', t: 2600 },
    { c: '💥 Same word? Both cancel!', t: 2600 },
    { c: '🎯 Guess the word!', t: 2800 },
  ],
};

export default {
  id: 'jinx', name: 'Jinx', emoji: '👯', color: '#3867d6', min: 3, tut,
  start(ctx) {
    const P = ctx.players;
    const words = jinxStream(ctx.level);
    let left = DECK;
    let score = 0;
    let gi = 0; // guesser index
    nextCard();

    function deckBadge() {
      return h('div', { class: 'deck-badge' }, h('span', null, '🃏'), h('b', null, String(left)), h('span', { class: 'deck-score' }, `⭐ ${score}`));
    }

    function nextCard() {
      if (left <= 0) return coopResults(ctx, score, DECK);
      const guesser = P[gi % P.length];
      const givers = P.filter((p) => p !== guesser);
      const word = words.next().w;
      const clues = [];
      let i = 0;

      mount(view({
        color: ctx.color, back: ctx.quit, title: 'Jinx',
        body: h('div', { class: 'jx-guesser' }, deckBadge(), avatar(guesser, 'xl'), h('div', { class: 'pass-name' }, guesser), h('div', { class: 'jx-look' }, '🙈 Look away!')),
        actions: [btn('Clues', () => ask(), { emoji: '✍️' })],
      }));

      function ask() {
        if (i >= givers.length) return check();
        const name = givers[i];
        passTo(ctx, name, () => write(name), { note: h('span', { class: 'jx-not' }, '🙈 ', guesser) });
      }

      function write(name) {
        const input = h('input', { class: 'big-input', type: 'text', maxlength: 24, autocomplete: 'off', autocapitalize: 'none', enterkeyhint: 'done', placeholder: '1 word' });
        const lock = btn('Lock in', () => submit(), { emoji: '🔒', disabled: true });
        const warn = h('div', { class: 'warn' });
        input.addEventListener('input', () => {
          const v = input.value.trim();
          const multi = /\s/.test(v);
          warn.textContent = multi ? '☝️ ONE word' : '';
          enable(lock, v.length > 0 && !multi);
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        function submit() {
          const v = input.value.trim();
          if (!v || /\s/.test(v)) return;
          input.blur();
          clues.push({ name, text: v });
          i += 1;
          sfx.pop();
          ask();
        }
        const wEl = h('div', { class: 'secret-word' }, word);
        mount(view({
          color: ctx.color, back: ctx.quit, title: name,
          body: h('div', { class: 'answer' }, h('div', { class: 'secret small' }, wEl), input, warn),
          actions: [lock],
        }));
        requestAnimationFrame(() => fitText(wEl, 52, 20));
        setTimeout(() => input.focus(), 250);
      }

      // Clue-givers check the cancellations (the guesser is still looking away).
      function check() {
        clues.forEach((c) => {
          c.invalid = containsWord(c.text, word);
          c.cancel = c.invalid || clues.some((o) => o !== c && sameAnswer(o.text, c.text));
        });
        const anyJinx = clues.some((c) => c.cancel);
        if (anyJinx) { sfx.jinx(); buzz([40, 30, 40]); }
        const grid = h('div', { class: 'clues' });
        const render = () => grid.replaceChildren(...clues.map((c) => h('button', {
          class: `clue ${c.cancel ? 'cancel' : ''}`,
          onclick: () => { c.cancel = !c.cancel; sfx.tap(); render(); },
        }, h('span', { class: 'clue-text' }, c.text), c.cancel ? h('span', { class: 'stamp' }, 'JINX') : null, avatar(c.name, 'xs'))));
        render();
        mount(view({
          color: ctx.color, back: ctx.quit, title: '🙈 ' + guesser,
          body: h('div', { class: 'jx-check' }, h('div', { class: 'secret small' }, h('div', { class: 'secret-word' }, word)), grid, h('div', { class: 'groups-hint' }, '👆 tap to cancel')),
          actions: [btn('Show', () => passTo(ctx, guesser, () => guess()), { emoji: '👀' })],
        }));
      }

      function guess() {
        const kept = clues.filter((c) => !c.cancel);
        mount(view({
          color: ctx.color, back: ctx.quit, title: guesser,
          body: h('div', { class: 'jx-guess' }, deckBadge(),
            kept.length
              ? h('div', { class: 'clues big' }, kept.map((c) => h('div', { class: 'clue' }, h('span', { class: 'clue-text' }, titleCase(c.text)))))
              : h('div', { class: 'jx-empty' }, '💥 All jinxed!'),
            h('div', { class: 'jx-say' }, '🗣️ Say your guess')),
          actions: [
            btn('Pass', () => { left -= 1; sfx.pass(); done(null); }, { kind: 'ghost', emoji: '⤴️' }),
            btn('Reveal', () => judge(), { emoji: '👀' }),
          ],
        }));
      }

      function judge() {
        mount(view({
          color: ctx.color, back: ctx.quit, title: guesser,
          body: h('div', { class: 'jx-guess' }, h('div', { class: 'secret' }, h('div', { class: 'secret-word' }, word))),
          actions: [
            btn('Missed', () => { left -= 2; sfx.buzzer(); done(false); }, { kind: 'ghost', emoji: '❌' }),
            btn('Got it', () => { left -= 1; score += 1; sfx.good(); done(true); }, { emoji: '✅' }),
          ],
        }));
      }

      function done() {
        gi += 1;
        left = Math.max(0, left);
        nextCard();
      }
    }
  },
};
