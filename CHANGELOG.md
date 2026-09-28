# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

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

[0.1.0]: https://github.com/KristofferRisa/lazykeys/releases/tag/v0.1.0
