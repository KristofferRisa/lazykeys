/**
 * `:set` — read or change a setting, the way vim spells it:
 *
 *   :set                list every option
 *   :set opt            turn a boolean on, or show a value
 *   :set noopt          turn a boolean off
 *   :set opt!           flip a boolean (also :set invopt)
 *   :set opt?           show the value
 *   :set opt=val        assign (also opt:val)
 */
import type { Settings, SettingSpec, SettingValue } from './settings';
import type { Translate } from './i18n';
export type SetOp = 'on' | 'toggle' | 'ask' | 'assign';
export interface SetArg {
    name: string;
    op: SetOp;
    value?: string;
}
/** Split one `:set` argument into a name and what to do with it. */
export declare function parseSetArg(arg: string): SetArg;
/** How vim prints an option: `  scroll=72`, `  hlsearch`, `nohlsearch`. */
export declare function formatOption(row: SettingSpec, value: SettingValue): string;
export interface SetResult {
    ok: boolean;
    message: string;
    /** True when the setting was written (as opposed to read). */
    changed?: boolean;
}
/**
 * Resolve an option name the way vim does: the name itself first (so
 * `notify` is `notify`, not `no` + `tify`), then `no…` / `inv…`.
 */
export declare function resolveOption(settings: Settings, name: string): {
    row: SettingSpec;
    negated: boolean;
    inverted: boolean;
} | null;
/** Apply every argument of a `:set` line. One result per argument. */
export declare function applySet(settings: Settings, argv: string[], t: Translate): SetResult[];
/** Completion pool for `:set`: every option, and `no…` for the booleans. */
export declare function setCompletions(settings: Settings): Array<{
    value: string;
    hint: string;
}>;
