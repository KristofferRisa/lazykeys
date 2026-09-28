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

import { Dispatcher } from './dispatcher';
import { ExRegistry, parseLine } from './ex';
import { createTranslator } from './i18n';
import { Keymap } from './keymap';
import type { KeyMapping, KeySpec } from './keymap';
import { LEADER, isEditable, keyName, normalizeToken, parseSeq, tokenDisplay } from './keys';
import { Settings, localStorageAdapter } from './settings';
import { createUi } from './ui';
import { builtinPlugins } from '../plugins';
import type {
  CommandDetail,
  HealthItem,
  KeyLayer,
  LazyKeys,
  LazyKeysEvents,
  LazyKeysOptions,
  Level,
  Message,
  Mode,
  NavigateOptions,
  NotifyOptions,
  PassthroughKey,
  PluginContext,
  PluginInfo,
  PluginSpec,
  ResolvedOptions,
  Scroller,
  SessionStore,
  SidebarSource,
  StatusSegment,
} from '../types';

export { VERSION } from '../version';
import { VERSION } from '../version';

/** The DOM event every command is announced with. */
export const COMMAND_EVENT = 'lazykeys:command';

const DEFAULT_PASSTHROUGH = ['C-f', 'C-k'];

function resolveOptions(o: LazyKeysOptions): ResolvedOptions {
  const rootOpt = o.root ?? 'main';
  const root = (): Element => {
    const found = typeof rootOpt === 'function' ? rootOpt() : document.querySelector(rootOpt);
    return found ?? document.body;
  };
  const headings = o.headings ?? 'h1, h2, h3, h4';
  const sectionsOpt = o.sections ?? 'h2, h3';
  const sections = (): Element[] => {
    if (typeof sectionsOpt === 'function') return sectionsOpt();
    const inRoot = Array.from(root().querySelectorAll(sectionsOpt));
    return inRoot.length ? inRoot : Array.from(root().querySelectorAll(headings));
  };
  const passthrough: PassthroughKey[] = (o.passthrough ?? DEFAULT_PASSTHROUGH).map((p) =>
    typeof p === 'string' ? { key: normalizeToken(p) } : { ...p, key: normalizeToken(p.key) },
  );
  return {
    enabled: o.enabled ?? true,
    persist: o.persist ?? true,
    namespace: o.namespace ?? 'lazykeys',
    passthrough,
    eventName: o.eventName ?? null,
    navigate:
      o.navigate ??
      ((url, opts) => {
        if (opts.newTab) window.open(url, '_blank', 'noopener');
        else window.location.assign(url);
      }),
    root,
    headings,
    sections,
    hintTargets:
      o.hintTargets ??
      [
        'a[href]',
        'button:not([disabled])',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        'input:not([type="hidden"]):not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        'summary',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', '),
    exclude: ['[data-lazykeys]', o.exclude].filter(Boolean).join(', '),
    fields:
      o.fields ??
      'input[type="search"], input[type="text"], input:not([type]), input[type="email"], input[type="url"], textarea, [contenteditable="true"]',
    title: o.title ?? (() => document.title),
    section:
      o.section ??
      (() => {
        const first = location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0];
        return first ?? '';
      }),
    mount: o.mount ?? (() => document.body ?? document.documentElement),
  };
}

function createSession(namespace: string): SessionStore {
  const store = (): Storage | null => {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  };
  const k = (key: string) => `${namespace}:${key}`;
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = store()?.getItem(k(key));
        return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        store()?.setItem(k(key), JSON.stringify(value));
      } catch {
        /* private mode */
      }
    },
    remove(key) {
      try {
        store()?.removeItem(k(key));
      } catch {
        /* private mode */
      }
    },
  };
}

type Listener = (payload: never) => void;

