// The word database: loads data/words.json, indexes it, and generates fresh content for each game.
// In developer mode it also merges in AI-written content and asks for more when a game runs low.
import { store, getRecent, pushRecent, devOn } from './store.js';
import { pick, shuffle, sample } from './rng.js';

let DB = null;
const WORDS = [];
const GROUPS = [];
let TABOO = new Map();
let CHUNKS = null;

export async function loadDB() {
  const res = await fetch('./data/words.json');
  DB = await res.json();
  DB.categories.forEach((c) => indexCategory(c));
  TABOO = new Map(Object.entries(DB.taboo).map(([k, v]) => [k.toLowerCase(), v]));
  if (devOn()) mergeExtras(store.get('ai', null));
  return stats();
}

function indexCategory(c) {
  for (const g of c.groups) {
    const grp = { id: g.id, n: g.n, s: g.s, kind: g.k || 'noun', cat: c, words: [] };
    [['e', 1], ['m', 2], ['h', 3]].forEach(([k, d]) => (g[k] || []).forEach((w) => addWord(grp, w, d)));
    GROUPS.push(grp);
  }
}

const seenWords = new Set();
function addWord(grp, w, d) {
  const k = `${grp.cat.id}|${w.toLowerCase()}`; // the same word may appear in different decks
  if (seenWords.has(k)) return false;
  seenWords.add(k);
  const e = { w, d, g: grp };
  grp.words.push(e);
  WORDS.push(e);
  return true;
}

// ---------- AI content (developer mode) ----------
// Saved shape: { decks: [category], words: [[groupId, word, level]], taboo: {word: [4]},
//                questions: [], spectrums: [[left, right]], doodle: {adj: [], noun: [], act: []} }
function mergeExtras(x) {
  if (!x) return;
  (x.decks || []).forEach((c) => {
    if (DB.categories.some((k) => k.id === c.id)) return;
    c.ai = true;
    DB.categories.push(c);
    indexCategory(c);
  });
  (x.words || []).forEach(([gid, w, d]) => { const g = GROUPS.find((k) => k.id === gid); if (g) addWord(g, w, d); });
  Object.entries(x.taboo || {}).forEach(([w, b]) => TABOO.set(w.toLowerCase(), b));
  const qs = new Set(DB.questions);
  (x.questions || []).forEach((q) => { if (!qs.has(q)) { qs.add(q); DB.questions.push(q); } });
  const sp = new Set(DB.spectrums.map((p) => p.join('|')));
  (x.spectrums || []).forEach((p) => { if (!sp.has(p.join('|'))) { sp.add(p.join('|')); DB.spectrums.push(p); } });
  const dd = x.doodle || {};
  ['adj', 'noun', 'act'].forEach((f) => (dd[f] || []).forEach((v) => { if (!DB.doodle[f].includes(v)) DB.doodle[f].push(v); }));
}

// Save new AI content and use it right away.
export function addExtras(part) {
  const x = store.get('ai', null) || {};
  if (part.decks) x.decks = (x.decks || []).concat(part.decks);
  if (part.words) x.words = (x.words || []).concat(part.words);
  if (part.taboo) x.taboo = Object.assign(x.taboo || {}, part.taboo);
  if (part.questions) x.questions = (x.questions || []).concat(part.questions);
  if (part.spectrums) x.spectrums = (x.spectrums || []).concat(part.spectrums);
  if (part.doodle) {
    x.doodle = x.doodle || { adj: [], noun: [], act: [] };
    ['adj', 'noun', 'act'].forEach((f) => { x.doodle[f] = (x.doodle[f] || []).concat(part.doodle[f] || []); });
  }
  store.set('ai', x);
  mergeExtras(part);
}

export function extraCounts() {
  const x = store.get('ai', null) || {};
  const deckWords = (x.decks || []).reduce((n, c) => n + c.groups.reduce((m, g) => m + (g.e || []).length + (g.m || []).length + (g.h || []).length, 0), 0);
  return {
    decks: (x.decks || []).length,
    words: (x.words || []).length + deckWords,
    taboo: Object.keys(x.taboo || {}).length,
    questions: (x.questions || []).length,
    spectrums: (x.spectrums || []).length,
    doodle: ['adj', 'noun', 'act'].reduce((n, f) => n + ((x.doodle || {})[f] || []).length, 0),
  };
}
export function clearExtras() { store.del('ai'); }

