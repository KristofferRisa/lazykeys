/**
 * The settings are one schema.
 *
 * `:set`, the sidebar's settings source and every plugin's own `get()` read
 * the same rows. Adding a switch is one row. Where the values live is the
 * storage adapter's business: namespaced localStorage by default, or whatever
 * store the site already has.
 */

export type SettingType = 'boolean' | 'number' | 'enum' | 'string';
export type SettingValue = boolean | number | string;

export interface SettingSpec {
  /** The storage key, and the name plugins read it by. */
  key: string;
  /** The name `:set` knows it by. Omit to keep it out of `:set`. */
  option?: string;
  type: SettingType;
  default: SettingValue;
  /** For `enum`. */
  values?: string[];
  /** For `number`. */
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  help?: string;
  /** Heading in the sidebar's settings source. */
  group?: string;
  /** This row only bites while that boolean row is on (drawn dimmed otherwise). */
  requires?: string;
  /** Kept out of the sidebar's settings source. */
  hidden?: boolean;
}

/**
 * Where values are kept. Values handed to `set` are already coerced; `undefined`
 * means "back to the default" and should remove the stored value.
 */
export interface StorageAdapter {
  get(key: string): unknown;
  set(key: string, value: SettingValue | undefined): void;
  /** Report changes made elsewhere (another tab, another widget). `null` = anything. */
  subscribe?(fn: (key: string | null) => void): () => void;
}

export type SettingsListener = (key: string | null, value: SettingValue | undefined) => void;

