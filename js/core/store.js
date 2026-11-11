// localStorage wrapper. Every access is guarded so private browsing never breaks the app.
const PREFIX = 'qc.';
const mem = {};

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? (key in mem ? mem[key] : fallback) : JSON.parse(raw);
    } catch { return key in mem ? mem[key] : fallback; }
  },
  set(key, value) {
    mem[key] = value;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
  del(key) {
    delete mem[key];
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ----- Players & level -----
export function getPlayers() { return store.get('players', []); }
export function setPlayers(p) { store.set('players', p); }
export function getLevel() { return store.get('level', 2); }
export function setLevel(l) { store.set('level', l); }

// ----- Tickets: the all-day scoreboard -----
export function getTickets() {
  const t = store.get('tickets', null);
  if (!t || t.day !== today()) return { day: today(), scores: {} };
  return t;
}
export function addTickets(name, n) {
  if (!n) return;
  const t = getTickets();
  t.scores[name] = (t.scores[name] || 0) + n;
  store.set('tickets', t);
}
export function resetTickets() { store.set('tickets', { day: today(), scores: {} }); }

// Rank players by score and hand out tickets: 1st 3, 2nd 2, 3rd 1 (ties share).
export function awardRanking(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const out = {};
  let rank = 0, last = null;
  entries.forEach(([name, s], i) => {
    if (s !== last) { rank = i; last = s; }
    const t = Math.max(0, 3 - rank);
    out[name] = t;
    addTickets(name, t);
  });
  return out;
}
export function awardAll(names, n) {
  const out = {};
  names.forEach(nm => { out[nm] = n; addTickets(nm, n); });
  return out;
}

// ----- Recently used words, so each game feels new every time -----
export function getRecent(key) { return store.get('recent.' + key, []); }
export function pushRecent(key, items, cap = 600) {
  const r = getRecent(key);
  r.push(...items);
  store.set('recent.' + key, r.slice(-cap));
}
export function clearRecent(key) { store.set('recent.' + key, []); }
