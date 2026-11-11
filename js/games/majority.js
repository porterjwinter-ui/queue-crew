// Majority Rules: everyone answers secretly. Match the most popular answer to score.
// If exactly one person is the odd one out, they hold the Odd Sock and can't win while holding it.
import { h, view, btn, mount, avatar, nameTag, enable, fitText, ic } from '../core/ui.js';
import { questionStream } from '../core/db.js';
import { groupAnswers, titleCase } from '../core/text.js';
import { sfx } from '../core/sound.js';
import { passTo, results, scoreStrip } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const TARGET = 5;
const MAX_ROUNDS = 14;
const X = [48, 122, 198, 272];

const tut = {
  id: 'majority',
  svg: `
    ${art.at(160, 26, `<g class="a q"><rect x="-70" y="-17" width="140" height="34" rx="12" fill="#20bf6b"/><text x="0" y="6" text-anchor="middle" font-size="16" font-weight="900" fill="#fff">Best pet?</text></g>`)}
    ${X.map((x, i) => art.person('p' + i, x, 132, ['#3867d6', '#ff9f1c', '#8854d0', '#e84393'][i], { scale: 0.75 })).join('')}
    ${X.map((x, i) => art.bubble('h' + i, x, 84, '?', { w: 44, fs: 18 })).join('')}
    ${X.map((x, i) => art.bubble('a' + i, x, 84, '', { w: 44, icon: i === 1 ? 'cat' : 'dog' })).join('')}
    ${[0, 2, 3].map((i) => art.text('pl' + i, X[i], 62, '+1', { fs: 18, fill: '#20bf6b' })).join('')}
    ${art.icon('duck', 122, 58, 'sock', { size: 26, color: '#fff', bg: '#e84393' })}
  `,
  css: `
    ${['h0', 'h1', 'h2', 'h3', 'a0', 'a1', 'a2', 'a3', 'pl0', 'pl2', 'pl3', 'duck'].map((c) => `.tut-majority .${c}`).join(', ')} { transform: scale(0); }
    .tut-majority[data-s="0"] .q { animation: tPop .5s .1s both cubic-bezier(.3,1.5,.5,1); }
    ${[0, 1, 2, 3].map((i) => `.tut-majority[data-s="1"] .h${i} { animation: tPop .35s ${0.2 + i * 0.3}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    ${[0, 1, 2, 3].map((i) => `.tut-majority[data-s="2"] .a${i}, .tut-majority[data-s="3"] .a${i} { transform: scale(1); transition-delay: ${i * 0.25}s; }`).join('\n')}
    ${[0, 2, 3].map((i) => `.tut-majority[data-s="2"] .pl${i} { animation: tFloat 1.2s ${1.2 + i * 0.1}s both; }`).join('\n')}
    .tut-majority[data-s="2"] .p0, .tut-majority[data-s="2"] .p2, .tut-majority[data-s="2"] .p3 { animation: tBounce .4s 1.2s 4 alternate; }
    .tut-majority[data-s="3"] .a1 { opacity: 0; }
    .tut-majority[data-s="3"] .duck { animation: tPop .45s .3s both cubic-bezier(.3,1.6,.5,1), tShake .4s .8s 2; }
    .tut-majority[data-s="3"] .p0, .tut-majority[data-s="3"] .p2, .tut-majority[data-s="3"] .p3 { opacity: .4; }
  `,
  steps: [
    { c: 'A question', t: 1800 },
    { c: 'Everyone answers secretly', t: 2400 },
    { c: 'Match the most = +1', t: 2800 },
    { c: 'Odd one out gets the sock', t: 2800 },
  ],
};

export default {
  id: 'majority', name: 'Majority Rules', icon: 'users-group', color: '#20bf6b', min: 3, tut,
  start(ctx) {
    const P = ctx.players;
    const scores = Object.fromEntries(P.map((p) => [p, 0]));
    const qs = questionStream();
    let duck = null;
    let round = 0;
    const strip = () => scoreStrip(scores, duck ? { [duck]: 'sock' } : {});
    newQuestion();

    function newQuestion() {
      round += 1;
      const q = qs.next();
      const answers = [];
      let i = 0;
      const qEl = h('div', { class: 'q-text' }, q);
      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round}`,
        body: h('div', { class: 'q-card' }, h('div', { class: 'q-ico' }, ic('help-circle')), h('div', { class: 'q-box' }, qEl), strip()),
        actions: [btn('Answer', () => ask(), { icon: 'pencil' })],
      }));
      requestAnimationFrame(() => fitText(qEl, 46, 22));

      function ask() {
        if (i >= P.length) return reveal(q, answers);
        const name = P[i];
        passTo(ctx, name, () => answerScreen(name));
      }

      function answerScreen(name) {
        const input = h('input', { class: 'big-input', type: 'text', maxlength: 40, autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done', placeholder: '…' });
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

    function reveal(q, answers) {
      let groups = groupAnswers(answers);
      let selected = null;
      const list = h('div', { class: 'groups' });
      const hint = h('div', { class: 'groups-hint' }, ic('hand-click'), 'Tap two to merge');

      const outcome = () => {
        const sizes = groups.map((g) => g.items.length);
        const max = Math.max(...sizes);
        const top = groups.filter((g) => g.items.length === max);
        const winners = top.length === 1 && max > 1 ? top[0] : null;
        const singles = groups.filter((g) => g.items.length === 1);
        const odd = singles.length === 1 && groups.length > 1 ? singles[0].items[0].name : null;
        return { winners, odd };
      };

      const render = () => {
        const { winners, odd } = outcome();
        list.replaceChildren(...groups.sort((a, b) => b.items.length - a.items.length).map((g) => {
          const label = titleCase(g.items[0].text);
          const el = h('button', {
            class: `group ${g === winners ? 'win' : ''} ${g === selected ? 'sel' : ''}`,
            onclick: () => {
              sfx.tap();
              if (!selected) { selected = g; }
              else if (selected === g) { selected = null; }
              else { g.items.push(...selected.items); groups = groups.filter((x) => x !== selected); selected = null; sfx.pop(); }
              render();
            },
          },
          h('div', { class: 'group-text' }, label),
          h('div', { class: 'group-avs' }, g.items.map((it) => avatar(it.name, 's', it.name === odd ? h('i', { class: 'ss-badge' }, ic('sock')) : null))),
          g === winners ? h('div', { class: 'group-plus' }, '+1') : null);
          return el;
        }));
      };
      render();

      mount(view({
        color: ctx.color, back: ctx.quit, title: q,
        body: h('div', { class: 'reveal-groups' }, list, hint),
        actions: [btn('Score', () => {
          const { winners, odd } = outcome();
          if (winners) winners.items.forEach((it) => (scores[it.name] += 1));
          if (odd) duck = odd;
          sfx.good();
          afterRound();
        }, { icon: 'star' })],
      }));
    }

    function afterRound() {
      const champ = P.filter((p) => p !== duck && scores[p] >= TARGET).sort((a, b) => scores[b] - scores[a])[0];
      if (champ || round >= MAX_ROUNDS) return finish();
      mount(view({
        color: ctx.color, back: ctx.quit, title: `First to ${TARGET}`,
        body: h('div', { class: 'round-end' },
          duck ? h('div', { class: 'round-msg' }, h('span', { class: 'duck-big' }, ic('sock')), nameTag(duck)) : null,
          strip()),
        actions: [
          btn('Finish', finish, { kind: 'ghost', icon: 'flag' }),
          btn('Next', newQuestion, { icon: 'arrow-right' }),
        ],
      }));
    }

    function finish() {
      results(ctx, scores, { cantWin: duck, note: duck ? `${duck} has the Odd Sock and can't win` : null });
    }
  },
};
