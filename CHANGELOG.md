# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [0.2.0] — 2026-09-30

Fuzzy filtering for pickers, the way LazyVim's picker works.

### Added

- **Fuzzy filter for pickers**, LazyVim style: `ui.picker({ filter: true, … })` puts a filter above the list. It opens in insert mode (type to filter, <kbd>↑</kbd><kbd>↓</kbd>/<kbd>Ctrl-N</kbd><kbd>Ctrl-P</kbd> move, <kbd>Enter</kbd> chooses); <kbd>Esc</kbd> goes to normal mode (<kbd>j</kbd><kbd>k</kbd>, <kbd>gg</kbd>/<kbd>G</kbd>, <kbd>i</kbd>/<kbd>a</kbd>/<kbd>/</kbd> to type again) and <kbd>Esc</kbd> or <kbd>q</kbd> there closes. Matched letters are highlighted, the title shows `n/total`, and the input is an ARIA combobox over the listbox. New options `query` and `placeholder`; items may carry `keywords`, matched as plain text. `onChoose` still gets the item's index in `items`.
- `:history` uses the filter.
- `fuzzyMatch()`, `fuzzyFilter()` and `fold()` are exported, with the `FuzzyMatch` and `Ranked` types.
- Messages `picker.filter`, `picker.filterLabel`, `picker.empty`, `picker.count` and `foot.normal`.

### Changed

- Unfiltered pickers take <kbd>gg</kbd>/<kbd>G</kbd> to the first and last item (they scrolled the float), and moving the pointer over an item selects it.

## [0.1.1] — 2026-09-28

