/**
 * statusline — lualine's segments, in lualine's order: mode, section, path,
 * the last message, the search position, pending keys, and how far down the
 * page you are. Any plugin adds a segment with `statusline: [...]`.
 *
 * It is decorative to assistive tech (a screen reader announcing every j would
 * be a punishment); messages reach screen readers through the live region.
 */

import { type Child, append, h } from '../core/dom';
import { tokenDisplay } from '../core/keys';
import type { InternalLazyKeys } from '../core/lazykeys';
import type { Mode, PluginContext, StatusContext, StatusSegment } from '../types';
import { definePlugin, toggleSetting } from './util';

const KNOWN_MODES = new Set(['normal', 'insert', 'cmdline', 'hints']);

function modeLabel(ctx: PluginContext, mode: Mode): string {
  return KNOWN_MODES.has(mode) ? ctx.t(`mode.${mode}`) : String(mode).toUpperCase();
}

function createStatusline(ctx: PluginContext) {
  const lk = ctx.lk as InternalLazyKeys;
  let el: HTMLElement | null = null;
  let frame = 0;

  function visible(): boolean {
    return lk.isEnabled() && ctx.settings.get<boolean>('statusline') !== false;
  }

  function teardown(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    el?.parentNode?.removeChild(el);
    el = null;
    document.documentElement.classList.remove('lk-status-on');
  }

  function render(): void {
    frame = 0;
    if (!visible()) {
      teardown();
      return;
    }
    if (!el) el = h('div', { class: 'lk-status', attrs: { 'aria-hidden': 'true' } });
    if (!el.isConnected) ctx.ui.root().appendChild(el);
    document.documentElement.classList.add('lk-status-on');
    const state = lk.dispatcher.state;
    const status: StatusContext = {
      lk,
      t: ctx.t,
      mode: lk.mode(),
      pending: state.count + state.keys.map(tokenDisplay).join(''),
      message: lk._echo(),
    };
    el.setAttribute('data-mode', status.mode);
    const segments = [...lk._segments].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    const nodes: HTMLElement[] = [];
    for (const seg of segments) {
      let content: Child | Child[];
      try {
        content = seg.render(status);
      } catch {
        content = null;
      }
      const list = (Array.isArray(content) ? content : [content]).filter(
        (c) => c !== null && c !== undefined && c !== false && c !== '',
      );
      const node = h('span', {
        class: ['lk-seg', `lk-seg--${seg.id}`, seg.grow ? 'is-grow' : '', seg.class ?? ''].filter(Boolean).join(' '),
      });
      if (list.length) append(node, list);
      else node.hidden = !seg.grow;
      nodes.push(node);
    }
    el.replaceChildren(...nodes);
  }

  function schedule(): void {
    if (frame) return;
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(render);
    else render();
  }

  return { render, schedule, teardown };
}

export const statusline = definePlugin({
  name: 'statusline',
  settings: ({ t }) => [
    {
      key: 'statusline',
      option: 'statusline',
      type: 'boolean',
      default: true,
      group: t('settings.group'),
      label: t('setting.statusline'),
      help: t('setting.statusline.help'),
    },
  ],
  keys: (ctx) => ({
    '<leader> u l': { desc: ctx.t('key.statusline'), run: () => toggleSetting(ctx, 'statusline') },
  }),
  statusline: (ctx): StatusSegment[] => [
    { id: 'mode', order: 10, render: (s) => modeLabel(ctx, s.mode) },
    {
      id: 'section',
      order: 20,
      render: () => [ctx.ui.icon('branch'), h('span', { text: ctx.options.section() || ctx.t('status.home') })],
    },
    { id: 'path', order: 30, render: () => decodeURI(location.pathname) },
    { id: 'message', order: 40, grow: true, render: (s) => s.message.text },
    { id: 'keys', order: 60, render: (s) => s.pending },
    { id: 'position', order: 90, render: ({ lk }) => lk.scroll.percent() },
  ],
  setup(ctx) {
    const bar = createStatusline(ctx);
    const onScroll = () => bar.schedule();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    const offs = [
      ctx.lk.on('render', bar.schedule),
      ctx.lk.on('enable', bar.render),
      ctx.lk.on('disable', bar.teardown),
    ];
    if (ctx.lk.isEnabled()) bar.render();
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      offs.forEach((off) => off());
      bar.teardown();
    };
  },
});
