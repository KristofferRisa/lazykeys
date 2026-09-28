/**
 * core — the settings every other plugin leans on, the way out, `:set`,
 * `:Lazy` and `:checkhealth`.
 */

import { h } from '../core/dom';
import { applySet, formatOption, setCompletions } from '../core/set';
import { VERSION } from '../version';
import type { HealthItem, PluginContext } from '../types';
import { definePlugin } from './util';

function storageWorks(kind: 'local' | 'session'): boolean {
  try {
    const store = kind === 'local' ? localStorage : sessionStorage;
    store.setItem('lazykeys:probe', '1');
    store.removeItem('lazykeys:probe');
    return true;
  } catch {
    return false;
  }
}

function healthList(ctx: PluginContext, items: HealthItem[]): HTMLElement {
  return h(
    'ul',
    { class: 'lk-health' },
    items.map((item) => {
      const state = item.ok === true ? 'ok' : item.ok === false ? 'error' : 'warn';
      return h('li', { attrs: { 'data-state': state } }, [
        h('b', { text: ctx.t(`health.${state}`) }),
        h('span', { text: item.label }),
        item.detail ? h('em', { text: item.detail }) : null,
      ]);
    }),
  );
}

function openSetList(ctx: PluginContext): void {
  const lines = ctx.settings
    .schema()
    .filter((row) => row.option)
    .map((row) => formatOption(row, ctx.settings.get(row.key)));
  ctx.ui.float({
    title: ctx.t('set.title'),
    icon: 'gear',
    class: 'lk-float--options',
    body: [h('pre', { class: 'lk-pre', text: lines.join('\n') }), h('p', { class: 'lk-note', text: ctx.t('set.note') })],
  });
}

