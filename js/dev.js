// Hidden developer menu (tap the Queue Crew logo 7 times on the home screen).
// Developer mode lets an AI (through the owner's OpenRouter key) keep every game stocked:
// Forehead gets endless new decks, and games quietly get more words, questions, scales
// and cards whenever they're about to repeat. With developer mode off, none of that is used.
import { h, view, btn, mount, ic, confirmBox, enable } from './core/ui.js';
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

  const kind = h('select', { class: 'big-select', 'aria-label': 'What to make' },
    KINDS.map((k) => h('option', { value: k.id }, k.label)));

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
      const r = await generate(kind.value, (msg) => { status.textContent = msg; });
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
      section('Make more now', kind, status, made),
      section('Made by AI', counts, logEl)),
    actions: [remove, gen],
  }));
  showCounts();
}

// Search box over every OpenRouter model. Type part of a name or id ("flash", "claude", "llama").
function modelPicker() {
  let models = cachedModels();
  const current = h('div', { class: 'model-current' });
  const search = h('input', {
    class: 'big-input', type: 'search', placeholder: 'Search models', autocomplete: 'off',
    autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Search models', enterkeyhint: 'search',
  });
  const list = h('div', { class: 'model-list', role: 'listbox', 'aria-label': 'Models' });
  const note = h('p', { class: 'dev-note' });

  const price = (m) => (m.in || m.out ? `$${fmt(m.in)} in / $${fmt(m.out)} out per 1M tokens` : 'Free');
  const showCurrent = () => {
    const m = getModelInfo();
    current.replaceChildren(h('b', null, m.name), h('span', null, m.id), h('span', null, price(m)));
  };

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const sel = getModelInfo().id;
    let hits = terms.length ? models.filter((m) => terms.every((t) => `${m.name} ${m.id}`.toLowerCase().includes(t))) : models;
    const shown = hits.slice(0, 40);
    const rows = shown.map((m) => h('button', {
      class: `model-row ${m.id === sel ? 'on' : ''}`, role: 'option', 'aria-selected': String(m.id === sel),
      onclick: () => { setModelInfo(m); showCurrent(); render(); },
    }, h('b', null, m.name), h('span', null, m.id), h('span', null, price(m))));
    // Not in the list (or offline)? Typing an exact model id still works.
    if (!hits.some((m) => m.id === q) && /^[a-z0-9~][\w.-]*\/[\w.:~-]+$/i.test(q)) {
      rows.push(h('button', { class: 'model-row', onclick: () => { setModelInfo({ id: q, name: q, params: [] }); showCurrent(); render(); } },
        h('b', null, `Use "${q}"`), h('span', null, 'Model id typed by hand')));
    }
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'model-empty' }, 'No models match.')]));
    note.textContent = terms.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : `${models.length} models`;
  };

  search.addEventListener('input', render);
  showCurrent();
  render();
  loadModels().then((m) => { models = m; render(); }).catch(() => { note.textContent = `${models.length} saved models (no connection)`; });
  return { el: h('div', { class: 'model-picker' }, current, search, list, note) };
}

function fmt(n) { return n >= 10 ? String(Math.round(n)) : String(Number(n.toFixed(2))); }

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}
