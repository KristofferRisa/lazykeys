/**
 * The ex commands are a table, like the keymap. `:help` renders both, so the
 * documentation is the implementation rather than a copy of it.
 *
 * Names resolve by exact match, then by alias, then by unique prefix — `:se`,
 * `:nohl` and `:colo` land where a vim user expects.
 */

export interface Completion {
  /** The text that replaces the word being completed. */
  value: string;
  /** What the menu shows; defaults to value. */
  label?: string;
  hint?: string;
}

export interface ExContext {
  /** The whole line as typed, without the leading `:`. */
  line: string;
  /** Whether the name was typed with a trailing `!` (`:q!`). */
  bang: boolean;
}

export interface ExCommandSpec {
  name: string;
  alias?: string[];
  /** How the arguments read in `:help`, e.g. `'{slug}'` or `'[option]'`. */
  args?: string;
  desc?: string;
  /** Runs, but is left out of `:help` and completion. */
  hidden?: boolean;
  run(argv: string[], ctx: ExContext): void;
  /** Completions for the word under the cursor, given the words before it. */
  complete?(word: string, argv: string[]): Completion[];
}

export interface ExCommand extends ExCommandSpec {
  plugin?: string;
}

export interface ParsedLine {
  name: string;
  argv: string[];
  bang: boolean;
  line: string;
}

export function parseLine(line: string): ParsedLine | null {
  const text = String(line ?? '').replace(/^[\s:]+/, '');
  if (!text.trim()) return null;
  const parts = text.trim().split(/\s+/);
  const name = parts[0] as string;
  return { name, argv: parts.slice(1), bang: /!$/.test(name) && name.length > 1, line: text };
}

export class ExRegistry {
  private stacks = new Map<string, ExCommand[]>();
  private order: string[] = [];

  add(spec: ExCommandSpec, plugin?: string): () => void {
    if (!spec.name) throw new Error('lazykeys: an ex command needs a name');
    const cmd: ExCommand = { ...spec };
    if (plugin !== undefined) cmd.plugin = plugin;
    const stack = this.stacks.get(spec.name) ?? [];
    if (!stack.length) this.order.push(spec.name);
    stack.push(cmd);
    this.stacks.set(spec.name, stack);
    return () => {
      const list = this.stacks.get(spec.name);
      if (!list) return;
      const at = list.indexOf(cmd);
      if (at !== -1) list.splice(at, 1);
      if (!list.length) {
        this.stacks.delete(spec.name);
        this.order = this.order.filter((n) => n !== spec.name);
      }
    };
  }

  /** Every live command, in registration order. */
  list(): ExCommand[] {
    const out: ExCommand[] = [];
    for (const name of this.order) {
      const stack = this.stacks.get(name);
      const top = stack?.[stack.length - 1];
      if (top) out.push(top);
    }
    return out;
  }

  get(name: string): ExCommand | undefined {
    const stack = this.stacks.get(name);
    return stack?.[stack.length - 1];
  }

  /** Exact name, then alias, then unique prefix of a name. */
  resolve(name: string): ExCommand | null {
    if (!name) return null;
    const all = this.list();
    const exact = this.get(name);
    if (exact) return exact;
    const aliased = all.find((c) => c.alias?.includes(name));
    if (aliased) return aliased;
    const hits = all.filter((c) => c.name.startsWith(name));
    if (hits.length === 1) return hits[0] as ExCommand;
    // Case only as a last resort: `:lazy` for `:Lazy`, when nothing else fits.
    const lower = name.toLowerCase();
    const folded = all.filter((c) => c.name.toLowerCase() === lower);
    if (folded.length === 1) return folded[0] as ExCommand;
    const foldedPrefix = hits.length ? [] : all.filter((c) => c.name.toLowerCase().startsWith(lower));
    return foldedPrefix.length === 1 ? (foldedPrefix[0] as ExCommand) : null;
  }

  /**
   * Resolve a parsed line: `:q!` is tried as written first (it may be an
   * alias), then without its bang.
   */
  resolveLine(parsed: ParsedLine): { command: ExCommand; bang: boolean } | null {
    const direct = this.resolve(parsed.name);
    if (direct) return { command: direct, bang: parsed.bang };
    if (parsed.bang) {
      const bare = this.resolve(parsed.name.slice(0, -1));
      if (bare) return { command: bare, bang: true };
    }
    return null;
  }

  /**
   * The wildmenu's rows for a partly typed line: command names for the first
   * word, the command's own `complete()` after that.
   */
  completions(text: string): Completion[] {
    const trimmed = text.replace(/^\s+/, '');
    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) {
      const word = parts[0] ?? '';
      return this.list()
        .filter((c) => !c.hidden && c.name.startsWith(word))
        .map((c) => {
          const row: Completion = { value: c.name, label: ':' + c.name };
          if (c.desc) row.hint = c.desc;
          return row;
        });
    }
    const command = this.resolve(parts[0] as string);
    if (!command?.complete) return [];
    const word = parts[parts.length - 1] ?? '';
    const head = parts.slice(0, -1).join(' ');
    return command
      .complete(word, parts.slice(1, -1))
      .filter((c) => c.value.startsWith(word))
      .map((c) => ({ ...c, label: c.label ?? c.value, value: head + ' ' + c.value }));
  }
}
