/**
 * hints — `f` labels every link in view; type the label to follow it. `F`
 * opens it in a new tab. flash.nvim maps the same thing to `s`, so `s` works
 * too.
 *
 * Only what is on screen gets a label, which is what keeps labels one or two
 * characters long on a page with a hundred links below the fold. The labels
 * are pinned where things were when `f` was pressed, so any movement
 * underneath them ends the round rather than lying about it.
 */

import { h, remove } from '../core/dom';
import { labelsFor } from '../core/labels';
import type { PluginContext } from '../types';
import { definePlugin, inView, isExcluded } from './util';

export interface HintTarget {
  label: string;
  tag: string;
  href: string;
}

export interface HintsApi {
  start(opts?: { newTab?: boolean }): void;
  cancel(): void;
  active(): boolean;
  /** What is labelled right now, and where each label goes. */
  list(): HintTarget[];
}

function createHints(ctx: PluginContext): HintsApi {
  let container: HTMLElement | null = null;
  let hints: Array<{ el: HTMLElement; label: string; node: HTMLElement }> = [];
  let typed = '';
  let newTab = false;
  let pop: (() => void) | null = null;
  let startY = 0;

  // A scroll event can arrive a frame after the motion that caused it (`ggf`
  // typed fast), so only real movement since the labels were drawn ends them.
  function onScroll(): void {
    if (Math.abs(ctx.lk.scroll.y() - startY) > 2) cancel();
  }

  function chars(): string {
    const raw = String(ctx.settings.get('hintchars') ?? '')
      .replace(/\s/g, '')
      .toLowerCase();
    return new Set(raw).size >= 2 ? raw : 'asdfghjkl';
  }

  function render(): void {
    for (const hint of hints) {
      const match = hint.label.startsWith(typed);
      hint.node.hidden = !match;
      while (hint.node.firstChild) hint.node.removeChild(hint.node.firstChild);
      if (match && typed) {
        hint.node.appendChild(h('b', { text: hint.label.slice(0, typed.length) }));
        hint.node.appendChild(document.createTextNode(hint.label.slice(typed.length)));
      } else {
        hint.node.textContent = hint.label;
      }
    }
  }

  function follow(el: HTMLElement): void {
    const tab = newTab;
    cancel();
    const href = (el as HTMLAnchorElement).href;
    if (tab && href) {
      ctx.lk.navigate(href, { newTab: true });
      return;
    }
    // click() rather than following href: pages hang behaviour off real
    // clicks (routers, menus, summary, buttons).
    el.focus?.({ preventScroll: true });
    el.click();
  }

  function onKey(e: KeyboardEvent): boolean {
    if (e.metaKey || e.altKey || e.ctrlKey) return false;
    if (e.key === 'Escape') {
      cancel();
      return true;
    }
    if (e.key === 'Backspace') {
      typed = typed.slice(0, -1);
      render();
      return true;
    }
    if (e.key === 'Enter') {
      const first = hints.find((x) => x.label.startsWith(typed));
      if (first) follow(first.el);
      else cancel();
      return true;
    }
    if (e.key.length !== 1) return true;
    const next = typed + e.key.toLowerCase();
    const candidates = hints.filter((x) => x.label.startsWith(next));
    if (!candidates.length) {
      cancel();
      return true;
    }
    typed = next;
    const only = candidates[0];
    if (candidates.length === 1 && only && only.label === typed) {
      follow(only.el);
      return true;
    }
    render();
    return true;
  }

  function start(opts: { newTab?: boolean } = {}): void {
    cancel();
    newTab = !!opts.newTab;
    const all = Array.from(document.querySelectorAll<HTMLElement>(ctx.options.hintTargets));
    const targets = all.filter((el) => !isExcluded(el, ctx.options.exclude) && inView(el));
    if (!targets.length) {
      ctx.lk.echo(ctx.t('msg.noHints'));
      return;
    }
    const labels = labelsFor(targets.length, chars());
    container = h('div', { class: 'lk-hints', attrs: { 'aria-hidden': 'true', 'data-new-tab': newTab ? 'true' : null } });
    targets.forEach((el, i) => {
      const r = el.getClientRects()[0] as DOMRect;
      const node = h('span', {
        class: 'lk-hint',
        text: labels[i] as string,
        style: { left: Math.max(0, r.left - 4) + 'px', top: Math.max(0, r.top - 6) + 'px' },
      });
      container!.appendChild(node);
      hints.push({ el, label: labels[i] as string, node });
    });
    ctx.ui.root().appendChild(container);
    typed = '';
    render();
    pop = ctx.pushLayer({ name: 'hints', onKey });
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('resize', cancel);
    startY = ctx.lk.scroll.y();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    ctx.lk.setMode('hints');
    ctx.ui.announce(ctx.t('msg.hintsActive'));
  }

  function cancel(): void {
    if (!container) return;
    window.removeEventListener('wheel', cancel);
    window.removeEventListener('resize', cancel);
    window.removeEventListener('scroll', onScroll, { capture: true });
    pop?.();
    pop = null;
    remove(container);
    container = null;
    hints = [];
    typed = '';
    if (ctx.lk.mode() === 'hints') ctx.lk.setMode('normal');
  }

  return {
    start,
    cancel,
    active: () => container !== null,
    list: () =>
      hints.map((x) => ({ label: x.label, tag: x.el.tagName.toLowerCase(), href: (x.el as HTMLAnchorElement).href ?? '' })),
  };
}

export const hints = definePlugin({
  name: 'hints',
  settings: ({ t }) => [
    {
      key: 'hintchars',
      option: 'hintchars',
      type: 'string',
      default: 'asdfghjkl',
      group: t('settings.group'),
      label: t('setting.hintchars'),
      help: t('setting.hintchars.help'),
    },
  ],
  keys: ({ lk, t }) => {
    const api = () => lk.use<HintsApi>('hints');
    const section = t('section.links');
    return {
      f: { desc: t('key.hint'), section, run: () => api()?.start({ newTab: false }) },
      F: { desc: t('key.hintNewTab'), section, run: () => api()?.start({ newTab: true }) },
      s: { hidden: true, section, run: () => api()?.start({ newTab: false }) },
      S: { hidden: true, section, run: () => api()?.start({ newTab: true }) },
    };
  },
  setup(ctx) {
    const api = createHints(ctx);
    ctx.provide('hints', api);
    const offs = [ctx.lk.on('disable', api.cancel), ctx.lk.on('navigate', api.cancel)];
    return () => {
      api.cancel();
      offs.forEach((off) => off());
    };
  },
});