/** Make a LazyKeys instance. It attaches one keydown listener to `document`. */
export function createLazyKeys(options: LazyKeysOptions = {}): LazyKeys {
  const opts = resolveOptions(options);
  const t = createTranslator(options.messages);
  const session = createSession(opts.namespace);
  const settings = new Settings(options.storage ?? localStorageAdapter(opts.namespace), {
    enabled: opts.enabled,
    ...(options.defaults ?? {}),
  });
  const keymap = new Keymap();
  const commands = new ExRegistry();
  const listeners = new Map<string, Set<Listener>>();
  const services = new Map<string, unknown>();
  const layers: KeyLayer[] = [];
  const guards = new Set<() => boolean>(options.yieldTo ?? []);
  const log: Message[] = [];
  const pluginInfo: PluginInfo[] = [];
  const healthFns: Array<{ plugin: string; fn: () => HealthItem[] }> = [];
  const cleanups: Array<() => void> = [];
  const sources: SidebarSource[] = [];
  const segments: StatusSegment[] = [];
  let enabled = false;
  let destroyed = false;
  let mode: Mode = 'normal';
  let echoState: { text: string; level?: Level } = { text: '' };
  let echoTimer: ReturnType<typeof setTimeout> | null = null;

  function emit<K extends keyof LazyKeysEvents>(event: K, payload: LazyKeysEvents[K]): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (p: LazyKeysEvents[K]) => void)(payload);
      } catch (e) {
        console.error(`lazykeys: a '${event}' listener failed`, e);
      }
    }
  }

  function on<K extends keyof LazyKeysEvents>(event: K, fn: (payload: LazyKeysEvents[K]) => void): () => void {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(fn as Listener);
    return () => set?.delete(fn as Listener);
  }

  function pushLayer(layer: KeyLayer): () => void {
    layers.push(layer);
    return () => {
      const at = layers.lastIndexOf(layer);
      if (at !== -1) layers.splice(at, 1);
    };
  }

  const ui = createUi({ t, mount: opts.mount, pushLayer });

  // -------------------------------------------------------------------------
  // Scrolling. 'instant', never 'auto': a page with
  // `html { scroll-behavior: smooth }` turns 'auto' into a quarter second of
  // animation per j, and a held key feels like wading.
  // -------------------------------------------------------------------------
  const scrollerOpt = options.scroller;
  const target = (): HTMLElement | null => (scrollerOpt ? scrollerOpt() : null);
  const reducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scroll: Scroller = {
    behavior: () => (settings.get<boolean>('smoothscroll') && !reducedMotion() ? 'smooth' : 'instant') as ScrollBehavior,
    y: () => {
      const el = target();
      return el ? el.scrollTop : window.scrollY;
    },
    viewport: () => {
      const el = target();
      return el ? el.clientHeight : window.innerHeight;
    },
    max: () => {
      const el = target();
      const height = el ? el.scrollHeight : document.documentElement.scrollHeight;
      return Math.max(0, height - scroll.viewport());
    },
    by(px) {
      const el = target();
      const o: ScrollToOptions = { top: px, left: 0, behavior: scroll.behavior() };
      if (el) el.scrollBy(o);
      else window.scrollBy(o);
    },
    to(y) {
      const el = target();
      const o: ScrollToOptions = { top: Math.max(0, Math.min(y, scroll.max())), left: 0, behavior: scroll.behavior() };
      if (el) el.scrollTo(o);
      else window.scrollTo(o);
    },
    toPercent(pct) {
      scroll.to(scroll.max() * (Math.max(0, Math.min(100, pct)) / 100));
    },
    offsetOf(node) {
      const el = target();
      const top = node.getBoundingClientRect().top;
      return el ? top - el.getBoundingClientRect().top + el.scrollTop : top + window.scrollY;
    },
    percent() {
      const max = scroll.max();
      const y = scroll.y();
      if (max <= 0) return 'All';
      if (y <= 1) return 'Top';
      if (y >= max - 1) return 'Bot';
      return Math.round((y / max) * 100) + '%';
    },
  };

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------
  function notify(message: string, o?: NotifyOptions | Level): void {
    if (!message) return;
    const nopts: NotifyOptions = typeof o === 'string' ? { level: o } : (o ?? {});
    const entry: Message = { at: new Date(), level: nopts.level ?? 'info', message };
    if (nopts.title) entry.title = nopts.title;
    log.push(entry);
    if (log.length > 100) log.shift();
    const shown = services.get('notifier') as { show(m: Message, o: NotifyOptions): boolean } | undefined;
    if (!(shown && shown.show(entry, nopts))) ui.announce(message);
    emit('message', entry);
  }

  function echo(message: string, level?: Level): void {
    echoState = level ? { text: message ?? '', level } : { text: message ?? '' };
    if (echoTimer) clearTimeout(echoTimer);
    echoTimer = null;
    emit('echo', echoState);
    emit('render', undefined);
    if (!message) return;
    if (level) notify(message, { level });
    else ui.announce(message);
    echoTimer = setTimeout(() => {
      echoState = { text: '' };
      emit('echo', echoState);
      emit('render', undefined);
    }, 2600);
  }

  // -------------------------------------------------------------------------
  // Commands and their announcement
  // -------------------------------------------------------------------------
  function announceCommand(detail: CommandDetail): void {
    emit('command', detail);
    emit('render', undefined);
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail }));
    if (opts.eventName) document.dispatchEvent(new CustomEvent(opts.eventName, { detail }));
  }

  const leaderToken = (): string => {
    const value = settings.get<string>('leader');
    if (value === ',' || value === '\\') return value;
    return 'Space';
  };

  const dispatcher = new Dispatcher({
    keymap,
    leader: leaderToken,
    timeoutlen: () => settings.get<number>('timeoutlen') ?? 250,
    onPending: (state) => {
      emit('pending', state);
      emit('render', undefined);
    },
    onRun: (entry, ctx) => announceCommand({ seq: entry.seq, count: ctx.count }),
    onError: (error, entry) => {
      console.error(`lazykeys: '${entry.seq}' failed`, error);
      echo(t('msg.failed', { what: entry.seq }), 'error');
    },
  });

  function exec(line: string): boolean {
    const parsed = parseLine(line);
    if (!parsed) return false;
    const hit = commands.resolveLine(parsed);
    if (!hit) {
      echo(t('msg.notCommand', { name: parsed.name }), 'error');
      return false;
    }
    try {
      hit.command.run(parsed.argv, { line: parsed.line, bang: hit.bang });
    } catch (error) {
      console.error(`lazykeys: ':${hit.command.name}' failed`, error);
      echo(t('msg.failed', { what: ':' + hit.command.name }), 'error');
      return false;
    }
    announceCommand({ ex: hit.command.name, line: parsed.line });
    return true;
  }

  // -------------------------------------------------------------------------
  // Keys
  // -------------------------------------------------------------------------
  function yielding(): boolean {
    for (const guard of guards) {
      try {
        if (guard()) return true;
      } catch {
        /* a broken guard does not take the keyboard away */
      }
    }
    return false;
  }

  function setMode(next: Mode): void {
    if (mode === next) return;
    mode = next;
    emit('mode', mode);
    emit('render', undefined);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!enabled || destroyed || e.isComposing) return;
    if (yielding()) return;

    const top = layers[layers.length - 1];
    if (top) {
      if (top.onKey(e) === true) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const origin = (path[0] as EventTarget | undefined) ?? e.target;
    if (isEditable(origin)) {
      if (e.key === 'Escape') {
        (origin as HTMLElement).blur?.();
        setMode('normal');
        return;
      }
      setMode('insert');
      return;
    }
    if (mode === 'insert') setMode('normal');

    if (e.defaultPrevented || e.metaKey || e.altKey) return;
    const token = keyName(e);
    if (!token) return;

    if (opts.passthrough.some((p) => p.key === token)) {
      dispatcher.reset();
      return;
    }

    if (token === 'Escape') {
      const consumed = dispatcher.feed('Escape', e);
      emit('escape', undefined);
      echo('');
      if (consumed) e.preventDefault();
      return;
    }

    if (dispatcher.feed(token, e)) e.preventDefault();
  }

  function onFocusIn(e: FocusEvent): void {
    if (!enabled || layers.length) return;
    if (isEditable(e.target)) setMode('insert');
  }

  function onFocusOut(): void {
    if (!enabled || mode !== 'insert') return;
    setTimeout(() => {
      if (mode === 'insert' && !isEditable(document.activeElement)) setMode('normal');
    }, 0);
  }

  // -------------------------------------------------------------------------
  // Enable / disable
  // -------------------------------------------------------------------------
  function activate(): void {
    if (enabled || destroyed) return;
    enabled = true;
    mode = isEditable(document.activeElement) ? 'insert' : 'normal';
    document.documentElement.classList.add('lk-on');
    emit('enable', undefined);
    emit('render', undefined);
  }

  function deactivate(): void {
    if (!enabled) return;
    enabled = false;
    dispatcher.reset();
    ui.closeFloat();
    mode = 'normal';
    document.documentElement.classList.remove('lk-on');
    emit('disable', undefined);
  }

  function applyEnabled(): void {
    if (settings.get<boolean>('enabled')) activate();
    else deactivate();
  }

  // -------------------------------------------------------------------------
  // Plugins
  // -------------------------------------------------------------------------
  const unregister = new Map<string, () => void>();

  function contextFor(name: string, own: Array<() => void>): PluginContext {
    return {
      lk: instance,
      name,
      settings,
      t,
      options: opts,
      session,
      ui,
      pushLayer,
      provide(service, api) {
        services.set(service, api);
        own.push(() => {
          if (services.get(service) === api) services.delete(service);
        });
      },
      onCleanup(fn) {
        own.push(fn);
      },
    };
  }

  function value<T>(field: T | ((ctx: PluginContext) => T) | undefined, ctx: PluginContext): T | undefined {
    return typeof field === 'function' ? (field as (ctx: PluginContext) => T)(ctx) : field;
  }

  function isEnabledSpec(spec: PluginSpec): boolean {
    if (spec.enabled === undefined) return true;
    if (typeof spec.enabled === 'function') {
      try {
        return spec.enabled(instance);
      } catch {
        return false;
      }
    }
    return spec.enabled;
  }

  /** Load a set of plugins: settings first for all, then everything else, then setup. */
  function load(specs: PluginSpec[], builtinSpecs: Set<PluginSpec>): void {
    const staged = specs.filter(isEnabledSpec).map((spec) => {
      const own: Array<() => void> = [];
      const ctx = contextFor(spec.name, own);
      const started = now();
      try {
        const rows = value(spec.settings, ctx);
        if (rows?.length) own.push(settings.define(rows));
      } catch (error) {
        console.error(`lazykeys: plugin '${spec.name}' settings failed`, error);
      }
      return { spec, ctx, own, ms: now() - started, keys: 0, commands: 0 };
    });

    for (const stage of staged) {
      const { spec, ctx, own } = stage;
      const started = now();
      try {
        const table = value(spec.keys, ctx);
        if (table) {
          own.push(keymap.apply(table, spec.name));
          stage.keys = Object.values(table).filter((m) => typeof m !== 'string' && m !== false).length;
        }
        const cmds = value(spec.commands, ctx) ?? [];
        for (const c of cmds) own.push(commands.add(c, spec.name));
        stage.commands = cmds.length;
        for (const s of value(spec.sources, ctx) ?? []) {
          sources.push(s);
          own.push(() => {
            const at = sources.indexOf(s);
            if (at !== -1) sources.splice(at, 1);
          });
        }
        for (const seg of value(spec.statusline, ctx) ?? []) {
          segments.push(seg);
          own.push(() => {
            const at = segments.indexOf(seg);
            if (at !== -1) segments.splice(at, 1);
          });
        }
        const healthFn = spec.health;
        if (healthFn) {
          const entry = { plugin: spec.name, fn: () => healthFn(ctx) };
          healthFns.push(entry);
          own.push(() => {
            const at = healthFns.indexOf(entry);
            if (at !== -1) healthFns.splice(at, 1);
          });
        }
      } catch (error) {
        console.error(`lazykeys: plugin '${spec.name}' failed to load`, error);
      }
      stage.ms += now() - started;
    }

    for (const stage of staged) {
      const { spec, ctx, own } = stage;
      const started = now();
      if (spec.setup) {
        try {
          const cleanup = spec.setup(ctx);
          if (typeof cleanup === 'function') own.push(cleanup);
        } catch (error) {
          console.error(`lazykeys: plugin '${spec.name}' setup failed`, error);
        }
      }
      stage.ms += now() - started;
      const info: PluginInfo = {
        name: spec.name,
        keys: stage.keys,
        commands: stage.commands,
        ms: Math.round(stage.ms * 100) / 100,
        builtin: builtinSpecs.has(spec),
      };
      pluginInfo.push(info);
      const undo = () => {
        own.reverse().forEach((fn) => {
          try {
            fn();
          } catch (e) {
            console.error(`lazykeys: cleanup of '${spec.name}' failed`, e);
          }
        });
        own.length = 0;
        const at = pluginInfo.indexOf(info);
        if (at !== -1) pluginInfo.splice(at, 1);
        if (unregister.get(spec.name) === undo) unregister.delete(spec.name);
        const c = cleanups.indexOf(undo);
        if (c !== -1) cleanups.splice(c, 1);
      };
      unregister.set(spec.name, undo);
      cleanups.push(undo);
    }
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // -------------------------------------------------------------------------
  // The instance
  // -------------------------------------------------------------------------
  const instance: LazyKeys & {
    /** @internal */ _sources: SidebarSource[];
    /** @internal */ _segments: StatusSegment[];
    /** @internal */ _echo(): { text: string; level?: Level };
  } = {
    version: VERSION,
    keymap,
    commands,
    settings,
    dispatcher,
    scroll,
    ui,
    options: opts,
    t,
    _sources: sources,
    _segments: segments,
    _echo: () => echoState,

    enable() {
      if (destroyed) return;
      const was = enabled;
      if (opts.persist) settings.set('enabled', true);
      activate();
      if (!was && enabled) {
        echo(t('msg.on'), 'success');
        notify(t('msg.intro', { leader: instance.leader() }), { level: 'info', title: t('msg.introTitle'), timeout: 5200 });
      }
    },
    disable() {
      if (opts.persist) settings.set('enabled', false);
      deactivate();
    },
    toggle() {
      if (enabled) instance.disable();
      else instance.enable();
    },
    isEnabled: () => enabled,
    ownsKeys: () => enabled && !destroyed && !yielding(),

    destroy() {
      if (destroyed) return;
      deactivate();
      destroyed = true;
      emit('destroy', undefined);
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      for (const undo of cleanups.splice(0).reverse()) undo();
      if (echoTimer) clearTimeout(echoTimer);
      ui.destroy();
      settings.destroy();
      listeners.clear();
      services.clear();
    },

    map(seq, mapping, desc) {
      if (typeof mapping === 'string') return keymap.group(seq, mapping);
      if (mapping === false) return keymap.set(seq, false);
      const spec: KeySpec = typeof mapping === 'function' ? { run: mapping } : { ...mapping };
      if (desc) spec.desc = desc;
      return keymap.set(seq, spec, 'user');
    },
    command: (spec) => commands.add(spec, 'user'),
    register(plugin) {
      unregister.get(plugin.name)?.();
      load([plugin], new Set());
      return () => unregister.get(plugin.name)?.();
    },
    exec,
    feed(seq) {
      for (const token of parseSeq(seq)) {
        dispatcher.feed(token === LEADER ? leaderToken() : token, null);
      }
    },

    notify,
    echo,
    messages: () => log.slice(),

    on,
    use: <T>(service: string) => services.get(service) as T | undefined,

    mode: () => mode,
    setMode,
    leader: () => tokenDisplay(leaderToken()),
    navigate(url, o: NavigateOptions = {}) {
      opts.navigate(url, { newTab: !!o.newTab });
    },
    refresh() {
      dispatcher.reset();
      ui.closeFloat();
      ui.remount();
      if (enabled) document.documentElement.classList.add('lk-on');
      emit('navigate', undefined);
      emit('render', undefined);
    },
    redraw() {
      if (!destroyed) emit('render', undefined);
    },
    yieldTo(fn) {
      guards.add(fn);
      return () => guards.delete(fn);
    },
    plugins: () => pluginInfo.map((p) => ({ ...p })),
    health: () =>
      healthFns.map(({ plugin, fn }) => {
        try {
          return { plugin, items: fn() };
        } catch {
          return { plugin, items: [{ label: t('msg.failed', { what: plugin }), ok: false }] };
        }
      }),
    complete: (text) => commands.completions(text),
    exCommands: () => commands.list(),
  };

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  const disabled = new Set(options.disable ?? []);
  const userPlugins = options.plugins ?? [];
  const replaced = new Set(userPlugins.map((p) => p.name));
  const builtins = builtinPlugins().filter((p) => !disabled.has(p.name) && !replaced.has(p.name));

  const tail: PluginSpec[] = [];
  if (options.settings?.length || options.keys || options.commands?.length) {
    const user: PluginSpec = { name: 'user' };
    if (options.settings?.length) user.settings = options.settings;
    if (options.keys) user.keys = options.keys as Record<string, KeyMapping>;
    if (options.commands?.length) user.commands = options.commands;
    tail.push(user);
  }

  // Built-ins and consumer plugins share one settings pass, so a consumer's
  // keys can read a built-in's setting and vice versa.
  load([...builtins, ...userPlugins, ...tail], new Set(builtins));

  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  cleanups.unshift(
    settings.on((key) => {
      if (key === null || key === 'enabled') applyEnabled();
      emit('render', undefined);
    }),
  );

  const start = () => {
    if (!destroyed) applyEnabled();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  return instance;
}

export type InternalLazyKeys = LazyKeys & {
  _sources: SidebarSource[];
  _segments: StatusSegment[];
  _echo(): { text: string; level?: Level };
};
