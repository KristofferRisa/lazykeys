import { describe, expect, it } from 'vitest';
import { buildTree, createLazyKeys, explorer, memoryAdapter, type SidebarRow } from '../src/index';

type Node = ReturnType<typeof buildTree>;
const labels = (node: Node): string[] => (node.children ?? []).map((c) => c.label);
const lk = () => createLazyKeys({ storage: memoryAdapter(), enabled: false });

async function rows(options: Parameters<typeof explorer>[0]): Promise<SidebarRow[]> {
  const k = lk();
  try {
    return (await explorer(options).rows({ lk: k, t: k.t }))[0]!.children!;
  } finally {
    k.destroy();
  }
}

describe('buildTree', () => {
  it('folds paths into folders, folders first, a section’s own page first', () => {
    const root = buildTree(
      [{ path: '/blog/b/' }, { path: '/blog/' }, { path: '/blog/a/' }, { path: '/about/' }, { path: '/' }],
      { current: () => '/blog/a/' },
    );
    expect(labels(root)).toEqual(['blog/', 'index', 'about']);
    const blog = root.children![0]!;
    expect(labels(blog)).toEqual(['index', 'a', 'b']);
    expect(blog.open).toBe(true);
  });

  it('keeps pages that differ only by query string apart, and names them by it', () => {
    const root = buildTree([{ path: '/repo?slug=a' }, { path: '/repo?slug=b' }, { path: '/repo' }, { path: '/repo?slug=a#top' }], {
      current: () => '/',
    });
    expect(labels(root)).toEqual(['repo', 'repo?slug=a', 'repo?slug=b']);
    expect(root.children!.map((c) => c.path)).toEqual(['/repo', '/repo?slug=a', '/repo?slug=b']);
  });

  it('takes an explicit label per entry', () => {
    const root = buildTree(
      [
        { path: '/repo?slug=a', label: 'Alpha' },
        { path: '/repo?slug=b', label: 'Beta', title: 'the second' },
      ],
      { current: () => '/' },
    );
    expect(labels(root)).toEqual(['Alpha', 'Beta']);
    expect(root.children![1]!.hint).toBe('the second');
  });
});

describe('explorer()', () => {
  it('marks the exact page, query string included, as current', async () => {
    const list = await rows({
      load: () => [{ path: '/repo?slug=a' }, { path: '/repo?slug=b' }],
      current: () => '/repo?slug=b',
    });
    expect(list.map((r) => [r.label, !!r.current, r.href])).toEqual([
      ['repo?slug=a', false, '/repo?slug=a'],
      ['repo?slug=b', true, '/repo?slug=b'],
    ]);
  });

  it('falls back to the bare path for a query string it does not list (?q=, ?utm_…)', async () => {
    const list = await rows({ load: () => [{ path: '/search/' }, { path: '/about/' }], current: () => '/search/?q=vim' });
    expect(list.map((r) => r.label)).toEqual(['about', 'search']);
    expect(list.find((r) => r.label === 'search')?.current).toBe(true);
  });

  it('adds the page it is on when the list does not have it', async () => {
    const list = await rows({ load: () => [{ path: '/about/' }], current: () => '/hidden?x=1' });
    expect(list.find((r) => r.current)?.label).toBe('hidden?x=1');
  });
});
