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

export const LEADER = '<leader>';

const NAMED: Record<string, string> = {
  leader: LEADER,
  space: 'Space',
  spc: 'Space',
  cr: 'Enter',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  bs: 'Backspace',
  backspace: 'Backspace',
  del: 'Delete',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  lt: '<',
  gt: '>',
  bar: '|',
  bslash: '\\',
};

function ctrlOf(rest: string): string {
  const named = NAMED[rest.toLowerCase()];
  if (named && named !== LEADER) return 'C-' + named;
  return 'C-' + (rest.length === 1 ? rest.toLowerCase() : rest);
}

/** Normalise one token as written in a keymap. */
export function normalizeToken(raw: string): string {
  const token = raw.trim();
  if (token === '') return 'Space';
  const bracket = /^<(.+)>$/.exec(token);
  if (bracket && bracket[1]) {
    const inner = bracket[1];
    const ctrl = /^[cC]-(.+)$/.exec(inner);
    if (ctrl && ctrl[1]) return ctrlOf(ctrl[1]);
    const named = NAMED[inner.toLowerCase()];
    return named ?? inner;
  }
  const ctrl = /^[cC]-(.+)$/.exec(token);
  if (ctrl && ctrl[1]) return ctrlOf(ctrl[1]);
  return token;
}

/** `'<leader> u z'` → `['<leader>', 'u', 'z']`. */
export function parseSeq(seq: string): string[] {
  return seq
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken);
}

/** The canonical spelling of a sequence: normalised tokens joined by one space. */
export function normalizeSeq(seq: string): string {
  return parseSeq(seq).join(' ');
}

/** How one token reads to a person — the way which-key and `:help` print it. */
export function tokenDisplay(token: string): string {
  switch (token) {
    case LEADER:
      return '<leader>';
    case 'Space':
      return '<space>';
    case 'Enter':
      return '<cr>';
    case 'Escape':
      return '<esc>';
    case 'Tab':
      return '<tab>';
    case 'Backspace':
      return '<bs>';
    default:
      if (token.startsWith('C-')) return '<' + token + '>';
      return token;
  }
}

/** `'<leader> u z'` reads as `<leader>uz`. */
export function displaySeq(seq: string | string[]): string {
  const tokens = Array.isArray(seq) ? seq : parseSeq(seq);
  return tokens.map(tokenDisplay).join('');
}

const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Hyper', 'Super', 'OS', 'Fn']);

/**
 * The token a key press stands for, or null for a bare modifier.
 * Meta and Alt combinations are returned as-is; the dispatcher leaves them to
 * the browser and the page.
 */
export function keyName(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): string | null {
  let key = e.key;
  if (!key || MODIFIERS.has(key) || key === 'Unidentified' || key === 'Dead') return null;
  if (key === 'Esc') key = 'Escape';
  if (key === ' ' || key === 'Spacebar') key = 'Space';
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    return 'C-' + (key.length === 1 ? key.toLowerCase() : key);
  }
  return key;
}

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** True while the caret is somewhere keys are text: that is insert mode. */
export function isEditable(el: EventTarget | null | undefined): boolean {
  if (!el || typeof (el as Element).tagName !== 'string') return false;
  const node = el as HTMLElement;
  const tag = node.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((node as HTMLInputElement).type || 'text').toLowerCase();
    return !NOT_TEXT.has(type);
  }
  return !!node.isContentEditable;
}
