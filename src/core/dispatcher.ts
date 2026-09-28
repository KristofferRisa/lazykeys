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

import { LEADER } from './keys';
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

export class Dispatcher {
  private keys: string[] = [];
  private count = '';
  private awaitingArg: KeymapEntry | null = null;
  private ambiguous: KeymapEntry | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: DispatcherOptions) {}

  get state(): DispatcherState {
    return { keys: this.keys.slice(), count: this.count, awaitingArg: this.awaitingArg };
  }

  /** Whether anything is pending — a prefix, a count or an argument. */
  get busy(): boolean {
    return this.keys.length > 0 || this.count !== '' || this.awaitingArg !== null;
  }

  /** Drop whatever is pending. */
  reset(): void {
    this.clearTimer();
    const was = this.busy;
    this.keys = [];
    this.count = '';
    this.awaitingArg = null;
    this.ambiguous = null;
    if (was) this.emitPending();
  }

  /**
   * Feed one token. Returns true when it was consumed — the caller then
   * prevents the browser's default for it.
   */
  feed(key: string, event: KeyboardEvent | null = null): boolean {
    if (this.awaitingArg) {
      const entry = this.awaitingArg;
      if (key === 'Escape') {
        this.reset();
        return true;
      }
      this.run(entry, event, key);
      return true;
    }

    if (key === 'Escape') {
      if (!this.busy) return false;
      this.reset();
      return true;
    }

    if (this.ambiguous) {
      this.clearTimer();
      const pendingEntry = this.ambiguous;
      this.ambiguous = null;
      const next = [...this.keys, key].join(' ');
      if (!this.opts.keymap.get(next) && !this.opts.keymap.isPrefix(next)) {
        // The shorter binding was what was meant: run it, then treat this key
        // as the start of whatever comes next.
        this.run(pendingEntry, event);
        return this.feed(key, event) || true;
      }
    }

    let token = key;
    if (!this.keys.length && key === this.opts.leader()) token = LEADER;

    if (!this.keys.length && /^[0-9]$/.test(token) && !(token === '0' && !this.count)) {
      this.count += token;
      this.emitPending();
      return true;
    }

    const seq = [...this.keys, token].join(' ');
    const entry = this.opts.keymap.get(seq);
    const prefix = this.opts.keymap.isPrefix(seq);

    if (entry && entry.arg) {
      this.keys.push(token);
      this.awaitingArg = entry;
      this.emitPending();
      return true;
    }

    if (entry && !prefix) {
      this.run(entry, event);
      return true;
    }

    if (entry && prefix) {
      this.keys.push(token);
      this.ambiguous = entry;
      const wait = Math.max(0, this.opts.timeoutlen());
      this.timer = setTimeout(() => {
        this.timer = null;
        const pending = this.ambiguous;
        this.ambiguous = null;
        if (pending) this.run(pending, null);
      }, wait);
      this.emitPending();
      return true;
    }

    if (prefix) {
      this.keys.push(token);
      this.emitPending();
      return true;
    }

    if (this.busy) this.reset();
    return false;
  }

  private run(entry: KeymapEntry, event: KeyboardEvent | null, arg?: string): void {
    const hasCount = this.count.length > 0;
    const count = hasCount ? parseInt(this.count, 10) : 1;
    this.clearTimer();
    this.keys = [];
    this.count = '';
    this.awaitingArg = null;
    this.ambiguous = null;
    this.emitPending();

    const ctx: KeyContext = { count, hasCount, seq: entry.seq, event };
    if (arg !== undefined) ctx.arg = arg;
    try {
      entry.run(ctx);
    } catch (error) {
      if (this.opts.onError) this.opts.onError(error, entry);
      else console.error(`lazykeys: '${entry.seq}' failed`, error);
      return;
    }
    this.opts.onRun?.(entry, ctx);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emitPending(): void {
    this.opts.onPending?.(this.state);
  }
}
