import { describe, expect, it } from 'vitest';
import { LEADER, displaySeq, isEditable, keyName, normalizeSeq, normalizeToken, parseSeq } from '../src/core/keys';

describe('key tokens', () => {
  it('parses space-separated sequences', () => {
    expect(parseSeq('g g')).toEqual(['g', 'g']);
    expect(parseSeq('<leader> u z')).toEqual([LEADER, 'u', 'z']);
    expect(parseSeq('  C-d  ')).toEqual(['C-d']);
  });

  it('accepts vim angle-bracket notation', () => {
    expect(normalizeToken('<C-d>')).toBe('C-d');
    expect(normalizeToken('<c-D>')).toBe('C-d');
    expect(normalizeToken('<CR>')).toBe('Enter');
    expect(normalizeToken('<Esc>')).toBe('Escape');
    expect(normalizeToken('<Space>')).toBe('Space');
    expect(normalizeToken('<Leader>')).toBe(LEADER);
    expect(normalizeToken('<lt>')).toBe('<');
    expect(normalizeToken('<C-CR>')).toBe('C-Enter');
    expect(normalizeSeq('<leader>   f f')).toBe('<leader> f f');
  });

  it('displays sequences the way which-key prints them', () => {
    expect(displaySeq('<leader> u z')).toBe('<leader>uz');
    expect(displaySeq('C-d')).toBe('<C-d>');
    expect(displaySeq('g g')).toBe('gg');
    expect(displaySeq(['Space', 'Enter'])).toBe('<space><cr>');
  });

  it('names key presses', () => {
    const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
      ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods }) as KeyboardEvent;
    expect(keyName(ev('j'))).toBe('j');
    expect(keyName(ev('G'))).toBe('G');
    expect(keyName(ev(' '))).toBe('Space');
    expect(keyName(ev('D', { ctrlKey: true }))).toBe('C-d');
    expect(keyName(ev('Enter', { ctrlKey: true }))).toBe('C-Enter');
    expect(keyName(ev('Shift'))).toBeNull();
    expect(keyName(ev('Esc'))).toBe('Escape');
    // Meta combinations are not Ctrl ones.
    expect(keyName(ev('k', { ctrlKey: true, metaKey: true }))).toBe('k');
  });

  it('knows which elements take text', () => {
    const input = document.createElement('input');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const div = document.createElement('div');
    expect(isEditable(input)).toBe(true);
    expect(isEditable(document.createElement('textarea'))).toBe(true);
    expect(isEditable(document.createElement('select'))).toBe(true);
    expect(isEditable(checkbox)).toBe(false);
    expect(isEditable(div)).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});