Fixes for the gaps the first two consumers hit — kristoffer.dev ([#69](https://github.com/KristofferRisa/kristoffer.dev/pull/69)) and portal.kristoffer.dev ([#3](https://github.com/KristofferRisa/portal.kristoffer.dev/pull/3)) — so neither needs a workaround.

### Added

- `lk.redraw()` redraws the status line (coalesced to one frame) without touching the message segment — for segments that render state LazyKeys does not know about.
- Sidebar sources are keyed by id: registering an id that exists replaces it (in its tab position), and removing that registration brings the previous one back. `sources` also takes a record where `false` removes an id (`sources: { settings: false }`), there is a top-level `sources` option, and `lk.source(id, source | false)` returns its removal.
- `enabledOption` (default `'lazy'`): the `enabled` setting's `:set` name, so `:set nolazy` turns LazyKeys off. `false` keeps it out of `:set`.
- Setting rows without a `label`/`help` take them from `messages`: `setting.<key>.label`, then `setting.<key>`, and `setting.<key>.help` — including built-in rows a consumer redefines. `settingLabel()` and `settingHelp()` are exported.
- `explorer()` entries may carry a `label`.
- `headingIgnore`: the elements the outline leaves out of heading labels (permalink anchors).
- `escapeInFields: 'page' | 'blur' | 'keep'`: who gets Esc while the caret is in a field.

### Changed

- **Esc in a field now reaches the page first** (`escapeInFields: 'page'`, the new default). The page's handlers run, and LazyKeys blurs the field afterwards only if none of them called `preventDefault()` or stopped propagation. 0.1.0 blurred in the capture phase, before any page handler; `escapeInFields: 'blur'` restores that.
- **`passthrough` applies only where a key would start a sequence.** Inside a sequence a passthrough key is an ordinary key, so `` ` `` can be passed through to a site's terminal and `` <leader> ` `` still mapped.
- **The `enabled` setting shows in the settings source** (it was hidden) and has a `:set` name, `lazy`. Set `enabledOption: false` to keep it out of `:set`; redefine the row with `hidden: true` to hide it again.
- **`explorer()` keeps the query string** as part of an entry's identity and label: `/repo?slug=a` and `/repo?slug=b` are two rows (`repo?slug=a`, `repo?slug=b`). The hash is still ignored. "You are here" defaults to `location.pathname + location.search` and falls back to the bare path, so an unlisted `?q=` does not add a row.
- **The outline no longer strips a trailing `#`, `¶` or `§` from heading text.** It drops permalink anchor *elements* instead (`headingIgnore`, default `a.anchor, a.headerlink, a.header-anchor, a.heading-anchor, a.hash-link, [aria-hidden="true"], [hidden]`), so "Learning C#" stays whole. A site whose permalink is bare text with none of those classes should set `headingIgnore`.

### Fixed

- `--lk-focus`, `--lk-mode-normal` (and `--lk-mode-insert`/`-cmdline`/`-hints`, `--lk-hint-bg`) followed the `:root` accent even when a site set `--lk-accent` lower down, on `body`. Derived tokens are no longer declared on `:root`; each is read with its fallback where it is used (`var(--lk-focus, var(--lk-accent))`), so it follows `--lk-accent` wherever that is set. Defaults stay on `:where(:root)` with zero specificity.

## [0.1.0] — 2026-09-28

The first release: kristoffer.dev's vim mode, extracted and generalised into a framework any site can adopt.

### Added

- `createLazyKeys(options)` / `LazyKeys.setup(options)` returning an instance with `enable`, `disable`, `toggle`, `isEnabled`, `ownsKeys`, `destroy`, `map`, `command`, `register`, `exec`, `feed`, `notify`, `echo`, `on`, `use`, `navigate`, `refresh` and `yieldTo`.
- One keymap table of token sequences (`'g g'`, `'<leader> u z'`, `'C-d'`, vim `<C-d>` notation accepted) with derived prefixes, `+group` labels, stacked overrides and `false` to unmap.
- A DOM-free dispatcher: counts (`5j`, `40%`), a configurable leader (`space`, `,`, `\`), `timeoutlen` for which-key and for ambiguous sequences, and bindings that take an argument (`m{a-z}`).
- An ex-command table resolved by exact name, alias, then unique prefix; Tab completion and per-prefix history in the command line.
- One settings schema with a pluggable storage adapter (namespaced localStorage by default, memory adapter included) and vim's `:set` forms: `opt`, `noopt`, `opt!`, `invopt`, `opt?`, `opt=val`.
- Built-in plugins: `core`, `motions`, `yank`, `marks`, `hints`, `cmdline`, `find`, `whichkey`, `help`, `sidebar` (outline, buffers and settings sources, plus an `explorer()` factory), `statusline` (extensible segments), `notifier` and `zen`.
- `:help`, `:set`, `:explorer`, `:outline`, `:buffers`, `:options`, `:history`, `:marks`, `:messages`, `:nohlsearch`, `:zen`, `:Lazy`, `:checkhealth`, `:version`, `:write`, `:quit`, `:wq`.
- Search painted with the CSS Custom Highlight API (no DOM mutation), with graceful fallback.
- Guards: insert mode while the caret is in a field, `yieldTo` predicates, `passthrough` keys (default Ctrl-F, Ctrl-K), Cmd/Alt always left alone.
- `lazykeys:command` events (`{ seq, count }` / `{ ex, line }`) plus an optional consumer-named event.
- An overridable `navigate(url, { newTab })` and `refresh()` for SPAs, including `<body>` swaps.
- Every user-facing string in one overridable `messages` table.
- Theming entirely through `--lk-*` custom properties with tokyonight-ish defaults; reduced-motion aware; dialog, combobox, tree and live-region semantics.
- Builds: ESM, minified IIFE (`window.LazyKeys`), CSS and type declarations, committed in `dist/`.

[0.2.0]: https://github.com/KristofferRisa/lazykeys/releases/tag/v0.2.0
[0.1.1]: https://github.com/KristofferRisa/lazykeys/releases/tag/v0.1.1
[0.1.0]: https://github.com/KristofferRisa/lazykeys/releases/tag/v0.1.0
