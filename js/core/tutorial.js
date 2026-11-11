// Plays an animated "how to play" storyboard.
// A tutorial is { id, svg, css, steps: [{ c: 'caption', t: ms }] }.
// The SVG gets data-s="<step>" and each tutorial's CSS moves its pieces for that step.
import { h } from './ui.js';

const injected = new Set();

export function tutorial(t, { captions = true } = {}) {
  if (!injected.has(t.id)) {
    const st = document.createElement('style');
    st.textContent = t.css;
    document.head.append(st);
    injected.add(t.id);
  }
  const stage = h('div', {
    class: `tut tut-${t.id}`,
    html: `<svg class="tut-svg" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${t.svg}</svg>`,
  });
  const cap = h('div', { class: 'tut-cap' });
  const dots = h('div', { class: 'tut-dots' }, t.steps.map(() => h('i')));
  const wrap = h('div', { class: `tut-wrap ${captions ? '' : 'nocap'}` }, stage, captions ? cap : null, captions ? dots : null);

  let i = -1;
  let started = false;
  const show = (n) => {
    stage.setAttribute('data-s', String(n));
    cap.textContent = t.steps[n].c;
    cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in');
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === n));
  };
  const next = () => {
    if (started && !wrap.isConnected) return; // screen closed: stop looping
    if (wrap.isConnected) started = true;
    const wrapAround = i === t.steps.length - 1;
    if (wrapAround) {
      stage.classList.add('fade');
      setTimeout(() => {
        stage.classList.add('snap');
        i = 0; show(0);
        void stage.offsetWidth;
        stage.classList.remove('snap');
        stage.classList.remove('fade');
        setTimeout(next, t.steps[0].t || 2200);
      }, 300);
      return;
    }
    i += 1;
    show(i);
    setTimeout(next, t.steps[i].t || 2200);
  };
  setTimeout(next, 60);
  return wrap;
}

// Reusable SVG bits for storyboards. Each piece sits inside a positioned wrapper so CSS
// transforms on the inner ".a" group animate relative to where the piece was placed.
const at = (x, y, inner, scale = 1) => `<g transform="translate(${x} ${y})${scale !== 1 ? ` scale(${scale})` : ''}">${inner}</g>`;

export const art = {
  person(id, x, y, color, { face = 'smile', scale = 1 } = {}) {
    const mouth = face === 'o'
      ? '<ellipse cx="0" cy="9" rx="4" ry="5" fill="#1d1530"/>'
      : face === 'flat'
        ? '<path d="M-6 9 h12" stroke="#1d1530" stroke-width="3" stroke-linecap="round"/>'
        : '<path d="M-7 7 q7 7 14 0" fill="none" stroke="#1d1530" stroke-width="3" stroke-linecap="round"/>';
    return at(x, y, `<g class="a ${id}">
      <rect x="-22" y="26" width="44" height="52" rx="20" fill="${color}"/>
      <g class="a ${id}-head"><circle cx="0" cy="0" r="22" fill="#ffd9b3"/>
      <circle cx="-8" cy="-3" r="3.2" fill="#1d1530"/><circle cx="8" cy="-3" r="3.2" fill="#1d1530"/>${mouth}</g>
    </g>`, scale);
  },
  phone(id, x, y, { w = 46, hgt = 28, fill = '#fff', text = '', fs = 13 } = {}) {
    return at(x, y, `<g class="a ${id}"><rect x="${-w / 2}" y="${-hgt / 2}" width="${w}" height="${hgt}" rx="6" fill="#1d1530"/>
      <rect class="${id}-scr" x="${-w / 2 + 3}" y="${-hgt / 2 + 3}" width="${w - 6}" height="${hgt - 6}" rx="4" fill="${fill}"/>
      ${text ? `<text x="0" y="${fs / 2.6}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="#1d1530">${text}</text>` : ''}</g>`);
  },
  bubble(id, x, y, text, { w = 70, fs = 15, fill = '#fff', tail = 'down' } = {}) {
    const tailPath = tail === 'down' ? 'M-6 14 L0 24 L6 14 Z' : tail === 'left' ? `M${-w / 2 + 2} -6 L${-w / 2 - 10} 2 L${-w / 2 + 2} 6 Z` : `M${w / 2 - 2} -6 L${w / 2 + 10} 2 L${w / 2 - 2} 6 Z`;
    return at(x, y, `<g class="a ${id}"><path d="${tailPath}" fill="${fill}" stroke="#1d1530" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="${-w / 2}" y="-16" width="${w}" height="32" rx="14" fill="${fill}" stroke="#1d1530" stroke-width="2.5"/>
      <text x="0" y="${fs / 2.8}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="#1d1530">${text}</text></g>`);
  },
  check(id, x, y, r = 16) {
    return at(x, y, `<g class="a ${id}"><circle r="${r}" fill="#20bf6b"/><path d="M${-r * 0.45} 0 l${r * 0.3} ${r * 0.32} l${r * 0.6} ${-r * 0.62}" fill="none" stroke="#fff" stroke-width="${r * 0.28}" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  },
  cross(id, x, y, r = 16) {
    return at(x, y, `<g class="a ${id}"><circle r="${r}" fill="#ff3b3b"/><path d="M${-r * 0.38} ${-r * 0.38} L${r * 0.38} ${r * 0.38} M${r * 0.38} ${-r * 0.38} L${-r * 0.38} ${r * 0.38}" stroke="#fff" stroke-width="${r * 0.28}" stroke-linecap="round"/></g>`);
  },
  emoji(id, x, y, e, size = 30) {
    return at(x, y, `<g class="a ${id}"><text x="0" y="0" font-size="${size}" text-anchor="middle" dominant-baseline="central">${e}</text></g>`);
  },
  text(id, x, y, t, { fs = 16, fill = '#1d1530', weight = 900 } = {}) {
    return at(x, y, `<g class="a ${id}"><text x="0" y="${fs / 3}" text-anchor="middle" font-size="${fs}" font-weight="${weight}" fill="${fill}">${t}</text></g>`);
  },
  at,
};
