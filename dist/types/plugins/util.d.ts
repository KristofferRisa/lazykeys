import type { PluginContext, PluginSpec } from '../types';
/** Identity, for type inference: `definePlugin({ name, keys, … })`. */
export declare function definePlugin(spec: PluginSpec): PluginSpec;
/** Flip a boolean setting and say so. */
export declare function toggleSetting(ctx: PluginContext, key: string): void;
/** Whether an element is on screen and drawn. */
export declare function inView(el: Element): boolean;
export declare function isExcluded(el: Element, selector: string): boolean;
/** Copy text, with the execCommand fallback for when the clipboard API is not there. */
export declare function copyText(text: string): Promise<void>;
/** The side the sidebar uses; which-key takes the other. */
export declare function sidebarSide(ctx: PluginContext): 'left' | 'right';
