// Majority Rules: everyone answers the same question secretly.
// Your answer matches the most popular one? +1. First to 5 wins.
import { h, view, btn, mount, avatar, person, enable, fitText, ic } from '../core/ui.js';
import { questionStream } from '../core/db.js';
import { groupAnswers, titleCase } from '../core/text.js';
import { sfx } from '../core/sound.js';
import { passTo, results, scoreStrip } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const TARGET = 5;
const MAX_ROUNDS = 12;
const X = [48, 122, 198, 272];

const tut = {
  id: 'majority',
  svg: `
    ${art.at(160, 26, `<g class="a q"><rect x="-96" y="-17" width="192" height="34" rx="12" fill="#20bf6b"/><text x="0" y="6" text-anchor="middle" font-size="16" font-weight="900" fill="#fff">What's the best pet?</text></g>`)}
    ${X.map((x, i) => art.person('p' + i, x, 132, ['#3867d6', '#ff9f1c', '#8854d0', '#e84393'][i], { scale: 0.75 })).join('')}
    ${X.map((x, i) => art.bubble('h' + i, x, 84, '?', { w: 44, fs: 18 })).join('')}
    ${X.map((x, i) => art.bubble('a' + i, x, 84, '', { w: 44, icon: i === 1 ? 'cat' : 'dog' })).join('')}
    ${[0, 2, 3].map((i) => art.text('pl' + i, X[i], 60, '+1', { fs: 20, fill: '#20bf6b' })).join('')}
  `,
  css: `
    ${['h0', 'h1', 'h2', 'h3', 'a0', 'a1', 'a2', 'a3', 'pl0', 'pl2', 'pl3'].map((c) => `.tut-majority .${c}`).join(', ')} { transform: scale(0); }
    .tut-majority[data-s="0"] .q { animation: tPop .5s .1s both cubic-bezier(.3,1.5,.5,1); }
    ${[0, 1, 2, 3].map((i) => `.tut-majority[data-s="1"] .h${i} { animation: tPop .35s ${0.2 + i * 0.3}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    ${[0, 1, 2, 3].map((i) => `.tut-majority[data-s="2"] .a${i} { transform: scale(1); transition-delay: ${i * 0.25}s; }`).join('\n')}
    ${[0, 2, 3].map((i) => `.tut-majority[data-s="2"] .pl${i} { animation: tPop .35s ${1.4 + i * 0.1}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    .tut-majority[data-s="2"] .p1 { opacity: .4; transition-delay: 1.4s; }
  `,
  steps: [
    { c: 'Everyone gets the same question', t: 2200 },
    { c: 'Answer secretly', t: 2400 },
    { c: 'Match the most answers = 1 point', t: 3400 },
  ],
};

export default {
  id: 'majority', name: 'Majority Rules', icon: 'users-group', color: '#20bf6b', min: 3, tut,
  start(ctx) {
    const P = ctx.players;
    const scores = Object.fromEntries(P.map((p) => [p, 0]));
    const qs = questionStream();
    let round = 0;
    newQuestion();

    function newQuestion() {
      round += 1;
      const q = qs.next();
      const answers = [];
      let i = 0;
      const qEl = h('div', { class: 'q-text' }, q);
      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round}`,
        body: h('div', { class: 'q-card' }, h('div', { class: 'q-box' }, qEl)),
        actions: [btn('Answer', () => ask(), { icon: 'pencil' })],
      }));
      requestAnimationFrame(() => fitText(qEl, 46, 22));

      function ask() {
        if (i >= P.length) return reveal(q, answers);
        const name = P[i];
        passTo(ctx, name, () => answerScreen(name));
      }

      function answerScreen(name) {
        const input = h('input', { class: 'big-input', type: 'text', maxlength: 40, autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done', placeholder: 'Your answer' });
        const lock = btn('Lock in', () => submit(), { icon: 'lock', disabled: true });
        input.addEventListener('input', () => enable(lock, input.value.trim().length > 0));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        function submit() {
          const v = input.value.trim();
          if (!v) return;
          input.blur();
          answers.push({ name, text: v });
          i += 1;
          sfx.pop();
          ask();
        }
        mount(view({
          color: ctx.color, back: ctx.quit, title: name,
          body: h('div', { class: 'answer' }, h('div', { class: 'q-text small' }, q), input),
          actions: [lock],
        }));
        setTimeout(() => input.focus(), 250);
      }
    }

    // Same answers are grouped automatically. Tap two groups to join them if they mean the same thing.
    function reveal(q, answers) {
      let groups = groupAnswers(answers);
      let selected = null;
      const list = h('div', { class: 'groups' });

      const winnerGroup = () => {
        const max = Math.max(...groups.map((g) => g.items.length));
        const top = groups.filter((g) => g.items.length === max);
        return top.length === 1 && max > 1 ? top[0] : null;
      };

      const render = () => {
        const win = winnerGroup();
        list.replaceChildren(...groups.sort((a, b) => b.items.length - a.items.length).map((g) => h('button', {
          class: `group ${g === win ? 'win' : ''} ${g === selected ? 'sel' : ''}`,
          onclick: () => {
            sfx.tap();
            if (!selected) selected = g;
            else if (selected === g) selected = null;
            else { g.items.push(...selected.items); groups = groups.filter((x) => x !== selected); selected = null; sfx.pop(); }
            render();
          },
        },
        h('div', { class: 'group-text' }, titleCase(g.items[0].text)),
        h('div', { class: 'group-avs' }, g.items.map((it) => person(it.name, 'xs'))),
        g === win ? h('div', { class: 'group-plus' }, '+1') : null)));
      };
      render();

      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round}`,
        body: h('div', { class: 'reveal-groups' }, list, h('div', { class: 'groups-hint' }, 'Same answer split in two? Tap both.')),
        actions: [btn('Score', () => {
          const win = winnerGroup();
          if (win) win.items.forEach((it) => (scores[it.name] += 1));
          sfx.good();
          afterRound(!!win);
        }, { icon: 'check' })],
      }));
    }

    function afterRound(anyone) {
      const done = P.some((p) => scores[p] >= TARGET) || round >= MAX_ROUNDS;
      if (done) return results(ctx, scores);
      mount(view({
        color: ctx.color, back: ctx.quit, title: `First to ${TARGET}`,
        body: h('div', { class: 'round-end' }, anyone ? null : h('div', { class: 'round-msg' }, 'Tie! No points this time.'), scoreStrip(scores)),
        actions: [btn('Next', newQuestion, { icon: 'arrow-right' })],
      }));
    }
  },
};
