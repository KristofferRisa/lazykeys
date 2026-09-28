/**
 * cmdline — the `:` line, and the prompt that `/` (or any plugin) builds on.
 *
 * It floats over the middle of the page the way noice.nvim moves it off the
 * bottom row: at the bottom of a browser window it would compete with the
 * scrollbar, page chrome and whatever the operating system puts down there.
 * `:set cmdline=bottom` puts it back on the last line.
 *
 * Tab completes from the command table and what it offers appears under the
 * line. Up/Down walk that menu, or the history when there is no menu; Ctrl-P
 * and Ctrl-N always mean the history. Backspacing past the prefix leaves.
 */
import type { Completion } from '../core/ex';
export interface PromptOptions {
    /** The character drawn before the input, and the history bucket: `':'`, `'/'`. */
    prefix: string;
    title?: string;
    /** Accessible name of the input. */
    label?: string;
    icon?: string;
    /** Styling hook: `data-kind` on the line. */
    kind?: string;
    initial?: string;
    /** Called as the value changes; what it returns is drawn at the right edge. */
    onInput?(value: string): {
        hint?: string;
        empty?: boolean;
    } | void;
    /** Completion rows for Tab. */
    complete?(value: string): Completion[];
    onAccept(value: string): void;
    onCancel?(): void;
}
export interface CmdlineApi {
    /** Open the prompt registered for a prefix (`':'` by default). */
    open(prefix?: string, initial?: string): void;
    /** Register the prompt a prefix opens. */
    define(prefix: string, factory: () => PromptOptions): () => void;
    /** Open an ad-hoc prompt. */
    prompt(opts: PromptOptions): void;
    close(): void;
    active(): boolean;
    /** Every line run, oldest first, with its prefix. */
    history(): string[];
}
export declare const cmdline: import("..").PluginSpec;
