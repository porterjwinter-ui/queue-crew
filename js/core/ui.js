// Tiny DOM + screen helpers shared by every game.
import { sfx, buzz } from './sound.js';
import { ICONS } from './icons.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

let root;
let cleanups = [];
let backHandler = null;

export function initUI(el) {
  root = el;
  // Trap the hardware/gesture back button so it walks back through screens.
  history.replaceState({ qc: 0 }, '');
  history.pushState({ qc: 1 }, '');
  window.addEventListener('popstate', () => {
    if (backHandler) {
      history.pushState({ qc: 1 }, '');
      backHandler();
    }
  });
}

// Replace the whole screen. Runs cleanups registered by the previous screen.
export function mount(el) {
  const old = cleanups;
  cleanups = [];
  old.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  closeOverlay();
  root.replaceChildren(el);
  window.scrollTo(0, 0);
}

export function onCleanup(fn) { cleanups.push(fn); }

export function setBack(fn) { backHandler = fn; }

// Darken/lighten a hex color.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v + amt * 255))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1d1530' : '#ffffff';
}

// Mix a color toward white (f = 0 is the color, 1 is white).
export function tint(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * f));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

export function themeVars(color) {
  return { '--c': color, '--c2': shade(color, -0.18), '--c3': shade(color, 0.38), '--c4': tint(color, 0.9), '--on': textOn(color) };
}

// Icons come from Tabler Icons (MIT). js/core/icons.js holds only the ones the app uses.
// Names ending in "-filled" use the solid version.
const SVGNS = 'http://www.w3.org/2000/svg';
export function iconMarkup(name) {
  if (!(name in ICONS)) console.warn('missing icon', name);
  return ICONS[name] || '';
}
export function ic(name, cls = '') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `ic ${cls}`);
  s.setAttribute('aria-hidden', 'true');
  if (name.endsWith('-filled')) {
    s.setAttribute('fill', 'currentColor');
  } else {
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
  }
  s.innerHTML = iconMarkup(name);
  return s;
}

// Three stars for difficulty / ratings: n solid, the rest outlined.
export function stars(n, cls = '') {
  return h('span', { class: `stars ${cls}` }, [1, 2, 3].map((k) => ic(k <= n ? 'star-filled' : 'star', k <= n ? 'on' : '')));
}

// One standard screen: optional back chevron + title, a body, and up to 3 buttons.
export function view({ color = '#6c5ce7', back, left, title, right, body, actions = [], cls = '', solid = false }) {
  setBack(back || null);
  const v = h('section', { class: `view ${solid ? 'solid' : ''} ${cls}` });
  Object.entries(themeVars(color)).forEach(([k, val]) => v.style.setProperty(k, val));
  if (back || left || title || right) {
    v.append(h('header', { class: 'bar' },
      back ? h('button', { class: 'iconbtn', 'aria-label': 'Back', onclick: () => { sfx.tap(); back(); } }, ic('chevron-left')) : (left || h('span', { class: 'iconbtn-spacer' })),
      h('div', { class: 'bar-title' }, title || ''),
      right || h('span', { class: 'iconbtn-spacer' })
    ));
  }
  v.append(h('main', { class: 'main' }, body));
  const acts = actions.filter(Boolean);
  if (acts.length) v.append(h('footer', { class: `actions n${acts.length}` }, acts));
  return v;
}

// A big tappable button: icon on top, short label underneath.
export function btn(label, onTap, opts = {}) {
  const { kind = 'primary', icon, disabled, cls = '' } = opts;
  const b = h('button', { class: `btn ${kind} ${cls}`, disabled: disabled || null, 'aria-label': label || icon },
    icon ? h('span', { class: 'btn-ico' }, ic(icon)) : null,
    label ? h('span', { class: 'btn-label' }, label) : null);
  let busy = false;
  b.addEventListener('click', (e) => {
    if (busy || b.disabled) return;
    busy = true; setTimeout(() => (busy = false), 250);
    if (!opts.silent) sfx.tap();
    buzz(8);
    onTap && onTap(e);
  });
  return b;
}

export function enable(b, on) { b.disabled = !on; }

// Overlay (pause menus, confirmations, celebrations).
let overlayEl = null;
export function overlay(content, { color = '#6c5ce7', dim = true } = {}) {
  closeOverlay();
  overlayEl = h('div', { class: `overlay ${dim ? 'dim' : ''}` }, h('div', { class: 'overlay-card' }, content));
  Object.entries(themeVars(color)).forEach(([k, val]) => overlayEl.style.setProperty(k, val));
  document.body.append(overlayEl);
  return overlayEl;
}
export function closeOverlay() { if (overlayEl) { overlayEl.remove(); overlayEl = null; } }

