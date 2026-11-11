// Developer-only: uses the owner's own OpenRouter key to write extra game content.
// The key is kept in this phone's storage and is only ever sent to openrouter.ai.
// Everything the AI writes is checked (format, duplicates, clean words, plain characters)
// before it is added, so a bad reply can never break a game.
import { store, devOn } from './store.js';
import { aiContext, addExtras, onRunningLow } from './db.js';
import { shuffle } from './rng.js';
import { normalize, containsWord } from './text.js';

// Default: Google's current Gemini Flash. Any OpenRouter model can be picked in the developer menu.
export const DEFAULT_MODEL = {
  id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash', in: 0.83, out: 4.12,
  params: ['max_tokens', 'temperature', 'reasoning', 'response_format', 'structured_outputs'],
};
// Used only if the model list has never loaded (first open with no signal).
const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  { id: 'google/gemini-3.5-flash-lite', name: 'Google: Gemini 3.5 Flash Lite', in: 0.3, out: 2.5, params: DEFAULT_MODEL.params },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', in: 2, out: 10, params: ['max_tokens', 'temperature', 'reasoning'] },
  { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', in: 0.1, out: 0.5, params: ['max_tokens', 'temperature', 'reasoning'] },
];

export const getKey = () => store.get('dev.key', '');
export function setKey(k) { if (k) store.set('dev.key', k); else store.del('dev.key'); }
export const getModelInfo = () => store.get('dev.model2', null) || DEFAULT_MODEL;
export const getModel = () => getModelInfo().id;
export const setModelInfo = (m) => store.set('dev.model2', { id: m.id, name: m.name, in: m.in, out: m.out, params: m.params || [], price: m.price === null ? null : undefined });

// OpenRouter's public model list (no key needed). Cached so the picker works offline too.
export function cachedModels() {
  const c = store.get('dev.models', null);
  return c && Array.isArray(c.list) && c.list.length ? c.list : FALLBACK_MODELS;
}
export async function loadModels() {
  const c = store.get('dev.models', null);
  if (c && Date.now() - c.t < 12 * 60 * 60 * 1000 && c.list.length) return c.list;
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error('models ' + res.status);
  const data = await res.json();
  const list = (data.data || [])
    .filter((m) => !String(m.id).endsWith(':batch'))
    .filter((m) => !m.architecture || !m.architecture.output_modalities || m.architecture.output_modalities.includes('text'))
    .sort((a, b) => (b.created || 0) - (a.created || 0))
    .map((m) => ({
      id: m.id,
      name: String(m.name || m.id).replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').trim() || m.id, // no emoji in the app
      in: Math.round(Number((m.pricing && m.pricing.prompt) || 0) * 1e8) / 100,
      out: Math.round(Number((m.pricing && m.pricing.completion) || 0) * 1e8) / 100,
      params: (m.supported_parameters || []).filter((p) => ['max_tokens', 'temperature', 'reasoning', 'response_format'].includes(p)),
    }));
  store.set('dev.models', { t: Date.now(), list });
  return list;
}

export class AIError extends Error {}

const SYSTEM = `You write content for Queue Crew, a family party-game app that groups play on one phone while waiting in line at theme parks.
Rules for everything you write:
- Clean and friendly for all ages. No swearing, romance, alcohol, drugs, real weapons, injuries or gore.
- No brand names, trademarks, characters from movies, TV, books or video games, and no real people.
- Plain everyday English a 10-year-old understands. Every sentence must read naturally.
- Only plain letters, numbers and normal punctuation. No emoji.
- Never repeat or lightly reword anything in the lists you are given.
- Reply with one JSON object only. No other text.`;

// Only send options the chosen model supports (from OpenRouter's model list).
function requestBody(prompt, maxTokens) {
  const info = getModelInfo();
  const has = (p) => !info.params || !info.params.length || info.params.includes(p);
  const body = {
    model: info.id,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
  };
  if (has('temperature')) body.temperature = 0.9;
  // Thinking models (like Gemini Flash): keep thinking short so the answer isn't cut off.
  if (info.params && info.params.includes('reasoning')) { body.reasoning = { effort: 'low', exclude: true }; body.max_tokens = maxTokens + 2000; }
  if (info.params && info.params.includes('response_format')) body.response_format = { type: 'json_object' };
  return body;
}

