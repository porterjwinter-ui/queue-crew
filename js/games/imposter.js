// Imposter: everyone gets the secret word except one player. One-word clues, then point and vote.
import { h, view, btn, mount, holdToPeek, avatar, person, enable, ic } from '../core/ui.js';
import { imposterRound } from '../core/db.js';
import { randInt } from '../core/rng.js';
import { passTo, results, scoreStrip } from '../core/flow.js';
import { sfx } from '../core/sound.js';
import { art } from '../core/tutorial.js';

const X = [48, 122, 198, 272];
const tut = {
  id: 'imposter',
  svg: `
    ${X.map((x, i) => art.person('p' + i, x, 122, ['#3867d6', '#20bf6b', '#8854d0', '#ff9f1c'][i], { scale: 0.78 })).join('')}
    <g transform="translate(198 122)"><g class="a glow"><circle r="34" fill="#ff3b3b" opacity=".25"/></g></g>
    ${X.map((x, i) => art.bubble('t' + i, x, 70, '', { w: 46, icon: i === 2 ? 'question-mark' : 'pizza', iconColor: i === 2 ? '#ff3b3b' : '#1d1530' })).join('')}
    ${['Cheese', 'Slice', 'Round?', 'Crust'].map((w, i) => art.bubble('s' + i, X[i], 70, w, { w: 70, fs: 13 })).join('')}
    ${art.icon('spy', 198, 110, 'spy', { size: 30, color: '#fff', bg: '#1d1530' })}
    ${art.icon('pt0', 82, 120, 'arrow-right', { size: 26, color: '#ff3b3b' })}${art.icon('pt1', 156, 120, 'arrow-right', { size: 26, color: '#ff3b3b' })}${art.icon('pt3', 240, 120, 'arrow-left', { size: 26, color: '#ff3b3b' })}
    ${art.icon('bang', 198, 64, 'alert-circle', { size: 34, color: '#fff', bg: '#ff3b3b' })}
  `,
  css: `
    ${['t0', 't1', 't2', 't3', 's0', 's1', 's2', 's3'].map((c) => `.tut-imposter .${c}`).join(', ')}, .tut-imposter .spy, .tut-imposter .glow,
    .tut-imposter .pt0, .tut-imposter .pt1, .tut-imposter .pt3, .tut-imposter .bang { transform: scale(0); }
    ${[0, 1, 2, 3].map((i) => `.tut-imposter[data-s="0"] .t${i} { animation: tPop .4s ${0.2 + i * 0.35}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    .tut-imposter[data-s="1"] .t0, .tut-imposter[data-s="1"] .t1, .tut-imposter[data-s="1"] .t2, .tut-imposter[data-s="1"] .t3 { transform: scale(1); }
    .tut-imposter[data-s="1"] .glow { transform: scale(1); }
    .tut-imposter[data-s="1"] .spy { animation: tPop .5s .5s both cubic-bezier(.3,1.6,.5,1); }
    .tut-imposter[data-s="1"] .p0, .tut-imposter[data-s="1"] .p1, .tut-imposter[data-s="1"] .p3 { opacity: .45; }
    ${[0, 1, 2, 3].map((i) => `.tut-imposter[data-s="2"] .s${i} { animation: tPop .35s ${0.2 + i * 0.55}s both cubic-bezier(.3,1.6,.5,1); }`).join('\n')}
    .tut-imposter[data-s="3"] .pt0, .tut-imposter[data-s="3"] .pt1, .tut-imposter[data-s="3"] .pt3 { animation: tPop .3s .3s both; }
    .tut-imposter[data-s="3"] .p2 { animation: tShake .4s .6s 3; }
    .tut-imposter[data-s="4"] .glow { transform: scale(1.3); }
    .tut-imposter[data-s="4"] .bang { animation: tPop .45s .2s both cubic-bezier(.3,1.6,.5,1); }
  `,
  steps: [
    { c: 'Everyone sees the word…', t: 2600 },
    { c: '…except the imposter', t: 2400 },
    { c: 'Each person says one word', t: 3000 },
    { c: 'Everyone points at the imposter', t: 2400 },
    { c: 'Caught!', t: 2000 },
  ],
};

export default {
  id: 'imposter', name: 'Imposter', icon: 'spy', color: '#8854d0', min: 3, tut,
  modes: [
    { id: 'classic', label: 'Classic', icon: 'spy', art: ['i:pizza', 'i:pizza', 'i:question-mark'] },
    { id: 'sneaky', label: 'Sneaky', icon: 'masks-theater', art: ['i:pizza', 'i:pizza', 'i:burger'] },
  ],
  start(ctx) {
    const P = ctx.players;
    const scores = Object.fromEntries(P.map((p) => [p, 0]));
    const sneaky = ctx.mode === 'sneaky';
    let round = 0;
    newRound();

    function newRound() {
      round += 1;
      const r = imposterRound(ctx.level);
      const spy = randInt(0, P.length - 1);
      let i = 0;
      // Show the topic to everyone first.
      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round}`,
        body: h('div', { class: 'topic' },
          h('div', { class: 'topic-ico' }, ic(r.icon)),
          h('div', { class: 'topic-label' }, 'Topic'),
          h('div', { class: 'topic-name' }, r.topic)),
        actions: [btn('Deal', () => deal(), { icon: 'cards' })],
      }));

      function deal() {
        if (i >= P.length) return talk();
        const name = P[i];
        passTo(ctx, name, () => peek(name, i === spy));
      }

      function peek(name, isSpy) {
        let secret;
        if (isSpy && !sneaky) {
          secret = h('div', { class: 'secret spy' }, h('div', { class: 'secret-ico' }, ic('spy')), h('div', null, 'Imposter!'), h('small', null, r.topic));
        } else {
          secret = h('div', { class: 'secret' }, h('div', { class: 'secret-word' }, isSpy ? r.decoy : r.word));
        }
        const done = btn('Done', () => { i += 1; deal(); }, { icon: 'check', disabled: true });
        mount(view({
          color: ctx.color, back: ctx.quit, title: name,
          body: holdToPeek(secret, () => enable(done, true)),
          actions: [done],
        }));
      }

      function talk() {
        const first = randInt(0, P.length - 1);
        const order = P.slice(first).concat(P.slice(0, first));
        mount(view({
          color: ctx.color, back: ctx.quit, title: r.topic,
          body: h('div', { class: 'talk' },
            h('div', { class: 'talk-icon' }, ic('message-circle')),
            h('div', { class: 'talk-rule' }, 'Each person says one word'),
            h('div', { class: 'talk-order' }, order.map((n, k) => h('span', { class: 'talk-step' }, person(n, 'm', h('i', { class: 'order-num' }, String(k + 1))), k < order.length - 1 ? ic('chevron-right', 'talk-arrow') : null)))),
          actions: [btn('Vote', vote, { icon: 'hand-finger-right' })],
        }));
      }

      function vote() {
        let n = 3;
        const num = h('div', { class: 'vote-num' }, '3');
        mount(view({
          color: ctx.color, back: ctx.quit, title: 'Vote',
          body: h('div', { class: 'vote' }, num, h('div', { class: 'vote-hand' }, ic('hand-finger-right'))),
        }));
        sfx.count();
        const id = setInterval(() => {
          n -= 1;
          if (n > 0) { num.textContent = String(n); sfx.count(); return; }
          clearInterval(id);
          num.textContent = 'Point!'; sfx.go();
          setTimeout(reveal, 1200);
        }, 800);
      }

      function reveal() {
        const spyName = P[spy];
        mount(view({
          color: ctx.color, back: ctx.quit, title: 'The imposter was',
          body: h('div', { class: 'reveal' },
            avatar(spyName, 'xl'), h('div', { class: 'pass-name' }, spyName),
            h('div', { class: 'reveal-q' }, 'Did you catch them?')),
          actions: [
            btn('No', () => { scores[spyName] += 2; sfx.pass(); after(`${spyName} +2`); }, { kind: 'ghost', icon: 'x' }),
            btn('Yes', () => { P.forEach((p) => { if (p !== spyName) scores[p] += 1; }); sfx.good(); after('Everyone else +1'); }, { icon: 'check' }),
          ],
        }));
      }

      function after(msg) {
        mount(view({
          color: ctx.color, back: ctx.quit, title: `Round ${round}`,
          body: h('div', { class: 'round-end' },
            h('div', { class: 'secret small' }, h('div', { class: 'secret-word' }, r.word), sneaky ? h('small', null, 'Imposter had: ', r.decoy) : null),
            h('div', { class: 'round-msg' }, h('b', null, msg)),
            scoreStrip(scores)),
          actions: [
            btn('Finish', () => results(ctx, scores), { kind: 'ghost', icon: 'flag' }),
            btn('Next', newRound, { icon: 'arrow-right' }),
          ],
        }));
      }
    }
  },
};