export const core = definePlugin({
  name: 'core',
  settings: ({ t }) => [
    {
      key: 'enabled',
      type: 'boolean',
      default: true,
      hidden: true,
      group: t('settings.group'),
      label: t('setting.enabled'),
      help: t('setting.enabled.help'),
    },
    {
      key: 'leader',
      option: 'leader',
      type: 'enum',
      values: ['space', ',', '\\'],
      default: 'space',
      group: t('settings.group'),
      label: t('setting.leader'),
      help: t('setting.leader.help'),
    },
    {
      key: 'timeoutlen',
      option: 'timeoutlen',
      type: 'number',
      default: 250,
      min: 0,
      max: 2000,
      step: 50,
      group: t('settings.group'),
      label: t('setting.timeoutlen'),
      help: t('setting.timeoutlen.help'),
    },
  ],

  keys: ({ lk, t }) => ({
    g: '+' + t('group.goto'),
    y: '+' + t('group.yank'),
    Z: '+' + t('group.quit'),
    '[': '+' + t('group.prev'),
    ']': '+' + t('group.next'),
    '<leader> f': '+' + t('group.file'),
    '<leader> g': '+' + t('group.git'),
    '<leader> s': '+' + t('group.search'),
    '<leader> u': '+' + t('group.ui'),
    '<leader> c': '+' + t('group.code'),
    '<leader> b': '+' + t('group.buffer'),
    '<leader> q': '+' + t('group.session'),

    'Z Z': { desc: t('key.quit'), section: t('section.lazykeys'), run: () => lk.disable() },
    '<leader> q q': { desc: t('key.quit'), run: () => lk.disable() },
    '<leader> c h': { desc: t('key.checkhealth'), run: () => void lk.exec('checkhealth') },
    '<leader> l': { desc: t('key.lazy'), run: () => void lk.exec('Lazy') },
  }),

  commands: (ctx) => {
    const { lk, t, settings } = ctx;
    return [
      {
        name: 'set',
        alias: ['se'],
        args: '[option]',
        desc: t('cmd.set'),
        run(argv) {
          if (!argv.length) {
            openSetList(ctx);
            return;
          }
          const results = applySet(settings, argv, t);
          const last = results[results.length - 1];
          const failed = results.find((r) => !r.ok);
          if (failed) lk.echo(failed.message, 'error');
          else if (last) lk.echo(last.message, last.changed ? 'success' : undefined);
        },
        complete: () => setCompletions(settings),
      },
      {
        name: 'quit',
        alias: ['q', 'q!', 'qa', 'qa!', 'qall', 'quitall'],
        desc: t('cmd.quit'),
        run: () => lk.disable(),
      },
      { name: 'write', alias: ['w'], desc: t('cmd.write'), run: () => lk.echo(t('msg.written')) },
      { name: 'wq', alias: ['x', 'xa', 'wqa'], desc: t('cmd.wq'), run: () => lk.disable() },
      {
        name: 'version',
        alias: ['ver'],
        desc: t('cmd.version'),
        run: () => lk.echo(t('msg.version', { version: VERSION })),
      },
      {
        name: 'Lazy',
        alias: ['plugins'],
        desc: t('cmd.lazy'),
        run() {
          const plugins = lk.plugins().sort((a, b) => b.ms - a.ms);
          const total = plugins.reduce((sum, p) => sum + p.ms, 0);
          ctx.ui.float({
            title: t('lazy.title'),
            icon: 'zap',
            class: 'lk-float--lazy',
            body: [
              h('p', {
                class: 'lk-note',
                text: t('lazy.summary', { n: plugins.length, ms: total.toFixed(2) }),
              }),
              h(
                'ul',
                { class: 'lk-lazy' },
                plugins.map((p) =>
                  h('li', null, [
                    h('span', { class: 'lk-lazy-ok', text: '●', attrs: { 'aria-hidden': 'true' } }),
                    h('span', { class: 'lk-lazy-name', text: p.name }),
                    h('span', { class: 'lk-lazy-detail', text: t('lazy.detail', { keys: p.keys, commands: p.commands }) }),
                    h('span', { class: 'lk-lazy-ms', text: p.ms.toFixed(2) + 'ms' }),
                  ]),
                ),
              ),
            ],
          });
        },
      },
      {
        name: 'checkhealth',
        alias: ['che', 'health'],
        desc: t('cmd.checkhealth'),
        run() {
          const body: HTMLElement[] = [];
          for (const { plugin, items } of lk.health()) {
            if (!items.length) continue;
            body.push(h('h3', { text: plugin === 'core' ? t('health.core') : `lazykeys.${plugin}` }), healthList(ctx, items));
          }
          ctx.ui.float({ title: t('health.title'), icon: 'heart', class: 'lk-float--health', body });
        },
      },
    ];
  },

  health: ({ lk, t, settings }) => {
    const hasHighlight = typeof CSS !== 'undefined' && !!(CSS as unknown as { highlights?: unknown }).highlights;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return [
      {
        label: t('health.enabled', { state: t(lk.isEnabled() ? 'msg.on.short' : 'msg.off.short') }),
        ok: true,
        detail: t('health.leader', { leader: lk.leader() }),
      },
      { label: t('health.keymap'), ok: lk.keymap.list().length > 0, detail: t('health.bindings', { n: lk.keymap.list().length }) },
      { label: t('health.commands'), ok: lk.exCommands().length > 0, detail: String(lk.exCommands().length) },
      { label: t('health.storage'), ok: settings.schema().length > 0, detail: String(settings.schema().length) },
      { label: t('health.highlight'), ok: hasHighlight ? true : null, detail: t('health.highlightDetail') },
      {
        label: t('health.clipboard'),
        ok: typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText ? true : null,
        detail: t('health.clipboardDetail'),
      },
      { label: t('health.local'), ok: storageWorks('local') ? true : null, detail: t('health.localDetail') },
      { label: t('health.session'), ok: storageWorks('session') ? true : null, detail: t('health.sessionDetail') },
      { label: t('health.motion'), ok: reduced ? null : true, detail: t('health.motionDetail') },
    ];
  },
});
