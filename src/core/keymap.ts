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

import { LEADER, displaySeq, normalizeSeq, parseSeq, tokenDisplay } from './keys';

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

interface Slot {
  entry: KeymapEntry | null; // null = unmapped
}

export interface WhichKeyRow {
  /** The token to feed when the row is picked; empty for an `arg` row. */
  token: string;
  display: string;
  label: string;
  group: boolean;
}

export class Keymap {
  private slots = new Map<string, Slot[]>();
  private groups = new Map<string, string[]>();
  private prefixCache: Set<string> | null = null;
  private listeners = new Set<() => void>();

  /** Add a binding. Returns the function that removes exactly this one. */
  set(seq: string, spec: KeySpec | KeyHandler | false, plugin?: string): () => void {
    const canonical = normalizeSeq(seq);
    if (!canonical) throw new Error(`lazykeys: empty key sequence`);
    let slot: Slot;
    if (spec === false) {
      slot = { entry: null };
    } else {
      const base: KeySpec = typeof spec === 'function' ? { run: spec } : spec;
      if (typeof base.run !== 'function') {
        throw new Error(`lazykeys: the binding for '${seq}' has no run()`);
      }
      const entry: KeymapEntry = { ...base, seq: canonical, tokens: canonical.split(' ') };
      if (plugin !== undefined) entry.plugin = plugin;
      slot = { entry };
    }
    const stack = this.slots.get(canonical) ?? [];
    stack.push(slot);
    this.slots.set(canonical, stack);
    this.changed();
    return () => {
      const list = this.slots.get(canonical);
      if (!list) return;
      const at = list.indexOf(slot);
      if (at === -1) return;
      list.splice(at, 1);
      if (!list.length) this.slots.delete(canonical);
      this.changed();
    };
  }

  /** Name a prefix, which-key style. `'+file'` and `'file'` are the same. */
  group(prefix: string, label: string): () => void {
    const canonical = normalizeSeq(prefix);
    const clean = label.replace(/^\+/, '');
    const stack = this.groups.get(canonical) ?? [];
    stack.push(clean);
    this.groups.set(canonical, stack);
    this.changed();
    return () => {
      const list = this.groups.get(canonical);
      if (!list) return;
      const at = list.lastIndexOf(clean);
      if (at !== -1) list.splice(at, 1);
      if (!list.length) this.groups.delete(canonical);
      this.changed();
    };
  }

  /** Apply a whole table at once. Returns one function that undoes all of it. */
  apply(table: Record<string, KeyMapping>, plugin?: string): () => void {
    const undo: Array<() => void> = [];
    for (const [seq, mapping] of Object.entries(table)) {
      if (typeof mapping === 'string') {
        undo.push(this.group(seq, mapping));
      } else {
        undo.push(this.set(seq, mapping, plugin));
      }
    }
    return () => undo.reverse().forEach((fn) => fn());
  }

  /** The live binding for a sequence, if there is one. */
  get(seq: string): KeymapEntry | undefined {
    const stack = this.slots.get(seq) ?? this.slots.get(normalizeSeq(seq));
    const top = stack?.[stack.length - 1];
    return top?.entry ?? undefined;
  }

  /** Every live binding, in the order they were first mapped. */
  list(): KeymapEntry[] {
    const out: KeymapEntry[] = [];
    for (const stack of this.slots.values()) {
      const top = stack[stack.length - 1];
      if (top?.entry) out.push(top.entry);
    }
    return out;
  }

  /** Whether some longer binding starts with this sequence. Derived, never declared. */
  isPrefix(seq: string): boolean {
    return this.prefixes().has(seq);
  }

  prefixes(): Set<string> {
    if (this.prefixCache) return this.prefixCache;
    const set = new Set<string>();
    for (const entry of this.list()) {
      for (let i = 1; i < entry.tokens.length; i++) {
        set.add(entry.tokens.slice(0, i).join(' '));
      }
    }
    this.prefixCache = set;
    return set;
  }

  groupLabel(prefix: string): string | undefined {
    const stack = this.groups.get(prefix);
    return stack?.[stack.length - 1];
  }

  /** Every declared group label, for `:help`. */
  groupLabels(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [prefix, stack] of this.groups) {
      const label = stack[stack.length - 1];
      if (label) out.set(prefix, label);
    }
    return out;
  }

  /**
   * The rows which-key shows under a hanging prefix: one per next token,
   * `+name` for tokens that open a further menu.
   */
  children(prefix: string): WhichKeyRow[] {
    const own = this.get(prefix);
    if (own?.arg) {
      return [
        {
          token: '',
          display: typeof own.arg === 'string' ? own.arg : '{key}',
          label: own.desc ?? '',
          group: false,
        },
      ];
    }
    const head = prefix ? prefix.split(' ') : [];
    const seen = new Set<string>();
    const rows: WhichKeyRow[] = [];
    for (const entry of this.list()) {
      if (entry.tokens.length <= head.length) continue;
      if (head.some((t, i) => entry.tokens[i] !== t)) continue;
      const token = entry.tokens[head.length] as string;
      if (seen.has(token)) continue;
      const child = [...head, token].join(' ');
      const command = this.get(child);
      const isPrefix = this.isPrefix(child);
      if (command && !command.hidden) {
        seen.add(token);
        rows.push({ token, display: tokenDisplay(token), label: command.desc ?? '', group: false });
        continue;
      }
      if (isPrefix && this.hasVisibleUnder(child)) {
        seen.add(token);
        const label = this.groupLabel(child) ?? token;
        rows.push({ token, display: tokenDisplay(token), label: '+' + label, group: true });
      }
    }
    rows.sort((a, b) => a.display.localeCompare(b.display));
    return rows;
  }

  private hasVisibleUnder(prefix: string): boolean {
    const head = prefix + ' ';
    return this.list().some((e) => e.seq.startsWith(head) && !e.hidden);
  }

  /** Subscribe to changes. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.prefixCache = null;
    this.listeners.forEach((fn) => fn());
  }
}

/** The `:help` section a binding falls under when it does not name one. */
export function defaultSection(entry: KeymapEntry, keymap: Keymap, leaderLabel: string): string {
  if (entry.section) return entry.section;
  if (entry.tokens[0] === LEADER) {
    if (entry.tokens.length > 2) {
      const group = keymap.groupLabel(entry.tokens.slice(0, 2).join(' '));
      return group ? `${leaderLabel} · ${group}` : leaderLabel;
    }
    return leaderLabel;
  }
  return '';
}

export { displaySeq, parseSeq };
