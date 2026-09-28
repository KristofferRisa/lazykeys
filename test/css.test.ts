import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/lazykeys.css'), 'utf8');
const rootBlock = /:where\(:root\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

describe('lazykeys.css tokens', () => {
  it('declares its defaults on :where(:root), with zero specificity', () => {
    expect(rootBlock).toContain('--lk-accent:');
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/);
  });

  it('never derives one token from another on :root, where it would freeze', () => {
    const declarations = rootBlock.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations).not.toMatch(/var\(--lk-/);
    for (const token of ['--lk-focus', '--lk-mode-normal', '--lk-mode-insert', '--lk-mode-cmdline', '--lk-mode-hints', '--lk-hint-bg']) {
      expect(declarations).not.toContain(token + ':');
    }
  });

  it('reads every derived token with its fallback where it is used', () => {
    const uses = [...css.matchAll(/var\((--lk-(?:focus|mode-[a-z]+|hint-bg))(,[^;]*)?\)/g)];
    expect(uses.length).toBeGreaterThan(5);
    for (const [whole, , fallback] of uses) expect(fallback, whole).toMatch(/var\(--lk-(accent|green|yellow|orange)\)/);
  });
});
