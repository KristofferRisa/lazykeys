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

import { h, icon, replace } from '../core/dom';
import type { Completion } from '../core/ex';
import type { PluginContext } from '../types';
import { definePlugin } from './util';

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
  onInput?(value: string): { hint?: string; empty?: boolean } | void;
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

const HISTORY = 'history';

function createCmdline(ctx: PluginContext): CmdlineApi {
  const { t, lk } = ctx;
  const factories = new Map<string, () => PromptOptions>();
  let el: HTMLElement | null = null;
  let input!: HTMLInputElement;
  let hintEl!: HTMLElement;
  let menuEl!: HTMLElement;
  let titleEl!: HTMLElement;
  let iconEl!: HTMLElement;
  let prefixEl!: HTMLElement;
  let current: PromptOptions | null = null;
  let pop: (() => void) | null = null;
  let histIndex = -1;
  let menuItems: Completion[] = [];
  let menuSel = -1;
  let seq = 0;

  const readHistory = (): string[] => {
    const list = ctx.session.get<string[]>(HISTORY, []);
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  };

  function remember(line: string): void {
    const list = readHistory().filter((l) => l !== line);
    list.push(line);
    ctx.session.set(HISTORY, list.slice(-50));
  }

  function build(): void {
    if (el) {
      if (!el.isConnected) ctx.ui.root().appendChild(el);
      return;
    }
    const menuId = `lk-cmdline-menu-${++seq}`;
    input = h('input', {
      class: 'lk-cmdline-input',
      attrs: {
        type: 'text',
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-controls': menuId,
      },
      on: {
        input: () => onInput(),
        blur: () => {
          // A click elsewhere ends the line; the menu keeps focus with mousedown.
          setTimeout(() => {
            if (current && document.activeElement !== input) cancel();
          }, 0);
        },
      },
    });
    hintEl = h('span', { class: 'lk-cmdline-hint', attrs: { 'aria-live': 'polite' } });
    titleEl = h('span', { class: 'lk-cmdline-title' });
    iconEl = h('span', { class: 'lk-cmdline-icon', attrs: { 'aria-hidden': 'true' } });
    prefixEl = h('span', { class: 'lk-cmdline-prefix', attrs: { 'aria-hidden': 'true' } });
    menuEl = h('div', {
      class: 'lk-cmdline-menu',
      attrs: { role: 'listbox', id: menuId },
      on: {
        mousedown: (e) => {
          // mousedown, not click: the input must not lose focus first.
          e.preventDefault();
          const item = (e.target as Element).closest?.('[data-i]');
          if (!item) return;
          selectMenu(parseInt(item.getAttribute('data-i') ?? '0', 10));
          input.focus();
        },
      },
    });
    el = h('div', { class: 'lk-cmdline', attrs: { hidden: true } }, [
      h('div', { class: 'lk-cmdline-box' }, [titleEl, h('div', { class: 'lk-cmdline-line' }, [iconEl, prefixEl, input, hintEl])]),
      menuEl,
    ]);
    ctx.ui.root().appendChild(el);
  }

  function renderMenu(): void {
    const open = menuItems.length > 0;
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuEl.classList.toggle('is-open', open);
    if (!open) {
      replace(menuEl, []);
      input.removeAttribute('aria-activedescendant');
      return;
    }
    replace(
      menuEl,
      menuItems.slice(0, 12).map((item, i) =>
        h(
          'div',
          {
            class: 'lk-cmdline-item' + (i === menuSel ? ' is-selected' : ''),
            attrs: {
              role: 'option',
              id: `${menuEl.id}-${i}`,
              'aria-selected': i === menuSel ? 'true' : 'false',
              'data-i': i,
            },
          },
          [
            h('span', { class: 'lk-cmdline-item-key', text: item.label ?? item.value }),
            item.hint ? h('span', { class: 'lk-cmdline-item-doc', text: item.hint }) : null,
          ],
        ),
      ),
    );
    if (menuSel >= 0) {
      input.setAttribute('aria-activedescendant', `${menuEl.id}-${menuSel}`);
      (menuEl.children[menuSel] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function selectMenu(i: number): void {
    if (!menuItems.length) return;
    const shown = Math.min(menuItems.length, 12);
    menuSel = ((i % shown) + shown) % shown;
    input.value = (menuItems[menuSel] as Completion).value;
    renderMenu();
  }

  function setHint(text: string, empty = false): void {
    hintEl.textContent = text;
    hintEl.setAttribute('data-empty', empty ? 'true' : 'false');
  }

  function onInput(): void {
    if (!current) return;
    const value = input.value;
    if (current.onInput) {
      const r = current.onInput(value);
      setHint(r?.hint ?? '', !!r?.empty);
    }
    if (current.complete) {
      menuItems = current.complete(value);
      menuSel = -1;
      // One exact candidate is not a menu, it is what you already typed.
      if (menuItems.length === 1 && menuItems[0]?.value === value) menuItems = [];
      if (!current.onInput) setHint(menuItems.length ? t('cmdline.completions', { n: menuItems.length }) : '');
      renderMenu();
    }
  }

  function walkHistory(delta: number): void {
    if (!current) return;
    const prefix = current.prefix;
    const all = readHistory().filter((l) => l.startsWith(prefix));
    if (!all.length) return;
    if (histIndex === -1) histIndex = all.length;
    histIndex = Math.max(0, Math.min(histIndex + delta, all.length));
    input.value = histIndex === all.length ? '' : (all[histIndex] as string).slice(prefix.length);
    onInput();
  }

  function close(): void {
    if (!el || !current) return;
    current = null;
    pop?.();
    pop = null;
    el.hidden = true;
    el.classList.remove('is-open');
    menuItems = [];
    menuSel = -1;
    renderMenu();
    setHint('');
    if (document.activeElement === input) input.blur();
    if (lk.mode() === 'cmdline') lk.setMode('normal');
  }

  function cancel(): void {
    const was = current;
    close();
    was?.onCancel?.();
  }

  function accept(): void {
    const was = current;
    if (!was) return;
    const value = input.value;
    close();
    if (!value.trim()) return;
    remember(was.prefix + value);
    was.onAccept(value);
  }

  function onKey(e: KeyboardEvent): boolean {
    if (!current) return false;
    if (e.key === 'Escape') {
      cancel();
      return true;
    }
    if (e.key === 'Enter') {
      accept();
      return true;
    }
    if (e.key === 'Tab') {
      if (current.complete) {
        if (!menuItems.length) menuItems = current.complete(input.value);
        if (menuItems.length) selectMenu(menuSel + (e.shiftKey ? -1 : 1));
      }
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (menuItems.length && !e.ctrlKey) selectMenu(menuSel + (e.key === 'ArrowDown' ? 1 : -1));
      else walkHistory(e.key === 'ArrowUp' ? -1 : 1);
      return true;
    }
    if (e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'p')) {
      walkHistory(e.key === 'p' ? -1 : 1);
      return true;
    }
    if (e.key === 'Backspace' && input.value === '') {
      cancel();
      return true;
    }
    // Everything else is typing, and belongs to the input.
    if (document.activeElement !== input) input.focus();
    return false;
  }

  function prompt(opts: PromptOptions): void {
    if (current) close();
    build();
    const node = el as HTMLElement;
    current = opts;
    histIndex = -1;
    menuItems = [];
    menuSel = -1;
    const kind = opts.kind ?? (opts.prefix === ':' ? 'cmd' : 'prompt');
    node.setAttribute('data-shape', ctx.settings.get<string>('cmdline') === 'bottom' ? 'bottom' : 'popup');
    node.setAttribute('data-kind', kind);
    prefixEl.textContent = opts.prefix;
    titleEl.textContent = opts.title ?? '';
    replace(iconEl, icon(opts.icon ?? 'command'));
    input.setAttribute('aria-label', opts.label ?? opts.title ?? t('cmdline.label'));
    input.value = opts.initial ?? '';
    setHint('');
    renderMenu();
    node.hidden = false;
    node.classList.add('is-open');
    pop = ctx.pushLayer({ name: 'cmdline', onKey });
    lk.setMode('cmdline');
    input.focus();
    if (input.value) onInput();
  }

  const api: CmdlineApi = {
    open(prefix = ':', initial = '') {
      const factory = factories.get(prefix);
      if (!factory) {
        lk.echo(t('msg.unavailable', { what: prefix }), 'error');
        return;
      }
      prompt({ ...factory(), initial });
    },
    define(prefix, factory) {
      factories.set(prefix, factory);
      return () => {
        if (factories.get(prefix) === factory) factories.delete(prefix);
      };
    },
    prompt,
    close: cancel,
    active: () => current !== null,
    history: readHistory,
  };

  api.define(':', () => ({
    prefix: ':',
    title: t('cmdline.title'),
    label: t('cmdline.label'),
    icon: 'command',
    kind: 'cmd',
    complete: (value) => lk.complete(value),
    onAccept: (value) => void lk.exec(value),
  }));

  return api;
}

export const cmdline = definePlugin({
  name: 'cmdline',
  settings: ({ t }) => [
    {
      key: 'cmdline',
      option: 'cmdline',
      type: 'enum',
      values: ['popup', 'bottom'],
      default: 'popup',
      group: t('settings.group'),
      label: t('setting.cmdline'),
      help: t('setting.cmdline.help'),
    },
  ],
  keys: ({ lk, t }) => ({
    ':': {
      desc: t('key.cmdline'),
      section: t('section.search'),
      run: () => lk.use<CmdlineApi>('cmdline')?.open(':'),
    },
    '<leader> :': { desc: t('key.history'), run: () => void lk.exec('history') },
  }),
  commands: ({ lk, t, ui }) => [
    {
      name: 'history',
      alias: ['his'],
      desc: t('cmd.history'),
      run() {
        const api = lk.use<CmdlineApi>('cmdline');
        const all = api?.history() ?? [];
        if (!api || !all.length) {
          lk.echo(t('msg.noHistory'));
          return;
        }
        ui.picker({
          title: t('history.title'),
          icon: 'command',
          filter: true,
          items: all
            .slice()
            .reverse()
            .map((line) => ({ label: line })),
          onChoose: (item) => api.open(item.label.charAt(0), item.label.slice(1)),
        });
      },
    },
  ],
  setup(ctx) {
    const api = createCmdline(ctx);
    ctx.provide('cmdline', api);
    const offs = [ctx.lk.on('disable', api.close), ctx.lk.on('navigate', api.close)];
    return () => {
      api.close();
      offs.forEach((off) => off());
    };
  },
});
