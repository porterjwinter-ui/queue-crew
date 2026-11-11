// Forehead: phone on your head, friends give clues, nod down = got it, tilt up = skip.
import { h, view, btn, mount, fitText, pauseMenu, keepAwake, onCleanup, setBack, sleep, closeOverlay, ic, gameFullscreen } from '../core/ui.js';
import { decks, deckStream } from '../core/db.js';
import { devOn } from '../core/store.js';
import { newDeck } from '../core/ai.js';
import { requestMotion, watchUp, tiltDetector, screenFix, isUpright } from '../core/tilt.js';
import { timer, onHidden } from '../core/timer.js';
import { sfx, buzz } from '../core/sound.js';
import { passTo, results, carousel } from '../core/flow.js';
import { art } from '../core/tutorial.js';

const ROUND = 60;

const tut = {
  id: 'forehead',
  svg: `
    ${art.person('f1', 52, 112, '#3867d6', { scale: 0.85 })}
    ${art.person('f2', 268, 112, '#20bf6b', { scale: 0.85 })}
    <g transform="translate(160 84) scale(1.3)">
      <g class="a g">
        <rect x="-22" y="26" width="44" height="52" rx="20" fill="#ff5a5f"/>
        <g class="a gh">
          <circle r="22" fill="#ffd9b3"/>
          <circle cx="-8" cy="1" r="3" fill="#1d1530"/><circle cx="8" cy="1" r="3" fill="#1d1530"/>
          <path d="M-6 10 q6 5 12 0" fill="none" stroke="#1d1530" stroke-width="2.6" stroke-linecap="round"/>
          <g class="a ph">
            <rect x="-25" y="-33" width="50" height="26" rx="5" fill="#1d1530"/>
            <rect class="ph-scr" x="-22.5" y="-30.5" width="45" height="21" rx="3.5" fill="#fff"/>
            <text x="0" y="-15.5" text-anchor="middle" font-size="11" font-weight="900" fill="#1d1530">CAT</text>
          </g>
        </g>
      </g>
    </g>
    ${art.bubble('b1', 62, 52, 'Meow!', { w: 72 })}
    ${art.bubble('b2', 258, 52, 'Purrs!', { w: 72 })}
    ${art.check('ok', 160, 26, 18)}
    ${art.icon('skip', 160, 26, 'arrow-forward-up', { size: 22, color: '#fff', bg: '#ff9f1c' })}
    ${art.icon('arrDown', 222, 88, 'arrow-down', { size: 30, color: '#20bf6b' })}
    ${art.icon('arrUp', 222, 88, 'arrow-up', { size: 30, color: '#ff9f1c' })}
    ${art.text('plus', 196, 22, '+1', { fs: 20, fill: '#20bf6b' })}
    <g transform="translate(290 30)"><g class="a clk">
      <circle r="18" fill="#fff" stroke="#1d1530" stroke-width="3"/>
      <circle class="clk-arc" r="12" fill="none" stroke="#ff5a5f" stroke-width="6" stroke-dasharray="75.4" stroke-dashoffset="0" transform="rotate(-90)"/>
    </g></g>`,
  css: `
    .tut-forehead .gh { transform-origin: 50% 100%; }
    .tut-forehead[data-s="0"] .ph { animation: fhRise 1.3s .25s cubic-bezier(.3,1.25,.5,1) both; }
    @keyframes fhRise { from { transform: translate(0px, 70px) rotate(90deg) scale(.7); } to { transform: none; } }
    .tut-forehead .b1, .tut-forehead .b2, .tut-forehead .ok, .tut-forehead .skip, .tut-forehead .plus,
    .tut-forehead .arrDown, .tut-forehead .arrUp { transform: scale(0); }
    .tut-forehead[data-s="1"] .b1 { animation: tPop .45s .2s both cubic-bezier(.3,1.6,.5,1); }
    .tut-forehead[data-s="1"] .b2 { animation: tPop .45s 1.1s both cubic-bezier(.3,1.6,.5,1); }
    .tut-forehead[data-s="2"] .gh { animation: fhNod 1.6s .2s ease-in-out both; }
    @keyframes fhNod { 0%,100% { transform: none; } 30%,70% { transform: translateY(7px) scaleY(.82); } }
    .tut-forehead[data-s="2"] .ph-scr { fill: #20bf6b; transition-delay: .5s; }
    .tut-forehead[data-s="2"] .ok { animation: tPop .4s .7s both cubic-bezier(.3,1.6,.5,1); }
    .tut-forehead[data-s="2"] .plus { animation: tFloat 1.1s .8s both; }
    .tut-forehead[data-s="2"] .arrDown { animation: tPop .3s .1s both; }
    .tut-forehead[data-s="3"] .gh { animation: fhBack 1.6s .2s ease-in-out both; }
    @keyframes fhBack { 0%,100% { transform: none; } 30%,70% { transform: translateY(-7px) scaleY(.82); } }
    .tut-forehead[data-s="3"] .ph-scr { fill: #ff9f1c; transition-delay: .5s; }
    .tut-forehead[data-s="3"] .skip { animation: tPop .4s .7s both cubic-bezier(.3,1.6,.5,1); }
    .tut-forehead[data-s="3"] .arrUp { animation: tPop .3s .1s both; }
    .tut-forehead .clk { transform: scale(.85); }
    .tut-forehead[data-s="4"] .clk { transform: translate(-24px, 32px) scale(1.8); }
    .tut-forehead[data-s="4"] .clk-arc { animation: fhClock 2s .3s linear both; }
    @keyframes fhClock { to { stroke-dashoffset: 75.4; } }
  `,
  steps: [
    { c: 'Phone on your head', t: 2600 },
    { c: 'Friends give clues', t: 2600 },
    { c: 'Nod down when you get it', t: 2600 },
    { c: 'Tilt up to skip', t: 2600 },
    { c: 'You have 60 seconds', t: 2400 },
  ],
};

