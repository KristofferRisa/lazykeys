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
    /** What the row is called. Omitted: `messages['setting.<key>.label']`, then `['setting.<key>']`, then the key. */
    label?: string;
    /** A line of help. Omitted: `messages['setting.<key>.help']`. */
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
/**
 * The default adapter: one JSON object under `<namespace>:settings` in
 * localStorage, so a reset is one removeItem. Every access is wrapped: private
 * mode and blocked storage degrade to "remembered for this page".
 */
export declare function localStorageAdapter(namespace?: string): StorageAdapter;
/** Keeps values for the life of the page. Handy for tests and for "don't remember". */
export declare function memoryAdapter(initial?: Record<string, SettingValue>): StorageAdapter;
export interface Validation {
    ok: boolean;
    value?: SettingValue;
    /** 'number' | 'enum' — what was wrong, for the caller's message. */
    error?: 'number' | 'enum' | 'empty';
}
export declare class Settings {
    private readonly adapter;
    private readonly overrides;
    private rows;
    private byKey;
    private byOption;
    private listeners;
    private unsubscribe;
    constructor(adapter: StorageAdapter, overrides?: Record<string, SettingValue>);
    /** Add rows. A row whose key exists replaces it. Returns the undo. */
    define(specs: SettingSpec[]): () => void;
    private reindex;
    schema(): SettingSpec[];
    /** A row by its key, or by its `:set` option name. */
    row(name: string): SettingSpec | null;
    /**
     * A stored value is only trusted as far as its own row allows: anything out
     * of range falls back to the default rather than reaching a feature.
     */
    coerce(row: SettingSpec, value: unknown): SettingValue;
    /** Check a value typed by a person, rather than silently falling back. */
    validate(row: SettingSpec, raw: string): Validation;
    get<T extends SettingValue = SettingValue>(key: string): T;
    all(): Record<string, SettingValue>;
    /**
     * Write a value. Defaults are not written: the store stays a record of what
     * was actually chosen, so changing a default later reaches everyone who never
     * touched that row.
     */
    set(key: string, value: unknown): SettingValue | undefined;
    toggle(key: string): boolean | undefined;
    /** Every row back to its default. */
    reset(): void;
    /** Subscribe to changes. `key` is null when anything may have changed. */
    on(fn: SettingsListener): () => void;
    destroy(): void;
    private emit;
}
