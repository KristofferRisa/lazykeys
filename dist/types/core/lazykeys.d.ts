/**
 * createLazyKeys — the instance, the plugin loader and the one keydown
 * listener.
 *
 * Every built-in is a plugin spec like any consumer's: keys, commands,
 * settings, sidebar sources and status segments are contributed to shared
 * registries, and `setup(ctx)` wires anything else. The core owns only what
 * every plugin leans on: the keymap, the ex table, the settings schema, the
 * dispatcher, the scroller, floats, and the order in which a key press is
 * offered to things:
 *
 *   1. disabled, or composing (IME)                 → the page's
 *   2. a `yieldTo` guard is true                   → the page's
 *   3. a LazyKeys surface is up (cmdline, float…)  → that surface's
 *   4. the caret is in a field                     → the field's (insert mode)
 *   5. already handled, or Cmd/Alt held            → the page's
 *   6. a passthrough key                           → the browser's
 *   7. otherwise                                   → the dispatcher's
 */
import type { LazyKeys, LazyKeysOptions, Level, SidebarSource, StatusSegment } from '../types';
export { VERSION } from '../version';
/** The DOM event every command is announced with. */
export declare const COMMAND_EVENT = "lazykeys:command";
/** Make a LazyKeys instance. It attaches one keydown listener to `document`. */
export declare function createLazyKeys(options?: LazyKeysOptions): LazyKeys;
export type InternalLazyKeys = LazyKeys & {
    _sources: SidebarSource[];
    _segments: StatusSegment[];
    _echo(): {
        text: string;
        level?: Level;
    };
};
