/**
 * The shared furniture: one root element, floating windows (`:help`,
 * `:messages`, `:checkhealth`, the pickers) and a screen-reader line.
 *
 * A float is a modal dialog in everything but name: one at a time, it takes
 * the keyboard while it is up, moves focus into itself and hands it back to
 * wherever it was when it closes.
 */

import { type Child, h, icon, kbds, remove, replace } from './dom';
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

  function float(opts: FloatOptions): FloatHandle {
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
    let sel = Math.max(0, Math.min(opts.selected ?? 0, items.length - 1));
    const listId = `lk-picker-${floatSeq + 1}`;
    const list = h('ul', { class: 'lk-picker', attrs: { role: 'listbox', id: listId } });

    function draw(): void {
      replace(
        list,
        items.map((item, i) =>
          h(
            'li',
            {
              class: i === sel ? 'is-selected' : '',
              attrs: { role: 'option', 'aria-selected': i === sel ? 'true' : 'false', 'data-i': i },
              on: {
                click: () => choose(i),
              },
            },
            [
              h('span', { class: 'lk-picker-label', text: item.label }),
              item.hint ? h('span', { class: 'lk-picker-hint', text: item.hint }) : null,
            ],
          ),
        ),
      );
      const node = list.children[sel] as HTMLElement | undefined;
      node?.scrollIntoView?.({ block: 'nearest' });
    }

    function choose(i: number): void {
      const item = items[i];
      closeFloat();
      if (item) opts.onChoose(item, i);
    }

    draw();
    return float({
      title: opts.title,
      icon: opts.icon ?? 'list',
      width: opts.width ?? 'min(420px, 92vw)',
      class: 'lk-float--picker',
      body: list,
      footer: footer([
        [['j', 'k'], t('foot.move')],
        [['↵'], t('foot.choose')],
        [['q'], t('foot.close')],
      ]),
      onKey(e) {
        if (!items.length) return false;
        if (e.key === 'j' || e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
          sel = (sel + 1) % items.length;
          draw();
          return true;
        }
        if (e.key === 'k' || e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
          sel = (sel - 1 + items.length) % items.length;
          draw();
          return true;
        }
        if (e.key === 'Enter') {
          choose(sel);
          return true;
        }
        return false;
      },
    });
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
