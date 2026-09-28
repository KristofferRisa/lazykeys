/**
 * find — `/` finds text on the page, `n` and `N` walk the matches.
 *
 * Matches are Ranges, never wrapped elements: the page's DOM is left exactly
 * as it was built, so nothing downstream (anchors, frameworks, copy) sees a
 * mutated tree. They are painted with the CSS Custom Highlight API where it
 * exists; where it does not, jumping still works and only the colour is gone.
 */
export interface FindApi {
    /** Re-run the search without moving — what the / line calls as you type. */
    preview(text: string): number;
    /** Commit: land on the first match at or below where you are. */
    accept(text: string): number;
    next(delta?: number): void;
    clear(): void;
    /** `:noh` — stop painting, keep the pattern for the next n. */
    nohl(): void;
    pattern(): string;
    count(): number;
    index(): number;
}
/** Collect matches under a root. Exported for tests. */
export declare function collectMatches(root: Node, needle: string, ignoreCase: boolean, exclude: string): Range[];
export declare const find: import("..").PluginSpec;
