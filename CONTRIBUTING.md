# Contributing to lazykeys

Thanks for wanting to help. lazykeys is small on purpose: a keymap, a dispatcher, a settings schema and a handful of plugins, with zero runtime dependencies. Changes that keep it that way are the easiest to land.

## Setup

```sh
pnpm install
pnpm typecheck   # tsc, strict, for src/ and test/
pnpm test        # vitest + happy-dom
pnpm build       # dist/: ESM, IIFE, CSS, .d.ts
```

Open `examples/index.html` in a browser (straight from disk is fine) to try a change by hand.

## dist/ is committed

Git dependencies (`pnpm add github:KristofferRisa/lazykeys#vX.Y.Z`) and vendored copies use `dist/` without building, so it is checked in. **Run `pnpm build` and commit `dist/` with every source change.** CI rebuilds and fails on any difference (`git diff --exit-code dist`), so a stale build cannot be merged.

## Ground rules

These are the three principles the project is built on — please keep them true:

1. **The keymap is one table.** New bindings are rows in a plugin's `keys`. Never keep a second list of keys anywhere (help text, which-key rows, prefix sets are all derived).
2. **The settings are one schema.** A new switch is one `SettingSpec` row; read it with `ctx.settings.get()`.
3. **Nothing mutates the page.** No wrapping page text, no `innerHTML`, no injected `<style>`, no `eval`. Build DOM with `h()` from `src/core/dom.ts`; set inline values through `style.setProperty`. A test enforces the obvious cases.

And:

- **Every user-facing string goes through `t()`** with a key in `src/core/i18n.ts`, so sites in other languages can override it.
- **New UI is themable** with `--lk-*` tokens only, respects `prefers-reduced-motion`, and passes an axe check (roles, labels, contrast, focus).
- **Built-in features are plugins** (`src/plugins/`), wired through the same spec a consumer would write.
- **Tests** for anything with logic: pure parts in `test/*.test.ts` against the module, behaviour through `createLazyKeys` in `test/lazykeys.test.ts`.

## Commits and releases

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `chore:`). Releases are git tags (`vX.Y.Z`) with a GitHub release; the version lives in `package.json` and `src/version.ts` (the build refuses to run if they differ), and every release gets a `CHANGELOG.md` entry.

## Reporting bugs

Include the browser, what you pressed, what you expected, and the output of `:checkhealth`.
