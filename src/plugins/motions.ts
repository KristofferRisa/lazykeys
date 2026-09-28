/**
 * motions — scrolling the page the way j and k scroll a buffer, section jumps,
 * history, and `gi` into the first field.
 */

import type { PluginContext } from '../types';
import { definePlugin, isExcluded } from './util';

function jumpSection(ctx: PluginContext, dir: 1 | -1, n: number): void {
  const { scroll } = ctx.lk;
  const targets = ctx.options.sections().filter((el) => !isExcluded(el, ctx.options.exclude));
  if (!targets.length) {
    ctx.lk.echo(ctx.t('msg.noSections'));
    return;
  }
  const here = scroll.y() + 4;
  const tops = targets.map((el) => scroll.offsetOf(el) - 16);
  let idx = -1;
  if (dir > 0) {
    for (let a = 0; a < tops.length; a++) {
      if ((tops[a] as number) > here) {
        idx = Math.min(a + (n - 1), tops.length - 1);
        break;
      }
    }
    if (idx === -1) return scroll.to(scroll.max());
  } else {
    for (let b = tops.length - 1; b >= 0; b--) {
      if ((tops[b] as number) < here - 8) {
        idx = Math.max(b - (n - 1), 0);
        break;
      }
    }
    if (idx === -1) return scroll.to(0);
  }
  scroll.to(tops[idx] as number);
}

function focusFirstField(ctx: PluginContext): void {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(ctx.options.fields));
  const el = candidates.find(
    (c) => !isExcluded(c, ctx.options.exclude) && c.getClientRects().length > 0 && !(c as HTMLInputElement).disabled,
  );
  if (!el) {
    ctx.lk.echo(ctx.t('msg.noField'));
    return;
  }
  el.focus();
  (el as HTMLInputElement).select?.();
  ctx.lk.setMode('insert');
}

export const motions = definePlugin({
  name: 'motions',
  settings: ({ t }) => [
    {
      key: 'scroll',
      option: 'scroll',
      type: 'number',
      default: 72,
      min: 8,
      max: 400,
      step: 4,
      group: t('settings.group'),
      label: t('setting.scroll'),
      help: t('setting.scroll.help'),
    },
    {
      key: 'smoothscroll',
      option: 'smoothscroll',
      type: 'boolean',
      default: false,
      group: t('settings.group'),
      label: t('setting.smoothscroll'),
      help: t('setting.smoothscroll.help'),
    },
  ],
  keys: (ctx) => {
    const { lk, t, settings } = ctx;
    const s = lk.scroll;
    const step = () => settings.get<number>('scroll') || 72;
    const half = () => s.viewport() / 2;
    const motion = t('section.motion');
    const links = t('section.links');
    const go = t('section.go');
    return {
      j: { desc: t('key.down'), section: motion, run: ({ count }) => s.by(step() * count) },
      k: { desc: t('key.up'), section: motion, run: ({ count }) => s.by(-step() * count) },
      'C-e': { hidden: true, section: motion, run: ({ count }) => s.by(step() * count) },
      'C-y': { hidden: true, section: motion, run: ({ count }) => s.by(-step() * count) },
      d: { desc: t('key.halfDown'), section: motion, run: ({ count }) => s.by(half() * count) },
      u: { desc: t('key.halfUp'), section: motion, run: ({ count }) => s.by(-half() * count) },
      'C-d': { hidden: true, section: motion, run: ({ count }) => s.by(half() * count) },
      'C-u': { hidden: true, section: motion, run: ({ count }) => s.by(-half() * count) },
      'g g': {
        desc: t('key.top'),
        section: motion,
        run: ({ count, hasCount }) => (hasCount ? s.toPercent(count) : s.to(0)),
      },
      G: {
        desc: t('key.bottom'),
        section: motion,
        run: ({ count, hasCount }) => (hasCount ? s.toPercent(count) : s.to(s.max())),
      },
      '%': { desc: t('key.percent'), section: motion, run: ({ count }) => s.toPercent(count) },
      '}': { desc: t('key.nextSection'), section: motion, run: ({ count }) => jumpSection(ctx, 1, count) },
      '{': { desc: t('key.prevSection'), section: motion, run: ({ count }) => jumpSection(ctx, -1, count) },
      H: { desc: t('key.back'), section: links, run: ({ count }) => history.go(-count) },
      L: { desc: t('key.forward'), section: links, run: ({ count }) => history.go(count) },
      r: { desc: t('key.reload'), section: links, run: () => location.reload() },
      'g i': { desc: t('key.field'), section: go, run: () => focusFirstField(ctx) },
      i: { hidden: true, section: go, run: () => focusFirstField(ctx) },
    };
  },
});