function safeLocal(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The default adapter: one JSON object under `<namespace>:settings` in
 * localStorage, so a reset is one removeItem. Every access is wrapped: private
 * mode and blocked storage degrade to "remembered for this page".
 */
export function localStorageAdapter(namespace = 'lazykeys'): StorageAdapter {
  const KEY = `${namespace}:settings`;
  let cache: Record<string, unknown> | null = null;

  function read(): Record<string, unknown> {
    if (cache) return cache;
    let parsed: unknown = null;
    try {
      const raw = safeLocal()?.getItem(KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    return cache;
  }

  return {
    get: (key) => read()[key],
    set(key, value) {
      const store = { ...read() };
      if (value === undefined) delete store[key];
      else store[key] = value;
      cache = store;
      try {
        const ls = safeLocal();
        if (!ls) return;
        if (Object.keys(store).length) ls.setItem(KEY, JSON.stringify(store));
        else ls.removeItem(KEY);
      } catch {
        /* private mode: kept in memory for this page */
      }
    },
    subscribe(fn) {
      if (typeof window === 'undefined') return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key !== KEY && e.key !== null) return;
        cache = null;
        fn(null);
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

/** Keeps values for the life of the page. Handy for tests and for "don't remember". */
export function memoryAdapter(initial: Record<string, SettingValue> = {}): StorageAdapter {
  const store = new Map<string, SettingValue>(Object.entries(initial));
  return {
    get: (key) => store.get(key),
    set(key, value) {
      if (value === undefined) store.delete(key);
      else store.set(key, value);
    },
  };
}

export interface Validation {
  ok: boolean;
  value?: SettingValue;
  /** 'number' | 'enum' — what was wrong, for the caller's message. */
  error?: 'number' | 'enum' | 'empty';
}

const TRUE = new Set(['true', '1', 'on', 'yes']);
const FALSE = new Set(['false', '0', 'off', 'no']);

export class Settings {
  private rows: SettingSpec[] = [];
  private byKey = new Map<string, SettingSpec>();
  private byOption = new Map<string, SettingSpec>();
  private listeners = new Set<SettingsListener>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly overrides: Record<string, SettingValue> = {},
  ) {
    if (adapter.subscribe) {
      this.unsubscribe = adapter.subscribe((key) => this.emit(key, key === null ? undefined : this.get(key)));
    }
  }

  /** Add rows. A row whose key exists replaces it. Returns the undo. */
  define(specs: SettingSpec[]): () => void {
    const added: SettingSpec[] = [];
    for (const spec of specs) {
      const row: SettingSpec = { ...spec };
      if (Object.prototype.hasOwnProperty.call(this.overrides, row.key)) {
        row.default = this.coerce(row, this.overrides[row.key]);
      }
      const existing = this.byKey.get(row.key);
      if (existing) this.rows = this.rows.filter((r) => r !== existing);
      this.rows.push(row);
      added.push(row);
    }
    this.reindex();
    return () => {
      this.rows = this.rows.filter((r) => !added.includes(r));
      this.reindex();
    };
  }

  private reindex(): void {
    this.byKey.clear();
    this.byOption.clear();
    for (const row of this.rows) {
      this.byKey.set(row.key, row);
      if (row.option) this.byOption.set(row.option, row);
    }
  }

  schema(): SettingSpec[] {
    return this.rows.slice();
  }

  /** A row by its key, or by its `:set` option name. */
  row(name: string): SettingSpec | null {
    return this.byKey.get(name) ?? this.byOption.get(name) ?? null;
  }

  /**
   * A stored value is only trusted as far as its own row allows: anything out
   * of range falls back to the default rather than reaching a feature.
   */
  coerce(row: SettingSpec, value: unknown): SettingValue {
    if (value === undefined || value === null) return row.default;
    switch (row.type) {
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          if (TRUE.has(value.toLowerCase())) return true;
          if (FALSE.has(value.toLowerCase())) return false;
        }
        if (typeof value === 'number') return value !== 0;
        return row.default;
      case 'number': {
        let n = typeof value === 'number' ? value : parseFloat(String(value));
        if (!Number.isFinite(n)) return row.default;
        if (row.min !== undefined && n < row.min) n = row.min;
        if (row.max !== undefined && n > row.max) n = row.max;
        return n;
      }
      case 'enum':
        return row.values?.includes(String(value)) ? String(value) : row.default;
      default: {
        const s = String(value);
        return s.length ? s : row.default;
      }
    }
  }

  /** Check a value typed by a person, rather than silently falling back. */
  validate(row: SettingSpec, raw: string): Validation {
    switch (row.type) {
      case 'boolean': {
        const v = raw.toLowerCase();
        if (TRUE.has(v)) return { ok: true, value: true };
        if (FALSE.has(v)) return { ok: true, value: false };
        return { ok: true, value: v.length > 0 };
      }
      case 'number': {
        const n = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(n)) return { ok: false, error: 'number' };
        return { ok: true, value: this.coerce(row, n) };
      }
      case 'enum':
        return row.values?.includes(raw) ? { ok: true, value: raw } : { ok: false, error: 'enum' };
      default:
        return raw.length ? { ok: true, value: raw } : { ok: false, error: 'empty' };
    }
  }

  get<T extends SettingValue = SettingValue>(key: string): T {
    const row = this.byKey.get(key);
    if (!row) return undefined as unknown as T;
    let stored: unknown;
    try {
      stored = this.adapter.get(key);
    } catch {
      stored = undefined;
    }
    return this.coerce(row, stored) as T;
  }

  all(): Record<string, SettingValue> {
    const out: Record<string, SettingValue> = {};
    for (const row of this.rows) out[row.key] = this.get(row.key);
    return out;
  }

  /**
   * Write a value. Defaults are not written: the store stays a record of what
   * was actually chosen, so changing a default later reaches everyone who never
   * touched that row.
   */
  set(key: string, value: unknown): SettingValue | undefined {
    const row = this.byKey.get(key);
    if (!row) return undefined;
    const previous = this.get(key);
    const next = this.coerce(row, value);
    try {
      this.adapter.set(key, next === row.default ? undefined : next);
    } catch {
      /* the adapter's problem; the value still applies for listeners */
    }
    if (next !== previous) this.emit(key, next);
    return next;
  }

  toggle(key: string): boolean | undefined {
    const row = this.byKey.get(key);
    if (!row || row.type !== 'boolean') return undefined;
    return this.set(key, !this.get(key)) as boolean;
  }

  /** Every row back to its default. */
  reset(): void {
    for (const row of this.rows) {
      try {
        this.adapter.set(row.key, undefined);
      } catch {
        /* ignore */
      }
    }
    this.emit(null, undefined);
  }

  /** Subscribe to changes. `key` is null when anything may have changed. */
  on(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.listeners.clear();
  }

  private emit(key: string | null, value: SettingValue | undefined): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(key, value);
      } catch (e) {
        console.error('lazykeys: a settings listener failed', e);
      }
    }
  }
}
