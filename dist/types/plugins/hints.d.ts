/**
 * hints — `f` labels every link in view; type the label to follow it. `F`
 * opens it in a new tab. flash.nvim maps the same thing to `s`, so `s` works
 * too.
 *
 * Only what is on screen gets a label, which is what keeps labels one or two
 * characters long on a page with a hundred links below the fold. The labels
 * are pinned where things were when `f` was pressed, so any movement
 * underneath them ends the round rather than lying about it.
 */
export interface HintTarget {
    label: string;
    tag: string;
    href: string;
}
export interface HintsApi {
    start(opts?: {
        newTab?: boolean;
    }): void;
    cancel(): void;
    active(): boolean;
    /** What is labelled right now, and where each label goes. */
    list(): HintTarget[];
}
export declare const hints: import("..").PluginSpec;
