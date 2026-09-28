/**
 * sidebar — the neo-tree panel. Sources are pluggable: the built-ins are the
 * outline of this page, the buffers visited this session and the settings;
 * a site adds its own explorer with `explorer({ load })`.
 *
 * Inside it: j/k move, Enter opens (or expands, or flips a switch), h/l
 * collapse and expand, / filters, Tab and 1–9 switch source, R reloads, q
 * closes. While it is open it owns the keyboard.
 */

import { h, icon, replace } from '../core/dom';
import type { InternalLazyKeys } from '../core/lazykeys';
import type { PluginContext, SidebarRow, SidebarSource } from '../types';
import { buffersSource, outlineSource, recordBuffer, settingsSource } from './sources';
import { definePlugin } from './util';

export interface SidebarApi {
  open(source?: string): void;
  close(): void;
  toggle(source?: string): void;
  isOpen(): boolean;
  /** The id of the source on show. */
  source(): string;
  /** Every registered source, in tab order. */
  sources(): SidebarSource[];
  /** Ask the current source for its rows again. */
  refresh(): void;
}

interface FlatRow {
  row: SidebarRow;
  depth: number;
  id: string;
  isDir: boolean;
  open: boolean;
}

function rowId(row: SidebarRow): string {
  return row.id ?? row.href ?? row.label;
}

function matches(row: SidebarRow, filter: string): boolean {
  const hay = (row.label + ' ' + (row.kind === 'option' ? '' : (row.hint ?? ''))).toLowerCase();
  return hay.includes(filter.toLowerCase());
}

/** Flatten a row tree for display. With a filter, keep matches and the folders above them. */
export function flattenRows(rows: SidebarRow[], openState: Map<string, boolean>, filter = '', depth = 0): FlatRow[] {
  const out: FlatRow[] = [];
  for (const row of rows) {
    const id = rowId(row);
    const d = depth + (row.depth ?? 0);
    if (row.children) {
      const open = filter ? true : (openState.get(id) ?? !!row.open);
      const kids = open || filter ? flattenRows(row.children, openState, filter, d + 1) : [];
      if (filter && !kids.length && !matches(row, filter)) continue;
      out.push({ row, depth: d, id, isDir: true, open });
      if (open) out.push(...kids);
      continue;
    }
    if (filter && row.kind !== 'header' && !matches(row, filter)) continue;
    out.push({ row, depth: d, id, isDir: false, open: false });
  }
  if (!filter) return out;
  // A heading with nothing left under it is noise.
  return out.filter((r, i) => r.row.kind !== 'header' || (out[i + 1] && out[i + 1]!.row.kind !== 'header'));
}