export function pauseMenu({ color, onResume, onQuit }) {
  overlay(h('div', { class: 'stack center' },
    h('div', { class: 'huge-ico' }, ic('player-pause')),
    h('div', { class: 'actions n2 inline' },
      btn('Quit', () => { closeOverlay(); onQuit(); }, { kind: 'ghost', icon: 'home' }),
      btn('Go', () => { closeOverlay(); onResume(); }, { icon: 'player-play' }))
  ), { color });
}

export function confirmBox({ color, icon = 'help-circle', text, yes = 'Yes', no = 'No', onYes }) {
  overlay(h('div', { class: 'stack center' },
    h('div', { class: 'huge-ico' }, ic(icon)),
    text ? h('div', { class: 'overlay-text' }, text) : null,
    h('div', { class: 'actions n2 inline' },
      btn(no, () => closeOverlay(), { kind: 'ghost' }),
      btn(yes, () => { closeOverlay(); onYes(); }))
  ), { color });
}

// Little floating "+1" style pop.
export function pop(text, { x = 50, y = 40, color = '#fff' } = {}) {
  const p = h('div', { class: 'popfx', style: { left: x + '%', top: y + '%', color } }, text);
  document.body.append(p);
  setTimeout(() => p.remove(), 1000);
}

// Small message at the bottom of the screen.
export function toast(text, ms = 1400) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function flash(color) {
  const f = h('div', { class: 'flashfx', style: { background: color } });
  document.body.append(f);
  setTimeout(() => f.remove(), 450);
}

export function confetti(n = 70) {
  const box = h('div', { class: 'confetti' });
  const colors = ['#ff5a5f', '#ffd32a', '#0fb9b1', '#6c5ce7', '#20bf6b', '#ff9f1c', '#e84393'];
  for (let i = 0; i < n; i++) {
    const s = h('i', {
      style: {
        left: Math.random() * 100 + '%',
        background: colors[i % colors.length],
        animationDelay: Math.random() * 0.6 + 's',
        animationDuration: 1.6 + Math.random() * 1.4 + 's',
        transform: `rotate(${Math.random() * 360}deg)`,
      }
    });
    box.append(s);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3400);
}

// Shrink text until it fits its box.
export function fitText(el, max = 120, min = 18) {
  let size = max;
  el.style.fontSize = size + 'px';
  const parent = el.parentElement;
  if (!parent) return;
  let guard = 0;
  while (size > min && (el.scrollWidth > parent.clientWidth * 0.94 || el.scrollHeight > parent.clientHeight * 0.92) && guard++ < 60) {
    size -= Math.max(2, size * 0.06);
    el.style.fontSize = size + 'px';
  }
}

// Avatars: a colored circle with the player's first letter.
const AV_COLORS = ['#ff5a5f', '#ff9f1c', '#f7b731', '#20bf6b', '#0fb9b1', '#3867d6', '#8854d0', '#e84393', '#4b6584', '#a3cb38'];
export function avatarColor(name) {
  let x = 0; for (const ch of name) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[x % AV_COLORS.length];
}
export function avatar(name, size = 'm', extra) {
  const c = avatarColor(name);
  return h('span', { class: `av av-${size}`, style: { background: c, color: textOn(c) }, title: name },
    (name.trim()[0] || '?').toUpperCase(), extra || null);
}
export function nameTag(name, extra) {
  return h('span', { class: 'nametag' }, avatar(name, 's'), h('span', null, name), extra || null);
}

// Press-and-hold to reveal a secret. Calls onSeen() the first time.
export function holdToPeek(secret, onSeen) {
  let seen = false;
  const front = h('div', { class: 'peek-front' }, h('div', { class: 'peek-hand' }, ic('hand-finger')), h('div', { class: 'peek-label' }, 'Hold to see'));
  const back = h('div', { class: 'peek-back' }, secret);
  const box = h('div', { class: 'peek' }, front, back);
  const show = (e) => { e.preventDefault(); box.classList.add('open'); if (!seen) { seen = true; onSeen && onSeen(); } };
  const hide = () => box.classList.remove('open');
  box.addEventListener('pointerdown', show);
  box.addEventListener('pointerup', hide);
  box.addEventListener('pointercancel', hide);
  box.addEventListener('pointerleave', hide);
  box.addEventListener('contextmenu', e => e.preventDefault());
  return box;
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Keep the screen awake while a round runs (where supported).
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release(); wakeLock = null;
    }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock === null && keepAwake.want) keepAwake(true);
});
