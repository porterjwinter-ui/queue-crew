// Queue Crew — app shell: home carousel, how-to-play intros, players, scoreboard.
import { h, view, btn, mount, initUI, avatar, confirmBox, themeVars, enable, onCleanup } from './core/ui.js';
import { loadDB } from './core/db.js';
import { unlockAudio, sfx, soundOn, setSound } from './core/sound.js';
import { store, getPlayers, setPlayers, getLevel, setLevel, getTickets, resetTickets } from './core/store.js';
import { tutorial } from './core/tutorial.js';
import { carousel } from './core/flow.js';

import forehead from './games/forehead.js';
import imposter from './games/imposter.js';
import hotpotato from './games/hotpotato.js';
import dontsayit from './games/dontsayit.js';
import majority from './games/majority.js';
import jinx from './games/jinx.js';
import spectrum from './games/spectrum.js';
import fishbowl from './games/fishbowl.js';
import doodle from './games/doodle.js';
import bingo from './games/bingo.js';
import wait, { waitRunning } from './games/wait.js';

const GAMES = [forehead, imposter, hotpotato, dontsayit, majority, jinx, spectrum, fishbowl, doodle, bingo, wait];
const NO_LEVEL = new Set(['majority', 'spectrum', 'wait']);
const LEVELS = [null, { stars: '⭐', name: 'Easy' }, { stars: '⭐⭐', name: 'Medium' }, { stars: '⭐⭐⭐', name: 'Hard' }];
const APP_COLOR = '#6c5ce7';

