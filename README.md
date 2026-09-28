# lazykeys

**A LazyVim-shaped modal keyboard layer for any website.** A leader key with a which-key panel, a floating `:` command line with completion, link hints, `/` search, a neo-tree sidebar, a lualine status line and corner notifications — in one dependency-free TypeScript package that hands the keyboard back to everything else on the page.

[![CI](https://github.com/KristofferRisa/lazykeys/actions/workflows/ci.yml/badge.svg)](https://github.com/KristofferRisa/lazykeys/actions/workflows/ci.yml)
![license: MIT](https://img.shields.io/badge/license-MIT-blue)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)

```
 NORMAL   blog  /blog/modal-editing/            /keyboard  [2/5]      <leader>u    42%
```

- [Why](#why)
- [Quickstart](#quickstart)
- [The default keymap](#the-default-keymap)
- [Commands](#commands)
- [Settings](#settings)
- [Options](#options)
- [Plugins](#plugins)
- [Sidebar sources](#sidebar-sources)
- [Status line segments](#status-line-segments)
- [Storage adapters](#storage-adapters)
- [Translations (i18n)](#translations-i18n)
- [Guards and yielding](#guards-and-yielding)
- [Events](#events)
- [Navigation and SPAs](#navigation-and-spas)
- [Theming](#theming)
- [Accessibility](#accessibility), [CSP](#content-security-policy), [browser support](#browser-support)
- [Instance API](#instance-api)
- [Credits](#credits)

---

## Why

A keymap you have to have memorised is a keymap for the person who wrote it. One that answers questions is a keymap for everyone else. That is the idea LazyVim is built on, and it carries over to a web page unchanged:

- **`<leader>` leaves a prefix hanging on purpose**, and which-key answers with everything that can follow it.
- **`:` and `/` float** over the middle of the page instead of fighting the scrollbar at the bottom.
- **`<leader>e` shows the shape of the site** in a tree, instead of making you remember it.

Three principles hold it together, and they are what make it extensible:

1. **The keymap is one table.** Sequences are token lists — `'g g'`, `'<leader> u z'`, `'C-d'` — so the set of prefixes is *derived* from the map. The dispatcher, which-key and `:help` all read the same table; adding a binding is one line, and there is no second list to forget. Groups are declared as `'+name'`.
2. **The settings are one schema.** `:set`, the sidebar's settings source and every plugin's own `get()` read the same rows, stored through a pluggable adapter.
3. **Nothing mutates the page.** `/` paints matches with the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) — `Range` objects, never `<mark>` wrappers — and every element LazyKeys draws lives in its own root, built with `createElement`. There is no `innerHTML` anywhere.

It started life as the vim mode on [kristoffer.dev](https://kristoffer.dev) and was extracted so any site can have it.

---

## Quickstart

### ESM (bundlers, Astro, Vite, …)

lazykeys is not on npm; install it from GitHub. `dist/` is committed, so no build step runs on install.

```sh
pnpm add github:KristofferRisa/lazykeys#v0.1.0
```

```ts
import { createLazyKeys } from 'lazykeys';
import 'lazykeys/lazykeys.css';

const lk = createLazyKeys();
```

That is the whole setup. Press <kbd>Space</kbd> and wait.

### `<script>` tag (no bundler)

Copy `dist/lazykeys.iife.js` and `dist/lazykeys.css` into your site (or load them from jsDelivr), and call `LazyKeys.setup()`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/KristofferRisa/lazykeys@v0.1.0/dist/lazykeys.css">
<script src="https://cdn.jsdelivr.net/gh/KristofferRisa/lazykeys@v0.1.0/dist/lazykeys.iife.js"></script>
<script>
  const lk = LazyKeys.setup({ enabled: true });
</script>
```

The IIFE is minified, self-contained and exposes everything the ESM build exports on `window.LazyKeys` (`setup`, `createLazyKeys`, `explorer`, `memoryAdapter`, `defaultMessages`, …).

[`examples/index.html`](examples/index.html) is a complete demo that loads the IIFE — open it straight from disk.

### Files

| File | What |
| --- | --- |
| `dist/lazykeys.js` | ESM, unminified (your bundler minifies) |
| `dist/lazykeys.iife.js` | `<script>` build, minified, global `LazyKeys` |
| `dist/lazykeys.css` | the stylesheet — all `--lk-*` tokens |
| `dist/types/index.d.ts` | type declarations |

Package exports: `lazykeys`, `lazykeys/iife`, `lazykeys/lazykeys.css` (alias `lazykeys/css`).

---

## The default keymap

<kbd>Space</kbd> is the leader (`:set leader=,` or `leader=\` gives Space back to the page). `{count}` before a motion repeats it: `5j`, `3}`, `40%`.

### Motion

| Keys | Does |
| --- | --- |
| <kbd>j</kbd> <kbd>k</kbd> | down / up a step (also <kbd>Ctrl-E</kbd> / <kbd>Ctrl-Y</kbd>) |
| <kbd>d</kbd> <kbd>u</kbd> | half a screen (also <kbd>Ctrl-D</kbd> / <kbd>Ctrl-U</kbd>) |
| <kbd>gg</kbd> <kbd>G</kbd> | top / bottom; `{count}gg` and `{count}G` go to that percent |
| <kbd>%</kbd> | `{count}%` down the page |
| <kbd>}</kbd> <kbd>{</kbd> | next / previous heading (the `sections` option) |

### Links, going places

| Keys | Does |
| --- | --- |
| <kbd>f</kbd> | label every clickable thing in view, then type its label (<kbd>s</kbd> too, as flash.nvim maps it) |
| <kbd>F</kbd> | the same, into a new tab (<kbd>S</kbd> too) |
| <kbd>H</kbd> <kbd>L</kbd> | back / forward in history |
| <kbd>r</kbd> | reload |
| <kbd>gi</kbd> | into the first text field (also <kbd>i</kbd>) |
| <kbd>go</kbd> | the outline of this page |

### Search, yank, marks

| Keys | Does |
| --- | --- |
| <kbd>/</kbd> | find on this page, counting matches as you type |
| <kbd>n</kbd> <kbd>N</kbd> | next / previous match |
| <kbd>:</kbd> | the command line |
| <kbd>yy</kbd> | yank this page's URL |
| <kbd>yt</kbd> | yank title and URL as a markdown link |
| <kbd>m</kbd>`{a-z}` | set a mark on this page; `{A-Z}` marks span the site |
| <kbd>'</kbd>`{mark}` | jump back to one |
| <kbd>?</kbd> | the whole map, generated from the table the keys dispatch from |
| <kbd>ZZ</kbd> | turn LazyKeys off |

### Leader

| Keys | Does |
| --- | --- |
| <kbd>Space</kbd><kbd>e</kbd> | explorer (falls back to the first sidebar source) |
| <kbd>Space</kbd><kbd>,</kbd> | switch buffer (pages visited this session) |
| <kbd>Space</kbd><kbd>:</kbd> | command history |
| <kbd>Space</kbd><kbd>?</kbd> | keymaps |
| <kbd>Space</kbd><kbd>l</kbd> | `:Lazy` |
| <kbd>Space</kbd><kbd>f</kbd> **+file/find** | <kbd>e</kbd> explorer · <kbd>r</kbd> recent pages |
| <kbd>Space</kbd><kbd>s</kbd> **+search** | <kbd>s</kbd> symbols (outline) · <kbd>h</kbd> find on page · <kbd>k</kbd> keymaps · <kbd>m</kbd> marks · <kbd>n</kbd> notifications |
| <kbd>Space</kbd><kbd>u</kbd> **+ui/toggle** | <kbd>h</kbd> highlight matches · <kbd>l</kbd> status line · <kbd>w</kbd> which-key · <kbd>n</kbd> dismiss notifications · <kbd>o</kbd> quick settings · <kbd>z</kbd> zen |
| <kbd>Space</kbd><kbd>c</kbd> **+code** | <kbd>h</kbd> `:checkhealth` |
| <kbd>Space</kbd><kbd>q</kbd> **+quit/session** | <kbd>q</kbd> turn LazyKeys off |

Group labels are also declared for `g` (goto), `y` (yank), `Z` (quit), `[` (prev), `]` (next), `<leader> g` (git) and `<leader> b` (buffer); a group only appears in which-key once something is mapped under it.

### Inside the surfaces

| Where | Keys |
| --- | --- |
| command line | <kbd>Tab</kbd>/<kbd>Shift-Tab</kbd> complete · <kbd>↑</kbd><kbd>↓</kbd> menu, or history · <kbd>Ctrl-P</kbd>/<kbd>Ctrl-N</kbd> history · <kbd>Enter</kbd> run · <kbd>Esc</kbd> or backspace past the prefix leaves |
| sidebar | <kbd>j</kbd><kbd>k</kbd> move · <kbd>gg</kbd>/<kbd>G</kbd> · <kbd>Enter</kbd>/<kbd>l</kbd>/<kbd>o</kbd> open, expand, flip · <kbd>h</kbd> collapse · <kbd>Space</kbd> flip · <kbd>/</kbd> filter · <kbd>Tab</kbd> or <kbd>1</kbd>–<kbd>9</kbd> source · <kbd>R</kbd> reload · <kbd>q</kbd> close |
| floats (`:help` …) | <kbd>j</kbd><kbd>k</kbd> <kbd>Ctrl-D</kbd><kbd>Ctrl-U</kbd> <kbd>g</kbd><kbd>G</kbd> scroll · <kbd>q</kbd>/<kbd>Esc</kbd> close |
| pickers | <kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> choose |
| link hints | type the label · <kbd>Backspace</kbd> · <kbd>Enter</kbd> takes the first match · <kbd>Esc</kbd> |

### Left alone on purpose

<kbd>Ctrl-F</kbd> (native find stays native) and <kbd>Ctrl-K</kbd> are passed through by default (`passthrough`), and every <kbd>Cmd</kbd>/<kbd>Alt</kbd> combination always belongs to the browser. Keys LazyKeys does not map are never prevented.

---

## Commands

Names resolve by **exact match, then alias, then unique prefix** (then, as a last resort, case-insensitively), so `:se`, `:nohl` and `:che` land where a vim user expects. `:q!` style bangs are tried as an alias first, then as a flag (`ctx.bang`).

| Command | Aliases | Does |
| --- | --- | --- |
| `:help` | `:h` | the keymap and the command list |
| `:set [option]` | `:se` | read or change a setting — bare `:set` lists them |
| `:explorer` | `:Neotree`, `:tree` | the sidebar, on the explorer |
| `:outline` | `:symbols` | the sidebar, on this page's headings |
| `:buffers` | `:ls`, `:bufs` | the sidebar, on pages visited this session |
| `:options` | `:opt` | the settings, in the sidebar |
| `:history` | `:his` | the `:` and `/` lines you have run, in a picker |
| `:marks` | | the marks you have set |
| `:messages` | `:mes`, `:notifications` | everything LazyKeys has said |
| `:nohlsearch` | `:noh`, `:nohl` | stop painting the last search (`n` still works) |
| `:zen` | | toggle `lk-zen` on `<html>` — what it hides is your CSS |
| `:Lazy` | `:plugins` | every plugin loaded, with its keys, commands and load time |
| `:checkhealth` | `:che`, `:health` | whether everything LazyKeys leans on is here, plus every plugin's `health()` |
| `:version` | `:ver` | what this is |
| `:write` | `:w` | nothing to write — settings save themselves |
| `:quit` | `:q`, `:q!`, `:qa`, `:qall`, `:quitall` | turn LazyKeys off (remembered) |
| `:wq` | `:x`, `:xa`, `:wqa` | the same, for the muscle memory |

### `:set`

| Form | Does |
| --- | --- |
| `:set` | list every option |
| `:set opt` | turn a boolean on — or show a non-boolean's value |
| `:set noopt` | turn a boolean off |
| `:set opt!` / `:set invopt` | flip a boolean |
| `:set opt?` | show the value |
| `:set opt=val` / `opt:val` | assign (numbers clamp to the row's `min`/`max`, enums must be one of `values`) |

Several at once work: `:set scroll=120 nohlsearch leader=,`. Errors are vim's: `E518` unknown option, `E521` number required, `E474` invalid argument.

---

## Settings

Every row below appears under `:set`, in the sidebar's settings source, and is what the plugins read. Override any default with `defaults: { scroll: 100 }`.

| `:set` | Key | Default | |
| --- | --- | --- | --- |
| `leader` | `leader` | `space` | the leader: `space`, `,` or `\` |
| `timeoutlen` | `timeoutlen` | `250` | ms a prefix waits before which-key shows (0–2000). The leader never waits. An ambiguous binding (both a key and a prefix) runs after this long |
| `whichkey` | `whichkey` | on | the panel that answers a hanging prefix |
| `cmdline` | `cmdline` | `popup` | `popup` floats `:` and `/`; `bottom` is the classic line |
| `sidebar` | `sidebar` | `right` | which edge the sidebar opens on; which-key takes the other corner |
| `statusline` | `statusline` | on | the bar along the bottom |
| `notify` | `notify` | on | messages also rise in the corner and fade |
| `hintchars` | `hintchars` | `asdfghjkl` | the alphabet `f` builds labels from |
| `scroll` | `scroll` | `72` | pixels one `j` moves (8–400) |
| `smoothscroll` | `smoothscroll` | off | animate motions (forced off under `prefers-reduced-motion`) |
| `hlsearch` | `hlsearch` | on | paint every match, not just the current one |
| `ignorecase` | `ignorecase` | on | with smartcase: an uppercase letter in the pattern means you meant it |
| — | `enabled` | `true` | whether LazyKeys is on (`options.enabled` sets the default; `:q` and `ZZ` write it) |

---

## Options

Everything is optional.

```ts
createLazyKeys({
  enabled: true,                  // default of the `enabled` setting
  persist: true,                  // enable()/disable() write that setting
  namespace: 'lazykeys',          // storage keys: lazykeys:settings, lazykeys:marks, …
  storage: localStorageAdapter(), // where settings live
  defaults: { leader: ',' },      // override setting defaults
  settings: [],                   // extra setting rows
  keys: {},                       // extra / overriding bindings, applied last
  commands: [],                   // extra / overriding ex commands
  plugins: [],                    // your plugins; one named like a built-in replaces it
  disable: [],                    // built-ins to leave out: ['zen', 'yank']
  messages: {},                   // override any user-facing string
  yieldTo: [],                    // stand down while any returns true
  passthrough: ['C-f', 'C-k'],    // never take these keys
  eventName: undefined,           // also dispatch commands as this DOM event
  navigate: (url, { newTab }) => {}, // SPA routers
  root: 'main',                   // what / searches and the outline reads (falls back to body)
  headings: 'h1, h2, h3, h4',     // outline source
  sections: 'h2, h3',             // targets of { and } (string or () => Element[])
  hintTargets: 'a[href], button:not([disabled]), …', // what f labels
  exclude: '#my-terminal, .cookie-banner', // chrome that / and f ignore
  fields: 'input[type=search], …',// what gi focuses
  scroller: () => document.querySelector('#app-scroll'), // when the window is not what scrolls
  title: () => document.title,    // buffers and yt
  section: () => location.pathname.split('/')[1] ?? '', // the status line's section segment
  mount: () => document.body,     // where LazyKeys' root element goes
});
```

---

## Plugins

Every built-in is a plugin spec, in the lazy.nvim spirit: `core`, `motions`, `yank`, `marks`, `hints`, `cmdline`, `find`, `whichkey`, `help`, `sidebar`, `statusline`, `notifier`, `zen`. Leave one out with `disable: ['zen']`; replace one by passing a plugin with the same name.

```ts
interface PluginSpec {
  name: string;
  enabled?: boolean | ((lk) => boolean);              // lazy.nvim's enabled/cond
  keys?: Record<string, KeyMapping> | ((ctx) => …);   // bindings, '+group' strings, or false to unmap
  commands?: ExCommandSpec[] | ((ctx) => …);
  settings?: SettingSpec[] | ((ctx) => …);            // defined before any plugin's keys/setup run
  sources?: SidebarSource[] | ((ctx) => …);
  statusline?: StatusSegment[] | ((ctx) => …);
  health?: (ctx) => HealthItem[];                      // rows for :checkhealth
  setup?(ctx): void | (() => void);                    // runs last; may return a cleanup
}
```

Every field may be a value or a function of the plugin context, which carries `lk` (the instance), `t` (translate), `settings`, `options`, `ui` (floats, pickers, icons, `announce`), `session` (namespaced sessionStorage JSON), `pushLayer()` (take the keyboard while a surface is up), `provide(name, api)` and `onCleanup(fn)`.

A binding is `{ run(ctx), desc?, section?, hidden?, arg? }` or a bare function. `run` receives `{ count, hasCount, seq, arg?, event }`. `arg: '{a-z}'` makes the binding swallow the next key, the way `m` and `'` do.

### Example: a site plugin

```ts
import { createLazyKeys, definePlugin, explorer } from 'lazykeys';

const site = definePlugin({
  name: 'site',
  settings: [
    { key: 'mood', option: 'mood', type: 'enum', values: ['calm', 'loud'], default: 'calm', label: 'Mood', group: 'Site' },
  ],
  keys: ({ lk }) => ({
    'g h': { desc: 'Home', section: 'Go', run: () => lk.navigate('/') },
    'g b': { desc: 'Blog', section: 'Go', run: () => lk.navigate('/blog/') },
    '[ [': { desc: 'Previous post', run: () => document.querySelector<HTMLAnchorElement>('a[rel=prev]')?.click() },
    '] ]': { desc: 'Next post', run: () => document.querySelector<HTMLAnchorElement>('a[rel=next]')?.click() },
    '<leader> <leader>': { desc: 'Find file', run: () => openPalette() },
    '<leader> g': '+git',
    '<leader> g g': { desc: 'Repository', run: () => lk.navigate('https://github.com/me/site', { newTab: true }) },
    r: false, // no reload key here
  }),
  commands: ({ lk, settings }) => [
    {
      name: 'mood',
      args: '[calm|loud]',
      desc: 'Set the mood',
      run: ([value]) => (value ? settings.set('mood', value) : lk.echo(`mood=${settings.get('mood')}`)),
      complete: () => [{ value: 'calm' }, { value: 'loud' }],
    },
  ],
  sources: [explorer({ load: () => fetch('/index.json').then((r) => r.json()) })],
  statusline: ({ settings }) => [{ id: 'mood', order: 80, render: () => String(settings.get('mood')) }],
  health: () => [{ label: 'search index', ok: !!window.searchIndex, detail: '<leader>e and :open' }],
  setup({ lk, settings }) {
    return settings.on((key, value) => {
      if (key === 'mood') document.body.dataset.mood = String(value);
    });
  },
});

const lk = createLazyKeys({ plugins: [site] });
```

At runtime: `lk.map(seq, mapping, desc?)`, `lk.command(spec)` and `lk.register(plugin)` each return their own removal.

### Services

Plugins talk through services: `ctx.provide('name', api)` and `lk.use('name')`. The built-ins provide:

| Service | API |
| --- | --- |
| `cmdline` | `open(prefix = ':', initial?)`, `define(prefix, () => PromptOptions)`, `prompt(opts)`, `close()`, `active()`, `history()` |
| `find` | `preview(text)`, `accept(text)`, `next(delta)`, `clear()`, `nohl()`, `pattern()`, `count()`, `index()` |
| `hints` | `start({ newTab })`, `cancel()`, `active()`, `list()` |
| `sidebar` | `open(source?)`, `close()`, `toggle(source?)`, `isOpen()`, `source()`, `sources()`, `refresh()` |
| `notifier` | `show(message, opts)`, `dismissAll()` |
| `whichkey` | `show(tokens)`, `hide()`, `visible()` |

`cmdline.prompt()` is how `/` is built, and how you would add a `?` backwards search or a `#` tag prompt of your own.

---

## Sidebar sources

A source is a tab in the sidebar:

```ts
interface SidebarSource {
  id: string;
  label: string;                 // '' falls back to messages['source.<id>']
  icon?: string;                 // folder, file, list, layers, gear, hash, link, …
  order?: number;                // built-ins: explorer 10, outline 20, buffers 30, settings 40
  rows(ctx): SidebarRow[] | Promise<SidebarRow[]>;
  reload?(): void;               // R
}

interface SidebarRow {
  label: string;
  hint?: string; icon?: string; id?: string; depth?: number;
  kind?: 'dir' | 'file' | 'item' | 'header' | 'symbol' | 'option';
  current?: boolean; dormant?: boolean;
  children?: SidebarRow[]; open?: boolean;   // a folder
  href?: string;                              // Enter navigates (and closes the sidebar)
  onSelect?(): boolean | void;                // Enter; return true to close
  onCycle?(dir: 1 | -1): void;                // h / l / Space on an option
  value?: string; toggled?: boolean;          // drawn on the right
}
```

The built-ins are **outline** (headings under `root`, as document symbols), **buffers** (pages visited this session) and **settings** (the schema). The **explorer** is yours to feed, because only the site knows its pages:

```ts
import { explorer } from 'lazykeys';

explorer({
  load: async () => (await fetch('/index.json').then((r) => r.json())).map((p) => ({ path: p.permalink, title: p.title })),
  rootLabel: 'content/',
  fileName: (segment) => segment + '.md',  // how a leaf page is named
  indexName: '_index.md',                   // how a section's own page is named
  current: () => location.pathname,         // "you are here"
});
```

It turns a flat list of URL paths into a folder tree: folders above files, a section's own page first, and the branch you are standing in open.

---

## Status line segments

```ts
interface StatusSegment {
  id: string;
  order?: number;   // built-ins: mode 10, section 20, path 30, message 40, search 50, keys 60, position 90
  grow?: boolean;   // take the slack (message does)
  class?: string;
  render(ctx: { lk, t, mode, pending, message }): Node | string | Array<Node | string> | null;
}
```

Return text or nodes you built (`h()` and `icon()` are exported); nothing is parsed as HTML. The segment element gets `lk-seg lk-seg--<id>`. It redraws on mode changes, pending keys, messages, settings changes and scroll (coalesced to one frame).

When something only your segment knows about changes — a mood, a row cursor, a value fetched after load — call `lk.redraw()`. It asks for one frame of the status line and leaves the message segment as it is:

```ts
document.addEventListener('site:mood', () => lk.redraw());
```

---

## Storage adapters

Settings go through a `StorageAdapter`:

```ts
interface StorageAdapter {
  get(key: string): unknown;
  set(key: string, value: boolean | number | string | undefined): void; // undefined = back to the default
  subscribe?(fn: (key: string | null) => void): () => void;            // changes made elsewhere
}
```

The default, `localStorageAdapter(namespace)`, keeps one JSON object under `<namespace>:settings`, never throws (private mode degrades to "remembered for this page"), and follows other tabs through the `storage` event. `memoryAdapter()` remembers nothing. Defaults are never written, so changing a default later reaches everyone who never touched that row.

A site that already has a settings store keeps it — here, mapping LazyKeys' keys onto an existing `KdevSettings` schema:

```ts
const KEYS: Record<string, string> = {
  enabled: 'vim', leader: 'vimLeader', whichkey: 'vimWhichKey', timeoutlen: 'vimTimeout',
  cmdline: 'vimCmdline', sidebar: 'vimSidebar', notify: 'vimNotify', statusline: 'vimStatusline',
  hintchars: 'vimHintChars', scroll: 'vimScroll', smoothscroll: 'vimSmooth',
  hlsearch: 'vimHlsearch', ignorecase: 'vimIgnorecase',
};
const kdevStorage = {
  get: (key) => KdevSettings.get(KEYS[key] ?? key),
  set: (key, value) => KdevSettings.set(KEYS[key] ?? key, value),
  subscribe: (fn) => KdevSettings.on((key) => fn(key === null ? null : (Object.keys(KEYS).find((k) => KEYS[k] === key) ?? key))),
};
LazyKeys.setup({ storage: kdevStorage, enabled: false });
```

Session state (marks, buffers, `:` history, a pending cross-page mark jump) lives in `sessionStorage` under the same namespace.

---

## Translations (i18n)

Every string LazyKeys shows — modes, which-key group names, key and command descriptions, help sections, messages, sidebar labels, setting labels, footers — comes from one table. Override any subset with `messages`; `{name}` placeholders are filled in. The full English table is exported as `defaultMessages`.

```ts
createLazyKeys({
  messages: {
    'mode.normal': 'NORMAL',
    'mode.insert': 'SETT INN',
    'mode.cmdline': 'KOMMANDO',
    'group.file': 'fil/finn',
    'group.search': 'søk',
    'group.ui': 'visning',
    'key.explorer': 'Utforsker',
    'key.find': 'Finn på denne siden',
    'msg.on': 'LazyKeys på',
    'msg.intro': 'Trykk {leader} for kartet, ? for hjelp, :q for å slå av.',
    'help.title': 'Tastatur',
    'source.explorer': 'Utforsker',
    'sidebar.filter': 'filtrer',
    'setting.scroll': 'Rullesteg (px)',
  },
});
```

Your own plugins can use `ctx.t('your.key')` with keys you add to `messages` too.

---

## Guards and yielding

The order a key press is offered to things:

1. LazyKeys is off, or an IME is composing → **the page's**.
2. Any `yieldTo` guard returns true → **the page's**. Pass one per widget that owns the keyboard while open: `yieldTo: [() => terminal.isOpen(), () => palette.isOpen()]`, or add one later with `lk.yieldTo(fn)`.
3. A LazyKeys surface is up (command line, float, sidebar, hints) → **that surface's**.
4. The caret is in a field (`input`, `textarea`, `select`, `contenteditable`) → **the field's**. That is insert mode; <kbd>Esc</kbd> blurs the field and returns to normal.
5. Already `defaultPrevented`, or <kbd>Cmd</kbd>/<kbd>Alt</kbd> held → **the page's**.
6. A `passthrough` key (default <kbd>Ctrl-F</kbd>, <kbd>Ctrl-K</kbd>) → **the browser's**.
7. Otherwise → **the dispatcher's**. Only keys it takes are `preventDefault()`ed.

The listener is on `document` in the capture phase. Other key handlers can ask `lk.ownsKeys()` — true while LazyKeys is on and not yielding — to give up a bare key of their own (kristoffer.dev's presenter hands `p` over this way).

---

## Events

After every command, LazyKeys dispatches a `CustomEvent` on `document`:

```ts
document.addEventListener('lazykeys:command', (e) => {
  e.detail; // { seq: 'g g', count: 1 }  or  { ex: 'checkhealth', line: 'checkhealth' }
});
```

`seq` is the canonical token sequence (`'<leader> e'`, `'C-d'`), exactly as bindings are written. `ex` is the resolved command name, `line` what was typed. Pass `eventName: 'kdev:vim'` to also dispatch the same detail under your own name.

Inside JavaScript, `lk.on(event, fn)` returns an unsubscribe:

| Event | Payload |
| --- | --- |
| `command` | the same detail as above |
| `enable`, `disable`, `destroy` | — |
| `mode` | `'normal' \| 'insert' \| 'cmdline' \| 'hints'` |
| `pending` | `{ keys, count, awaitingArg }` |
| `message` | `{ at, level, title?, message }` — every `notify()` |
| `echo` | `{ text, level? }` — the status line's message |
| `escape` | — (Esc in normal mode) |
| `navigate` | — (`refresh()` was called) |
| `render` | — (something the status line shows changed; `lk.redraw()` emits it too) |

---

## Navigation and SPAs

Everything that goes somewhere goes through `navigate(url, { newTab })` — the explorer, buffers, cross-page marks and `F`. The default uses `location.assign` and `window.open(…, 'noopener')`; pass your router's instead. Link hints click the element rather than following `href`, so router links and buttons behave as if clicked.

After a client-side route change, call `lk.refresh()`: it drops pending keys, closes floats, re-attaches LazyKeys' root if the `<body>` was swapped, restores a pending cross-page mark, records the page in buffers and redraws. With Astro's view transitions:

```ts
document.addEventListener('astro:page-load', () => lk.refresh());
```

Create the instance once (it survives body swaps). `lk.destroy()` removes every element, listener and class it added.

---

## Theming

All styling is `--lk-*` custom properties with tokyonight-ish dark defaults, declared on `:where(:root)` — zero specificity, so yours win wherever they are declared:

```css
:root {
  --lk-accent: var(--color-primary);
  --lk-bg: var(--color-surface);
  --lk-fg: var(--color-text);
}
```

Set them wherever your own tokens live. If your dark mode or themes are classes on `body` (`body.dark`, `body.theme-x`), set the `--lk-*` tokens on `body` too — a `var()` resolves where it is declared, so a mapping on `:root` would only ever see the `:root` values.

**Derived tokens follow the accent wherever you set it.** `--lk-focus`, `--lk-mode-normal`, `--lk-mode-insert`, `--lk-mode-cmdline`, `--lk-mode-hints` and `--lk-hint-bg` are not declared on `:root` at all; each is read as `var(--lk-focus, var(--lk-accent))` (and so on) at the element that uses it. Setting `--lk-accent` on `body` is enough for the focus rings and the NORMAL block to follow it — there is no need to restate them. Set one explicitly only to make it differ from what it derives from.

| Token | Default | Used for |
| --- | --- | --- |
| `--lk-font` | system monospace stack | everything LazyKeys draws |
| `--lk-font-size` | `0.8125rem` | base size |
| `--lk-bg` | `#1f2335` | panels, floats, command line |
| `--lk-bg-alt` | `#292e42` | status line, hover |
| `--lk-bg-muted` | `#3b4261` | status segments, switches |
| `--lk-bg-kbd` | `#16161e` | key caps |
| `--lk-fg` | `#c0caf5` | text |
| `--lk-fg-strong` | `#e5e9ff` | emphasis, input text |
| `--lk-fg-muted` | `#9aa5ce` | hints, secondary text |
| `--lk-border` | `#3b4261` | borders |
| `--lk-accent` | `#7aa2f7` | titles, selection, keys |
| `--lk-accent-fg` | `#1a1b26` | text on accent |
| `--lk-accent-soft` | `rgb(122 162 247 / .16)` | selected rows |
| `--lk-focus` | falls back to `--lk-accent` (resolved at the element) | focus rings |
| `--lk-green` `--lk-yellow` `--lk-orange` `--lk-red` `--lk-blue` `--lk-purple` | tokyonight | levels, groups |
| `--lk-mode-normal` / `-insert` / `-cmdline` / `-hints` | fall back to accent / green / yellow / orange (resolved at the element) | the mode block |
| `--lk-hint-bg` / `--lk-hint-fg` | falls back to yellow / dark | link hint labels (new-tab hints use `--lk-purple`) |
| `--lk-search-bg` / `--lk-search-fg` | translucent yellow / inherit | every match |
| `--lk-search-current-bg` / `--lk-search-current-fg` | orange / dark | the current match |
| `--lk-radius` / `--lk-radius-sm` | `10px` / `5px` | corners |
| `--lk-shadow` | `0 24px 64px rgb(0 0 0 / .45)` | floating things |
| `--lk-backdrop` | `rgb(0 0 0 / .55)` | behind floats |
| `--lk-status-h` | `28px` | status line height |
| `--lk-status-pad` | `var(--lk-status-h)` | bottom padding added to `body` while the status line shows (set `0` to opt out) |
| `--lk-sidebar-w` | `300px` | sidebar width |
| `--lk-sidebar-top` | `0px` | sidebar top, e.g. your header's height |
| `--lk-notify-top` | `1rem` | toast stack offset |
| `--lk-cmdline-top` | `16vh` | where the popup command line floats |
| `--lk-z` | `8000` | base z-index: sidebar +50, status +100, hints +200, which-key +250, cmdline +300, floats +400, toasts +500 |

State classes on `<html>` for your own CSS: `lk-on` (enabled), `lk-status-on` (status line showing), `lk-sidebar-open` with `data-lk-sidebar="left|right"`, `lk-zen` (`:zen`). For example, `.lk-zen .site-header { display: none }`, or lift a fixed widget clear of the bar with `html.lk-status-on .chat-bubble { bottom: calc(1rem + var(--lk-status-h)) }`.

`prefers-reduced-motion` turns off every animation and transition, and forces `smoothscroll` off.

---

## Accessibility

- Floats (`:help`, `:messages`, pickers …) are `role="dialog"` with `aria-modal`, labelled by their title; focus moves in and is handed back on close, and Tab stays inside.
- The command line input is a `combobox` over a `listbox` with `aria-activedescendant`; the match count is `aria-live`.
- The sidebar is a `tablist` of sources over a `tree` of `treeitem`s with `aria-level`, `aria-expanded`, `aria-selected` and `aria-current`.
- Toasts are an `aria-live="polite"` log; status messages go to a visually hidden live region. The status line itself is `aria-hidden` — a screen reader announcing every `j` would be a punishment.
- Visible `:focus-visible` rings use `--lk-focus`. The default palette passes axe's contrast checks.

## Content Security Policy

LazyKeys works under `script-src 'self'` with no `unsafe-inline` or `unsafe-eval`: no `eval`, no `new Function`, no injected `<style>`, no `innerHTML`. Inline positions (hint labels, tree depth, which-key rows) are set through CSSOM (`style.setProperty`), which `style-src` does not govern. Ship `lazykeys.css` as a normal stylesheet.

## Browser support

Current Chrome, Edge, Firefox and Safari (ES2020). The CSS Custom Highlight API paints search matches in Chromium 105+, Safari 17.2+ and Firefox 140+; without it `/`, `n` and `N` still find and jump, only the colour is missing. `:checkhealth` reports what the current browser has.

---

## Instance API

```ts
const lk = createLazyKeys(options);   // or LazyKeys.setup(options)

lk.enable(); lk.disable(); lk.toggle(); lk.isEnabled(); lk.ownsKeys(); lk.destroy();
lk.map('<leader> x', () => {}, 'Do x');      // → unmap()
lk.command({ name: 'deploy', run() {} });    // → remove()
lk.register(plugin);                          // → unregister()
lk.exec('set scroll=120');                    // run an ex line → boolean
lk.feed('g g');                               // feed keys as if typed
lk.notify('Saved', 'success');                // toast + :messages (or { level, title, timeout })
lk.echo('3 matches');                         // the status line's message (with a level, also a toast)
lk.on('command', (detail) => {});             // → off()
lk.use<SidebarApi>('sidebar')?.open('outline');
lk.mode(); lk.setMode('insert'); lk.leader(); // '<space>'
lk.navigate('/about/', { newTab: false });
lk.refresh();                                  // after an SPA navigation
lk.redraw();                                   // redraw the status line (keeps the message)
lk.yieldTo(() => dialog.open);                 // → remove()
lk.plugins(); lk.health(); lk.messages(); lk.complete('se'); lk.exCommands();
lk.keymap; lk.commands; lk.settings; lk.dispatcher; lk.scroll; lk.ui; lk.t;
```

The building blocks are exported too — `Keymap`, `Dispatcher`, `ExRegistry`, `Settings`, `parseSeq`, `displaySeq`, `labelsFor`, `applySet`, `parseSetArg`, `buildTree` — with their types.

---

## Credits

LazyKeys is a love letter to the Neovim ecosystem, and borrows its shape wholesale:

- [LazyVim](https://www.lazyvim.org) and [lazy.nvim](https://github.com/folke/lazy.nvim) — the leader layout, the plugin-spec idea and `:Lazy`
- [which-key.nvim](https://github.com/folke/which-key.nvim) — the panel that answers a hanging prefix
- [noice.nvim](https://github.com/folke/noice.nvim) — the floating command line and its completion popup
- [nvim-notify](https://github.com/rcarriga/nvim-notify) / [snacks.nvim](https://github.com/folke/snacks.nvim) — the corner notifications
- [neo-tree.nvim](https://github.com/nvim-neo-tree/neo-tree.nvim) — the sidebar and its sources
- [lualine.nvim](https://github.com/nvim-lualine/lualine.nvim) — the status line's segments and order
- [flash.nvim](https://github.com/folke/flash.nvim), [Vimium](https://github.com/philc/vimium) and [Vimium C](https://github.com/gdh1995/vimium-c) — link hints
- [tokyonight.nvim](https://github.com/folke/tokyonight.nvim) — the default palette
- [Lucide](https://lucide.dev) — the shapes of the icons

Extracted from [kristoffer.dev](https://kristoffer.dev)'s vim mode.

## License

[MIT](LICENSE) © Kristoffer Risa
