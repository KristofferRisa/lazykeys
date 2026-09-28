import { describe, expect, it } from 'vitest';
import { ExRegistry, parseLine } from '../src/core/ex';

function registry() {
  const ex = new ExRegistry();
  const run = () => {};
  ex.add({ name: 'set', desc: 'set', run, complete: () => [{ value: 'scroll' }, { value: 'statusline' }] });
  ex.add({ name: 'settings', run });
  ex.add({ name: 'nohlsearch', alias: ['noh', 'nohl'], run });
  ex.add({ name: 'colorscheme', alias: ['colo'], run });
  ex.add({ name: 'quit', alias: ['q', 'q!'], run });
  ex.add({ name: 'Lazy', run });
  ex.add({ name: 'secret', hidden: true, run });
  return ex;
}

describe('ExRegistry', () => {
  it('resolves exact names first', () => {
    // 'set' is also a prefix of 'settings'; exact wins.
    expect(registry().resolve('set')?.name).toBe('set');
  });

  it('then aliases', () => {
    const ex = registry();
    expect(ex.resolve('noh')?.name).toBe('nohlsearch');
    expect(ex.resolve('q')?.name).toBe('quit');
  });

  it('then a unique prefix', () => {
    const ex = registry();
    expect(ex.resolve('nohlse')?.name).toBe('nohlsearch');
    expect(ex.resolve('color')?.name).toBe('colorscheme');
    expect(ex.resolve('sett')?.name).toBe('settings');
  });

  it('refuses an ambiguous prefix', () => {
    expect(registry().resolve('se')).toBeNull();
  });

  it('folds case only as a last resort', () => {
    const ex = registry();
    expect(ex.resolve('lazy')?.name).toBe('Lazy');
    expect(ex.resolve('nope')).toBeNull();
  });

  it('handles a bang as an alias, else as a flag', () => {
    const ex = registry();
    expect(ex.resolveLine(parseLine('q!')!)).toMatchObject({ bang: true });
    expect(ex.resolveLine(parseLine('q!')!)?.command.name).toBe('quit');
    const hit = ex.resolveLine(parseLine('colo! x')!);
    expect(hit?.command.name).toBe('colorscheme');
    expect(hit?.bang).toBe(true);
  });

  it('parses lines', () => {
    expect(parseLine(':set  scroll=100 nohlsearch')).toEqual({
      name: 'set',
      argv: ['scroll=100', 'nohlsearch'],
      bang: false,
      line: 'set  scroll=100 nohlsearch',
    });
    expect(parseLine('   ')).toBeNull();
  });

  it('completes names, skipping hidden commands', () => {
    const rows = registry().completions('se');
    expect(rows.map((r) => r.value)).toEqual(['set', 'settings']);
    expect(rows[0]).toMatchObject({ label: ':set', hint: 'set' });
    expect(registry().completions('sec')).toEqual([]);
  });

  it('completes arguments through the command', () => {
    const rows = registry().completions('set st');
    expect(rows).toEqual([{ value: 'set statusline', label: 'statusline' }]);
  });

  it('later registrations win, and removing restores', () => {
    const ex = registry();
    const off = ex.add({ name: 'Lazy', desc: 'mine', run: () => {} });
    expect(ex.get('Lazy')?.desc).toBe('mine');
    expect(ex.list().filter((c) => c.name === 'Lazy')).toHaveLength(1);
    off();
    expect(ex.get('Lazy')?.desc).toBeUndefined();
  });
});
