import { describe, expect, it } from 'vitest';
import { fold, fuzzyFilter, fuzzyMatch } from '../src/index';

describe('fold', () => {
  it('lower-cases and drops diacritics, one unit per unit', () => {
    expect(fold('Åpen Café Ærø Straße')).toBe('apen cafe aro strase');
    for (const text of ['Ærø', 'naïve', 'İstanbul']) expect(fold(text).length).toBe(text.length);
  });
});

describe('fuzzyMatch', () => {
  it('matches characters in order and says where', () => {
    expect(fuzzyMatch('opg', 'Oppgaver')?.positions).toEqual([0, 1, 3]);
    expect(fuzzyMatch('gpo', 'Oppgaver')).toBeNull();
    expect(fuzzyMatch('xyz', 'Oppgaver')).toBeNull();
  });

  it('ignores case, whitespace in the query and diacritics', () => {
    expect(fuzzyMatch('ape', 'Åpen')).not.toBeNull();
    expect(fuzzyMatch('cafe', 'Café')).not.toBeNull();
    expect(fuzzyMatch('set  sc', 'set scroll=90')).not.toBeNull();
  });

  it('matches everything on an empty query, with no positions', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, positions: [] });
  });

  it('ranks a start over a word start over scattered letters', () => {
    const start = fuzzyMatch('rep', 'Repos')!.score;
    const word = fuzzyMatch('rep', 'Go to repo')!.score;
    const scattered = fuzzyMatch('rep', 'rarely extra pipes');
    expect(start).toBeGreaterThan(word);
    expect(scattered === null || scattered.score < word).toBe(true);
  });

  it('counts camelCase humps as word starts', () => {
    // The same gap is kept on humps and dropped as noise elsewhere.
    expect(fuzzyMatch('lk', 'createLazyKeys')?.positions).toEqual([6, 10]);
    expect(fuzzyMatch('lk', 'allowkey')).toBeNull();
  });

  it('finds the best start, not the first', () => {
    expect(fuzzyMatch('por', 'copy of portal')?.positions).toEqual([8, 9, 10]);
  });

  it('drops letters strewn across the text', () => {
    expect(fuzzyMatch('repo', 'Tasks with high priority')).toBeNull();
  });
});

describe('fuzzyFilter', () => {
  const items = [
    { label: 'Settings', keywords: ['options', 'preferences'] },
    { label: 'Search the site' },
    { label: 'Sitemap', keywords: ['all pages'] },
  ];

  it('keeps every item, in order, for an empty query', () => {
    expect(fuzzyFilter('  ', items, (i) => i.label).map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('orders by score and keeps the original index', () => {
    const ranked = fuzzyFilter('site', items, (i) => i.label, (i) => i.keywords ?? []);
    expect(ranked[0]?.item.label).toBe('Sitemap');
    expect(ranked.map((r) => r.index)).toContain(1);
  });

  it('matches keywords as plain text only, without label highlights', () => {
    const ranked = fuzzyFilter('prefer', items, (i) => i.label, (i) => i.keywords ?? []);
    expect(ranked.map((r) => r.item.label)).toEqual(['Settings']);
    expect(ranked[0]?.match.positions).toEqual([]);
    expect(fuzzyFilter('opns', items, (i) => i.label, (i) => i.keywords ?? [])).toEqual([]);
  });
});
