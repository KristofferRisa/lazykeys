// Build dist/: ESM, a minified IIFE on window.LazyKeys, the stylesheet and
// the type declarations. dist/ is committed (git dependencies and vendored
// copies use it without a build), so this must be deterministic: CI rebuilds
// and fails on any diff.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'));

const versionSource = readFileSync(at('src/version.ts'), 'utf8');
if (!versionSource.includes(`'${pkg.version}'`)) {
  console.error(`src/version.ts does not match package.json (${pkg.version})`);
  process.exit(1);
}

const banner = `/*! lazykeys v${pkg.version} | MIT | https://github.com/KristofferRisa/lazykeys */`;

rmSync(at('dist'), { recursive: true, force: true });
mkdirSync(at('dist'), { recursive: true });

const shared = {
  bundle: true,
  target: ['es2020'],
  platform: 'browser',
  legalComments: 'none',
  charset: 'utf8',
  banner: { js: banner },
  logLevel: 'warning',
};

await build({
  ...shared,
  entryPoints: [at('src/index.ts')],
  outfile: at('dist/lazykeys.js'),
  format: 'esm',
});

await build({
  ...shared,
  entryPoints: [at('src/iife.ts')],
  outfile: at('dist/lazykeys.iife.js'),
  format: 'iife',
  globalName: 'LazyKeys',
  minify: true,
});

copyFileSync(at('src/lazykeys.css'), at('dist/lazykeys.css'));

execFileSync(process.execPath, [at('node_modules/typescript/bin/tsc'), '-p', at('tsconfig.build.json')], {
  stdio: 'inherit',
});

for (const file of ['lazykeys.js', 'lazykeys.iife.js', 'lazykeys.css']) {
  const size = readFileSync(at(`dist/${file}`)).length;
  console.log(`dist/${file}`.padEnd(24), `${(size / 1024).toFixed(1)} KB`);
}
