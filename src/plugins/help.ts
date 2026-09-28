/**
 * help — `?` and `:help`. Generated from the same keymap and ex table the keys
 * dispatch from, so it cannot fall out of date.
 */

import { h } from '../core/dom';
import { defaultSection } from '../core/keymap';
import { displaySeq } from '../core/keys';
import type { PluginContext } from '../types';
import { definePlugin } from './util';

interface Row {
  key: string;
  doc: string;
  extra?: string;
}

function group(name: string, rows: Row[]): HTMLElement {
  return h('section', { class: 'lk-help-group' }, [
    h('h3', { text: name }),
    h(
      'dl',
      null,
      rows.flatMap((row) => [
        h('dt', null, h('kbd', { text: row.key })),
        h('dd', null, [row.doc, row.extra ? h('span', { class: 'lk-help-alias', text: row.extra }) : null]),
      ]),
    ),
  ]);
}

export function openHelp(ctx: PluginContext): void {
  const { lk, t } = ctx;
  const leaderLabel = t('section.leader');
  const sections = new Map<string, Row[]>();
  const add = (name: string, row: Row) => {
    const list = sections.get(name) ?? [];
    list.push(row);
    sections.set(name, list);
  };

  for (const entry of lk.keymap.list()) {
    // Aliases dispatch but are named in the row they alias, so the map reads
    // as a map rather than a table of duplicates.
    if (entry.hidden) continue;
    const section = defaultSection(entry, lk.keymap, leaderLabel) || t('section.other');
    const key = displaySeq(entry.tokens) + (entry.arg ? (typeof entry.arg === 'string' ? entry.arg : '{key}') : '');
    add(section, { key, doc: entry.desc ?? '' });
  }
  const motion = sections.get(t('section.motion'));
  if (motion) motion.push({ key: '{count}', doc: t('key.count') });

  const commandRows: Row[] = lk
    .exCommands()
    .filter((c) => !c.hidden)
    .map((c) => {
      const row: Row = { key: ':' + c.name + (c.args ? ' ' + c.args : ''), doc: c.desc ?? '' };
      if (c.alias?.length) row.extra = ':' + c.alias.join(', :');
      return row;
    });

  const leftAlone: Row[] = ctx.options.passthrough.map((p) => ({
    key: displaySeq([p.key]),
    doc: p.desc ?? t(`pass.${p.key}`),
  }));
  leftAlone.push({ key: 'Cmd/Alt-*', doc: t('pass.meta') });

  // The page's own motions first, the editor's furniture after, the leader
  // menus last — the order someone learning the map would want.
  const first = ['section.motion', 'section.links', 'section.go', 'section.search', 'section.yank', 'section.marks'].map(
    (k) => t(k),
  );
  const rank = (name: string): number => {
    const at = first.indexOf(name);
    if (at !== -1) return at;
    if (name === leaderLabel || name.startsWith(leaderLabel + ' ')) return 200;
    if (name === t('section.lazykeys')) return 150;
    return 100;
  };
  const ordered = [...sections.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));

  const body = h('div', { class: 'lk-help-body' }, [
    ...ordered.map(([name, rows]) => group(name, rows)),
    commandRows.length ? group(t('section.commands'), commandRows) : null,
    group(t('section.leftAlone'), leftAlone),
  ]);

  ctx.ui.float({
    title: t('help.title'),
    icon: 'keyboard',
    class: 'lk-float--help',
    body: [h('p', { class: 'lk-note', text: t('help.intro', { leader: lk.leader() }) }), body],
  });
}

export const help = definePlugin({
  name: 'help',
  keys: (ctx) => {
    const show = () => openHelp(ctx);
    return {
      '?': { desc: ctx.t('key.help'), section: ctx.t('section.lazykeys'), run: show },
      '<leader> ?': { desc: ctx.t('key.keymaps'), run: show },
      '<leader> s k': { desc: ctx.t('key.keymaps'), run: show },
    };
  },
  commands: (ctx) => [{ name: 'help', alias: ['h'], desc: ctx.t('cmd.help'), run: () => openHelp(ctx) }],
});
