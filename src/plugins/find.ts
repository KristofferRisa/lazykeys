/**
 * find — `/` finds text on the page, `n` and `N` walk the matches.
 *
 * Matches are Ranges, never wrapped elements: the page's DOM is left exactly
 * as it was built, so nothing downstream (anchors, frameworks, copy) sees a
 * mutated tree. They are painted with the CSS Custom Highlight API where it
 * exists; where it does not, jumping still works and only the colour is gone.
 */

import type { PluginContext } from '../types';
import type { CmdlineApi } from './cmdline';
import { definePlugin, isExcluded, toggleSetting } from './util';

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

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'TEMPLATE', 'SVG']);
const MAX = 500;

interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}

function registry(): HighlightRegistry | null {
  const css = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: HighlightRegistry }) : null;
  const HighlightCtor = (globalThis as { Highlight?: unknown }).Highlight;
  return css?.highlights && HighlightCtor ? css.highlights : null;
}

function makeHighlight(ranges: Range[]): unknown {
  const Ctor = (globalThis as unknown as { Highlight: new () => { add(r: Range): void } }).Highlight;
  const hl = new Ctor();
  for (const r of ranges) hl.add(r);
  return hl;
}

/** Collect matches under a root. Exported for tests. */
export function collectMatches(root: Node, needle: string, ignoreCase: boolean, exclude: string): Range[] {
  const out: Range[] = [];
  if (!needle) return out;
  // Vim's smartcase: an uppercase letter in the pattern means you meant it.
  const fold = ignoreCase && !/[A-Z]/.test(needle);
  const probe = fold ? needle.toLowerCase() : needle;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP.has(parent.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      if (isExcluded(parent, exclude)) return NodeFilter.FILTER_REJECT;
      if (!parent.getClientRects().length) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode()) && out.length < MAX) {
    const text = fold ? (node.nodeValue ?? '').toLowerCase() : (node.nodeValue ?? '');
    let from = 0;
    while (out.length < MAX) {
      const at = text.indexOf(probe, from);
      if (at === -1) break;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      out.push(range);
      from = at + needle.length;
    }
  }
  return out;
}

function createFind(ctx: PluginContext): FindApi & { repaint(): void } {
  let matches: Range[] = [];
  let index = -1;
  let pattern = '';

  function unpaint(): void {
    const reg = registry();
    if (!reg) return;
    try {
      reg.delete('lk-search');
      reg.delete('lk-search-current');
    } catch {
      /* nothing to undo */
    }
  }

  function paint(): void {
    const reg = registry();
    if (!reg) return;
    try {
      if (ctx.settings.get<boolean>('hlsearch') && matches.length) reg.set('lk-search', makeHighlight(matches));
      else reg.delete('lk-search');
      const current = matches[index];
      if (current) reg.set('lk-search-current', makeHighlight([current]));
      else reg.delete('lk-search-current');
    } catch {
      unpaint();
    }
  }

  function reveal(i: number): void {
    const range = matches[i];
    if (!range) return;
    const s = ctx.lk.scroll;
    s.to(Math.max(0, s.offsetOf(range) - s.viewport() / 3));
  }

  function nearest(): number {
    const s = ctx.lk.scroll;
    const here = s.y() + 8;
    const at = matches.findIndex((r) => s.offsetOf(r) >= here);
    return at === -1 ? 0 : at;
  }

  function report(): void {
    ctx.lk.echo(ctx.t('msg.searchPos', { pattern, index: index + 1, total: matches.length }));
  }

  const api: FindApi & { repaint(): void } = {
    repaint: paint,
    preview(text) {
      pattern = text;
      matches = collectMatches(
        ctx.options.root(),
        text,
        ctx.settings.get<boolean>('ignorecase') !== false,
        ctx.options.exclude,
      );
      index = matches.length ? nearest() : -1;
      paint();
      ctx.lk.echo('');
      return matches.length;
    },
    accept(text) {
      const n = api.preview(text);
      if (!n) {
        ctx.lk.echo(ctx.t('msg.notFound', { pattern: text }));
        return 0;
      }
      reveal(index);
      report();
      return n;
    },
    next(delta = 1) {
      if (!matches.length && pattern) api.preview(pattern);
      if (!matches.length) {
        ctx.lk.echo(ctx.t(pattern ? 'msg.noMatches' : 'msg.noPrevSearch'));
        return;
      }
      index = (((index + delta) % matches.length) + matches.length) % matches.length;
      paint();
      reveal(index);
      report();
    },
    clear() {
      unpaint();
      matches = [];
      index = -1;
    },
    nohl: unpaint,
    pattern: () => pattern,
    count: () => matches.length,
    index: () => index,
  };
  return api;
}

