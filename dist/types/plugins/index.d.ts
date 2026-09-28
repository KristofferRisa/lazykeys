import type { PluginSpec } from '../types';
/**
 * Every built-in, in load order. Each is an ordinary plugin spec: leave one
 * out with `disable: ['zen']`, or replace it by passing a plugin of the same
 * name.
 */
export declare const builtins: {
    core: PluginSpec;
    motions: PluginSpec;
    yank: PluginSpec;
    marks: PluginSpec;
    hints: PluginSpec;
    cmdline: PluginSpec;
    find: PluginSpec;
    whichkey: PluginSpec;
    help: PluginSpec;
    sidebar: PluginSpec;
    statusline: PluginSpec;
    notifier: PluginSpec;
    zen: PluginSpec;
};
export type BuiltinName = keyof typeof builtins;
export declare function builtinPlugins(): PluginSpec[];
