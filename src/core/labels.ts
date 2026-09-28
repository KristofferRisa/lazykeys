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
export function labelsFor(n: number, alphabet: string): string[] {
  const chars = Array.from(new Set(Array.from(alphabet.replace(/\s/g, ''))));
  const base = chars.length;
  if (base < 2) throw new Error('lazykeys: a hint alphabet needs at least two distinct characters');
  const out: string[] = [];
  if (n <= 0) return out;

  const prefixes = Math.max(0, Math.ceil((n - base) / (base - 1)));

  if (prefixes <= base) {
    const singles = base - prefixes;
    for (let i = 0; i < singles && out.length < n; i++) out.push(chars[i] as string);
    for (let p = singles; p < base && out.length < n; p++) {
      for (let q = 0; q < base && out.length < n; q++) out.push((chars[p] as string) + (chars[q] as string));
    }
    return out;
  }

  let len = 2;
  while (Math.pow(base, len) < n) len++;
  for (let i = 0; i < n; i++) {
    let label = '';
    let x = i;
    for (let d = 0; d < len; d++) {
      label = (chars[x % base] as string) + label;
      x = Math.floor(x / base);
    }
    out.push(label);
  }
  return out;
}
