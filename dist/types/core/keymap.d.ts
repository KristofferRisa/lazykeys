/**
 * The keymap is one table.
 *
 * Every binding is a token sequence; the set of prefixes, the which-key rows
 * and the `:help` listing are all derived from it. There is no second list to
 * forget.
 *
 * Each sequence holds a small stack, so a consumer can override a built-in
 * binding and removing the override brings the original back. Mapping a
 * sequence to `false` hides whatever is under it.
 */
import { displaySeq, parseSeq } from './keys';
export interface KeyContext {
    /** The count typed before the keys, or 1. */
    count: number;
    /** Whether a count was typed at all (`G` vs `50G`). */
    hasCount: boolean;
    /** The canonical sequence that ran, e.g. `'<leader> u z'`. */
    seq: string;
    /** For bindings with `arg`, the key typed after the sequence (`m a`). */
    arg?: string;
    /** The key press that completed the sequence, when there was one. */
    event?: KeyboardEvent | null;
}
export type KeyHandler = (ctx: KeyContext) => void;
export interface KeySpec {
    run: KeyHandler;
    /** One line for which-key and `:help`. */
    desc?: string;
    /** The `:help` section this binding is listed under. Derived when omitted. */
    section?: string;
    /** Dispatches, but is left out of which-key and `:help` (aliases). */
    hidden?: boolean;
    /**
     * The binding takes the next key as its argument, whatever it is, the way
     * `m` and `'` do. A string is what which-key shows for it (`'{a-z}'`).
     */
    arg?: boolean | string;
}
/**
 * What a keymap table accepts per sequence: a spec, a bare handler, a group
 * label (`'+file/find'`), or `false` to unmap.
 */
export type KeyMapping = KeySpec | KeyHandler | string | false;
export interface KeymapEntry extends KeySpec {
    seq: string;
    tokens: string[];
    /** The plugin that registered it, when one did. */
    plugin?: string;
}
export interface WhichKeyRow {
    /** The token to feed when the row is picked; empty for an `arg` row. */
    token: string;
    display: string;
    label: string;
    group: boolean;
}
export declare class Keymap {
    private slots;
    private groups;
    private prefixCache;
    private listeners;
    /** Add a binding. Returns the function that removes exactly this one. */
    set(seq: string, spec: KeySpec | KeyHandler | false, plugin?: string): () => void;
    /** Name a prefix, which-key style. `'+file'` and `'file'` are the same. */
    group(prefix: string, label: string): () => void;
    /** Apply a whole table at once. Returns one function that undoes all of it. */
    apply(table: Record<string, KeyMapping>, plugin?: string): () => void;
    /** The live binding for a sequence, if there is one. */
    get(seq: string): KeymapEntry | undefined;
    /** Every live binding, in the order they were first mapped. */
    list(): KeymapEntry[];
    /** Whether some longer binding starts with this sequence. Derived, never declared. */
    isPrefix(seq: string): boolean;
    prefixes(): Set<string>;
    groupLabel(prefix: string): string | undefined;
    /** Every declared group label, for `:help`. */
    groupLabels(): Map<string, string>;
    /**
     * The rows which-key shows under a hanging prefix: one per next token,
     * `+name` for tokens that open a further menu.
     */
    children(prefix: string): WhichKeyRow[];
    private hasVisibleUnder;
    /** Subscribe to changes. */
    onChange(fn: () => void): () => void;
    private changed;
}
/** The `:help` section a binding falls under when it does not name one. */
export declare function defaultSection(entry: KeymapEntry, keymap: Keymap, leaderLabel: string): string;
export { displaySeq, parseSeq };
