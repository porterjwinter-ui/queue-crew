// Fishbowl: fill a bowl with words, then go through the SAME words three times:
// 1) describe it, 2) one word only, 3) sounds only.
import { h, view, btn, mount, fitText, enable, pauseMenu, setBack, keepAwake, onCleanup, closeOverlay, flash } from '../core/ui.js';
import { fishbowlStream } from '../core/db.js';
import { shuffle } from '../core/rng.js';
import { timer, ring, onHidden } from '../core/timer.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, makeTeams, teamBadge, teamResults, coopResults } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const TURN = 45;
const PER_PLAYER = 3;
const ROUNDS = [
  { emoji: '🗣️', rule: 'Describe it' },
  { emoji: '☝️', rule: 'ONE word only' },
  { emoji: '🔊', rule: 'Sounds only' },
];

const slip = (cls, x, y, rot = 0) => art.at(x, y, `<g class="a ${cls}"><rect x="-12" y="-7" width="24" height="14" rx="2" fill="#fff8d6" stroke="#1d1530" stroke-width="2" transform="rotate(${rot})"/></g>`);

const tut = {
  id: 'fishbowl',
  svg: `
    ${art.person('p0', 44, 130, '#ff5a5f', { scale: 0.7 })}
    ${art.person('p1', 276, 130, '#3867d6', { scale: 0.7 })}
    ${slip('s0', 60, 60, -10)}${slip('s1', 260, 60, 12)}${slip('s2', 110, 40, 6)}${slip('s3', 210, 40, -8)}
    <g transform="translate(160 150)"><g class="a bowl">
      <path d="M-46 -40 Q-62 0 -40 34 Q0 50 40 34 Q62 0 46 -40 Z" fill="#c9f1ff" stroke="#1d1530" stroke-width="3" opacity=".9"/>
      <ellipse cx="0" cy="-40" rx="46" ry="9" fill="#e9fbff" stroke="#1d1530" stroke-width="3"/>
      <text x="-12" y="20" font-size="22">🐟</text>
    </g></g>
    ${art.emoji('r1', 160, 50, '🗣️', 44)}${art.emoji('r2', 160, 50, '☝️', 44)}${art.emoji('r3', 160, 50, '🔊', 44)}
    ${art.text('n1', 205, 30, '1', { fs: 22, fill: '#0fb9b1' })}${art.text('n2', 205, 30, '2', { fs: 22, fill: '#0fb9b1' })}${art.text('n3', 205, 30, '3', { fs: 22, fill: '#0fb9b1' })}
    ${art.emoji('loop', 160, 52, '🔁', 50)}
  `,
  css: `
    .tut-fishbowl .r1, .tut-fishbowl .r2, .tut-fishbowl .r3, .tut-fishbowl .n1, .tut-fishbowl .n2, .tut-fishbowl .n3, .tut-fishbowl .loop { transform: scale(0); }
    .tut-fishbowl .s0, .tut-fishbowl .s1, .tut-fishbowl .s2, .tut-fishbowl .s3 { opacity: 0; }
    .tut-fishbowl[data-s="0"] .s0 { animation: fbDropL 1s .2s ease-in both; }
    .tut-fishbowl[data-s="0"] .s1 { animation: fbDropR 1s .6s ease-in both; }
    .tut-fishbowl[data-s="0"] .s2 { animation: fbDropL2 1s 1s ease-in both; }
    .tut-fishbowl[data-s="0"] .s3 { animation: fbDropR2 1s 1.4s ease-in both; }
    @keyframes fbDropL { 0% { opacity: 1; transform: none; } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(100px, 90px) rotate(90deg); } }
    @keyframes fbDropR { 0% { opacity: 1; transform: none; } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(-100px, 90px) rotate(-90deg); } }
    @keyframes fbDropL2 { 0% { opacity: 1; transform: none; } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(50px, 110px) rotate(80deg); } }
    @keyframes fbDropR2 { 0% { opacity: 1; transform: none; } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(-50px, 110px) rotate(-80deg); } }
    .tut-fishbowl[data-s="1"] .r1, .tut-fishbowl[data-s="1"] .n1,
    .tut-fishbowl[data-s="2"] .r2, .tut-fishbowl[data-s="2"] .n2,
    .tut-fishbowl[data-s="3"] .r3, .tut-fishbowl[data-s="3"] .n3 { animation: tPop .4s .15s both cubic-bezier(.3,1.6,.5,1); }
    .tut-fishbowl[data-s="1"] .p0, .tut-fishbowl[data-s="2"] .p1, .tut-fishbowl[data-s="3"] .p0 { animation: tBounce .35s .4s 4 alternate; }
    .tut-fishbowl[data-s="4"] .loop { animation: tPop .4s .1s both, tSpin 1.6s .5s linear infinite; }
    @keyframes tSpin { to { transform: rotate(360deg); } }
    .tut-fishbowl[data-s="4"] .bowl { animation: tShake .4s .3s 3; }
  `,
  steps: [
    { c: '✍️ Everyone adds words', t: 2800 },
    { c: '🗣️ Round 1: describe it', t: 2000 },
    { c: '☝️ Round 2: ONE word', t: 2000 },
    { c: '🔊 Round 3: sounds only', t: 2000 },
    { c: '🔁 Same words every round!', t: 2400 },
  ],
};

