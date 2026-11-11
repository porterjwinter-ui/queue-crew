// Paste into the browser console (or inject) to drive Queue Crew without touching the screen.
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej:' + e.reason));
window.T = {
  btns() { return [...document.querySelectorAll('button')].map((x) => x.textContent.trim()).filter(Boolean); },
  tap(label) {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(label) && !x.disabled);
    if (!b) throw new Error('no button ' + label + ' have: ' + T.btns().join('|'));
    b.click();
  },
  ori(beta, gamma, ms = 300) {
    return new Promise((res) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta, gamma, alpha: 0 }));
        if (performance.now() - t0 > ms) { clearInterval(id); res(); }
      }, 30);
    });
  },
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); },
  title() { return document.querySelector('.bar-title')?.textContent; },
  type(v) {
    const i = document.querySelector('input.big-input');
    i.value = v;
    i.dispatchEvent(new Event('input'));
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  },
  hold(sel = '.peek') {
    const p = document.querySelector(sel);
    p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    p.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  },
  async until(fn, ms = 4000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await T.wait(50); }
    return false;
  },
};
'harness ready';
