// The word database: loads data/words.json, indexes it, and generates fresh content for each game.
import { getRecent, pushRecent } from './store.js';
import { pick, shuffle, sample, rand } from './rng.js';

let DB = null;
const WORDS = [];
const GROUPS = [];
let TABOO = new Map();
let CHUNKS = null;

export async function loadDB() {
  const res = await fetch('./data/words.json');
  DB = await res.json();
  for (const c of DB.categories) {
    for (const g of c.groups) {
      const grp = { id: g.id, n: g.n, s: g.s, kind: g.k || 'noun', cat: c, words: [] };
      [['e', 1], ['m', 2], ['h', 3]].forEach(([k, d]) => (g[k] || []).forEach((w) => {
        const e = { w, d, g: grp };
        grp.words.push(e);
        WORDS.push(e);
      }));
      GROUPS.push(grp);
    }
  }
  TABOO = new Map(Object.entries(DB.taboo).map(([k, v]) => [k.toLowerCase(), v]));
  return stats();
}

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
function stream(pool, key, keyOf = (e) => e.w) {
  let queue = [];
  const refill = () => {
    const recent = new Set(getRecent(key));
    const fresh = shuffle(pool.filter((e) => !recent.has(keyOf(e))));
    const stale = shuffle(pool.filter((e) => recent.has(keyOf(e))));
    queue = fresh.concat(stale);
  };
  return {
    next() {
      if (!queue.length) refill();
      const e = queue.shift();
      pushRecent(key, [keyOf(e)]);
      return e;
    },
  };
}

// ---------- Forehead decks ----------
export function decks() {
  return [{ id: 'mix', name: 'Mix', emoji: '🎲' }].concat(
    DB.categories.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, act: !!c.act }))
  );
}
export function deckStream(deckId, level) {
  const pool = deckId === 'mix'
    ? WORDS.filter((e) => e.g.cat.id !== 'sayings')
    : WORDS.filter((e) => e.g.cat.id === deckId);
  return stream(byLevel(pool, level, 25), 'forehead');
}

// ---------- Imposter ----------
export function imposterRound(level) {
  const groups = GROUPS.filter((g) => g.kind === 'noun' && g.id !== 'history' && byLevel(g.words, level, 1).length >= 6);
  const g = pick(groups);
  const pool = byLevel(g.words, level, 6);
  const s = stream(pool, 'imposter');
  const word = s.next();
  const decoys = pool.filter((e) => e.w !== word.w);
  const decoy = pick(decoys);
  return { topic: g.n, emoji: g.cat.emoji, word: word.w, decoy: decoy.w };
}

// ---------- Don't Say It ----------
export function tabooStream(level) {
  const pool = WORDS.filter((e) => TABOO.has(e.w.toLowerCase()));
  const s = stream(byLevel(pool, level, 60), 'taboo');
  return { next() { const e = s.next(); return { word: e.w, banned: TABOO.get(e.w.toLowerCase()) }; } };
}

// ---------- Majority Rules ----------
const article = (s) => (/^[aeiou]/i.test(s) ? 'an' : 'a');
function nounGroups(min = 8) { return GROUPS.filter((g) => g.kind === 'noun' && g.words.length >= min); }

export function questionStream() {
  const authored = DB.questions.map((q) => ({ w: q }));
  const templated = [];
  for (const g of nounGroups()) {
    for (const t of DB.qTemplates) {
      if (t.includes('famous') && g.s.includes('famous')) continue;
      templated.push({ w: t.replace('a {s}', `${article(g.s)} {s}`).replace('{s}', g.s) });
    }
  }
  const a = stream(authored, 'questions');
  const b = stream(templated, 'questions');
  return { next: () => (rand() < 0.62 ? a : b).next().w };
}

// ---------- Spectrum ----------
export function spectrumStream() {
  const authored = DB.spectrums.map((p) => ({ w: p.join('|'), p }));
  const templated = [];
  for (const g of nounGroups()) {
    for (const [l, r] of DB.specTemplates) {
      const p = [l.replace('{s}', g.s), r.replace('{s}', g.s)];
      templated.push({ w: p.join('|'), p });
    }
  }
  const a = stream(authored, 'spectrum');
  const b = stream(templated, 'spectrum');
  return { next: () => (rand() < 0.65 ? a : b).next().p };
}

// ---------- Jinx ----------
export function jinxStream(level) {
  const pool = WORDS.filter((e) => e.g.kind === 'noun' && e.g.id !== 'history');
  return stream(byLevel(pool, level, 40), 'jinx');
}

// ---------- Fishbowl ----------
export function fishbowlStream(level) {
  const cats = ['animals', 'food', 'characters', 'people', 'park', 'stuff', 'places', 'music', 'vehicles', 'sports'];
  const pool = WORDS.filter((e) => cats.includes(e.g.cat.id) && e.g.kind === 'noun');
  return stream(byLevel(pool, level, 40), 'fishbowl');
}

// ---------- Hot Potato ----------
export function hotWordStream(level) {
  const pool = WORDS.filter((e) => e.g.cat.id !== 'sayings');
  return stream(byLevel(pool, level, 40), 'hotpotato');
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
  const s = stream(CHUNKS[level].map((c) => ({ ...c, w: c.pos + ':' + c.text })), 'chunks');
  const c = s.next();
  return { text: c.text.toUpperCase(), pos: c.pos };
}

// ---------- Doodle Chain ----------
// Level 1: "a dragon", 2: "a sleepy dragon", 3: "a sleepy dragon on a skateboard".
export function doodlePrompt(level = 3) {
  const d = DB.doodle;
  const adj = pick(d.adj), noun = pick(d.noun), act = pick(d.act);
  if (level === 1) return { text: `${article(noun)} ${noun}`, noun };
  if (level === 2) return { text: `${article(adj)} ${adj} ${noun}`, noun };
  return { text: `${article(adj)} ${adj} ${noun} ${act}`, noun };
}

// ---------- I Spy Bingo ----------
export function spotItems(n) { return sample(DB.spot, n); }
