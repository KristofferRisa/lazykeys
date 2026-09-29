/**
 * The pickers' fuzzy matcher. Every query character must appear in the text,
 * in order. Adjacent runs, word starts and a match at the very start score
 * higher; skipped characters inside the match cost. Case and diacritics are
 * ignored, so `ape` finds `Åpen` and `cafe` finds `Café`.
 */

export interface FuzzyMatch {
  score: number;
  /** Indexes into the original text (UTF-16 code units), for highlighting. */
  positions: number[];
}

/** Letters NFD does not take apart, folded to their base letter. */
const FOLD: Record<string, string> = { æ: 'a', ø: 'o', œ: 'o', ß: 's', đ: 'd', ł: 'l', ı: 'i', þ: 't', ð: 'd' };

/**
 * Lower case, diacritics dropped, one output unit per input unit — so
 * positions found in the folded text point at the same place in the original.
 */
export function fold(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const unit = text.charAt(i);
    const lower = unit.toLowerCase();
    // Lower-casing can change length (İ → i̇); keep one unit either way.
    const one = lower.length === 1 ? lower : unit;
    out += FOLD[one] ?? one.normalize('NFD').charAt(0);
  }
  return out;
}

const BOUNDARY = /[\s\-_./\\:·,;()[\]{}'"]/u;

function isBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const before = text.charAt(index - 1);
  if (BOUNDARY.test(before)) return true;
  // camelCase and PascalCase humps.
  const here = text.charAt(index);
  return before === before.toLowerCase() && here !== here.toLowerCase() && here === here.toUpperCase();
}

/**
 * Score `text` against `query`; null when it does not match. Whitespace in the
 * query is ignored. An empty query matches everything with score 0.
 *
 * Every occurrence of the first query character is tried as a start, with a
 * greedy run from there; the best run wins. That is quadratic in the worst
 * case and plenty for picker-sized lists and labels.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = fold(query.replace(/\s+/gu, ''));
  if (!q) return { score: 0, positions: [] };
  const t = fold(text);
  if (q.length > t.length) return null;

  let best: FuzzyMatch | null = null;
  const head = q.charAt(0);
  for (let start = t.indexOf(head); start !== -1; start = t.indexOf(head, start + 1)) {
    const positions: number[] = [];
    let score = 0;
    let ti = start;
    let prev = -2;
    for (let qi = 0; qi < q.length; qi++) {
      const qc = q.charAt(qi);
      while (ti < t.length && t.charAt(ti) !== qc) ti++;
      if (ti >= t.length) break;
      score += 1;
      if (ti === prev + 1) score += 8;
      if (isBoundary(text, ti)) score += 6;
      positions.push(ti);
      prev = ti;
      ti++;
    }
    // A later start has less text left, so it cannot finish either.
    if (positions.length !== q.length) break;
    const first = positions[0] ?? 0;
    const gaps = (positions[positions.length - 1] ?? 0) - first - (q.length - 1);
    score -= gaps + first * 0.3 + t.length * 0.05;
    if (first === 0) score += 4;
    if (!best || score > best.score) best = { score, positions };
  }
  // Characters strewn across the text are noise, not a match.
  return best && best.score >= q.length ? best : null;
}

export interface Ranked<T> {
  item: T;
  index: number;
  match: FuzzyMatch;
}

/**
 * Filter and order `items` by `query`. The label is matched fuzzily;
 * `keywords` only as plain substrings (a fuzzy hit somewhere in a long
 * description means nothing) and score like a weak label hit, without label
 * highlights. Ties keep the original order; an empty query returns every item
 * in order.
 */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  label: (item: T) => string,
  keywords: (item: T) => readonly string[] = () => [],
): Ranked<T>[] {
  const q = fold(query.trim().replace(/\s+/gu, ' '));
  const out: Ranked<T>[] = [];
  items.forEach((item, index) => {
    if (!q) {
      out.push({ item, index, match: { score: 0, positions: [] } });
      return;
    }
    let match = fuzzyMatch(query, label(item));
    for (const text of keywords(item)) {
      const t = fold(text);
      const at = t.indexOf(q);
      if (at === -1) continue;
      const score = isBoundary(text, at) ? 6 : 3;
      if (!match || match.score < score) match = { score, positions: [] };
    }
    if (match) out.push({ item, index, match });
  });
  if (q) out.sort((a, b) => b.match.score - a.match.score || a.index - b.index);
  return out;
}