export default {
  id: 'fishbowl', name: 'Fishbowl', emoji: '🐟', color: '#0fb9b1', min: 2, tut,
  modes: [
    { id: 'write', label: 'We write', emoji: '✍️', art: ['🧑', '✍️', '🐟'] },
    { id: 'auto', label: 'Surprise', emoji: '🎲', art: ['🎲', '→', '🐟'] },
  ],
  start(ctx) {
    const P = ctx.players;
    const coop = P.length < 4;
    const teams = coop ? [{ color: ctx.color, members: P.slice() }] : makeTeams(P);
    const tscores = teams.map(() => 0);
    const gen = fishbowlStream(ctx.level);
    const all = [];
    let round = 0;
    let bowl = [];
    let turnNo = 0;

    if (ctx.mode === 'auto') {
      for (let k = 0; k < Math.max(10, P.length * PER_PLAYER); k++) all.push(gen.next().w);
      roundIntro();
    } else fill(0);

    // ---- Filling the bowl ----
    function fill(pi) {
      if (pi >= P.length) return roundIntro();
      passTo(ctx, P[pi], () => addScreen(pi, 0));
    }
    function addScreen(pi, n) {
      if (n >= PER_PLAYER) return fill(pi + 1);
      const input = h('input', { class: 'big-input', type: 'text', maxlength: 40, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done', placeholder: 'A person, place or thing' });
      const add = btn('Add', () => submit(), { emoji: '➕', disabled: true });
      input.addEventListener('input', () => enable(add, input.value.trim().length > 1));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      function submit() {
        const v = input.value.trim();
        if (v.length < 2) return;
        input.blur();
        all.push(v); sfx.pop();
        addScreen(pi, n + 1);
      }
      mount(view({
        color: ctx.color, back: ctx.quit, title: P[pi],
        body: h('div', { class: 'answer' },
          h('div', { class: 'slips' }, Array.from({ length: PER_PLAYER }, (_, k) => h('span', { class: `slip ${k < n ? 'on' : ''}` }, k < n ? '✓' : ''))),
          input),
        actions: [
          btn('Idea', () => { input.value = gen.next().w; enable(add, true); input.focus(); }, { kind: 'ghost', emoji: '🎲' }),
          add,
        ],
      }));
      setTimeout(() => input.focus(), 250);
    }

    // ---- Rounds ----
    function roundIntro() {
      if (round >= ROUNDS.length) return finish();
      bowl = shuffle(all);
      const R = ROUNDS[round];
      mount(view({
        color: ctx.color, back: ctx.quit, title: `Round ${round + 1}`,
        body: h('div', { class: 'fb-round' },
          h('div', { class: 'fb-round-emoji' }, R.emoji),
          h('div', { class: 'fb-round-rule' }, R.rule),
          h('div', { class: 'fb-bowl' }, '🐟 ', String(bowl.length)),
          coop ? null : h('div', { class: 'teams' }, teams.map((t, i) => teamBadge(t, tscores[i])))),
        actions: [btn('Go', nextTurn, { emoji: '▶️' })],
      }));
    }

    function nextTurn() {
      const team = coop ? 0 : turnNo % 2;
      const members = teams[team].members;
      const name = members[Math.floor(turnNo / teams.length) % members.length];
      passTo(ctx, name, () => play(name, team), { label: 'Ready', emoji: ROUNDS[round].emoji, note: coop ? null : teamBadge(teams[team]) });
    }

    function play(name, team) {
      const R = ROUNDS[round];
      let paused = false;
      let got = 0;
      let cur = null;
      const word = h('div', { class: 'ds-word' });
      const box = h('div', { class: 'ds-wordbox fb' }, word);
      const count = h('div', { class: 'fb-count' });
      const r = ring(TURN, () => doPause());
      const draw = () => {
        if (!bowl.length) return end(true);
        cur = bowl.shift();
        word.textContent = cur;
        count.textContent = `🐟 ${bowl.length + 1}`;
        box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
        requestAnimationFrame(() => fitText(word, 60, 20));
      };
      mount(view({
        color: ctx.color, cls: 'ds-play',
        body: h('div', { class: 'ds-stage' },
          h('div', { class: 'ds-top' }, r.el, h('div', { class: 'fb-rule' }, R.emoji, ' ', R.rule), count),
          box),
        actions: [
          btn('Skip', () => { if (paused || !cur) return; bowl.splice(Math.floor(Math.random() * (bowl.length + 1)), 0, cur); cur = null; sfx.pass(); draw(); }, { kind: 'ghost', emoji: '⤴️', silent: true }),
          btn('Got it', () => { if (paused || !cur) return; got += 1; tscores[team] += 1; cur = null; sfx.good(); buzz(40); flash('#20bf6b'); draw(); }, { emoji: '✅', silent: true }),
        ],
      }));
      setBack(() => doPause());
      keepAwake.want = true; keepAwake(true);
      onCleanup(() => { keepAwake.want = false; keepAwake(false); });
      draw();
      const t = timer(TURN, { onTick: (left, frac) => r.set(left, frac), onEnd: () => end(false) });
      onHidden(() => doPause());

      function doPause() {
        if (paused || t.done) return;
        paused = true; t.pause();
        pauseMenu({ color: ctx.color, onResume: () => { paused = false; t.resume(); setBack(() => doPause()); }, onQuit: ctx.exit });
      }

      function end(empty) {
        if (t) t.stop();
        closeOverlay();
        if (cur) { bowl.unshift(cur); cur = null; }
        if (empty) sfx.win(); else { sfx.buzzer(); buzz([100, 60, 200]); }
        turnNo += 1;
        const roundOver = bowl.length === 0;
        if (roundOver) round += 1;
        mount(view({
          color: ctx.color, back: ctx.quit, title: name,
          body: h('div', { class: 'turn-end' },
            h('div', { class: 'te-row' }, h('span', { class: 'te-big ok' }, `✅ ${got}`)),
            roundOver ? h('div', { class: 'fb-empty' }, '🐟 Bowl empty!') : h('div', { class: 'fb-bowl' }, '🐟 ', String(bowl.length)),
            coop ? h('div', { class: 'res-big' }, String(tscores[0])) : h('div', { class: 'teams' }, teams.map((tm, i) => teamBadge(tm, tscores[i])))),
          actions: [btn('Next', roundOver ? roundIntro : nextTurn, { emoji: '➡️' })],
        }));
      }
    }

    function finish() {
      // Everyone on one team: the score is how many words you got per turn.
      if (coop) coopResults(ctx, Math.round((tscores[0] / Math.max(1, turnNo)) * 10) / 10, 6, { unit: ' per turn' });
      else teamResults(ctx, teams, tscores);
    }
  },
};
