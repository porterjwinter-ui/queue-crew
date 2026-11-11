// Text matching used by Jinx (cancel matching clues) and Majority Rules (group answers).

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stem(w) {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && /(ches|shes|xes|sses|zes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  return s;
}

const stemAll = (s) => normalize(s).split(' ').filter(Boolean).map(stem).join(' ');

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// True when two answers count as "the same" (plural, spelling slip, same word family).
export function sameAnswer(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = stemAll(a), sb = stemAll(b);
  if (sa === sb) return true;
  const ca = sa.replace(/ /g, ''), cb = sb.replace(/ /g, '');
  if (ca === cb) return true;
  const longer = Math.max(ca.length, cb.length);
  if (longer >= 5 && lev(ca, cb) <= 1) return true;
  if (longer >= 8 && lev(ca, cb) <= 2) return true;
  // Same family: "Japan" / "Japanese", "bake" / "baker"
  if (Math.min(ca.length, cb.length) >= 5 && (ca.startsWith(cb) || cb.startsWith(ca)) && Math.abs(ca.length - cb.length) <= 3) return true;
  return false;
}

// A clue is invalid in Jinx if it contains (a form of) the mystery word.
export function containsWord(clue, word) {
  const c = stemAll(clue).replace(/ /g, '');
  const parts = stemAll(word).split(' ').filter(p => p.length >= 3);
  if (!c) return false;
  return parts.some(p => c.includes(p) || (c.length >= 4 && p.includes(c)));
}

// Group answers into clusters of "same" answers.
export function groupAnswers(entries) {
  // entries: [{name, text}]
  const groups = [];
  for (const e of entries) {
    const g = groups.find(gr => gr.items.some(it => sameAnswer(it.text, e.text)));
    if (g) g.items.push(e); else groups.push({ items: [e] });
  }
  return groups;
}

export function titleCase(s) {
  return String(s).replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
