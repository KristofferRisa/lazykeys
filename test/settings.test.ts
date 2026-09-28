import { afterEach, describe, expect, it, vi } from 'vitest';
import { Settings, localStorageAdapter, memoryAdapter, type StorageAdapter } from '../src/core/settings';

const rows = [
  { key: 'scroll', option: 'scroll', type: 'number' as const, default: 72, min: 8, max: 400 },
  { key: 'hlsearch', option: 'hlsearch', type: 'boolean' as const, default: true },
  { key: 'side', option: 'sidebar', type: 'enum' as const, values: ['right', 'left'], default: 'right' },
  { key: 'chars', type: 'string' as const, default: 'asdf' },
];

describe('Settings', () => {
  afterEach(() => localStorage.clear());

  it('reads defaults and finds rows by key or option', () => {
    const s = new Settings(memoryAdapter());
    s.define(rows);
    expect(s.get('scroll')).toBe(72);
    expect(s.row('sidebar')?.key).toBe('side');
    expect(s.row('side')?.option).toBe('sidebar');
    expect(s.get('missing')).toBeUndefined();
  });

  it('coerces stored values through the row', () => {
    const s = new Settings(memoryAdapter({ scroll: 'nope', side: 'middle', chars: '', hlsearch: 'false' } as never));
    s.define(rows);
    expect(s.get('scroll')).toBe(72);
    expect(s.get('side')).toBe('right');
    expect(s.get('chars')).toBe('asdf');
    expect(s.get('hlsearch')).toBe(false);
    s.set('scroll', 5);
    expect(s.get('scroll')).toBe(8);
  });

  it('does not write defaults', () => {
    const adapter = memoryAdapter();
    const spy = vi.spyOn(adapter, 'set');
    const s = new Settings(adapter);
    s.define(rows);
    s.set('scroll', 100);
    s.set('scroll', 72);
    expect(spy.mock.calls).toEqual([
      ['scroll', 100],
      ['scroll', undefined],
    ]);
  });

  it('lets a consumer override defaults', () => {
    const s = new Settings(memoryAdapter(), { scroll: 120, side: 'left' });
    s.define(rows);
    expect(s.get('scroll')).toBe(120);
    expect(s.get('side')).toBe('left');
  });

  it('notifies on change only', () => {
    const s = new Settings(memoryAdapter());
    s.define(rows);
    const seen: Array<[string | null, unknown]> = [];
    const off = s.on((k, v) => seen.push([k, v]));
    s.set('scroll', 100);
    s.set('scroll', 100);
    s.toggle('hlsearch');
    off();
    s.set('scroll', 50);
    expect(seen).toEqual([
      ['scroll', 100],
      ['hlsearch', false],
    ]);
  });

  it('toggles only booleans', () => {
    const s = new Settings(memoryAdapter());
    s.define(rows);
    expect(s.toggle('scroll')).toBeUndefined();
    expect(s.toggle('hlsearch')).toBe(false);
  });

  it('validates what people type', () => {
    const s = new Settings(memoryAdapter());
    s.define(rows);
    expect(s.validate(s.row('scroll')!, '12x')).toEqual({ ok: false, error: 'number' });
    expect(s.validate(s.row('scroll')!, '999')).toEqual({ ok: true, value: 400 });
    expect(s.validate(s.row('side')!, 'up')).toEqual({ ok: false, error: 'enum' });
  });

  it('resets every row', () => {
    const s = new Settings(memoryAdapter());
    s.define(rows);
    s.set('scroll', 100);
    const seen: Array<string | null> = [];
    s.on((k) => seen.push(k));
    s.reset();
    expect(s.get('scroll')).toBe(72);
    expect(seen).toEqual([null]);
  });

  it('a row defined twice is replaced, and undo removes it', () => {
    const s = new Settings(memoryAdapter());
    s.define(rows);
    const undo = s.define([{ key: 'scroll', type: 'number', default: 10 }]);
    expect(s.get('scroll')).toBe(10);
    expect(s.schema().filter((r) => r.key === 'scroll')).toHaveLength(1);
    undo();
    expect(s.row('scroll')).toBeNull();
  });

  it('survives an adapter that throws', () => {
    const broken: StorageAdapter = {
      get() {
        throw new Error('nope');
      },
      set() {
        throw new Error('nope');
      },
    };
    const s = new Settings(broken);
    s.define(rows);
    expect(s.get('scroll')).toBe(72);
    expect(() => s.set('scroll', 100)).not.toThrow();
  });
});

describe('localStorageAdapter', () => {
  afterEach(() => localStorage.clear());

  it('keeps everything under one namespaced key', () => {
    const s = new Settings(localStorageAdapter('myapp'));
    s.define(rows);
    s.set('scroll', 100);
    s.set('hlsearch', false);
    expect(JSON.parse(localStorage.getItem('myapp:settings')!)).toEqual({ scroll: 100, hlsearch: false });
    s.set('scroll', 72);
    s.set('hlsearch', true);
    expect(localStorage.getItem('myapp:settings')).toBeNull();
  });

  it('reads what another instance wrote', () => {
    localStorage.setItem('lazykeys:settings', JSON.stringify({ scroll: 144 }));
    const s = new Settings(localStorageAdapter());
    s.define(rows);
    expect(s.get('scroll')).toBe(144);
  });

  it('shrugs off corrupt JSON', () => {
    localStorage.setItem('lazykeys:settings', '{nope');
    const s = new Settings(localStorageAdapter());
    s.define(rows);
    expect(s.get('scroll')).toBe(72);
    s.set('scroll', 90);
    expect(s.get('scroll')).toBe(90);
  });

  it('shrugs off a storage that throws (private mode)', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const s = new Settings(localStorageAdapter());
      s.define(rows);
      expect(s.get('scroll')).toBe(72);
      expect(() => s.set('scroll', 100)).not.toThrow();
      // Kept in memory for the page.
      expect(s.get('scroll')).toBe(100);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('hears other tabs', () => {
    const s = new Settings(localStorageAdapter());
    s.define(rows);
    const seen: Array<string | null> = [];
    s.on((k) => seen.push(k));
    localStorage.setItem('lazykeys:settings', JSON.stringify({ scroll: 200 }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'lazykeys:settings' }));
    expect(seen).toEqual([null]);
    expect(s.get('scroll')).toBe(200);
    s.destroy();
  });
});