async function ask(prompt, maxTokens = 3000, plain = false) {
  const key = getKey();
  if (!key) throw new AIError('Add your OpenRouter key first.');
  const body = requestBody(prompt, maxTokens);
  if (plain) { delete body.response_format; delete body.reasoning; body.max_tokens = maxTokens + 2000; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin + location.pathname,
        'X-Title': 'Queue Crew',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AIError(e.name === 'AbortError' ? 'That took too long. Try again.' : 'No connection. Try again with signal.');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    // Some models refuse JSON mode or the thinking setting: ask once more without them.
    if (res.status === 400 && !plain && (body.response_format || body.reasoning)) return ask(prompt, maxTokens, true);
    const known = { 401: "That key didn't work. Check it and try again.", 402: 'Your OpenRouter account is out of credits.', 429: 'Too many requests. Wait a minute and try again.' };
    throw new AIError(known[res.status] || (data && data.error && data.error.message) || `Something went wrong (${res.status}).`);
  }
  const choice = data && data.choices && data.choices[0];
  const content = choice && choice.message ? choice.message.content : '';
  // Content is usually a string, but some providers send a list of parts.
  const text = Array.isArray(content) ? content.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('') : String(content || '');
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) {
    store.set('dev.lastReply', text.slice(0, 500));
    throw new AIError(choice && choice.finish_reason === 'length' ? 'The AI ran out of room. Try again.' : "The AI didn't send anything usable back. Try again.");
  }
  try { return JSON.parse(text.slice(s, e + 1)); } catch {
    store.set('dev.lastReply', text.slice(0, 500));
    throw new AIError(choice && choice.finish_reason === 'length' ? 'The AI ran out of room. Try again.' : "The AI's reply was broken. Try again.");
  }
}

