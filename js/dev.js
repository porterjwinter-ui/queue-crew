// Hidden developer menu (tap the Queue Crew logo 7 times on the home screen).
// Developer mode lets an AI (through the owner's OpenRouter key) keep every game stocked:
// Forehead gets endless new decks, and games quietly get more words, questions, scales
// and cards whenever they're about to repeat. With developer mode off, none of that is used.
import { h, view, btn, mount, ic, confirmBox, enable, dropdown } from './core/ui.js';
import { store } from './core/store.js';
import { KINDS, getKey, setKey, getModelInfo, setModelInfo, cachedModels, loadModels, generate, getLog } from './core/ai.js';
import { extraCounts, clearExtras } from './core/db.js';

const COLOR = '#4b6584';

export function devMenu(home) {
  const isOn = () => !!store.get('dev.on', false);

  const sw = h('button', { class: `switch ${isOn() ? 'on' : ''}`, role: 'switch', 'aria-checked': String(isOn()), 'aria-label': 'Developer mode' }, h('span', { class: 'knob' }));
  sw.addEventListener('click', () => {
    const next = !isOn();
    if (next && !getKey()) { status.textContent = 'Add your OpenRouter key first.'; keyInput.focus(); return; }
    store.set('dev.on', next);
    // Reload so the games pick up (or drop) the AI content, then come back here.
    try { sessionStorage.setItem('qc.reopenDev', '1'); } catch { /* ignore */ }
    location.reload();
  });

  const keyInput = h('input', {
    class: 'big-input', type: 'password', placeholder: 'sk-or-...', autocomplete: 'off',
    autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'OpenRouter key',
  });
  keyInput.value = getKey();
  keyInput.addEventListener('change', () => {
    setKey(keyInput.value.trim());
    if (!keyInput.value.trim() && isOn()) { store.set('dev.on', false); sw.classList.remove('on'); }
    status.textContent = keyInput.value.trim() ? 'Key saved.' : 'Key removed.';
  });

  const model = modelPicker();

  const kind = choicePicker(KINDS);

  const status = h('div', { class: 'dev-status' });
  const made = h('div', { class: 'dev-made' });
  const counts = h('div', { class: 'dev-counts' });
  const logEl = h('div', { class: 'dev-log' });

  const showCounts = () => {
    const c = extraCounts();
    counts.textContent = `${c.decks} decks, ${c.words} words, ${c.taboo} cards, ${c.questions} questions, ${c.spectrums} scales, ${c.doodle} doodle ideas`;
    const l = getLog();
    logEl.replaceChildren(...l.map((e) => h('div', null, h('b', null, ago(e.t)), ' ', e.msg)));
  };

  const gen = btn('Generate', async () => {
    if (keyInput.value.trim() !== getKey()) setKey(keyInput.value.trim());
    if (!getKey()) { status.textContent = 'Add your OpenRouter key first.'; keyInput.focus(); return; }
    if (!isOn()) { status.textContent = 'Turn on developer mode first.'; return; }
    enable(gen, false);
    made.replaceChildren();
    try {
      const r = await generate(kind.value(), (msg) => { status.textContent = msg; });
      const items = [
        ...r.words.map((w) => w[1]),
        ...Object.keys(r.taboo),
        ...r.questions,
        ...r.spectrums.map((p) => `${p[0]} / ${p[1]}`),
        ...r.doodle.adj, ...r.doodle.noun, ...r.doodle.act,
      ];
      status.textContent = items.length ? `Added ${items.length} new things.` : 'Nothing new passed the checks. Try again.';
      made.replaceChildren(...items.slice(0, 30).map((t) => h('span', { class: 'chip' }, t)),
        items.length > 30 ? h('span', { class: 'chip skip' }, `+${items.length - 30} more`) : null);
    } catch (e) {
      status.textContent = e.message || 'Something went wrong.';
    } finally {
      enable(gen, true);
      showCounts();
    }
  }, { icon: 'sparkles' });

  const remove = btn('Remove AI', () => confirmBox({
    color: COLOR, icon: 'trash', text: 'Remove everything the AI made?',
    onYes: () => { clearExtras(); try { sessionStorage.setItem('qc.reopenDev', '1'); } catch { /* ignore */ } location.reload(); },
  }), { kind: 'ghost', icon: 'trash' });

  const section = (title, ...kids) => h('section', { class: 'dev-card' }, h('h2', null, title), ...kids);

  mount(view({
    color: COLOR, back: home, title: 'Developer',
    body: h('div', { class: 'dev' },
      section('Developer mode',
        h('div', { class: 'dev-row' }, h('span', null, 'AI keeps every game stocked'), sw),
        h('p', { class: 'dev-note' }, 'Forehead gets a New deck card, and games write more words and questions before they repeat.')),
      section('OpenRouter key', keyInput, h('p', { class: 'dev-note' }, 'Saved only on this phone. Sent only to openrouter.ai.')),
      section('Model', model.el),
      section('Make more now', kind.el, status, made),
      section('Made by AI', counts, logEl)),
    actions: [remove, gen],
  }));
  showCounts();
}

