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
export declare function parseLine(line: string): ParsedLine | null;
export declare class ExRegistry {
    private stacks;
    private order;
    add(spec: ExCommandSpec, plugin?: string): () => void;
    /** Every live command, in registration order. */
    list(): ExCommand[];
    get(name: string): ExCommand | undefined;
    /** Exact name, then alias, then unique prefix of a name. */
    resolve(name: string): ExCommand | null;
    /**
     * Resolve a parsed line: `:q!` is tried as written first (it may be an
     * alias), then without its bang.
     */
    resolveLine(parsed: ParsedLine): {
        command: ExCommand;
        bang: boolean;
    } | null;
    /**
     * The wildmenu's rows for a partly typed line: command names for the first
     * word, the command's own `complete()` after that.
     */
    completions(text: string): Completion[];
}
