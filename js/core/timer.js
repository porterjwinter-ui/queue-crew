// Pausable countdowns + a ring display. Rounds auto-pause when the phone locks or the app is hidden.
import { h, onCleanup } from './ui.js';

export function timer(seconds, { onTick, onEnd } = {}) {
  const total = seconds * 1000;
  let remaining = total;
  let last = performance.now();
  let running = true;
  let done = false;
  const loop = () => {
    if (done) return;
    const now = performance.now();
    if (running) remaining -= now - last;
    last = now;
    if (remaining <= 0) {
      remaining = 0;
      stop();
      onTick && onTick(0, 1);
      onEnd && onEnd();
      return;
    }
    onTick && onTick(remaining / 1000, 1 - remaining / total);
  };
  const id = setInterval(loop, 100);
  function stop() { done = true; clearInterval(id); }
  onCleanup(stop);
  return {
    pause() { loop(); running = false; },
    resume() { last = performance.now(); running = true; },
    stop,
    get left() { return remaining / 1000; },
    get elapsed() { return (total - remaining) / 1000; },
    get paused() { return !running; },
    get done() { return done; },
  };
}

// Calls fn when the page is hidden (phone locked, app switched).
export function onHidden(fn) {
  const handler = () => { if (document.visibilityState === 'hidden') fn(); };
  document.addEventListener('visibilitychange', handler);
  onCleanup(() => document.removeEventListener('visibilitychange', handler));
}

// Circular timer. Tapping it calls onTap (used for pause).
export function ring(seconds, onTap) {
  const R = 26, C = 2 * Math.PI * R;
  const el = h('button', { class: 'ring', 'aria-label': 'Pause', onclick: () => onTap && onTap() });
  el.innerHTML = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${R}" class="ring-bg"/><circle cx="32" cy="32" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><span class="ring-num">${seconds}</span>`;
  const fg = el.querySelector('.ring-fg');
  const num = el.querySelector('.ring-num');
  return {
    el,
    set(left, frac) {
      fg.setAttribute('stroke-dashoffset', String(C * frac));
      num.textContent = String(Math.ceil(left));
      el.classList.toggle('low', left <= 10);
    },
  };
}
