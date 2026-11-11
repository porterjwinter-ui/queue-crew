// Don't Say It: get your team to say the word without saying any of the banned words.
import { h, view, btn, mount, fitText, pauseMenu, setBack, keepAwake, onCleanup, closeOverlay, flash, pop, ic } from '../core/ui.js';
import { tabooStream } from '../core/db.js';
import { timer, ring, onHidden } from '../core/timer.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, makeTeams, teamBadge, teamResults, coopResults } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const ROUND = 60;

const card = (cls, word, banned) => art.at(160, 96, `<g class="a ${cls}">
  <rect x="-62" y="-70" width="124" height="140" rx="14" fill="#fff" stroke="#1d1530" stroke-width="3"/>
  <rect x="-62" y="-70" width="124" height="38" rx="14" fill="#e84393"/><rect x="-62" y="-44" width="124" height="12" fill="#e84393"/>
  <text x="0" y="-45" text-anchor="middle" font-size="17" font-weight="900" fill="#fff">${word}</text>
  ${banned.map((b, i) => `<g class="a ban${i}"><text x="0" y="${-12 + i * 22}" text-anchor="middle" font-size="14" font-weight="800" fill="#1d1530">${b}</text>
  <path class="a strike${i}" d="M-38 ${-16 + i * 22} h76" stroke="#ff3b3b" stroke-width="4" stroke-linecap="round"/></g>`).join('')}
</g>`);

const tut = {
  id: 'dontsayit',
  svg: `
    ${art.person('giver', 46, 120, '#e84393', { scale: 0.8 })}
    ${art.person('guess', 274, 120, '#3867d6', { scale: 0.8 })}
    ${card('crd', 'PIZZA', ['cheese', 'slice', 'crust', 'pepperoni'])}
    ${art.bubble('clue', 70, 40, 'Round food…', { w: 96, fs: 12, tail: 'down' })}
    ${art.bubble('ans', 262, 40, 'Pizza!', { w: 70, fs: 14 })}
    ${art.check('ok', 222, 140, 16)}
    ${art.bubble('slip', 70, 40, 'Cheese-', { w: 84, fs: 13, fill: '#ffd1d1' })}
    ${art.icon('bleep', 160, 110, 'volume-off', { size: 48, color: '#fff', bg: '#ff3b3b' })}
    ${art.text('pts', 160, 190, '+1', { fs: 22, fill: '#20bf6b' })}
  `,
  css: `
    .tut-dontsayit .clue, .tut-dontsayit .ans, .tut-dontsayit .ok, .tut-dontsayit .slip, .tut-dontsayit .bleep, .tut-dontsayit .pts,
    .tut-dontsayit [class*="strike"] { transform: scale(0); }
    .tut-dontsayit[data-s="0"] .crd { animation: tPop .5s .1s both cubic-bezier(.3,1.5,.5,1); }
    .tut-dontsayit[data-s="1"] .ban0, .tut-dontsayit[data-s="1"] .ban1, .tut-dontsayit[data-s="1"] .ban2, .tut-dontsayit[data-s="1"] .ban3 { animation: tShake .3s 2; }
    ${[0, 1, 2, 3].map((i) => `.tut-dontsayit[data-s="1"] .strike${i} { animation: tWipe .35s ${0.3 + i * 0.3}s both; }`).join('\n')}
    @keyframes tWipe { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .tut-dontsayit[data-s="2"] .clue { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-dontsayit[data-s="2"] .ans { animation: tPop .35s 1.2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-dontsayit[data-s="2"] .ok { animation: tPop .35s 1.6s both cubic-bezier(.3,1.6,.5,1); }
    .tut-dontsayit[data-s="2"] .pts { animation: tFloat 1.2s 1.6s both; }
    .tut-dontsayit[data-s="3"] .slip { animation: tPop .35s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-dontsayit[data-s="3"] .bleep { animation: tPop .4s .9s both cubic-bezier(.3,1.6,.5,1), tShake .3s 1.3s 3; }
    .tut-dontsayit[data-s="3"] .crd { opacity: .35; transition-delay: .8s; }
    .tut-dontsayit[data-s="3"] .giver { animation: tShake .3s 1s 2; }
  `,
  steps: [
    { c: 'Get your team to say it', t: 2200 },
    { c: 'Don\'t say any of these words', t: 2600 },
    { c: 'They guess it: 1 point', t: 2800 },
    { c: 'Say one by mistake? BLEEP!', t: 2800 },
  ],
};