// ---------- checks ----------
const BLOCKED = /\b(damn|hell|crap|sexy|sex|kiss|kissing|kill|killed|killing|murder|dead|blood|bloody|gun|guns|knife|beer|wine|vodka|drunk|drug|drugs|cigarette|smoke|weed|stupid|idiot|dumb|hate|naked|butt|poop|fart|pee|vomit|barf)\b/i;
function clean(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  if (!t || t.length > max) return null;
  if (!/^[A-Za-z0-9 ,.'!?&()\-:]+$/.test(t)) return null; // plain characters only (no emoji, no markup)
  if (BLOCKED.test(t)) return null;
  return t;
}
const key = (s) => normalize(s).replace(/ /g, '');
const LEVELS = { easy: 1, medium: 2, hard: 3 };

// ---------- generators ----------
// catIds: only these categories (one request). 'some': a few random categories. Default: all of them.
async function makeWords(progress, catIds = null) {
  const { groups } = aiContext();
  const usable = groups.filter((g) => g.id !== 'history');
  const byCat = {};
  usable.forEach((g) => { (byCat[g.cat] = byCat[g.cat] || []).push(g); });
  let cats = Object.entries(byCat);
  if (catIds === 'some') cats = shuffle(cats).slice(0, 3);
  else if (catIds) cats = cats.filter(([id]) => catIds.includes(id));
  cats = cats.map(([, gs]) => gs);
  const batches = [];
  for (let i = 0; i < cats.length; i += 5) batches.push(cats.slice(i, i + 5).flat());
  const added = [];
  const seen = new Set(aiContext().allWords.map(key)); // never repeat any word anywhere
  for (let b = 0; b < batches.length; b++) {
    progress(`Writing words (${b + 1} of ${batches.length})…`);
    const lines = batches[b].map((g) => `${g.id}: ${g.n} — already have: ${g.words.join(', ')}`).join('\n');
    const reply = await ask(`Add new words for guessing games like charades. For each group below, write 4 NEW items that clearly fit the group: one easy (young kids know it), two medium, one hard.
Each item is 1 to 4 words: a common thing, action, feeling or short phrase that fits the group. Storybook characters must be from old public-domain fairy tales or folklore.

Groups (id: name — items you must not repeat):
${lines}

Reply as {"words":[{"group":"farm","word":"water buffalo","level":"hard"}]}`, 4000);
    const ids = new Set(batches[b].map((g) => g.id));
    for (const it of (reply && Array.isArray(reply.words) ? reply.words : [])) {
      const w = clean(it && it.word, 30);
      const d = LEVELS[String(it && it.level).toLowerCase()];
      if (!w || !d || !ids.has(it.group) || w.split(' ').length > 4 || seen.has(key(w))) continue;
      seen.add(key(w));
      added.push([it.group, w, d]);
    }
  }
  return { words: added };
}

async function makeTaboo(progress) {
  if (aiContext().noCard.length < 10) {
    const more = await makeWords(progress, 'some');
    addExtras(more);
  }
  progress("Writing Don't Say It cards…");
  const { noCard } = aiContext();
  const pick = shuffle(noCard).slice(0, 30);
  const reply = await ask(`For a game like Taboo: for each word below, list the 4 words a player would most want to say as a clue. Those become the banned words.
Banned words are single common words (or two short words), and must not contain the word itself.
Words: ${pick.join(', ')}

Reply as {"cards":[{"word":"cow","banned":["milk","moo","farm","spots"]}]}`);
  const wanted = new Map(pick.map((w) => [key(w), w]));
  const taboo = {};
  for (const c of (reply && Array.isArray(reply.cards) ? reply.cards : [])) {
    const w = wanted.get(key(c && c.word || ''));
    if (!w || !Array.isArray(c.banned)) continue;
    const banned = [...new Set(c.banned.map((b) => clean(b, 20)).filter(Boolean))].filter((b) => !containsWord(b, w)).slice(0, 4);
    if (banned.length === 4) taboo[w] = banned;
  }
  return { taboo };
}

async function makeQuestions(progress) {
  progress('Writing Majority Rules questions…');
  const { questions } = aiContext();
  const reply = await ask(`Write 25 NEW questions for a game like Herd Mentality: everyone answers secretly and tries to match the most popular answer, so good questions have a few obvious, common answers.
Write full, natural sentences in one of these forms: "What's the best ...?", "Name something ...", "Name a ...", "Which ...?", "What ...?". Keep each under 60 characters. Questions end with "?" and "Name ..." prompts end with ".".

Existing questions (do not repeat or reword these):
${questions.join('\n')}

Reply as {"questions":["What's the best thing to pack for a picnic?"]}`);
  const seen = new Set(questions.map(key));
  const out = [];
  for (const q of (reply && Array.isArray(reply.questions) ? reply.questions : [])) {
    const t = clean(q, 70);
    if (!t || !/^[A-Z]/.test(t) || !/[?.]$/.test(t) || seen.has(key(t))) continue;
    seen.add(key(t));
    out.push(t);
  }
  return { questions: out };
}

async function makeScales(progress) {
  progress('Writing Spectrum scales…');
  const { spectrums } = aiContext();
  const reply = await ask(`Write 20 NEW scales for a game like Wavelength. Each scale is two opposite ends of one quality, like ["Cold","Hot"] or ["Bad pet","Great pet"]. A player names a thing that fits somewhere between the ends, so both ends must describe the same kind of thing. Each end is 1 to 4 words and starts with a capital letter.

Existing scales (do not repeat):
${spectrums.map((p) => p.join(' / ')).join('\n')}

Reply as {"scales":[["Quiet","Loud"]]}`);
  const seen = new Set(spectrums.map((p) => key(p.join('|'))));
  const out = [];
  for (const p of (reply && Array.isArray(reply.scales) ? reply.scales : [])) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const l = clean(p[0], 32), r = clean(p[1], 32);
    if (!l || !r || key(l) === key(r) || seen.has(key(`${l}|${r}`))) continue;
    seen.add(key(`${l}|${r}`));
    out.push([l, r]);
  }
  return { spectrums: out };
}

async function makeDoodle(progress) {
  progress('Writing doodle ideas…');
  const { doodle } = aiContext();
  const reply = await ask(`Add ideas for a drawing game. Prompts are built like "a [describing word] [thing] [doing something]", for example "a sleepy dragon on a skateboard".
Write 12 new describing words (one word each, like "sleepy" or "giant"), 15 new things that are easy to draw (animals, foods, objects or characters, 1 to 3 words), and 15 new "doing something" phrases (start with an -ing verb or a place, like "riding a bike" or "in a bathtub"; never use his, her or its).

Existing describing words: ${doodle.adj.join(', ')}
Existing things: ${doodle.noun.join(', ')}
Existing doing phrases: ${doodle.act.join(', ')}

Reply as {"describing":["wobbly"],"things":["penguin"],"doing":["riding a bike"]}`);
  const seen = new Set([...doodle.adj, ...doodle.noun, ...doodle.act].map(key)); // shared, so "sleepy" can't be a thing too
  const take = (list, have, max, test) => {
    const out = [];
    for (const v of (Array.isArray(list) ? list : [])) {
      const t = clean(v, max);
      if (!t || !test(t) || seen.has(key(t))) continue;
      seen.add(key(t));
      out.push(t.toLowerCase());
    }
    return out;
  };
  return {
    doodle: {
      adj: take(reply && reply.describing, doodle.adj, 14, (t) => /^[a-zA-Z-]+$/.test(t)),
      noun: take(reply && reply.things, doodle.noun, 24, (t) => t.split(' ').length <= 3),
      act: take(reply && reply.doing, doodle.act, 32, (t) => !/\b(his|her|its)\b/i.test(t)),
    },
  };
}

// Icons the AI may choose for a new deck (all are in js/core/icons.js).
const DECK_ICONS = ['paw', 'pizza', 'building-carousel', 'wand', 'briefcase', 'run', 'music', 'plant', 'car', 'fish', 'rocket',
  'tent', 'tree', 'flower', 'cake', 'cookie', 'ice-cream', 'dog', 'cat', 'bug', 'butterfly', 'dragon', 'robot', 'ghost', 'alien',
  'crown', 'sword', 'camera', 'book', 'palette', 'plane', 'bike', 'cloud', 'snowflake', 'flame', 'star', 'heart', 'gift', 'confetti',
  'puzzle', 'map-2', 'ball-football', 'ball-basketball', 'school', 'tools', 'hammer', 'leaf', 'lemon', 'apple', 'carrot', 'bread',
  'egg', 'meat', 'soup', 'cup', 'bottle', 'shirt', 'shoe', 'umbrella', 'backpack', 'balloon', 'ticket', 'microphone', 'headphones',
  'device-gamepad-2', 'world', 'mountain', 'christmas-tree', 'pumpkin-scary', 'bat', 'spider', 'horse-toy', 'train', 'bus', 'ship', 'tractor'];

async function makeDeck(progress) {
  progress('Inventing a new deck…');
  const { decks } = aiContext();
  const reply = await ask(`Invent a brand-new deck for a guessing game like Heads Up: one player holds the phone to their forehead and friends give clues for the word on it.
Pick a fun, specific theme that is not one of these existing decks: ${decks.join(', ')}.
Example themes: "Under the Sea", "Camping Trip", "At the Bakery", "Pirate Life", "Winter Fun".
Split it into 3 groups. Each group has 12 items: 4 easy, 5 medium and 3 hard. Items are 1 to 4 words and must be things players can act out or describe.
Choose the best icon for the deck from this list: ${DECK_ICONS.join(', ')}.

Reply as {"name":"Camping Trip","icon":"tent","groups":[{"name":"Camping Gear","singular":"piece of camping gear","easy":["tent"],"medium":["sleeping bag"],"hard":["compass"]}]}`, 3000);
  if (!reply || typeof reply !== 'object') throw new AIError("The AI didn't send a deck back. Try again.");
  let name = clean(reply.name || reply.title || reply.theme, 30);
  if (!name) throw new AIError("The AI's deck had no usable name. Try again.");
  if (decks.some((d) => key(d) === key(name))) name = `${name} 2`;
  const id = 'ai-' + key(name).slice(0, 16) + '-' + Date.now().toString(36);
  const seen = new Set(); // no repeats inside this deck (sharing words with other decks is fine)
  const groups = [];
  (Array.isArray(reply.groups) ? reply.groups : []).slice(0, 4).forEach((g, i) => {
    if (!g || typeof g !== 'object') return;
    const n = clean(g.name || g.title, 30) || `${name} ${i + 1}`;
    const grp = { id: `${id}-${i}`, n, s: clean(g.singular, 30) || n.toLowerCase(), e: [], m: [], h: [] };
    // Usually easy / medium / hard lists; a single "items" or "words" list is treated as medium.
    [['easy', 'e'], ['medium', 'm'], ['hard', 'h'], ['items', 'm'], ['words', 'm']].forEach(([from, to]) => {
      for (const v of (Array.isArray(g[from]) ? g[from] : [])) {
        const w = clean(typeof v === 'string' ? v : v && (v.word || v.item), 30);
        if (!w || w.split(' ').length > 4 || seen.has(key(w))) continue;
        seen.add(key(w));
        grp[to].push(w);
      }
    });
    if (grp.e.length + grp.m.length + grp.h.length >= 4) groups.push(grp);
  });
  const total = groups.reduce((t, g) => t + g.e.length + g.m.length + g.h.length, 0);
  if (total < 15) throw new AIError(`The AI's deck was too small (${total} words). Try again.`);
  const icon = DECK_ICONS.includes(reply.icon) ? reply.icon : 'sparkles';
  return { decks: [{ id, name, icon, groups }] };
}

// Make a new deck now, save it, and return its id (used by Forehead's "New deck" card).
export async function newDeck(progress = () => {}) {
  try {
    const part = await makeDeck(progress);
    addExtras(part);
    log(`New deck: ${part.decks[0].name}`);
    return part.decks[0];
  } catch (e) {
    log(`Deck failed: ${e.message}`);
    throw e;
  }
}

export const KINDS = [
  { id: 'all', label: 'Everything' },
  { id: 'deck', label: 'New Forehead deck' },
  { id: 'words', label: 'Words for all games' },
  { id: 'taboo', label: "Don't Say It cards" },
  { id: 'questions', label: 'Majority Rules questions' },
  { id: 'scales', label: 'Spectrum scales' },
  { id: 'doodle', label: 'Doodle Chain ideas' },
];
const RUN = { words: (p) => makeWords(p), taboo: makeTaboo, questions: makeQuestions, scales: makeScales, doodle: makeDoodle, deck: makeDeck };

// Runs the chosen generator(s), saves what passed the checks, and returns it.
export async function generate(kind, progress = () => {}) {
  const order = kind === 'all' ? ['words', 'taboo', 'questions', 'scales', 'doodle'] : [kind];
  const total = { decks: [], words: [], taboo: {}, questions: [], spectrums: [], doodle: { adj: [], noun: [], act: [] } };
  for (const k of order) {
    const part = await RUN[k](progress);
    addExtras(part);
    if (part.decks) { total.decks.push(...part.decks); part.decks.forEach((d) => log(`New deck: ${d.name}`)); }
    if (part.words) total.words.push(...part.words);
    if (part.taboo) Object.assign(total.taboo, part.taboo);
    if (part.questions) total.questions.push(...part.questions);
    if (part.spectrums) total.spectrums.push(...part.spectrums);
    if (part.doodle) ['adj', 'noun', 'act'].forEach((f) => total.doodle[f].push(...part.doodle[f]));
  }
  return total;
}

// ---------- Developer mode: never run out ----------
// Games report when they're close to repeating themselves; we quietly write more.
// One request per kind at a time, with a cooldown so it can't run up a bill in a loop.
const busy = new Set();
const nextAllowed = {};
const SUMMARY = (p) => [
  p.decks && p.decks.length ? `${p.decks.length} deck` : '',
  p.words && p.words.length ? `${p.words.length} words` : '',
  p.taboo && Object.keys(p.taboo).length ? `${Object.keys(p.taboo).length} cards` : '',
  p.questions && p.questions.length ? `${p.questions.length} questions` : '',
  p.spectrums && p.spectrums.length ? `${p.spectrums.length} scales` : '',
].filter(Boolean).join(', ');

export function log(msg) {
  const l = store.get('dev.log', []);
  l.unshift({ t: Date.now(), msg });
  store.set('dev.log', l.slice(0, 8));
}
export const getLog = () => store.get('dev.log', []);

async function refill(need) {
  if (!devOn() || busy.has(need) || Date.now() < (nextAllowed[need] || 0) || navigator.onLine === false) return;
  busy.add(need);
  try {
    let part;
    if (need.startsWith('deck:')) part = await makeWords(() => {}, [need.slice(5)]);
    else if (need === 'words') part = await makeWords(() => {}, 'some');
    else part = await RUN[need](() => {});
    addExtras(part);
    const sum = SUMMARY(part);
    if (sum) log(`Auto: ${sum}`);
    nextAllowed[need] = Date.now() + 60 * 1000;
  } catch (e) {
    log(`Auto failed: ${e.message}`);
    nextAllowed[need] = Date.now() + 5 * 60 * 1000;
  } finally {
    busy.delete(need);
  }
}

export function startAutoRefill() {
  onRunningLow((need) => { refill(need); });
}
