/**
 * lazykeys — a LazyVim-shaped modal keyboard layer for any website.
 *
 *   import { createLazyKeys } from 'lazykeys';
 *   import 'lazykeys/lazykeys.css';
 *
 *   const lk = createLazyKeys({ enabled: true });
 */

export { createLazyKeys, COMMAND_EVENT } from './core/lazykeys';
export { VERSION } from './version';
export { createLazyKeys as setup } from './core/lazykeys';

// The pieces, for consumers and tests.
export { Keymap, defaultSection } from './core/keymap';
export type { KeyContext, KeyHandler, KeyMapping, KeySpec, KeymapEntry, WhichKeyRow } from './core/keymap';
export { Dispatcher } from './core/dispatcher';
export type { DispatcherOptions, DispatcherState } from './core/dispatcher';
export { ExRegistry, parseLine } from './core/ex';
export type { Completion, ExCommand, ExCommandSpec, ExContext, ParsedLine } from './core/ex';
export { Settings, localStorageAdapter, memoryAdapter } from './core/settings';
export type { SettingSpec, SettingType, SettingValue, SettingsListener, StorageAdapter } from './core/settings';
export { applySet, formatOption, parseSetArg, resolveOption, settingHelp, settingLabel } from './core/set';
export type { SetArg, SetOp, SetResult } from './core/set';
export { labelsFor } from './core/labels';
export { fold, fuzzyFilter, fuzzyMatch } from './core/fuzzy';
export type { FuzzyMatch, Ranked } from './core/fuzzy';
export { LEADER, displaySeq, isEditable, keyName, normalizeSeq, normalizeToken, parseSeq, tokenDisplay } from './core/keys';
export { createTranslator, defaultMessages } from './core/i18n';
export type { MessageKey, MessageOverrides, Messages, Translate } from './core/i18n';
export { h, icon, iconNames } from './core/dom';
export type { Child, IconName } from './core/dom';

// Built-in plugins and helpers for writing your own.
export { builtins } from './plugins';
export type { BuiltinName } from './plugins';
export { definePlugin } from './plugins/util';
export { explorer, buildTree } from './plugins/sources';
export type { ExplorerEntry, ExplorerOptions } from './plugins/sources';
export type { CmdlineApi, PromptOptions } from './plugins/cmdline';
export type { FindApi } from './plugins/find';
export type { HintsApi, HintTarget } from './plugins/hints';
export type { NotifierApi } from './plugins/notifier';
export type { SidebarApi } from './plugins/sidebar';
export type { WhichKeyApi } from './plugins/whichkey';

export type * from './types';