export default {
  id: 'dontsayit', name: "Don't Say It", icon: 'message-circle-off', color: '#e84393', min: 2, tut,
  start(ctx) {
    const P = ctx.players;
    const coop = P.length < 4;
    const teams = coop ? [{ color: ctx.color, members: P.slice() }] : makeTeams(P);
    const tscores = teams.map(() => 0);
    const cards = tabooStream(ctx.level);
    // Turn order alternates teams; everyone gives clues once.
    const order = [];
    const maxLen = Math.max(...teams.map((t) => t.members.length));
    for (let k = 0; k < maxLen; k++) teams.forEach((t, ti) => { if (t.members[k]) order.push({ name: t.members[k], team: ti }); });
    let turn = 0;

    if (!coop) showTeams(); else nextTurn();

    function showTeams() {
      mount(view({
        color: ctx.color, back: ctx.quit, title: 'Teams',
        body: h('div', { class: 'teams' }, teams.map((t) => teamBadge(t)), h('div', { class: 'vs' }, 'VS')),
        actions: [btn('Start', nextTurn, { icon: 'player-play' })],
      }));
    }

    function nextTurn() {
      if (turn >= order.length) {
        return coop ? coopResults(ctx, tscores[0], order.length * 5) : teamResults(ctx, teams, tscores);
      }
      const { name, team } = order[turn];
      passTo(ctx, name, () => play(name, team), { label: 'Ready', icon: 'message-circle-off', note: coop ? null : teamBadge(teams[team]) });
    }

    function play(name, team) {
      const other = coop ? 0 : 1 - team;
      let paused = false;
      let got = 0, bleeps = 0;
      let cur = null;
      const word = h('div', { class: 'ds-word' });
      const wordBox = h('div', { class: 'ds-wordbox' }, word);
      const banned = h('div', { class: 'ds-banned' });
      const cardEl = h('div', { class: 'ds-card' }, wordBox, banned);
      const r = ring(ROUND, () => doPause());
      const scoreEl = h('div', { class: 'ds-score' }, '0');

      const show = () => {
        cur = cards.next();
        word.textContent = cur.word;
        banned.replaceChildren(...cur.banned.map((b) => h('div', { class: 'ds-ban' }, ic('ban'), b)));
        cardEl.classList.remove('in'); void cardEl.offsetWidth; cardEl.classList.add('in');
        requestAnimationFrame(() => fitText(word, 54, 20));
      };

      mount(view({
        color: ctx.color, cls: 'ds-play',
        body: h('div', { class: 'ds-stage' }, h('div', { class: 'ds-top' }, r.el, scoreEl), cardEl),
        actions: [
          btn('Skip', () => { if (!paused) { sfx.pass(); show(); } }, { kind: 'ghost', icon: 'arrow-forward-up', silent: true }),
          btn('Bleep', () => {
            if (paused) return;
            bleeps += 1; sfx.bleep(); buzz([80, 40, 80]); flash('#ff3b3b');
            if (coop) tscores[0] = Math.max(0, tscores[0] - 1); else tscores[other] += 1;
            pop(coop ? '−1' : '+1', { y: 30, color: coop ? '#ff3b3b' : teams[other].color });
            show();
          }, { kind: 'danger', icon: 'volume-off', silent: true }),
          btn('Got it', () => {
            if (paused) return;
            got += 1; tscores[team] += 1; scoreEl.textContent = String(got);
            sfx.good(); buzz(40); flash('#20bf6b'); show();
          }, { icon: 'check', silent: true }),
        ],
      }));
      setBack(() => doPause());
      keepAwake.want = true; keepAwake(true);
      onCleanup(() => { keepAwake.want = false; keepAwake(false); });
      show();

      let lastSec = ROUND;
      const t = timer(ROUND, {
        onTick: (left, frac) => {
          r.set(left, frac);
          const sec = Math.ceil(left);
          if (sec !== lastSec) { lastSec = sec; if (sec <= 5) sfx.tick(true); }
        },
        onEnd: end,
      });
      onHidden(() => doPause());

      function doPause() {
        if (paused || t.done) return;
        paused = true; t.pause();
        pauseMenu({ color: ctx.color, onResume: () => { paused = false; t.resume(); setBack(() => doPause()); }, onQuit: ctx.exit });
      }

      function end() {
        closeOverlay();
        sfx.buzzer(); buzz([100, 60, 200]);
        turn += 1;
        mount(view({
          color: ctx.color, back: ctx.quit, title: name,
          body: h('div', { class: 'turn-end' },
            h('div', { class: 'te-row' }, h('span', { class: 'te-big ok' }, ic('check'), String(got)), h('span', { class: 'te-big bad' }, ic('volume-off'), String(bleeps))),
            coop ? h('div', { class: 'res-big' }, String(tscores[0])) : h('div', { class: 'teams' }, teams.map((tm, i) => teamBadge(tm, tscores[i])))),
          actions: [btn(turn >= order.length ? 'Results' : 'Next', nextTurn, { icon: turn >= order.length ? 'flag' : 'arrow-right' })],
        }));
      }
    }
  },
};