// What the AI needs to know so it doesn't repeat anything.
export function aiContext() {
  return {
    groups: GROUPS.map((g) => ({ id: g.id, n: g.n, cat: g.cat.id, words: g.words.map((e) => e.w) })),
    decks: DB.categories.map((c) => c.name),
    allWords: WORDS.map((e) => e.w),
    noCard: WORDS.filter((e) => e.g.kind === 'noun' && !TABOO.has(e.w.toLowerCase())).map((e) => e.w),
    questions: DB.questions,
    spectrums: DB.spectrums,
    doodle: DB.doodle,
    categoryGroups: (catId) => GROUPS.filter((g) => g.cat.id === catId).map((g) => g.id),
  };
}

// When a game is close to running out of things it hasn't shown yet, this is called
// with what kind of content it needs. Developer mode hooks it up to the AI.
let lowHandler = null;
export function onRunningLow(fn) { lowHandler = fn; }

export function stats() {
  return { words: WORDS.length, groups: GROUPS.length, taboo: TABOO.size, questions: DB.questions.length, scales: DB.spectrums.length };
}

// Level 1 = easy words, 2 = easy + medium, 3 = medium + hard.
const allowed = (lvl) => (lvl === 1 ? [1] : lvl === 2 ? [1, 2] : [2, 3]);
function byLevel(list, lvl, min = 12) {
  const a = allowed(lvl);
  const r = list.filter((e) => a.includes(e.d));
  if (r.length >= min) return r;
  // Not enough at this level: widen by one step.
  const wider = list.filter((e) => Math.abs(e.d - (lvl === 1 ? 1 : lvl === 3 ? 3 : 2)) <= 1);
  return wider.length >= min ? wider : list;
}

// A never-ending shuffled stream that prefers things you haven't seen lately.
// poolFn is read again whenever new content arrives, so AI additions show up mid-game.
function stream(poolFn, key, { keyOf = (e) => e.w, need = null, low = 12 } = {}) {
  let queue = [];
  let lastLen = -1;
  const freshCount = (pool) => { const recent = new Set(getRecent(key)); return pool.filter((e) => !recent.has(keyOf(e))).length; };
  const check = (pool) => { if (lowHandler && need && freshCount(pool) < low) lowHandler(need); };
  const refill = (pool) => {
    const recent = new Set(getRecent(key));
    const fresh = shuffle(pool.filter((e) => !recent.has(keyOf(e))));
    const stale = shuffle(pool.filter((e) => recent.has(keyOf(e))));
    queue = fresh.concat(stale);
    lastLen = pool.length;
  };
  check(poolFn());
  return {
    next() {
      const pool = poolFn();
      if (!queue.length || pool.length !== lastLen) refill(pool);
      const e = queue.shift();
      pushRecent(key, [keyOf(e)]);
      if (queue.length % 4 === 0) check(pool);
      return e;
    },
  };
}

// ---------- Forehead decks ----------
export function decks() {
  return [{ id: 'mix', name: 'Mix', icon: 'arrows-shuffle' }].concat(
    DB.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, act: !!c.act, ai: !!c.ai }))
  );
}
export function deckStream(deckId, level) {
  const pool = () => byLevel(deckId === 'mix'
    ? WORDS.filter((e) => e.g.cat.id !== 'sayings')
    : WORDS.filter((e) => e.g.cat.id === deckId), level, 25);
  return stream(pool, 'forehead', { need: deckId === 'mix' ? 'words' : `deck:${deckId}` });
}

// ---------- Imposter ----------
export function imposterRound(level) {
  const groups = GROUPS.filter((g) => g.kind === 'noun' && g.id !== 'history' && byLevel(g.words, level, 1).length >= 6);
  const g = pick(groups);
  const pool = byLevel(g.words, level, 6);
  const s = stream(() => pool, 'imposter', { need: 'words', low: 3 });
  const word = s.next();
  const decoys = pool.filter((e) => e.w !== word.w);
  const decoy = pick(decoys);
  return { topic: g.n, icon: g.cat.icon, word: word.w, decoy: decoy.w };
}

// ---------- Don't Say It ----------
export function tabooStream(level) {
  const pool = () => byLevel(WORDS.filter((e) => TABOO.has(e.w.toLowerCase())), level, 60);
  const s = stream(pool, 'taboo', { need: 'taboo' });
  return { next() { const e = s.next(); return { word: e.w, banned: TABOO.get(e.w.toLowerCase()) }; } };
}

// ---------- Majority Rules ----------
// Every question is hand-written so it reads naturally.
export function questionStream() {
  const s = stream(() => DB.questions.map((q) => ({ w: q })), 'questions', { need: 'questions' });
  return { next: () => s.next().w };
}

// ---------- Spectrum ----------
export function spectrumStream() {
  const s = stream(() => DB.spectrums.map((p) => ({ w: p.join('|'), p })), 'spectrum', { need: 'scales' });
  return { next: () => s.next().p };
}

