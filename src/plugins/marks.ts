/**
 * marks — `m{a-z}` sets a mark on this page, `m{A-Z}` one that spans the
 * site, `'{mark}` jumps back. A jump to another page hands the scroll position
 * over through sessionStorage, since the jump is a navigation.
 */

import { h } from '../core/dom';
import type { PluginContext } from '../types';
import { definePlugin } from './util';

interface Mark {
  path: string;
  y: number;
}

const MARKS = 'marks';
const PENDING = 'pending-scroll';

function marks(ctx: PluginContext): Record<string, Mark> {
  const value = ctx.session.get<Record<string, Mark>>(MARKS, {});
  return value && typeof value === 'object' ? value : {};
}

function keyOf(letter: string): string {
  return letter === letter.toUpperCase() ? letter : `${location.pathname}|${letter}`;
}

function setMark(ctx: PluginContext, letter = ''): void {
  if (!/^[a-zA-Z]$/.test(letter)) {
    ctx.lk.echo(ctx.t('msg.markInvalid'), 'warn');
    return;
  }
  const all = marks(ctx);
  all[keyOf(letter)] = { path: location.pathname, y: ctx.lk.scroll.y() };
  ctx.session.set(MARKS, all);
  const global = letter === letter.toUpperCase();
  ctx.lk.echo(ctx.t(global ? 'msg.markSetGlobal' : 'msg.markSet', { mark: letter }), 'success');
}

function jumpMark(ctx: PluginContext, letter = ''): void {
  if (!/^[a-zA-Z]$/.test(letter)) {
    ctx.lk.echo(ctx.t('msg.markInvalid'), 'warn');
    return;
  }
  const mark = marks(ctx)[keyOf(letter)];
  if (!mark) {
    ctx.lk.echo(ctx.t('msg.markUnset', { mark: letter }), 'warn');
    return;
  }
  if (mark.path !== location.pathname) {
    ctx.session.set(PENDING, mark.y);
    ctx.lk.navigate(mark.path);
    return;
  }
  ctx.lk.scroll.to(mark.y);
}

function restorePending(ctx: PluginContext): void {
  const y = ctx.session.get<number | null>(PENDING, null);
  if (y === null) return;
  ctx.session.remove(PENDING);
  const scroller = ctx.lk.scroll;
  // After layout, so the page is tall enough to land where the mark was.
  requestAnimationFrame(() => scroller.to(Number(y) || 0));
}

export const marksPlugin = definePlugin({
  name: 'marks',
  keys: (ctx) => ({
    m: { desc: ctx.t('key.setMark'), section: ctx.t('section.marks'), arg: '{a-z A-Z}', run: ({ arg }) => setMark(ctx, arg) },
    "'": { desc: ctx.t('key.jumpMark'), section: ctx.t('section.marks'), arg: '{a-z A-Z}', run: ({ arg }) => jumpMark(ctx, arg) },
    '<leader> s m': { desc: ctx.t('key.marks'), run: () => void ctx.lk.exec('marks') },
  }),
  commands: (ctx) => [
    {
      name: 'marks',
      desc: ctx.t('cmd.marks'),
      run() {
        const all = marks(ctx);
        const keys = Object.keys(all).sort();
        if (!keys.length) {
          ctx.lk.echo(ctx.t('msg.noMarks'), 'warn');
          return;
        }
        const rows = keys.map((k) => {
          const m = all[k] as Mark;
          return ` ${k.split('|').pop()}     ${String(Math.round(m.y)).padStart(5)}  ${m.path}`;
        });
        ctx.ui.float({
          title: ctx.t('marks.title'),
          icon: 'list',
          class: 'lk-float--marks',
          body: h('pre', { class: 'lk-pre', text: ctx.t('marks.header') + '\n' + rows.join('\n') }),
        });
      },
    },
  ],
  setup(ctx) {
    restorePending(ctx);
    return ctx.lk.on('navigate', () => restorePending(ctx));
  },
});
