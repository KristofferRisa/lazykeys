import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLazyKeys, memoryAdapter, type LazyKeys } from '../src/index';

let lk: LazyKeys | null = null;

function make(): LazyKeys {
  lk = createLazyKeys({ storage: memoryAdapter() });
  return lk;
}

function press(key: string, mods: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true, ...mods });
  target.dispatchEvent(e);
  return e;
}

function typeInto(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

const labels = () => Array.from(document.querySelectorAll('.lk-picker .lk-picker-label')).map((li) => li.textContent);
const selected = () => document.querySelector('.lk-picker [aria-selected="true"] .lk-picker-label')?.textContent;
const input = () => document.querySelector('.lk-picker-input') as HTMLInputElement;

const items = [
  { label: 'alpha', hint: 'a' },
  { label: 'beta' },
  { label: 'gamma', keywords: ['third letter'] },
  { label: 'delta' },
];

afterEach(() => {
  lk?.destroy();
  lk = null;
  document.body.innerHTML = '';
});

describe('picker without a filter', () => {
  it('moves with j/k, chooses with Enter and has no input', () => {
    const k = make();
    const onChoose = vi.fn();
    k.ui.picker({ title: 'Pick', items, onChoose });
    expect(input()).toBeNull();
    press('j');
    press('j');
    expect(selected()).toBe('gamma');
    press('G');
    expect(selected()).toBe('delta');
    press('g');
    press('g');
    expect(selected()).toBe('alpha');
    press('Enter');
    expect(onChoose).toHaveBeenCalledWith(items[0], 0);
    expect(document.querySelector('.lk-float')).toBeNull();
  });

  it('closes on q', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, onChoose: () => {} });
    press('q');
    expect(k.ui.floatIsOpen()).toBe(false);
  });
});

describe('picker with a filter', () => {
  it('opens in insert mode with the caret in the filter', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('role')).toBe('combobox');
    expect(document.querySelector('.lk-picker-count')?.textContent).toBe('4/4');
  });

  it('filters fuzzily, highlights, and chooses by the original index', () => {
    const k = make();
    const onChoose = vi.fn();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose });
    typeInto(input(), 'lta');
    expect(labels()).toEqual(['delta']);
    expect(document.querySelector('.lk-picker-match')?.textContent).toBe('lta');
    expect(document.querySelector('.lk-picker-count')?.textContent).toBe('1/4');
    press('Enter');
    expect(onChoose).toHaveBeenCalledWith(items[3], 3);
  });

  it('matches keywords', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    typeInto(input(), 'third');
    expect(labels()).toEqual(['gamma']);
  });

  it('lets letters through to the filter in insert mode', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    for (const key of ['q', 'j', 'k', 'g', 'G', '?']) {
      const e = press(key);
      expect(e.defaultPrevented, key).toBe(false);
    }
    expect(k.ui.floatIsOpen()).toBe(true);
  });

  it('moves with the arrows and Ctrl-N/P/J/K while typing', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    press('ArrowDown');
    expect(selected()).toBe('beta');
    press('n', { ctrlKey: true });
    expect(selected()).toBe('gamma');
    press('k', { ctrlKey: true });
    press('p', { ctrlKey: true });
    expect(selected()).toBe('alpha');
    press('ArrowUp');
    expect(selected()).toBe('delta');
  });

  it('Esc goes to normal mode, where j/k move and i types again', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    press('Escape');
    expect(k.ui.floatIsOpen()).toBe(true);
    expect(input().readOnly).toBe(true);
    expect(document.querySelector('.lk-float-win')?.classList.contains('is-normal')).toBe(true);
    press('j');
    expect(selected()).toBe('beta');
    press('i');
    expect(input().readOnly).toBe(false);
    expect(press('j').defaultPrevented).toBe(false);
  });

  it('Esc twice closes, and so does q in normal mode', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    press('Escape');
    press('Escape');
    expect(k.ui.floatIsOpen()).toBe(false);
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose: () => {} });
    press('Escape');
    press('q');
    expect(k.ui.floatIsOpen()).toBe(false);
  });

  it('says so when nothing matches, and Enter does nothing', () => {
    const k = make();
    const onChoose = vi.fn();
    k.ui.picker({ title: 'Pick', items, filter: true, onChoose });
    typeInto(input(), 'zzz');
    expect(document.querySelector('.lk-picker-empty')?.textContent).toBe('No matches');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    press('Enter');
    expect(onChoose).not.toHaveBeenCalled();
    expect(k.ui.floatIsOpen()).toBe(true);
  });

  it('starts from query and placeholder when given', () => {
    const k = make();
    k.ui.picker({ title: 'Pick', items, filter: true, query: 'bet', placeholder: 'Find a letter', onChoose: () => {} });
    expect(input().value).toBe('bet');
    expect(input().placeholder).toBe('Find a letter');
    expect(labels()).toEqual(['beta']);
  });

  it(':history is filterable', () => {
    const k = make();
    k.exec('set scroll=90');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ':', bubbles: true, cancelable: true }));
    const line = document.querySelector('.lk-cmdline input') as HTMLInputElement;
    line.value = 'set scroll=80';
    press('Enter', {}, line);
    k.exec('history');
    expect(input()).not.toBeNull();
  });
});
