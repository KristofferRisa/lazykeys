/**
 * Key tokens.
 *
 * A sequence is a list of tokens joined by single spaces: `'g g'`,
 * `'<leader> u z'`, `'C-d'`. Writing the keymap that way is what lets the set
 * of prefixes be derived from it rather than maintained beside it.
 *
 * Tokens are what `KeyboardEvent.key` reports, with three normalisations:
 *
 *   - Ctrl + a key becomes `C-x` (lowercased when it is a single character)
 *   - the space bar is `Space`
 *   - `<leader>` stands for whichever key the `leader` setting names
 *
 * Vim's angle-bracket notation is accepted on the way in (`<C-d>`, `<CR>`,
 * `<Esc>`, `<Space>`, `<Tab>`, `<BS>`), so a binding can be copied from a
 * Neovim config as-is.
 */
export declare const LEADER = "<leader>";
/** Normalise one token as written in a keymap. */
export declare function normalizeToken(raw: string): string;
/** `'<leader> u z'` → `['<leader>', 'u', 'z']`. */
export declare function parseSeq(seq: string): string[];
/** The canonical spelling of a sequence: normalised tokens joined by one space. */
export declare function normalizeSeq(seq: string): string;
/** How one token reads to a person — the way which-key and `:help` print it. */
export declare function tokenDisplay(token: string): string;
/** `'<leader> u z'` reads as `<leader>uz`. */
export declare function displaySeq(seq: string | string[]): string;
/**
 * The token a key press stands for, or null for a bare modifier.
 * Meta and Alt combinations are returned as-is; the dispatcher leaves them to
 * the browser and the page.
 */
export declare function keyName(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): string | null;
/** True while the caret is somewhere keys are text: that is insert mode. */
export declare function isEditable(el: EventTarget | null | undefined): boolean;
