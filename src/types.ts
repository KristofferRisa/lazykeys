import type { Dispatcher, DispatcherState } from './core/dispatcher';
import type { Child, IconName } from './core/dom';
import type { Completion, ExCommand, ExCommandSpec, ExRegistry } from './core/ex';
import type { MessageOverrides, Translate } from './core/i18n';
import type { KeyMapping, Keymap } from './core/keymap';
import type { Settings, SettingSpec, SettingValue, StorageAdapter } from './core/settings';

export type Mode = 'normal' | 'insert' | 'cmdline' | 'hints' | (string & {});
export type Level = 'info' | 'success' | 'warn' | 'error';

export interface NotifyOptions {
  level?: Level;
  title?: string;
  /** ms before the toast fades; 0 keeps it until dismissed. */
  timeout?: number;
}

export interface Message {
  at: Date;
  level: Level;
  title?: string;
  message: string;
}

/** The detail of every `lazykeys:command` event (and the consumer's extra one). */
export type CommandDetail = { seq: string; count: number } | { ex: string; line: string };

export interface NavigateOptions {
  newTab?: boolean;
}

/** A surface that takes the keyboard while it is up (cmdline, float, sidebar, hints). */
export interface KeyLayer {
  name?: string;
  /** Return true when the key was handled: it is then prevented and stopped. */
  onKey(e: KeyboardEvent): boolean | void;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export interface SidebarRow {
  /** Stable identity, for remembering which folders are open. Defaults to href, then label. */
  id?: string;
  label: string;
  hint?: string;
  icon?: IconName | (string & {});
  kind?: 'dir' | 'file' | 'item' | 'header' | 'symbol' | 'option';
  /** Indent level, when the source flattens its own tree. */
  depth?: number;
  /** Drawn as "you are here". */
  current?: boolean;
  /** Drawn dimmed (a setting whose parent switch is off). */
  dormant?: boolean;
  /** A folder: Enter/l opens it, h closes it. */
  children?: SidebarRow[];
  /** Whether a folder starts open. */
  open?: boolean;
  /** Enter navigates here (through `navigate`), and the sidebar closes. */
  href?: string;
  /** Enter runs this. Return `true` to close the sidebar afterwards. */
  onSelect?(): boolean | void;
  /** h/l/Space on an option row step its value. */
  onCycle?(dir: 1 | -1): void;
  /** A value drawn on the right. */
  value?: string;
  /** Drawn as an on/off switch on the right. */
  toggled?: boolean;
}

export interface SidebarSourceContext {
  lk: LazyKeys;
  t: Translate;
}

export interface SidebarSource {
  id: string;
  label: string;
  icon?: IconName | (string & {});
  /** Tab order; lower first. Built-ins: explorer 10, outline 20, buffers 30, settings 40. */
  order?: number;
  rows(ctx: SidebarSourceContext): SidebarRow[] | Promise<SidebarRow[]>;
  /** `R` in the sidebar: drop caches. The rows are asked for again afterwards. */
  reload?(): void;
}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------

export interface StatusContext {
  lk: LazyKeys;
  t: Translate;
  mode: Mode;
  /** Pending count and keys, as displayed (`3g`, `<leader>u`). */
  pending: string;
  /** The current echo message. */
  message: { text: string; level?: Level };
}

export interface StatusSegment {
  id: string;
  /**
   * Position, lower first. Built-ins, lualine's order: mode 10, section 20,
   * path 30, message 40, search 50, keys 60, position 90.
   */
  order?: number;
  /** Take the slack (only the message segment does by default). */
  grow?: boolean;
  /** Extra class on the segment element. */
  class?: string;
  /** Text, a node built by the plugin, or nothing (the segment is hidden). */
  render(ctx: StatusContext): Child | Child[];
}

// ---------------------------------------------------------------------------
// :checkhealth
// ---------------------------------------------------------------------------

export interface HealthItem {
  label: string;
  /** true = OK, false = ERROR, null = WARNING. */
  ok: boolean | null;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

type OrFn<T> = T | ((ctx: PluginContext) => T);

/** A list of sources, or `{ id: source | false }` — `false` removes that id. */
export type PluginSources = SidebarSource[] | Record<string, SidebarSource | false>;

export interface PluginSpec {
  /** Unique. A plugin with a built-in's name replaces that built-in. */
  name: string;
  /** lazy.nvim's `enabled`/`cond`: false leaves the plugin out entirely. */
  enabled?: boolean | ((lk: LazyKeys) => boolean);
  /** Bindings. A string value (`'+file'`) names a which-key group; `false` unmaps. */
  keys?: OrFn<Record<string, KeyMapping>>;
  /** Ex commands. */
  commands?: OrFn<ExCommandSpec[]>;
  /** Setting rows. Defined before any plugin's keys or setup run. */
  settings?: OrFn<SettingSpec[]>;
  /**
   * Sidebar sources. A source whose id is already registered replaces it (and
   * the old one comes back if this plugin is removed). The record form names
   * ids, and `false` removes one: `{ settings: false, explorer: explorer(…) }`.
   */
  sources?: OrFn<PluginSources>;
  /** Status line segments. */
  statusline?: OrFn<StatusSegment[]>;
  /** Rows for `:checkhealth`. */
  health?: (ctx: PluginContext) => HealthItem[];
  /** Runs once, after every plugin's keys and commands exist. May return a cleanup. */
  setup?(ctx: PluginContext): void | (() => void);
}

export interface PluginInfo {
  name: string;
  keys: number;
  commands: number;
  /** ms spent loading it. */
  ms: number;
  builtin: boolean;
}

/** Session-scoped JSON storage, namespaced, never throws. */
export interface SessionStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export interface PluginContext {
  lk: LazyKeys;
  name: string;
  settings: Settings;
  t: Translate;
  options: ResolvedOptions;
  session: SessionStore;
  ui: Ui;
  /** Take the keyboard until the returned function is called. */
  pushLayer(layer: KeyLayer): () => void;
  /** Make an API available to other plugins through `lk.use(name)`. */
  provide<T>(service: string, api: T): void;
  /** Run when LazyKeys is destroyed. */
  onCleanup(fn: () => void): void;
}

export interface FloatOptions {
  title: string;
  icon?: IconName | (string & {});
  body: Child | Child[];
  footer?: Child | Child[];
  /** CSS width, e.g. `'min(420px, 92vw)'`. */
  width?: string;
  class?: string;
  /** Return true when handled. Runs before the float's own keys (q, Esc, j/k). */
  onKey?(e: KeyboardEvent): boolean | void;
  onClose?(): void;
}

export interface FloatHandle {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
  setBody(children: Child | Child[]): void;
}

export interface PickerItem {
  label: string;
  hint?: string;
}

export interface PickerOptions<T extends PickerItem> {
  title: string;
  icon?: IconName | (string & {});
  items: T[];
  selected?: number;
  width?: string;
  onChoose(item: T, index: number): void;
}

export interface Ui {
  /** The container every LazyKeys element lives in (created on first use). */
  root(): HTMLElement;
  icon(name: IconName | (string & {}), className?: string): Element;
  float(opts: FloatOptions): FloatHandle;
  closeFloat(): void;
  floatIsOpen(): boolean;
  picker<T extends PickerItem>(opts: PickerOptions<T>): FloatHandle;
  /** A footer line: `[['j', 'k'], 'scroll'], [['q'], 'close']`. */
  footer(parts: Array<[string[], string]>): HTMLElement;
  /** Say something to screen readers only. */
  announce(text: string): void;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PassthroughKey {
  key: string;
  desc?: string;
}

export interface LazyKeysOptions {
  /** The default of the `enabled` setting — whether LazyKeys starts on. Default true. */
  enabled?: boolean;
  /**
   * The `:set` name of the `enabled` setting: `:set nolazy` turns LazyKeys
   * off. Default `'lazy'`; `false` keeps it out of `:set`.
   */
  enabledOption?: string | false;
  /** Whether enable()/disable() write the `enabled` setting. Default true. */
  persist?: boolean;
  /**
   * Esc while the caret is in a field.
   * - `'page'` (default): the page's own Esc handlers run first; if none of
   *   them called `preventDefault()` or stopped propagation, the field is left
   *   and LazyKeys is back in normal mode.
   * - `'blur'`: leave the field at once, before the page hears the key (0.1.0).
   * - `'keep'`: never touch Esc in a field.
   */
  escapeInFields?: 'page' | 'blur' | 'keep';
  /** Prefix for every storage key (`lazykeys:settings`, `lazykeys:marks`, …). */
  namespace?: string;
  /** Where settings live. Default: namespaced localStorage. */
  storage?: StorageAdapter;
  /** Override setting defaults: `{ leader: ',', scroll: 100 }`. */
  defaults?: Record<string, SettingValue>;
  /** Extra setting rows. */
  settings?: SettingSpec[];
  /** Extra or overriding bindings, applied after every plugin. */
  keys?: Record<string, KeyMapping>;
  /** Extra or overriding ex commands. */
  commands?: ExCommandSpec[];
  /** Extra, replacing (same id) or removed (`{ settings: false }`) sidebar sources. */
  sources?: PluginSources;
  /** Your plugins. One named like a built-in replaces it. */
  plugins?: PluginSpec[];
  /** Built-in plugins to leave out, by name. */
  disable?: string[];
  /** Override any user-facing string. */
  messages?: MessageOverrides;
  /** LazyKeys stands down while any of these returns true. */
  yieldTo?: Array<() => boolean>;
  /**
   * Keys never taken to start a sequence, even when mapped. Default `['C-f', 'C-k']`.
   * Inside a sequence they are ordinary keys, so `<leader> \`` works with `\`` passed
   * through. Cmd/Alt combos always pass.
   */
  passthrough?: Array<string | PassthroughKey>;
  /** Also dispatch every command as this event (same detail as `lazykeys:command`). */
  eventName?: string;
  /** How to go somewhere. Override for SPA routers. */
  navigate?: (url: string, opts: NavigateOptions) => void;
  /** The content root `/` searches and the outline reads. Default `main`, else `body`. */
  root?: string | (() => Element | null);
  /** Headings for the outline source. Default `'h1, h2, h3, h4'` inside the root. */
  headings?: string;
  /**
   * Elements inside a heading the outline leaves out of its label — permalink
   * anchors. Default `'a.anchor, a.headerlink, a.header-anchor,
   * a.heading-anchor, a.hash-link, [aria-hidden="true"], [hidden]'`; `''` keeps
   * everything. Text is never stripped, so "Learning C#" stays whole.
   */
  headingIgnore?: string;
  /** Targets of `{` and `}`. Default `'h2, h3'` inside the root, else the headings. */
  sections?: string | (() => Element[]);
  /** What `f` labels. */
  hintTargets?: string;
  /** Page chrome that `/` and `f` should ignore (LazyKeys' own is always ignored). */
  exclude?: string;
  /** What `gi` focuses. */
  fields?: string;
  /** The element that scrolls, when it is not the window. */
  scroller?: () => HTMLElement | null;
  /** The page title for buffers and `yt`. Default `document.title`. */
  title?: () => string;
  /** The status line's section segment. Default: first path segment. */
  section?: () => string;
  /** Where LazyKeys' elements are mounted. Default `document.body`. */
  mount?: () => HTMLElement;
}

export interface ResolvedOptions {
  enabled: boolean;
  enabledOption: string | null;
  persist: boolean;
  escapeInFields: 'page' | 'blur' | 'keep';
  namespace: string;
  passthrough: PassthroughKey[];
  eventName: string | null;
  navigate: (url: string, opts: NavigateOptions) => void;
  root: () => Element;
  headings: string;
  headingIgnore: string;
  sections: () => Element[];
  hintTargets: string;
  exclude: string;
  fields: string;
  title: () => string;
  section: () => string;
  mount: () => HTMLElement;
}

// ---------------------------------------------------------------------------
// The instance
// ---------------------------------------------------------------------------

export interface LazyKeysEvents {
  enable: void;
  disable: void;
  mode: Mode;
  pending: DispatcherState;
  command: CommandDetail;
  message: Message;
  echo: { text: string; level?: Level };
  escape: void;
  /** `refresh()` was called: an SPA route changed. */
  navigate: void;
  /** Something the status line shows changed. */
  render: void;
  destroy: void;
}

export interface Scroller {
  /** 'instant' (never 'auto', which defers to a page's `scroll-behavior: smooth`) or 'smooth'. */
  behavior(): ScrollBehavior;
  by(px: number): void;
  to(y: number): void;
  toPercent(pct: number): void;
  y(): number;
  max(): number;
  viewport(): number;
  /** Where an element (or a Range) sits in scroll coordinates. */
  offsetOf(el: { getBoundingClientRect(): DOMRect }): number;
  /** 'Top', 'Bot', 'All' or 'NN%'. */
  percent(): string;
}

export interface LazyKeys {
  readonly version: string;
  readonly keymap: Keymap;
  readonly commands: ExRegistry;
  readonly settings: Settings;
  readonly dispatcher: Dispatcher;
  readonly scroll: Scroller;
  readonly ui: Ui;
  readonly options: ResolvedOptions;
  readonly t: Translate;

