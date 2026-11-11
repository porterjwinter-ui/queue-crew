// Screens that many games share: pass-the-phone, carousels, results, teams.
import { h, view, btn, mount, avatar, nameTag, confetti, setBack, ic, stars } from './ui.js';
import { sfx, buzz } from './sound.js';
import { awardRanking, awardAll, addTickets } from './store.js';
import { shuffle } from './rng.js';

// "Hand the phone to Maya" screen.
export function passTo(ctx, name, onReady, { label, icon = 'hand-stop', note } = {}) {
  mount(view({
    color: ctx.color, back: ctx.quit, title: ctx.name,
    body: h('div', { class: 'pass' },
      h('div', { class: 'pass-anim' }, avatar(name, 'xl')),
      h('div', { class: 'pass-name' }, name),
      note ? h('div', { class: 'pass-note' }, note) : null),
    actions: [btn(label || `I'm ${name}`, onReady, { icon })],
  }));
}

// Horizontal snap carousel. Tap the centered card to pick it; tap a side card to scroll to it.
export function carousel(items, render, onPick, { start = 0, onChange } = {}) {
  let current = start;
  const cards = items.map((it, i) => h('button', {
    class: 'car-card',
    onclick: () => {
      if (i === current) { sfx.tap(); onPick(it, i); }
      else scrollToCard(i, true);
    },
  }, render(it, i)));
  const track = h('div', { class: 'car-track' }, h('div', { class: 'car-pad' }), cards, h('div', { class: 'car-pad' }));
  const dots = h('div', { class: 'car-dots' }, items.map(() => h('i')));
  const wrap = h('div', { class: 'car' }, track, dots);

  function scrollToCard(i, smooth) {
    const c = cards[i];
    if (!c) return;
    const left = c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2;
    track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }
  function update() {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bd = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < bd) { bd = d; best = i; }
    });
    if (best !== current) { current = best; sfx.tick(); buzz(5); onChange && onChange(best); }
    cards.forEach((c, i) => c.classList.toggle('on', i === current));
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === current));
  }
  // Check which card is centered while scrolling (that's what plays the click for each card
  // you pass), plus once more after scrolling stops in case animation frames are paused.
  let last = 0, timer = 0;
  track.addEventListener('scroll', () => {
    const now = performance.now();
    if (now - last > 30) { last = now; update(); }
    clearTimeout(timer); timer = setTimeout(update, 80);
  }, { passive: true });
  setTimeout(() => { scrollToCard(start, false); update(); }, 0);
  wrap.go = (d) => scrollToCard(Math.max(0, Math.min(items.length - 1, current + d)), true);
  return wrap;
}

// Final standings + tickets. scores = {name: points}.
// cantWin: a player who may not take first place (Majority Rules' duck holder).
export function results(ctx, scores, { lowWins = false, note, cantWin, crossed = new Set() } = {}) {
  const eff = Object.fromEntries(Object.entries(scores).map(([n, s]) => [n, lowWins ? -s : s]));
  if (cantWin && cantWin in eff) {
    const others = Object.entries(eff).filter(([n]) => n !== cantWin).map(([, v]) => v);
    if (others.length) eff[cantWin] = Math.min(eff[cantWin], Math.max(...others) - 0.5);
  }
  const sorted = Object.keys(scores).sort((a, b) => eff[b] - eff[a]);
  const awards = awardRanking(eff);
  const medal = (r) => (r < 3 ? h('span', { class: `rank r${r + 1}` }, String(r + 1)) : null);
  let rank = 0, last = null;
  const rows = sorted.map((name, i) => {
    if (eff[name] !== last) { rank = i; last = eff[name]; }
    return h('div', { class: `res-row ${rank === 0 ? 'win' : ''}` },
      h('span', { class: 'res-medal' }, medal(rank)),
      crossOut(nameTag(name), crossed.has(name)),
      h('span', { class: 'res-score' }, String(scores[name])),
      tix(awards[name]));
  });
  finish(ctx, h('div', { class: 'results' }, h('div', { class: 'res-trophy' }, ic('trophy')), note ? h('div', { class: 'res-note' }, note) : null, rows));
}

// Everyone-on-one-team results. score out of max; tickets by how well the group did.
export function coopResults(ctx, score, max, { unit = '' } = {}) {
  const frac = max ? score / max : 0;
  const nStars = frac >= 0.85 ? 3 : frac >= 0.6 ? 2 : frac >= 0.3 ? 1 : 0;
  const titles = ['Warm-up', 'Nice!', 'Awesome!', 'Legendary!'];
  awardAll(ctx.players, nStars);
  finish(ctx, h('div', { class: 'results' },
    stars(nStars, 'res-stars'),
    h('div', { class: 'res-big' }, `${score}`, h('small', null, ` / ${max}${unit}`)),
    h('div', { class: 'res-title' }, titles[nStars]),
    nStars ? h('div', { class: 'res-tix-all' }, tix(nStars), h('span', null, 'each')) : null,
    h('div', { class: 'res-avs' }, ctx.players.map((p) => avatar(p, 'm')))));
}

// Team results: winners get 3 tickets each, everyone else 1.
export function teamResults(ctx, teams, tscores) {
  const best = Math.max(...tscores);
  teams.forEach((t, i) => t.members.forEach((m) => addTickets(m, tscores[i] === best ? 3 : 1)));
  finish(ctx, h('div', { class: 'results' },
    h('div', { class: 'res-trophy' }, ic('trophy')),
    teams.map((t, i) => h('div', { class: `team-res ${tscores[i] === best ? 'win' : ''}`, style: { '--tc': t.color } },
      h('div', { class: 'team-res-score' }, String(tscores[i])),
      h('div', { class: 'team-res-avs' }, t.members.map((m) => avatar(m, 's'))),
      tix(tscores[i] === best ? 3 : 1)))));
}

function finish(ctx, body) {
  sfx.win();
  confetti();
  mount(view({
    color: ctx.color, back: ctx.exit, title: ctx.name, body,
    actions: [btn('Home', ctx.exit, { kind: 'ghost', icon: 'home' }), btn('Again', ctx.again, { icon: 'refresh' })],
  }));
}

// "+3" with a ticket icon.
export function tix(n) {
  return h('span', { class: 'res-tix' }, n ? [`+${n}`, ic('ticket')] : '');
}

// Split players into two teams, alternating.
export function makeTeams(players) {
  const order = shuffle(players);
  const teams = [
    { color: '#ff5a5f', members: [] },
    { color: '#3867d6', members: [] },
  ];
  order.forEach((p, i) => teams[i % 2].members.push(p));
  return teams;
}

export function teamBadge(t, score) {
  return h('div', { class: 'team-badge', style: { '--tc': t.color } },
    h('span', { class: 'team-avs' }, t.members.map((m) => avatar(m, 'xs'))),
    score != null ? h('b', null, String(score)) : null);
}

// Small row of avatars with points.
// crossed: players who are out get a big red X across their face.
export function scoreStrip(scores, extra = {}, crossed = new Set()) {
  return h('div', { class: 'score-strip' }, Object.entries(scores).map(([n, s]) =>
    h('span', { class: `ss-item ${crossed.has(n) ? 'is-out' : ''}` },
      crossOut(avatar(n, 's', extra[n] ? h('i', { class: 'ss-badge' }, ic(extra[n])) : null), crossed.has(n)),
      h('b', null, String(s)))));
}

// Puts a red X across an avatar (or the avatar inside a name tag).
export function crossOut(el, yes = true) {
  if (yes) (el.classList.contains('av') ? el : el.querySelector('.av')).classList.add('out');
  return el;
}

export { setBack };