// A simple custom dropdown of fixed choices.
function choicePicker(options) {
  let value = options[0].id;
  const list = h('div', { class: 'dd-list', role: 'listbox' });
  const dd = dropdown({ label: options[0].label, panel: list });
  const render = () => list.replaceChildren(...options.map((o) => h('button', {
    class: `dd-opt ${o.id === value ? 'on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(o.id === value),
    onclick: () => { value = o.id; dd.setLabel(o.label); render(); dd.close(); },
  }, o.label)));
  render();
  return { el: dd.el, value: () => value };
}

// Model dropdown with a search box over every OpenRouter model. Each row shows just the name and price.
function modelPicker() {
  let models = cachedModels();
  const price = (m) => (m.in || m.out ? `$${fmt(m.in)} in / $${fmt(m.out)} out per 1M tokens` : 'Free');
  const labelFor = (m) => [h('b', null, m.name), h('span', null, m.price === null ? 'Typed by hand' : price(m))];

  const search = h('input', {
    class: 'dd-search-input', type: 'text', inputmode: 'search', placeholder: 'Search models', autocomplete: 'off',
    autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Search models', enterkeyhint: 'search',
  });
  const clear = h('button', { class: 'dd-clear', type: 'button', 'aria-label': 'Clear search', onclick: () => { search.value = ''; render(); search.focus(); } }, ic('x'));
  const list = h('div', { class: 'dd-list', role: 'listbox', 'aria-label': 'Models' });
  const note = h('div', { class: 'dd-note' });
  const dd = dropdown({
    label: labelFor(getModelInfo()),
    panel: [h('div', { class: 'dd-search' }, ic('search'), search, clear), list, note],
    onOpen: () => render(),
  });

  const choose = (m) => { setModelInfo(m); dd.setLabel(labelFor(getModelInfo())); dd.close(); };

  function render() {
    const q = search.value.trim().toLowerCase();
    clear.hidden = !q;
    const terms = q.split(/\s+/).filter(Boolean);
    const sel = getModelInfo().id;
    const hits = terms.length ? models.filter((m) => terms.every((t) => `${m.name} ${m.id}`.toLowerCase().includes(t))) : models;
    const rows = hits.slice(0, 40).map((m) => h('button', {
      class: `dd-opt ${m.id === sel ? 'on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(m.id === sel),
      onclick: () => choose(m),
    }, h('b', null, m.name), h('span', null, price(m))));
    // Not in the list (or offline)? Typing an exact model id still works.
    if (!hits.some((m) => m.id === q) && /^[a-z0-9~][\w.-]*\/[\w.:~-]+$/i.test(q)) {
      rows.push(h('button', { class: 'dd-opt', type: 'button', onclick: () => choose({ id: q, name: q, params: [], price: null }) },
        h('b', null, `Use "${q}"`), h('span', null, 'Typed by hand')));
    }
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'dd-empty' }, 'No models match.')]));
    note.textContent = terms.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : `${models.length} models`;
  }

  search.addEventListener('input', render);
  loadModels().then((m) => { models = m; if (!list.closest('[hidden]')) render(); }).catch(() => { note.textContent = `${models.length} saved models (no connection)`; });
  return { el: dd.el };
}

function fmt(n) { return n >= 10 ? String(Math.round(n)) : String(Number(n.toFixed(2))); }

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}