const article = (s) => (/^[aeiou]/i.test(s) ? 'an' : 'a');

// ---------- Jinx ----------
export function jinxStream(level) {
  const pool = () => byLevel(WORDS.filter((e) => e.g.kind === 'noun' && e.g.id !== 'history'), level, 40);
  return stream(pool, 'jinx', { need: 'words' });
}

// ---------- Fishbowl ----------
export function fishbowlStream(level) {
  const cats = ['animals', 'food', 'characters', 'people', 'park', 'stuff', 'places', 'music', 'vehicles', 'sports'];
  const pool = () => byLevel(WORDS.filter((e) => (cats.includes(e.g.cat.id) || e.g.cat.ai) && e.g.kind === 'noun'), level, 40);
  return stream(pool, 'fishbowl', { need: 'words' });
}

// ---------- Hot Potato ----------
export function hotWordStream(level) {
  const pool = () => byLevel(WORDS.filter((e) => e.g.cat.id !== 'sayings'), level, 40);
  return stream(pool, 'hotpotato', { need: 'words' });
}

function buildChunks() {
  const tokens = new Set();
  WORDS.forEach((e) => e.w.toLowerCase().split(/[^a-z]+/).forEach((t) => { if (t.length >= 3) tokens.add(t); }));
  const count = { start: {}, end: {}, any: {} };
  const bump = (o, k) => (o[k] = (o[k] || 0) + 1);
  for (const t of tokens) {
    bump(count.start, t[0]);
    for (const n of [2, 3]) {
      if (t.length > n) { bump(count.start, t.slice(0, n)); bump(count.end, t.slice(-n)); }
      const seen = new Set();
      for (let i = 0; i + n <= t.length; i++) seen.add(t.slice(i, i + n));
      seen.forEach((s) => bump(count.any, s));
    }
  }
  const list = (o, f) => Object.entries(o).filter(([k, v]) => f(k, v)).map(([k]) => k);
  const vowelish = (k) => /[aeiouy]/.test(k) || k.length === 1 || /^(ch|sh|th|st|tr|br|pl|cr|bl|gr|sp|fl|dr|sn|sl|sw|ck|ng|nd|nt|ll|ss)$/.test(k);
  CHUNKS = {
    1: list(count.start, (k, v) => k.length === 1 && v >= 20 && !/[qxzyuvk]/.test(k)).map((k) => ({ text: k, pos: 'start' })),
    2: list(count.start, (k, v) => k.length === 2 && v >= 10 && vowelish(k)).map((k) => ({ text: k, pos: 'start' }))
      .concat(list(count.any, (k, v) => k.length === 2 && v >= 40 && vowelish(k)).map((k) => ({ text: k, pos: 'any' }))),
    3: list(count.any, (k, v) => k.length === 3 && v >= 9).map((k) => ({ text: k, pos: 'any' }))
      .concat(list(count.end, (k, v) => k.length === 2 && v >= 18).map((k) => ({ text: k, pos: 'end' })))
      .concat(list(count.start, (k, v) => k.length === 3 && v >= 6).map((k) => ({ text: k, pos: 'start' }))),
  };
}
export function letterChunk(level) {
  if (!CHUNKS) buildChunks();
  const s = stream(() => CHUNKS[level].map((c) => ({ ...c, w: c.pos + ':' + c.text })), 'chunks');
  const c = s.next();
  return { text: c.text.toUpperCase(), pos: c.pos };
}

// ---------- Doodle Chain ----------
// Level 1: "a dragon", 2: "a sleepy dragon", 3: "a sleepy dragon on a skateboard".
const PEOPLE = new Set(['grandma', 'baby', 'chef', 'astronaut', 'pirate', 'knight', 'wizard', 'mermaid']);
const NOT_FOR_PEOPLE = new Set(['baby', 'chocolate', 'square', 'spotted', 'striped', 'fluffy']);
export function doodlePrompt(level = 3) {
  const d = DB.doodle;
  let adj, noun, act, tries = 0;
  do {
    adj = pick(d.adj); noun = pick(d.noun); act = pick(d.act);
  } while (tries++ < 20 && (adj === noun || act.includes(noun) || (PEOPLE.has(noun) && NOT_FOR_PEOPLE.has(adj))));
  if (level === 1) return { text: `${article(noun)} ${noun}`, noun };
  if (level === 2) return { text: `${article(adj)} ${adj} ${noun}`, noun };
  return { text: `${article(adj)} ${adj} ${noun} ${act}`, noun };
}

// ---------- I Spy Bingo ----------
export function spotItems(n) { return sample(DB.spot, n); }