// ---------- Home ----------
function home() {
  const start = Math.max(0, GAMES.findIndex((g) => g.id === store.get('lastGame', GAMES[0].id)));
  let current = start;
  const sound = h('button', { class: 'iconbtn', 'aria-label': 'Sound', onclick: () => { setSound(!soundOn()); sound.textContent = soundOn() ? '🔊' : '🔇'; sfx.tap(); } }, soundOn() ? '🔊' : '🔇');
  const trophy = h('button', { class: 'iconbtn', 'aria-label': 'Tickets', onclick: () => { sfx.tap(); scores(); } }, '🎟️');
  const running = waitRunning();
  const waitChip = running ? h('button', { class: 'wait-chip', onclick: () => intro(wait, true) }, '⏱️ ', h('span', { class: 'wait-time' }, '')) : null;
  if (running) {
    const tick = () => {
      const s = Math.floor((Date.now() - running.start) / 1000);
      waitChip.querySelector('.wait-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    const id = setInterval(tick, 1000);
    onCleanup(() => clearInterval(id));
  }
  const car = carousel(GAMES, (g) => {
    const card = h('div', { class: 'gcard' },
      h('div', { class: 'gcard-tut' }, tutorial(g.tut, { captions: false })),
      h('div', { class: 'gcard-name' }, h('span', { class: 'gcard-emoji' }, g.emoji), g.name));
    Object.entries(themeVars(g.color)).forEach(([k, v]) => card.style.setProperty(k, v));
    return card;
  }, (g) => intro(g), { start, onChange: (i) => { current = i; playBtn.style.setProperty('--c', GAMES[i].color); playBtn.style.setProperty('--c2', themeVars(GAMES[i].color)['--c2']); playBtn.style.setProperty('--on', themeVars(GAMES[i].color)['--on']); } });
  const playBtn = btn('Play', () => intro(GAMES[current]), { emoji: '▶️' });
  const v = view({
    color: APP_COLOR, left: sound, right: trophy,
    title: h('span', { class: 'logo' }, h('span', { class: 'logo-q' }, 'Q'), 'ueue Crew'),
    body: h('div', { class: 'home' }, waitChip, car),
    actions: [playBtn],
    cls: 'home-view',
  });
  mount(v);
  const t = themeVars(GAMES[start].color);
  Object.entries(t).forEach(([k, val]) => playBtn.style.setProperty(k, val));
}

// ---------- How to play ----------
function intro(game, skipToGame) {
  store.set('lastGame', game.id);
  if (skipToGame) return launch(game, null);
  const lvlBtn = NO_LEVEL.has(game.id) ? null : btn('', () => {
    const l = (getLevel() % 3) + 1;
    setLevel(l);
    lvlBtn.querySelector('.btn-emoji').textContent = LEVELS[l].stars;
    lvlBtn.querySelector('.btn-label').textContent = levelLabel(game, l);
  }, { kind: 'ghost', emoji: LEVELS[getLevel()].stars });
  if (lvlBtn) lvlBtn.append(h('span', { class: 'btn-label' }, levelLabel(game, getLevel())));
  mount(view({
    color: game.color, back: home, title: game.name,
    body: h('div', { class: 'intro' }, tutorial(game.tut)),
    actions: [lvlBtn, btn('Play', () => next(), { emoji: '▶️' })],
  }));
  function next() {
    if (game.min > 0) players(game);
    else modeOrLaunch(game);
  }
}

function levelLabel(game, l) {
  if (game.id === 'bingo') return ['', '3×3', '4×4', '5×5'][l];
  return LEVELS[l].name;
}

// ---------- Who's playing ----------
function players(game) {
  let list = getPlayers();
  const chips = h('div', { class: 'pchips' });
  const input = h('input', { class: 'big-input', type: 'text', maxlength: 14, placeholder: 'Name', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done' });
  const go = btn('Go', () => { setPlayers(list); modeOrLaunch(game); }, { emoji: '▶️' });
  const need = h('div', { class: 'need' });
  const render = () => {
    chips.replaceChildren(...list.map((n) => h('button', {
      class: 'pchip',
      onclick: () => { list = list.filter((x) => x !== n); sfx.tap(); render(); },
    }, avatar(n, 's'), h('span', null, n), h('span', { class: 'x' }, '✕'))));
    if (!list.length) chips.append(h('div', { class: 'pchips-empty' }, '👥'));
    const ok = list.length >= game.min;
    enable(go, ok);
    need.textContent = ok ? '' : `${game.min}+ 👥`;
  };
  const add = () => {
    const n = input.value.trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (!list.some((x) => x.toLowerCase() === n.toLowerCase())) list.push(n);
    input.value = '';
    sfx.pop();
    render();
    input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  render();
  mount(view({
    color: game.color, back: () => intro(game), title: 'Who’s playing?',
    body: h('div', { class: 'players' }, chips, h('div', { class: 'padd' }, input, btn('', add, { emoji: '➕', cls: 'addbtn', kind: 'ghost' })), need),
    actions: [go],
  }));
  if (!list.length) setTimeout(() => input.focus(), 300);
}

// ---------- Mode pick (two big picture buttons) ----------
function modeOrLaunch(game) {
  if (!game.modes) return launch(game, null);
  mount(view({
    color: game.color, back: () => intro(game), title: game.name,
    body: h('div', { class: 'modes' }, game.modes.map((m) => h('button', {
      class: 'mode',
      onclick: () => { sfx.tap(); launch(game, m.id); },
    }, h('div', { class: 'mode-art' }, m.art.map((a) => h('span', null, a))), h('div', { class: 'mode-name' }, m.emoji, ' ', m.label)))),
  }));
}

function launch(game, mode) {
  const ctx = {
    players: game.min > 0 ? getPlayers().slice() : [],
    level: getLevel(),
    color: game.color,
    name: game.name,
    mode,
    exit: home,
    quit: () => confirmBox({ color: game.color, emoji: '🏠', text: 'Quit?', yes: 'Quit', no: 'Stay', onYes: home }),
    again: () => launch(game, mode),
  };
  try {
    game.start(ctx);
  } catch (e) {
    console.error(e);
    mount(view({ color: game.color, back: home, title: game.name, body: h('div', { class: 'huge-emoji' }, '😵'), actions: [btn('Home', home, { emoji: '🏠' })] }));
  }
}

// ---------- Tickets (all-day scoreboard) ----------
function scores() {
  const t = getTickets();
  const rows = Object.entries(t.scores).sort((a, b) => b[1] - a[1]);
  mount(view({
    color: '#ffb400', back: home, title: 'Tickets',
    body: h('div', { class: 'results' },
      h('div', { class: 'res-trophy' }, rows.length ? '👑' : '🎟️'),
      rows.length
        ? rows.map(([n, s], i) => h('div', { class: `res-row ${i === 0 ? 'win' : ''}` },
          h('span', { class: 'res-medal' }, i === 0 ? '👑' : ''), avatar(n, 's'), h('span', { class: 'res-name' }, n), h('span', { class: 'res-score' }, `${s} 🎟️`)))
        : h('div', { class: 'res-note' }, 'Play games to earn tickets')),
    actions: rows.length ? [btn('Reset', () => confirmBox({ color: '#ffb400', emoji: '🗑️', text: 'Reset tickets?', onYes: () => { resetTickets(); scores(); } }), { kind: 'ghost', emoji: '🗑️' })] : [],
  }));
}

// ---------- Boot ----------
async function boot() {
  initUI(document.getElementById('app'));
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { passive: true }));
  try {
    await loadDB();
  } catch (e) {
    console.error(e);
    mount(view({ color: APP_COLOR, title: 'Queue Crew', body: h('div', { class: 'huge-emoji' }, '📶❌'), actions: [btn('Retry', () => location.reload(), { emoji: '🔄' })] }));
    return;
  }
  home();
  document.getElementById('splash')?.remove();
  // Test hook: jump straight to a game's intro (used by tools/test-harness.js).
  window.__qc = { intro: (id) => intro(GAMES.find((g) => g.id === id)), home };
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const firstVisit = !navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // First visit: hand the offline worker every file we just loaded so the app works with no signal.
        if (!firstVisit || !reg.active) return;
        const files = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/icon.svg']
          .concat(performance.getEntriesByType('resource').map((r) => r.name));
        reg.active.postMessage({ cache: files });
      })
      .catch(() => {});
  }
}

boot();