  enable(): void;
  disable(): void;
  toggle(): void;
  isEnabled(): boolean;
  /** True while LazyKeys takes single-key presses — what other key handlers on the page ask. */
  ownsKeys(): boolean;
  destroy(): void;

  /** Add a binding. Returns its removal. */
  map(seq: string, mapping: KeyMapping, desc?: string): () => void;
  /** Add an ex command. Returns its removal. */
  command(spec: ExCommandSpec): () => void;
  /**
   * Add a sidebar source under `id`, replacing one with that id, or hide that
   * id with `false`. Returns its removal, which brings back what it replaced.
   */
  source(id: string, source: SidebarSource | false): () => void;
  /** Add a plugin after setup. Returns its removal. */
  register(plugin: PluginSpec): () => void;
  /** Run an ex line, as if typed after `:`. Returns false when nothing matched. */
  exec(line: string): boolean;
  /** Feed keys, as if typed: `lk.feed('g g')`, `lk.feed('<leader> e')`. */
  feed(seq: string): void;

  /** A toast (when the notifier is on) and a line in `:messages`. */
  notify(message: string, opts?: NotifyOptions | Level): void;
  /** The status line's message; with a level it is also a toast. */
  echo(message: string, level?: Level): void;
  /** Everything said so far, oldest first. */
  messages(): Message[];

  on<K extends keyof LazyKeysEvents>(event: K, fn: (payload: LazyKeysEvents[K]) => void): () => void;
  /** A service another plugin provided (`'find'`, `'cmdline'`, `'sidebar'`, …). */
  use<T = unknown>(service: string): T | undefined;

  mode(): Mode;
  setMode(mode: Mode): void;
  /** The leader as displayed (`<space>`, `,`). */
  leader(): string;
  navigate(url: string, opts?: NavigateOptions): void;
  /** Call after an SPA navigation: closes surfaces, records the page, redraws. */
  refresh(): void;
  /**
   * Redraw the status line (coalesced to one frame): call it when something a
   * segment of yours renders changed. It leaves the message segment alone.
   */
  redraw(): void;
  /** Stand down while `fn()` returns true. Returns its removal. */
  yieldTo(fn: () => boolean): () => void;
  plugins(): PluginInfo[];
  /** `:checkhealth` rows from every plugin. */
  health(): Array<{ plugin: string; items: HealthItem[] }>;
  /** Completion rows for a partly typed `:` line. */
  complete(text: string): Completion[];
  /** The live ex commands. */
  exCommands(): ExCommand[];
}
