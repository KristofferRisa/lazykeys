import type { PluginSpec } from '../types';
import { cmdline } from './cmdline';
import { core } from './core';
import { find } from './find';
import { help } from './help';
import { hints } from './hints';
import { marksPlugin } from './marks';
import { motions } from './motions';
import { notifier } from './notifier';
import { sidebar } from './sidebar';
import { statusline } from './statusline';
import { whichkey } from './whichkey';
import { yank } from './yank';
import { zen } from './zen';

/**
 * Every built-in, in load order. Each is an ordinary plugin spec: leave one
 * out with `disable: ['zen']`, or replace it by passing a plugin of the same
 * name.
 */
export const builtins = {
  core,
  motions,
  yank,
  marks: marksPlugin,
  hints,
  cmdline,
  find,
  whichkey,
  help,
  sidebar,
  statusline,
  notifier,
  zen,
} satisfies Record<string, PluginSpec>;

export type BuiltinName = keyof typeof builtins;

export function builtinPlugins(): PluginSpec[] {
  return Object.values(builtins);
}
