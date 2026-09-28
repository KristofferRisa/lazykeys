import { describe, expect, it } from 'vitest';
import { labelsFor } from '../src/core/labels';

function prefixFree(labels: string[]): boolean {
  for (const a of labels) for (const b of labels) if (a !== b && b.startsWith(a)) return false;
  return true;
}

describe('labelsFor', () => {
  it('gives one-key labels while they last', () => {
    expect(labelsFor(3, 'asdfghjkl')).toEqual(['a', 's', 'd']);
    expect(labelsFor(9, 'asdfghjkl')).toEqual(Array.from('asdfghjkl'));
  });

  it('spends as few characters on prefixes as it can', () => {
    // 14 targets, 9 characters: one prefix frees 9 two-key labels, so 8 stay single.
    const labels = labelsFor(14, 'asdfghjkl');
    expect(labels).toHaveLength(14);
    expect(labels.filter((l) => l.length === 1)).toHaveLength(8);
    expect(labels.slice(8)).toEqual(['la', 'ls', 'ld', 'lf', 'lg', 'lh']);
  });

  it('is prefix-free, unique and shortest first for every size', () => {
    for (const alphabet of ['asdfghjkl', 'ab', 'abc', 'jkl;']) {
      for (let n = 1; n <= 200; n++) {
        const labels = labelsFor(n, alphabet);
        expect(labels).toHaveLength(n);
        expect(new Set(labels).size).toBe(n);
        expect(prefixFree(labels)).toBe(true);
        for (let i = 1; i < labels.length; i++) {
          expect(labels[i]!.length).toBeGreaterThanOrEqual(labels[i - 1]!.length);
        }
        for (const l of labels) for (const c of l) expect(alphabet).toContain(c);
      }
    }
  });

  it('falls back to fixed width past two keys', () => {
    const labels = labelsFor(100, 'asdfghjkl');
    expect(new Set(labels.map((l) => l.length))).toEqual(new Set([3]));
  });

  it('ignores whitespace and repeated characters', () => {
    expect(labelsFor(3, 'a s  s d')).toEqual(['a', 's', 'd']);
  });

  it('refuses an alphabet that cannot form labels', () => {
    expect(() => labelsFor(3, 'aaa')).toThrow();
  });

  it('returns nothing for nothing', () => {
    expect(labelsFor(0, 'asdf')).toEqual([]);
  });
});
