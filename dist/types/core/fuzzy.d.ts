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
/**
 * Lower case, diacritics dropped, one output unit per input unit — so
 * positions found in the folded text point at the same place in the original.
 */
export declare function fold(text: string): string;
/**
 * Score `text` against `query`; null when it does not match. Whitespace in the
 * query is ignored. An empty query matches everything with score 0.
 *
 * Every occurrence of the first query character is tried as a start, with a
 * greedy run from there; the best run wins. That is quadratic in the worst
 * case and plenty for picker-sized lists and labels.
 */
export declare function fuzzyMatch(query: string, text: string): FuzzyMatch | null;
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
export declare function fuzzyFilter<T>(query: string, items: readonly T[], label: (item: T) => string, keywords?: (item: T) => readonly string[]): Ranked<T>[];