export const find = definePlugin({
  name: 'find',
  settings: ({ t }) => [
    {
      key: 'hlsearch',
      option: 'hlsearch',
      type: 'boolean',
      default: true,
      group: t('settings.group'),
      label: t('setting.hlsearch'),
      help: t('setting.hlsearch.help'),
    },
    {
      key: 'ignorecase',
      option: 'ignorecase',
      type: 'boolean',
      default: true,
      group: t('settings.group'),
      label: t('setting.ignorecase'),
      help: t('setting.ignorecase.help'),
    },
  ],
  keys: (ctx) => {
    const { lk, t } = ctx;
    const api = () => lk.use<FindApi>('find');
    const open = () => {
      const cmdline = lk.use<CmdlineApi>('cmdline');
      if (!cmdline) lk.echo(t('msg.unavailable', { what: '/' }), 'error');
      else cmdline.open('/');
    };
    const section = t('section.search');
    return {
      '/': { desc: t('key.find'), section, run: open },
      n: { desc: t('key.findNext'), section, run: ({ count }) => api()?.next(count) },
      N: { desc: t('key.findPrev'), section, run: ({ count }) => api()?.next(-count) },
      '<leader> s h': { desc: t('key.find'), run: open },
      '<leader> u h': { desc: t('key.hlsearch'), run: () => toggleSetting(ctx, 'hlsearch') },
    };
  },
  commands: ({ lk, t }) => [
    {
      name: 'nohlsearch',
      alias: ['noh', 'nohl'],
      desc: t('cmd.nohlsearch'),
      run() {
        lk.use<FindApi>('find')?.nohl();
        lk.echo('');
      },
    },
  ],
  statusline: ({ lk }) => [
    {
      id: 'search',
      order: 50,
      render() {
        const api = lk.use<FindApi>('find');
        if (!api || !api.pattern() || !api.count()) return null;
        return `${api.index() + 1}/${api.count()}`;
      },
    },
  ],
  setup(ctx) {
    const api = createFind(ctx);
    ctx.provide('find', api);
    const { lk, t } = ctx;
    const undefine = lk.use<CmdlineApi>('cmdline')?.define('/', () => {
      const before = lk.scroll.y();
      return {
        prefix: '/',
        title: t('cmdline.searchTitle'),
        label: t('cmdline.searchLabel'),
        icon: 'search',
        kind: 'search',
        onInput(value) {
          if (!value) {
            api.clear();
            return { hint: '' };
          }
          const n = api.preview(value);
          return { hint: n ? t('cmdline.matches', { n }) : t('cmdline.noMatches'), empty: !n };
        },
        onAccept: (value) => void api.accept(value),
        onCancel() {
          api.clear();
          lk.scroll.to(before);
        },
      };
    });
    const offs = [
      () => undefine?.(),
      ctx.lk.on('escape', api.clear),
      ctx.lk.on('disable', api.clear),
      ctx.lk.on('navigate', api.clear),
      ctx.settings.on((key) => {
        if (key === 'hlsearch' || key === null) api.repaint();
      }),
    ];
    return () => {
      api.clear();
      offs.forEach((off) => off());
    };
  },
});
