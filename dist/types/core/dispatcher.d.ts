/**
 * The dispatcher: tokens in, bindings run.
 *
 * It knows nothing about the DOM, which is what lets it be tested with fake
 * timers and a table. The rules, in the order they apply:
 *
 *   1. A binding with `arg` swallows the next token as its argument.
 *   2. The leader is only the leader at the start of a sequence.
 *   3. A count starts with 1–9 and may then take 0 — a bare 0 is not a count.
 *   4. A sequence that is a binding and nothing longer runs at once.
 *   5. A sequence that is both a binding and a prefix waits `timeoutlen`, then
 *      runs — unless a key arrives that continues it. A key that does not
 *      continue it runs the shorter binding first and is then fed afresh.
 *   6. A sequence that is only a prefix waits as long as it takes.
 *   7. Anything else ends the sequence and is left to the page.
 */
import type { KeyContext, Keymap, KeymapEntry } from './keymap';
export interface DispatcherState {
    keys: string[];
    count: string;
    /** The binding waiting for its argument, if any. */
    awaitingArg: KeymapEntry | null;
}
export interface DispatcherOptions {
    keymap: Keymap;
    /** The token the leader setting currently names (`'Space'`, `','`, `'\\'`). */
    leader: () => string;
    /** How long an ambiguous sequence waits before it runs, in ms. */
    timeoutlen: () => number;
    /** Called whenever the pending keys or count change. */
    onPending?: (state: DispatcherState) => void;
    /** Called after a binding has run. */
    onRun?: (entry: KeymapEntry, ctx: KeyContext) => void;
    /** Called when a binding throws. Defaults to console.error. */
    onError?: (error: unknown, entry: KeymapEntry) => void;
}
export declare class Dispatcher {
    private readonly opts;
    private keys;
    private count;
    private awaitingArg;
    private ambiguous;
    private timer;
    constructor(opts: DispatcherOptions);
    get state(): DispatcherState;
    /** Whether anything is pending — a prefix, a count or an argument. */
    get busy(): boolean;
    /** Drop whatever is pending. */
    reset(): void;
    /**
     * Feed one token. Returns true when it was consumed — the caller then
     * prevents the browser's default for it.
     */
    feed(key: string, event?: KeyboardEvent | null): boolean;
    private run;
    private clearTimer;
    private emitPending;
}
