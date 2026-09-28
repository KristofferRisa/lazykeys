/**
 * Hint labels: variable length, shortest first.
 *
 * With 9 characters and 14 links, 8 links get a one-key label and only the
 * rest need two. Padding every label to a fixed width would cost a keystroke
 * on every link on the page.
 *
 * No label may be a prefix of another, or typing it could never resolve — so
 * the characters that become two-key prefixes stop being labels of their own.
 * Past what two keys can address (81 targets with a 9-letter alphabet) it
 * falls back to fixed-width labels, which cannot collide by construction.
 */
export declare function labelsFor(n: number, alphabet: string): string[];
