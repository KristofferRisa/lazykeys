/**
 * notifier — the corner toasts, nvim-notify by way of snacks.nvim: a message
 * that matters should not have to compete for the one line at the bottom.
 * Newest at the bottom, five at most; `:messages` keeps the log either way.
 */

import { h, remove } from '../core/dom';
import type { Message, NotifyOptions, PluginContext } from '../types';
import { definePlugin, sidebarSide } from './util';

const LEVEL_ICON = { info: 'info', warn: 'alert', error: 'alert', success: 'check' } as const;

export interface NotifierApi {
  /** Draw a toast. Returns false when toasts are switched off. */
  show(message: Message, opts?: NotifyOptions): boolean;
  dismissAll(): void;
}

function createNotifier(ctx: PluginContext): NotifierApi & { destroy(): void } {
  let host: HTMLElement | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function ensure(): HTMLElement {
    if (!host || !host.isConnected) {
      host = h('div', {
        class: 'lk-notify',
        attrs: { 'aria-live': 'polite', 'aria-relevant': 'additions', role: 'log' },
      });
      ctx.ui.root().appendChild(host);
    }
    host.setAttribute('data-side', sidebarSide(ctx));
    return host;
  }

  function dismiss(toast: HTMLElement): void {
    if (!toast.isConnected) return;
    toast.classList.add('is-leaving');
    const timer = setTimeout(() => {
      timers.delete(timer);
      remove(toast);
      if (host && !host.children.length) {
        remove(host);
        host = null;
      }
    }, 200);
    timers.add(timer);
  }

  return {
    show(message, opts = {}) {
      if (ctx.settings.get<boolean>('notify') === false) return false;
      const parent = ensure();
      const toast = h(
        'div',
        {
          class: 'lk-toast',
          attrs: { 'data-level': message.level },
          on: { click: () => dismiss(toast) },
        },
        [
          ctx.ui.icon(LEVEL_ICON[message.level] ?? 'info'),
          h('div', { class: 'lk-toast-text' }, [
            message.title ? h('b', { text: message.title }) : null,
            h('span', { text: message.message }),
          ]),
        ],
      );
      parent.appendChild(toast);
      while (parent.children.length > 5 && parent.firstChild) parent.removeChild(parent.firstChild);
      const timeout = opts.timeout ?? (message.level === 'error' ? 6000 : 3800);
      if (timeout > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          dismiss(toast);
        }, timeout);
        timers.add(timer);
      }
      return true;
    },
    dismissAll() {
      if (!host) return;
      Array.from(host.children).forEach((c) => dismiss(c as HTMLElement));
    },
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      remove(host);
      host = null;
    },
  };
}

export const notifier = definePlugin({
  name: 'notifier',
  settings: ({ t }) => [
    {
      key: 'notify',
      option: 'notify',
      type: 'boolean',
      default: true,
      group: t('settings.group'),
      label: t('setting.notify'),
      help: t('setting.notify.help'),
    },
  ],
  keys: ({ lk, t }) => ({
    '<leader> u n': { desc: t('key.dismiss'), run: () => lk.use<NotifierApi>('notifier')?.dismissAll() },
    '<leader> s n': { desc: t('key.notifications'), run: () => void lk.exec('messages') },
  }),
  commands: ({ lk, t, ui }) => [
    {
      name: 'messages',
      alias: ['mes', 'notifications'],
      desc: t('cmd.messages'),
      run() {
        const all = lk.messages();
        const body = all.length
          ? h(
              'ul',
              { class: 'lk-msglist' },
              all
                .slice()
                .reverse()
                .map((m) =>
                  h('li', { attrs: { 'data-level': m.level } }, [
                    h('time', { text: m.at.toTimeString().slice(0, 8), attrs: { datetime: m.at.toISOString() } }),
                    h('span', { text: m.message }),
                  ]),
                ),
            )
          : h('p', { class: 'lk-empty', text: t('messages.empty') });
        ui.float({ title: t('messages.title'), icon: 'info', class: 'lk-float--messages', body });
      },
    },
  ],
  setup(ctx) {
    const api = createNotifier(ctx);
    ctx.provide<NotifierApi>('notifier', api);
    return api.destroy;
  },
});