export default {
  id: 'forehead', name: 'Forehead', icon: 'device-mobile-rotated', color: '#ff5a5f', min: 2, tut,
  start(ctx) {
    const scores = Object.fromEntries(ctx.players.map((p) => [p, 0]));
    let turn = 0;
    let deck = null;
    let words = null;

    pickDeck();

    function pickDeck() {
      // Developer mode: the first card invents a brand-new deck every time.
      const list = (devOn() ? [{ id: 'new', name: 'New deck', icon: 'sparkles', isNew: true }] : []).concat(decks());
      mount(view({
        color: ctx.color, back: ctx.exit, title: 'Pick a deck',
        body: carousel(list, (d) => h('div', { class: `dcard ${d.isNew ? 'new' : ''}` },
          h('div', { class: 'deck-ico' }, ic(d.icon)),
          h('div', { class: 'deck-name' }, d.name),
          d.isNew ? h('div', { class: 'deck-hint' }, 'Made by AI') : null,
          d.ai ? h('span', { class: 'deck-ai' }, ic('sparkles')) : null,
          d.act ? h('div', { class: 'deck-hint' }, ic(d.id === 'sounds' ? 'volume' : 'run'), d.id === 'sounds' ? 'sound it' : 'act it') : null,
        ), (d) => (d.isNew ? makeDeck() : useDeck(d)), { start: 0 }),
      }));
    }

    function useDeck(d) { deck = d; words = deckStream(d.id, ctx.level); nextTurn(); }

    async function makeDeck() {
      const msg = h('div', { class: 'fh-place-sub' }, 'Inventing a new deck');
      mount(view({
        color: ctx.color, back: pickDeck, title: 'New deck',
        body: h('div', { class: 'fh-place' }, h('div', { class: 'huge-ico spin' }, ic('sparkles')), msg),
      }));
      try {
        const made = await newDeck((t) => { msg.textContent = t.replace(/…$/, ''); });
        if (!msg.isConnected) return; // they backed out while waiting
        useDeck({ id: made.id, name: made.name, icon: made.icon, ai: true });
      } catch (e) {
        if (!msg.isConnected) return;
        mount(view({
          color: ctx.color, back: pickDeck, title: 'New deck',
          body: h('div', { class: 'fh-place' }, h('div', { class: 'huge-ico' }, ic('cloud-off')), h('div', { class: 'fh-place-sub' }, e.message || 'Something went wrong.')),
          actions: [btn('Back', pickDeck, { kind: 'ghost', icon: 'arrow-left' }), btn('Try again', makeDeck, { icon: 'refresh' })],
        }));
      }
    }

    function nextTurn() {
      if (turn >= ctx.players.length) return results(ctx, scores);
      const name = ctx.players[turn];
      passTo(ctx, name, () => {
        // Both must be called directly inside the tap: iPhone's motion prompt, and full screen on Android.
        const motion = requestMotion();
        gameFullscreen(true);
        motion.then((ok) => placeOnHead(name, ok));
      }, { label: 'Ready', icon: 'device-mobile-rotated' });
    }

    // "Put it on your forehead" — starts by itself once the phone is upright and still.
    function placeOnHead(name, motionOk) {
      let up = null;
      let gotSensor = false;
      let steadySince = 0;
      let started = false;

      const sub = h('div', { class: 'fh-place-sub' }, motionOk ? 'Hold it sideways' : 'Tap Go');
      const hint = h('div', { class: 'fh-place' },
        h('div', { class: 'fh-place-anim' }, h('span', { class: 'fh-head' }, ic('mood-smile')), h('span', { class: 'fh-phone' }, ic('device-mobile-rotated'))),
        h('div', { class: 'fh-place-text' }, 'On your forehead!'),
        sub);
      mount(view({
        color: ctx.color, back: ctx.quit, title: name, body: hint,
        actions: [btn('Go', () => begin(), { icon: 'player-play' })],
      }));
      // Sideways + standing up for a moment = it's on someone's head. Start automatically.
      // Listen even if the permission ask failed: some browsers deliver motion without asking.
      onCleanup(watchUp((u) => {
        up = u;
        if (!gotSensor) { gotSensor = true; sub.textContent = 'Hold it sideways'; }
        if (started) return;
        if (isUpright(u) && Math.abs(u.x) > 0.75) {
          if (!steadySince) steadySince = performance.now();
          if (performance.now() - steadySince > 700) begin();
        } else steadySince = 0;
      }));
      setTimeout(() => { if (!gotSensor && sub.isConnected) sub.textContent = 'Tap Go'; }, 1500);

      function begin() {
        if (started) return;
        started = true;
        play(name, () => up, gotSensor);
      }
    }

    function play(name, getUp, sensor) {
      const record = [];
      let busy = false;
      let current = null;
      let rot = 0;
      let paused = false;

      const timeEl = h('div', { class: 'fh-time' }, String(ROUND));
      const wordEl = h('div', { class: 'fh-word' });
      const wordBox = h('div', { class: 'fh-wordbox' }, wordEl);
      const hintEl = h('div', { class: 'fh-hint' }, deck.act ? [ic(deck.id === 'sounds' ? 'volume' : 'run'), deck.id === 'sounds' ? 'SOUND IT' : 'ACT IT'] : null);
      const scoreEl = h('div', { class: 'fh-score' }, '0');
      const fb = h('div', { class: 'fh-fb' });
      const pauseBtn = h('button', { class: 'fh-pause', 'aria-label': 'Pause', onclick: (e) => { e.stopPropagation(); doPause(); } }, ic('player-pause'));
      const left = h('div', { class: 'fh-zone left', onclick: () => answer(false) }, h('span', null, ic('arrow-forward-up')));
      const right = h('div', { class: 'fh-zone right', onclick: () => answer(true) }, h('span', null, ic('check')));
      const stage = h('div', { class: 'fh-stage' }, left, right, h('div', { class: 'fh-top' }, timeEl, hintEl), wordBox, scoreEl, fb, pauseBtn);
      // .fh-safe marks the part of the screen not covered by the notch or the browser's bars.
      const safe = h('div', { class: 'fh-safe' });
      const scr = h('section', { class: 'fh-play' }, safe, stage);
      scr.style.setProperty('--c', ctx.color);
      setBack(() => doPause());
      mount(scr);
      keepAwake.want = true; keepAwake(true);
      onCleanup(() => { keepAwake.want = false; keepAwake(false); gameFullscreen(false); });

      // Fit the game inside the visible, unobstructed area (safe area AND the visual viewport).
      const layout = () => {
        const r = safe.getBoundingClientRect();
        let L = r.left, T = r.top, R = r.right, B = r.bottom;
        const vv = window.visualViewport;
        if (vv) {
          L = Math.max(L, vv.offsetLeft); T = Math.max(T, vv.offsetTop);
          R = Math.min(R, vv.offsetLeft + vv.width); B = Math.min(B, vv.offsetTop + vv.height);
        }
        const W = Math.max(100, R - L), H = Math.max(100, B - T);
        stage.style.left = `${L + W / 2}px`;
        stage.style.top = `${T + H / 2}px`;
        const side = rot === 90 || rot === -90;
        stage.style.width = (side ? H : W) + 'px';
        stage.style.height = (side ? W : H) + 'px';
        stage.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
        fitWord();
      };
      const fitWord = () => fitText(wordEl, Math.min(stage.offsetHeight * 0.34, 150), 22);
      window.addEventListener('resize', layout);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
      onCleanup(() => {
        window.removeEventListener('resize', layout);
        if (window.visualViewport) window.visualViewport.removeEventListener('resize', layout);
      });

      const u0 = getUp();
      if (sensor && u0) { const r = screenFix(u0); if (r != null) rot = r; }
      layout();

      // Countdown, then go.
      const det = tiltDetector({ onDown: () => answer(true), onUp: () => answer(false) });
      let lastRot = rot, rotSince = 0;
      let latest = u0;
      const stopSensor = sensor ? watchUp((u) => {
        latest = u;
        if (!det.calibrated) {
          // During the countdown, keep the numbers facing the watchers.
          if (isUpright(u)) { const r = screenFix(u); if (r != null && r !== rot) { rot = r; layout(); } }
          return;
        }
        const ang = det.feed(u);
        // Follow the grip if the phone gets flipped around, but only while held level.
        if (Math.abs(ang) < 12) {
          const r = screenFix(u);
          if (r != null && r !== rot) {
            if (r !== lastRot) { lastRot = r; rotSince = performance.now(); }
            else if (performance.now() - rotSince > 700) { rot = r; layout(); }
          }
        }
      }) : () => {};
      onCleanup(stopSensor);

      let t = null;
      (async () => {
        stage.classList.add('counting');
        for (const n of [3, 2, 1]) {
          if (!scr.isConnected) return;
          wordEl.textContent = String(n); fitWord(); sfx.count(); buzz(30);
          await sleep(800);
        }
        if (!scr.isConnected) return;
        stage.classList.remove('counting');
        sfx.go();
        const u = latest || getUp();
        if (sensor && u) det.calibrate(u);
        nextWord();
        t = timer(ROUND, {
          onTick: (leftS) => {
            timeEl.textContent = String(Math.ceil(leftS));
            stage.classList.toggle('low', leftS <= 10);
          },
          onEnd: () => end(),
        });
        onHidden(() => doPause());
      })();

      function nextWord() {
        current = words.next().w;
        wordEl.textContent = current;
        fitWord();
      }

      function answer(ok) {
        if (busy || paused || !t || t.done || !current) return;
        busy = true;
        record.push({ w: current, ok });
        if (ok) { scores[name] += 1; scoreEl.textContent = String(scores[name]); sfx.good(); buzz(60); }
        else { sfx.pass(); buzz([20, 40, 20]); }
        stage.classList.add(ok ? 'yes' : 'no');
        scr.classList.add(ok ? 'yes' : 'no'); // the whole screen, edges included
        fb.replaceChildren(ic(ok ? 'check' : 'arrow-forward-up'));
        current = null;
        setTimeout(() => {
          stage.classList.remove('yes', 'no');
          scr.classList.remove('yes', 'no');
          fb.replaceChildren();
          busy = false;
          if (t && !t.done) nextWord();
        }, 650);
      }

      function doPause() {
        if (!t || t.done || paused) return;
        paused = true;
        t.pause();
        pauseMenu({
          color: ctx.color,
          onResume: () => { paused = false; t.resume(); setBack(() => doPause()); },
          onQuit: () => ctx.exit(),
        });
      }

      function end() {
        closeOverlay();
        sfx.buzzer(); buzz([100, 60, 200]);
        stage.classList.add('over');
        scr.classList.add('over');
        wordEl.textContent = 'Time!';
        fitWord();
        setTimeout(() => recap(name, record), 1300);
      }
    }

    function recap(name, record) {
      turn += 1;
      const last = turn >= ctx.players.length;
      mount(view({
        color: ctx.color, back: ctx.quit, title: name,
        body: h('div', { class: 'recap' },
          h('div', { class: 'recap-score' }, String(scores[name]), ic('check')),
          h('div', { class: 'recap-list' }, record.length
            ? record.map((r) => h('span', { class: `chip ${r.ok ? 'ok' : 'skip'}` }, ic(r.ok ? 'check' : 'arrow-forward-up'), r.w))
            : null)),
        actions: [btn(last ? 'Results' : 'Next', nextTurn, { icon: last ? 'flag' : 'arrow-right' })],
      }));
    }
  },
};