function createSidebar(ctx: PluginContext): SidebarApi & { destroy(): void } {
  const { t } = ctx;
  const lk = ctx.lk as InternalLazyKeys;
  let el: HTMLElement | null = null;
  let tabsEl!: HTMLElement;
  let listEl!: HTMLElement;
  let filterWrap!: HTMLElement;
  let filterEl!: HTMLInputElement;
  let current = '';
  let raw: SidebarRow[] = [];
  let flat: FlatRow[] = [];
  let sel = 0;
  let filter = '';
  let filtering = false;
  let pendingG = false;
  let loading = false;
  let ticket = 0;
  let pop: (() => void) | null = null;
  let restoreFocus: Element | null = null;
  const openState = new Map<string, Map<string, boolean>>();

  const sources = (): SidebarSource[] => [...lk._sources()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const sourceById = (id: string) => sources().find((s) => s.id === id);
  const labelOf = (s: SidebarSource) => s.label || t(`source.${s.id}`);
  const stateFor = (id: string) => {
    let m = openState.get(id);
    if (!m) openState.set(id, (m = new Map()));
    return m;
  };
  const isOpen = () => !!(el && el.classList.contains('is-open'));

  function build(): void {
    if (el) {
      if (!el.isConnected) ctx.ui.root().appendChild(el);
      return;
    }
    tabsEl = h('div', { class: 'lk-sb-tabs', attrs: { role: 'tablist' } });
    filterEl = h('input', {
      attrs: {
        type: 'text',
        placeholder: t('sidebar.filter'),
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': t('sidebar.filterLabel'),
      },
      on: {
        input: () => {
          filter = filterEl.value;
          sel = 0;
          render();
        },
      },
    });
    filterWrap = h('div', { class: 'lk-sb-filter', attrs: { hidden: true } }, [icon('search'), filterEl]);
    listEl = h('div', {
      class: 'lk-sb-list',
      attrs: { role: 'tree', tabindex: '-1', 'aria-label': t('sidebar.label') },
      on: {
        click: (e) => {
          const item = (e.target as Element).closest?.('[data-i]');
          if (!item) return;
          sel = parseInt(item.getAttribute('data-i') ?? '0', 10);
          activate();
        },
      },
    });
    el = h('aside', { class: 'lk-sb', attrs: { 'aria-label': t('sidebar.label') } }, [
      tabsEl,
      filterWrap,
      listEl,
      ctx.ui.footer([
        [['j', 'k'], t('foot.move')],
        [['↵'], t('foot.open')],
        [['/'], t('foot.filter')],
        [['q'], t('foot.close')],
      ]),
    ]);
    ctx.ui.root().appendChild(el);
  }

  function renderTabs(): void {
    replace(
      tabsEl,
      sources().map((s, i) =>
        h(
          'button',
          {
            class: 'lk-sb-tab' + (s.id === current ? ' is-active' : ''),
            attrs: {
              type: 'button',
              role: 'tab',
              tabindex: '-1',
              'aria-selected': s.id === current ? 'true' : 'false',
              title: `${labelOf(s)} (${i + 1})`,
            },
            on: {
              mousedown: (e) => e.preventDefault(),
              click: () => setSource(s.id),
            },
          },
          [icon(s.icon ?? 'file'), h('span', { text: labelOf(s) })],
        ),
      ),
    );
  }

  function render(): void {
    if (!el) return;
    renderTabs();
    flat = flattenRows(raw, stateFor(current), filter);
    if (sel >= flat.length) sel = Math.max(0, flat.length - 1);
    if (flat[sel]?.row.kind === 'header') sel = nextSelectable(sel, 1);

    if (!flat.length) {
      const text = loading
        ? t('sidebar.loading')
        : filter
          ? t('sidebar.noMatch', { filter })
          : t('sidebar.empty');
      replace(listEl, h('p', { class: 'lk-empty', text }));
      listEl.removeAttribute('aria-activedescendant');
      return;
    }

    replace(
      listEl,
      flat.map((f, i) => {
        const { row } = f;
        if (row.kind === 'header') {
          return h('div', { class: 'lk-sb-head', text: row.label, attrs: { role: 'presentation' } });
        }
        const classes = ['lk-sb-row'];
        if (i === sel) classes.push('is-selected');
        if (row.current) classes.push('is-current');
        if (row.dormant) classes.push('is-dormant');
        if (f.isDir) classes.push(f.open ? 'is-open' : 'is-closed');
        const right =
          row.toggled !== undefined
            ? h('span', {
                class: 'lk-sb-switch',
                text: t(row.toggled ? 'msg.on.short' : 'msg.off.short'),
                attrs: { 'data-on': row.toggled ? 'true' : 'false' },
              })
            : row.value !== undefined
              ? h('span', { class: 'lk-sb-value', text: row.value })
              : row.hint && row.kind !== 'option'
                ? h('span', { class: 'lk-sb-hint', text: row.hint })
                : null;
        return h(
          'div',
          {
            class: classes.join(' '),
            attrs: {
              role: 'treeitem',
              id: `lk-sb-row-${i}`,
              'data-i': i,
              'aria-level': f.depth + 1,
              'aria-selected': i === sel ? 'true' : 'false',
              'aria-expanded': f.isDir ? (f.open ? 'true' : 'false') : null,
              'aria-current': row.current ? 'page' : null,
              title: row.kind === 'option' ? (row.hint ?? null) : null,
            },
            style: { '--lk-depth': f.depth },
          },
          [
            f.isDir ? h('span', { class: 'lk-sb-twist', attrs: { 'aria-hidden': 'true' } }, icon('chevron')) : null,
            icon(row.icon ?? (f.isDir ? 'folder' : row.kind === 'option' ? 'gear' : row.kind === 'symbol' ? 'hash' : 'file')),
            h('span', { class: 'lk-sb-label', text: row.label }),
            right,
          ],
        );
      }),
    );
    listEl.setAttribute('aria-activedescendant', `lk-sb-row-${sel}`);
    const node = listEl.querySelector('.is-selected') as HTMLElement | null;
    node?.scrollIntoView?.({ block: 'nearest' });
  }

  function load(): void {
    const source = sourceById(current);
    const mine = ++ticket;
    if (!source) {
      raw = [];
      loading = false;
      render();
      return;
    }
    let result: SidebarRow[] | Promise<SidebarRow[]>;
    try {
      result = source.rows({ lk, t });
    } catch {
      result = [];
    }
    if (Array.isArray(result)) {
      raw = result;
      loading = false;
      render();
      return;
    }
    loading = true;
    raw = [];
    render();
    result.then(
      (rows) => {
        if (mine !== ticket) return;
        raw = rows;
        loading = false;
        render();
      },
      () => {
        if (mine !== ticket) return;
        raw = [];
        loading = false;
        render();
      },
    );
  }

  function nextSelectable(from: number, dir: 1 | -1): number {
    if (!flat.length) return 0;
    let i = from;
    for (let guard = 0; guard < flat.length; guard++) {
      if (flat[i] && flat[i]!.row.kind !== 'header') return i;
      i = (i + dir + flat.length) % flat.length;
    }
    return from;
  }

  function move(delta: 1 | -1): void {
    if (!flat.length) return;
    sel = nextSelectable((sel + delta + flat.length) % flat.length, delta);
    render();
  }

  function setOpen(f: FlatRow, open: boolean): void {
    stateFor(current).set(f.id, open);
    render();
  }

  function activate(): void {
    const f = flat[sel];
    if (!f) return;
    const { row } = f;
    if (f.isDir) {
      setOpen(f, !f.open);
      return;
    }
    if (row.onSelect) {
      const close_ = row.onSelect();
      if (close_ === true) close();
      else if (isOpen()) load();
      return;
    }
    if (row.href) {
      const href = row.href;
      close();
      lk.navigate(href);
    }
  }

  function collapseToParent(): void {
    const depth = flat[sel]?.depth ?? 0;
    for (let i = sel - 1; i >= 0; i--) {
      const f = flat[i]!;
      if (f.isDir && f.depth < depth) {
        sel = i;
        setOpen(f, false);
        return;
      }
    }
  }

  function setSource(id: string): void {
    current = id;
    sel = 0;
    filter = '';
    filterEl.value = '';
    stopFiltering();
    load();
  }

  function startFiltering(): void {
    filtering = true;
    filterWrap.hidden = false;
    el?.classList.add('is-filtering');
    filterEl.focus();
  }

  function stopFiltering(): void {
    filtering = false;
    if (!filter) filterWrap.hidden = true;
    el?.classList.remove('is-filtering');
    if (document.activeElement === filterEl) listEl.focus({ preventScroll: true });
  }

  function onKey(e: KeyboardEvent): boolean {
    if (filtering) {
      if (e.key === 'Escape') {
        filter = '';
        filterEl.value = '';
        stopFiltering();
        render();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        stopFiltering();
        return true;
      }
      return false; // the input owns everything else
    }
    if (e.metaKey || e.altKey) return false;
    const key = e.key;
    if (pendingG) {
      pendingG = false;
      if (key === 'g') {
        sel = nextSelectable(0, 1);
        render();
      }
      return true;
    }
    if (e.ctrlKey) {
      if (key === 'd') {
        for (let i = 0; i < 10; i++) move(1);
        return true;
      }
      if (key === 'u') {
        for (let i = 0; i < 10; i++) move(-1);
        return true;
      }
      return false;
    }
    const f = flat[sel];
    switch (key) {
      case 'Escape':
      case 'q':
        close();
        return true;
      case 'j':
      case 'ArrowDown':
        move(1);
        return true;
      case 'k':
      case 'ArrowUp':
        move(-1);
        return true;
      case 'g':
        pendingG = true;
        return true;
      case 'G':
        sel = nextSelectable(flat.length - 1, -1);
        render();
        return true;
      case 'Enter':
      case 'l':
      case 'o':
      case 'ArrowRight':
        if (f?.isDir && f.open && key !== 'Enter' && key !== 'o') move(1);
        else if (f?.row.kind === 'option' && (key === 'l' || key === 'ArrowRight')) {
          f.row.onCycle?.(1);
          load();
        } else activate();
        return true;
      case 'h':
      case 'ArrowLeft':
        if (f?.isDir && f.open) setOpen(f, false);
        else if (f?.row.kind === 'option') {
          f.row.onCycle?.(-1);
          load();
        } else collapseToParent();
        return true;
      case ' ':
        if (f?.row.onCycle) {
          f.row.onCycle(1);
          load();
        } else activate();
        return true;
      case 'Tab': {
        const ids = sources().map((s) => s.id);
        if (!ids.length) return true;
        const at = ids.indexOf(current);
        setSource(ids[(at + (e.shiftKey ? -1 : 1) + ids.length) % ids.length] as string);
        return true;
      }
      case '/':
        startFiltering();
        return true;
      case 'R': {
        const source = sourceById(current);
        source?.reload?.();
        load();
        if (source) lk.echo(t('sidebar.reloaded', { source: labelOf(source) }));
        return true;
      }
      default:
        if (/^[1-9]$/.test(key)) {
          const target = sources()[parseInt(key, 10) - 1];
          if (target) setSource(target.id);
          return true;
        }
        return false;
    }
  }

  function open(which?: string): void {
    const all = sources();
    if (!all.length) {
      lk.echo(t('sidebar.noSources'), 'warn');
      return;
    }
    let id = which ?? (current || all[0]!.id);
    if (!sourceById(id)) {
      if (which && which !== 'explorer') {
        lk.echo(t('sidebar.unknownSource', { source: which }), 'warn');
        return;
      }
      id = all[0]!.id;
    }
    build();
    const node = el as HTMLElement;
    node.setAttribute('data-side', ctx.settings.get<string>('sidebar') === 'left' ? 'left' : 'right');
    const wasOpen = isOpen();
    if (id !== current || !wasOpen) {
      current = id;
      sel = 0;
      filter = '';
      filterEl.value = '';
      filterWrap.hidden = true;
      load();
    }
    if (!wasOpen) {
      node.classList.add('is-open');
      document.documentElement.classList.add('lk-sidebar-open');
      document.documentElement.setAttribute('data-lk-sidebar', node.getAttribute('data-side') ?? 'right');
      restoreFocus = document.activeElement;
      pop = ctx.pushLayer({ name: 'sidebar', onKey });
      lk.setMode('normal');
    }
    listEl.focus({ preventScroll: true });
  }

  function close(): void {
    if (!isOpen()) return;
    stopFiltering();
    pendingG = false;
    el!.classList.remove('is-open');
    document.documentElement.classList.remove('lk-sidebar-open');
    document.documentElement.removeAttribute('data-lk-sidebar');
    pop?.();
    pop = null;
    const back = restoreFocus as HTMLElement | null;
    restoreFocus = null;
    if (back?.isConnected && back.focus) back.focus({ preventScroll: true });
    else if (el!.contains(document.activeElement)) (document.activeElement as HTMLElement).blur?.();
  }

  return {
    open,
    close,
    toggle(which) {
      if (isOpen() && (!which || which === current || (which === 'explorer' && !sourceById('explorer')))) close();
      else open(which);
    },
    isOpen,
    source: () => current,
    sources,
    refresh() {
      if (!isOpen()) return;
      document.documentElement.classList.add('lk-sidebar-open');
      document.documentElement.setAttribute('data-lk-sidebar', el?.getAttribute('data-side') ?? 'right');
      load();
    },
    destroy() {
      close();
      el?.parentNode?.removeChild(el);
      el = null;
    },
  };
}

export const sidebar = definePlugin({
  name: 'sidebar',
  settings: ({ t }) => [
    {
      key: 'sidebar',
      option: 'sidebar',
      type: 'enum',
      values: ['right', 'left'],
      default: 'right',
      group: t('settings.group'),
      label: t('setting.sidebar'),
      help: t('setting.sidebar.help'),
    },
  ],
  sources: (ctx) => [outlineSource(ctx), buffersSource(ctx), settingsSource(ctx)],
  keys: ({ lk, t }) => {
    const api = () => lk.use<SidebarApi>('sidebar');
    const toggle = (id: string) => () => api()?.toggle(id);
    return {
      '<leader> e': { desc: t('key.explorer'), run: toggle('explorer') },
      '<leader> f e': { desc: t('key.explorer'), run: toggle('explorer') },
      '<leader> ,': { desc: t('key.buffers'), run: toggle('buffers') },
      '<leader> f r': { desc: t('key.recent'), run: toggle('buffers') },
      '<leader> s s': { desc: t('key.symbols'), run: toggle('outline') },
      '<leader> u o': { desc: t('key.quickSettings'), run: toggle('settings') },
      'g o': { desc: t('key.outline'), section: t('section.go'), run: toggle('outline') },
    };
  },
  commands: ({ lk, t }) => {
    const open = (id: string) => () => lk.use<SidebarApi>('sidebar')?.open(id);
    return [
      { name: 'explorer', alias: ['Neotree', 'tree'], desc: t('cmd.explorer'), run: open('explorer') },
      { name: 'outline', alias: ['symbols'], desc: t('cmd.outline'), run: open('outline') },
      { name: 'buffers', alias: ['ls', 'bufs'], desc: t('cmd.buffers'), run: open('buffers') },
      { name: 'options', alias: ['opt'], desc: t('cmd.options'), run: open('settings') },
    ];
  },
  setup(ctx) {
    const api = createSidebar(ctx);
    ctx.provide<SidebarApi>('sidebar', api);
    recordBuffer(ctx);
    const offs = [
      ctx.lk.on('disable', api.close),
      ctx.lk.on('navigate', () => {
        recordBuffer(ctx);
        api.refresh();
      }),
      // The settings source is a view of the store, so a :set from anywhere
      // else has to show up here too.
      ctx.settings.on(() => {
        if (api.isOpen() && api.source() === 'settings') api.refresh();
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      api.destroy();
    };
  },
});
