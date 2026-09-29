/**
 * The shared furniture: one root element, floating windows (`:help`,
 * `:messages`, `:checkhealth`, the pickers) and a screen-reader line.
 *
 * A float is a modal dialog in everything but name: one at a time, it takes
 * the keyboard while it is up, moves focus into itself and hands it back to
 * wherever it was when it closes.
 */

import { type Child, h, icon, kbds, remove, replace } from './dom';
import { fuzzyFilter } from './fuzzy';
import type { Translate } from './i18n';
import type { FloatHandle, FloatOptions, KeyLayer, PickerItem, PickerOptions, Ui } from '../types';

export interface UiDeps {
  t: Translate;
  mount: () => HTMLElement;
  pushLayer: (layer: KeyLayer) => () => void;
}

export function createUi(deps: UiDeps): Ui & { destroy(): void; remount(): void } {
  const { t } = deps;
  let rootEl: HTMLElement | null = null;
  let srEl: HTMLElement | null = null;
  let current: { handle: FloatHandle; pop: () => void; restore: Element | null; onClose?: () => void } | null = null;
  let floatSeq = 0;

  function root(): HTMLElement {
    if (!rootEl) rootEl = h('div', { class: 'lk-root', attrs: { 'data-lazykeys': '' } });
    // An SPA that swaps <body> (Astro view transitions, Turbo) takes the root
    // with it; the same element goes back, with everything open in it.
    if (!rootEl.isConnected) deps.mount().appendChild(rootEl);
    return rootEl;
  }

  function announce(text: string): void {
    if (!text) return;
    if (!srEl || !srEl.isConnected) {
      srEl = h('div', { class: 'lk-sr', attrs: { 'aria-live': 'polite', role: 'status' } });
      root().appendChild(srEl);
    }
    // Clear first so the same words twice are announced twice.
    srEl.textContent = '';
    const el = srEl;
    setTimeout(() => {
      el.textContent = text;
    }, 30);
  }

  function footer(parts: Array<[string[], string]>): HTMLElement {
    const children: Child[] = [];
    parts.forEach(([keys, label], i) => {
      if (i) children.push(h('span', { class: 'lk-dot', text: ' · ', attrs: { 'aria-hidden': 'true' } }));
      children.push(...kbds(keys), ' ' + label);
    });
    return h('div', { class: 'lk-foot' }, children);
  }

  function closeFloat(): void {
    if (!current) return;
    const { handle, pop, restore, onClose } = current;
    current = null;
    pop();
    remove(handle.el);
    if (restore && (restore as HTMLElement).focus && (restore as Element).isConnected) {
      try {
        (restore as HTMLElement).focus({ preventScroll: true });
      } catch {
        /* nothing to hand back to */
      }
    }
    onClose?.();
  }

  /**
   * `typing` (internal, for the filtered picker): while it returns true, keys
   * the float's own onKey did not take go to the focused field instead of the
   * float's defaults (q closes, j/k scroll …). Tab stays trapped.
   */
  function float(opts: FloatOptions, typing?: () => boolean): FloatHandle {
    closeFloat();
    const titleId = `lk-float-title-${++floatSeq}`;
    const body = h('div', { class: 'lk-float-body', attrs: { tabindex: '0' } }, opts.body);
    const win = h(
      'div',
      { class: 'lk-float-win', style: opts.width ? { width: opts.width } : {} },
      [
        h('div', { class: 'lk-float-title', attrs: { id: titleId } }, [
          icon(opts.icon ?? 'command'),
          h('span', { text: opts.title }),
        ]),
        body,
        opts.footer !== undefined
          ? h('div', { class: 'lk-float-footwrap' }, opts.footer)
          : footer([
              [['j', 'k'], t('foot.scroll')],
              [['q'], t('foot.close')],
            ]),
      ],
    );
    const el = h(
      'div',
      {
        class: ('lk-float ' + (opts.class ?? '')).trim(),
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        on: {
          mousedown: (e) => {
            if (e.target === el) closeFloat();
          },
        },
      },
      win,
    );

    const handle: FloatHandle = {
      el,
      body,
      close: closeFloat,
      setBody: (children) => replace(body, children),
    };

    const layer: KeyLayer = {
      name: 'float',
      onKey(e) {
        if (e.metaKey || e.altKey) return false;
        if (opts.onKey && opts.onKey(e) === true) return true;
        const key = e.key;
        if (typing?.()) return key === 'Tab';
        if (key === 'Escape' || key === 'q' || key === '?') {
          closeFloat();
          return true;
        }
        let by = 0;
        if (key === 'j' || key === 'ArrowDown') by = 60;
        else if (key === 'k' || key === 'ArrowUp') by = -60;
        else if (key === 'd' && e.ctrlKey) by = body.clientHeight / 2;
        else if (key === 'u' && e.ctrlKey) by = -body.clientHeight / 2;
        else if (key === 'G') by = body.scrollHeight;
        else if (key === 'g') {
          body.scrollTop = 0;
          return true;
        }
        if (by) {
          body.scrollTop += by;
          return true;
        }
        // Tab stays inside the dialog.
        if (key === 'Tab') return true;
        return false;
      },
    };

    const restore = typeof document !== 'undefined' ? document.activeElement : null;
    root().appendChild(el);
    const pop = deps.pushLayer(layer);
    current = { handle, pop, restore, ...(opts.onClose ? { onClose: opts.onClose } : {}) };
    try {
      body.focus({ preventScroll: true });
    } catch {
      /* not focusable in this environment */
    }
    return handle;
  }

  function picker<T extends PickerItem>(opts: PickerOptions<T>): FloatHandle {
    const items = opts.items;
    const filtering = opts.filter === true;
    const listId = `lk-picker-${floatSeq + 1}`;
    const list = h('ul', { class: 'lk-picker', attrs: { role: 'listbox', id: listId, 'aria-label': opts.title } });

    // What the list shows: every item, or the filter's hits in score order.
    let shown: Array<{ item: T; index: number; positions: number[] }> = items.map((item, index) => ({
      item,
      index,
      positions: [],
    }));
    let sel = Math.max(0, Math.min(opts.selected ?? 0, items.length - 1));
    // insert: the caret is in the filter; normal: j/k and friends move.
    let mode: 'insert' | 'normal' = 'insert';
    let pendingG = false;

    const input = filtering
      ? h('input', {
          class: 'lk-picker-input',
          attrs: {
            type: 'text',
            role: 'combobox',
            'aria-expanded': 'true',
            'aria-controls': listId,
            'aria-autocomplete': 'list',
            'aria-label': t('picker.filterLabel'),
            autocomplete: 'off',
            spellcheck: 'false',
            placeholder: opts.placeholder ?? t('picker.filter'),
          },
          on: {
            input: () => {
              refilter();
              sel = 0;
              draw();
            },
          },
        })
      : null;
    const count = filtering ? h('span', { class: 'lk-picker-count', attrs: { 'aria-hidden': 'true' } }) : null;
    const foot = h('div', { class: 'lk-picker-footwrap' });

    function refilter(): void {
      if (!input) return;
      shown = fuzzyFilter(
        input.value,
        items,
        (item) => item.label,
        (item) => item.keywords ?? [],
      ).map(({ item, index, match }) => ({ item, index, positions: match.positions }));
    }

    function label(text: string, positions: number[]): Child[] {
      if (!positions.length) return [text];
      const hits = new Set(positions);
      const out: Child[] = [];
      let run = '';
      let marked = false;
      const flush = () => {
        if (run) out.push(marked ? h('mark', { class: 'lk-picker-match', text: run }) : run);
        run = '';
      };
      for (let i = 0; i < text.length; i++) {
        if (hits.has(i) !== marked) {
          flush();
          marked = !marked;
        }
        run += text.charAt(i);
      }
      flush();
      return out;
    }

    function draw(): void {
      if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
      if (!shown.length) {
        replace(list, h('li', { class: 'lk-picker-empty', attrs: { role: 'presentation' }, text: t('picker.empty') }));
      } else {
        replace(
          list,
          shown.map(({ item, positions }, i) =>
            h(
              'li',
              {
                class: i === sel ? 'is-selected' : '',
                attrs: {
                  role: 'option',
                  id: `${listId}-${i}`,
                  'aria-selected': i === sel ? 'true' : 'false',
                  'data-i': i,
                },
                on: {
                  click: () => choose(i),
                  mousemove: () => {
                    if (sel === i) return;
                    sel = i;
                    mark();
                  },
                },
              },
              [
                h('span', { class: 'lk-picker-label' }, label(item.label, positions)),
                item.hint ? h('span', { class: 'lk-picker-hint', text: item.hint }) : null,
              ],
            ),
          ),
        );
      }
      if (count) count.textContent = t('picker.count', { n: shown.length, total: items.length });
      mark();
    }

    // Move the highlight without rebuilding the list.
    function mark(): void {
      Array.from(list.children).forEach((node, i) => {
        if (node.getAttribute('role') !== 'option') return;
        node.classList.toggle('is-selected', i === sel);
        node.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      });
      const node = list.children[sel] as HTMLElement | undefined;
      if (input) {
        if (node && shown.length) input.setAttribute('aria-activedescendant', node.id);
        else input.removeAttribute('aria-activedescendant');
      }
      node?.scrollIntoView?.({ block: 'nearest' });
    }

    function move(by: number): void {
      if (!shown.length) return;
      sel = (sel + by + shown.length) % shown.length;
      mark();
    }

    function choose(i: number): void {
      const entry = shown[i];
      closeFloat();
      if (entry) opts.onChoose(entry.item, entry.index);
    }

    function setMode(next: 'insert' | 'normal'): void {
      mode = next;
      pendingG = false;
      if (input) {
        input.readOnly = next === 'normal';
        input.closest('.lk-float-win')?.classList.toggle('is-normal', next === 'normal');
        try {
          input.focus({ preventScroll: true });
        } catch {
          /* not focusable in this environment */
        }
      }
      replace(
        foot,
        filtering && next === 'insert'
          ? footer([
              [['↑', '↓'], t('foot.move')],
              [['↵'], t('foot.choose')],
              [['esc'], t('foot.normal')],
            ])
          : footer([
              [['j', 'k'], t('foot.move')],
              ...(filtering ? ([[['i'], t('foot.filter')]] as Array<[string[], string]>) : []),
              [['↵'], t('foot.choose')],
              [['q'], t('foot.close')],
            ]),
      );
    }

    function onKey(e: KeyboardEvent): boolean {
      const key = e.key;
      const down = key === 'ArrowDown' || (e.ctrlKey && (key === 'n' || key === 'j'));
      const up = key === 'ArrowUp' || (e.ctrlKey && (key === 'p' || key === 'k'));
      if (down || up) {
        move(down ? 1 : -1);
        return true;
      }
      if (key === 'Enter') {
        if (shown.length) choose(sel);
        return true;
      }
      if (filtering && mode === 'insert') {
        if (key === 'Escape') {
          setMode('normal');
          return true;
        }
        return false; // the filter takes everything else
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (key === 'j' || key === 'k') {
        move(key === 'j' ? 1 : -1);
        return true;
      }
      if (key === 'G') {
        sel = Math.max(0, shown.length - 1);
        mark();
        return true;
      }
      if (key === 'g') {
        if (pendingG) {
          sel = 0;
          mark();
        }
        pendingG = !pendingG;
        return true;
      }
      pendingG = false;
      if (filtering && (key === 'i' || key === 'a' || key === '/')) {
        setMode('insert');
        return true;
      }
      return false; // q, Esc: the float closes
    }

    if (input && opts.query) {
      input.value = opts.query;
      refilter();
    }
    draw();
    setMode('insert');
    const handle = float(
      {
        title: opts.title,
        icon: opts.icon ?? 'list',
        width: opts.width ?? (filtering ? 'min(520px, 92vw)' : 'min(420px, 92vw)'),
        class: filtering ? 'lk-float--picker lk-float--filter' : 'lk-float--picker',
        body: input ? [h('div', { class: 'lk-picker-search' }, [icon('search'), input, count]), list] : list,
        footer: foot,
        onKey,
      },
      () => filtering && mode === 'insert',
    );
    if (input) {
      setMode('insert');
      input.select();
    }
    return handle;
  }

  return {
    root,
    icon,
    float,
    closeFloat,
    floatIsOpen: () => current !== null,
    remount() {
      if (rootEl && !rootEl.isConnected) deps.mount().appendChild(rootEl);
    },
    picker,
    footer,
    announce,
    destroy() {
      closeFloat();
      remove(rootEl);
      rootEl = null;
      srEl = null;
    },
  };
}
