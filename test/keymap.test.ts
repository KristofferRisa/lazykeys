import { describe, expect, it } from 'vitest';
import { Keymap, defaultSection } from '../src/core/keymap';

const noop = () => {};

describe('Keymap', () => {
  it('derives prefixes from the bindings', () => {
    const km = new Keymap();
    km.set('g g', noop);
    km.set('<leader> f f', noop);
    km.set('j', noop);
    expect(km.isPrefix('g')).toBe(true);
    expect(km.isPrefix('<leader>')).toBe(true);
    expect(km.isPrefix('<leader> f')).toBe(true);
    expect(km.isPrefix('<leader> f f')).toBe(false);
    expect(km.isPrefix('j')).toBe(false);
  });

  it('re-derives prefixes when bindings change', () => {
    const km = new Keymap();
    const off = km.set('z z', noop);
    expect(km.isPrefix('z')).toBe(true);
    off();
    expect(km.isPrefix('z')).toBe(false);
  });

  it('normalises sequences on the way in', () => {
    const km = new Keymap();
    km.set('<C-d>', noop);
    expect(km.get('C-d')).toBeDefined();
    expect(km.get('<C-d>')).toBeDefined();
  });

  it('builds which-key rows with +groups', () => {
    const km = new Keymap();
    km.set('<leader> e', { desc: 'Explorer', run: noop });
    km.set('<leader> f f', { desc: 'Find file', run: noop });
    km.set('<leader> f r', { desc: 'Recent', run: noop });
    km.set('<leader> x', { hidden: true, run: noop });
    km.group('<leader> f', '+file/find');
    const rows = km.children('<leader>');
    expect(rows).toEqual([
      { token: 'e', display: 'e', label: 'Explorer', group: false },
      { token: 'f', display: 'f', label: '+file/find', group: true },
    ]);
    expect(km.children('<leader> f').map((r) => r.label)).toEqual(['Find file', 'Recent']);
  });

  it('falls back to the token as a group name', () => {
    const km = new Keymap();
    km.set('z a', { desc: 'a', run: noop });
    expect(km.children('')).toEqual([{ token: 'z', display: 'z', label: '+z', group: true }]);
  });

  it('shows one row for bindings that take an argument', () => {
    const km = new Keymap();
    km.set('m', { desc: 'Set a mark', arg: '{a-z}', run: noop });
    expect(km.children('m')).toEqual([{ token: '', display: '{a-z}', label: 'Set a mark', group: false }]);
  });

  it('stacks overrides, and removing one restores the original', () => {
    const km = new Keymap();
    km.set('r', { desc: 'original', run: noop });
    const off = km.set('r', { desc: 'override', run: noop });
    expect(km.get('r')?.desc).toBe('override');
    off();
    expect(km.get('r')?.desc).toBe('original');
  });

  it('unmaps with false', () => {
    const km = new Keymap();
    km.set('r', noop);
    const off = km.set('r', false);
    expect(km.get('r')).toBeUndefined();
    expect(km.list()).toHaveLength(0);
    off();
    expect(km.get('r')).toBeDefined();
  });

  it('applies a whole table, strings as groups, and undoes it', () => {
    const km = new Keymap();
    const undo = km.apply({ '<leader> g': '+git', '<leader> g g': { desc: 'Repo', run: noop }, j: noop }, 'site');
    expect(km.groupLabel('<leader> g')).toBe('git');
    expect(km.get('<leader> g g')?.plugin).toBe('site');
    expect(km.list()).toHaveLength(2);
    undo();
    expect(km.list()).toHaveLength(0);
    expect(km.groupLabel('<leader> g')).toBeUndefined();
  });

  it('derives :help sections for leader bindings', () => {
    const km = new Keymap();
    km.group('<leader> u', 'ui');
    km.set('<leader> u z', noop);
    km.set('<leader> e', noop);
    km.set('j', { section: 'Motion', run: noop });
    expect(defaultSection(km.get('<leader> u z')!, km, 'Leader')).toBe('Leader · ui');
    expect(defaultSection(km.get('<leader> e')!, km, 'Leader')).toBe('Leader');
    expect(defaultSection(km.get('j')!, km, 'Leader')).toBe('Motion');
  });

  it('rejects bindings without a run()', () => {
    const km = new Keymap();
    expect(() => km.set('j', {} as never)).toThrow();
  });
});
