/**
 * whichkey — leave a prefix hanging and a panel rises in the corner listing
 * every key that can follow it, `+name` for the ones that open a further
 * menu. The leader was pressed to ask the question, so it answers at once;
 * everything else waits `timeoutlen`, so a fluent `gg` never flashes a panel.
 *
 * The rows come from the keymap, never from a list of their own.
 */

import { LEADER, displaySeq } from '../core/keys';
import { h, icon, remove } from '../core/dom';
import type { PluginContext } from '../types';
import { definePlugin, sidebarSide, toggleSetting } from './util';

function createWhichKey(ctx: PluginContext) {
  const { lk } = ctx;
  let el: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function hide(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    remove(el);
    el = null;
  }

  function show(tokens: string[]): void {
    hide();
    const seq = tokens.join(' ');
    const rows = lk.keymap.children(seq);
    if (!rows.length) return;
    const label = displaySeq(tokens);
    // Tall and narrow beats wide and short: the panel hugs one corner, and a
    // person scanning it is looking for one key, not reading prose.
    const perColumn = 9;
    const columns = Math.min(3, Math.ceil(rows.length / perColumn));
    const height = Math.ceil(rows.length / columns);
    el = h(
      'div',
      {
        class: 'lk-wk',
        attrs: {
          role: 'region',
          'aria-label': ctx.t('whichkey.label', { seq: label }),
          'data-side': sidebarSide(ctx) === 'right' ? 'left' : 'right',
        },
      },
      [
        h('div', { class: 'lk-wk-head' }, [
          icon('keyboard'),
          h('span', { class: 'lk-wk-seq', text: label }),
          h('span', { class: 'lk-wk-count', text: String(rows.length) }),
        ]),
        h(
          'div',
          { class: 'lk-wk-grid', style: { '--lk-wk-rows': height } },
          rows.map((row) =>
            h(
              'button',
              {
                class: 'lk-wk-row' + (row.group ? ' is-group' : ''),
                attrs: { type: 'button', tabindex: '-1', 'data-key': row.token },
                on: {
                  mousedown: (e) => e.preventDefault(),
                  click: () => {
                    if (row.token) lk.dispatcher.feed(row.token, null);
                  },
                },
              },
              [
                h('kbd', { text: row.display }),
                h('span', { class: 'lk-wk-arrow', text: '→', attrs: { 'aria-hidden': 'true' } }),
                h('span', { class: 'lk-wk-label', text: row.label }),
              ],
            ),
          ),
        ),
      ],
    );
    ctx.ui.root().appendChild(el);
  }

  function schedule(tokens: string[]): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!tokens.length || ctx.settings.get<boolean>('whichkey') === false) {
      hide();
      return;
    }
    const delay = tokens[0] === LEADER ? 0 : Math.max(0, ctx.settings.get<number>('timeoutlen') ?? 250);
    const want = tokens.join(' ');
    const fire = () => {
      timer = null;
      if (!lk.isEnabled() || lk.dispatcher.state.keys.join(' ') !== want) return;
      show(tokens);
    };
    if (delay === 0) fire();
    else timer = setTimeout(fire, delay);
  }

  return { schedule, hide, visible: () => el !== null, show };
}

export interface WhichKeyApi {
  show(tokens: string[]): void;
  hide(): void;
  visible(): boolean;
}

export const whichkey = definePlugin({
  name: 'whichkey',
  settings: ({ t }) => [
    {
      key: 'whichkey',
      option: 'whichkey',
      type: 'boolean',
      default: true,
      group: t('settings.group'),
      label: t('setting.whichkey'),
      help: t('setting.whichkey.help'),
    },
  ],
  keys: (ctx) => ({
    '<leader> u w': { desc: ctx.t('key.whichkey'), run: () => toggleSetting(ctx, 'whichkey') },
  }),
  setup(ctx) {
    const wk = createWhichKey(ctx);
    ctx.provide<WhichKeyApi>('whichkey', { show: wk.show, hide: wk.hide, visible: wk.visible });
    const offs = [
      ctx.lk.on('pending', (state) => wk.schedule(state.keys)),
      ctx.lk.on('disable', wk.hide),
      ctx.lk.on('escape', wk.hide),
    ];
    return () => {
      wk.hide();
      offs.forEach((off) => off());
    };
  },
});
