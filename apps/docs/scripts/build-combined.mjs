#!/usr/bin/env node
/**
 * Combined build for Cloudflare Pages — produces a single tree at
 * `apps/docs/.vitepress/dist/` containing:
 *
 *   _redirects                    → SPA fallback for /rune-studio/studio/*
 *   rune-studio/                  → public subpath (www.daikonic.dev/rune-studio/)
 *     ├── <site/*>                → static landing page from `site/`
 *     ├── docs/                   → VitePress docs (base='/rune-studio/docs/')
 *     └── studio/                 → Rune Studio SPA (base='/rune-studio/studio/')
 *
 * Both sub-builds run with CF_PAGES=1 so their configs pick the right base.
 * CF Pages' git integration points at `apps/docs/.vitepress/dist/` as the
 * output directory; no GitHub Actions workflow is required.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(__dirname, '..');
const repoRoot = resolve(docsRoot, '..', '..');

const siteRoot = join(repoRoot, 'site');
const studioDist = join(repoRoot, 'apps', 'studio', 'dist');
const docsRawDist = join(docsRoot, '.vitepress', 'dist-docs-raw');
const combinedDist = join(docsRoot, '.vitepress', 'dist');
const subpathDist = join(combinedDist, 'rune-studio');

const env = {
  ...process.env,
  CF_PAGES: '1',
  // Studio nav links — baked in so they resolve under /rune-studio/ at runtime
  // regardless of window.location.origin.
  VITE_HOME_URL: '/rune-studio/',
  VITE_DOCS_URL: '/rune-studio/docs/',
  VITE_GITHUB_URL: 'https://github.com/pradeepmouli/rune-langium'
};

function run(label, command, cwd) {
  console.log(`\n[build-combined] ${label}`);
  console.log(`[build-combined] $ ${command}  (cwd: ${cwd})`);
  execSync(command, { cwd, env, stdio: 'inherit' });
}

function copyDir(from, to, label) {
  if (!existsSync(from)) {
    throw new Error(`[build-combined] missing source: ${from}`);
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[build-combined] copied ${label}: ${from} → ${to}`);
}

rmSync(combinedDist, { recursive: true, force: true });
rmSync(docsRawDist, { recursive: true, force: true });

run('Generating typedoc API markdown', 'pnpm run docs:api', docsRoot);
run(
  'Building VitePress docs (base=/rune-studio/docs/)',
  'npx vitepress build --outDir ./.vitepress/dist-docs-raw',
  docsRoot
);

run(
  'Building Rune Studio (base=/rune-studio/studio/)',
  'pnpm --filter @rune-langium/studio build',
  repoRoot
);

mkdirSync(subpathDist, { recursive: true });
copyDir(siteRoot, subpathDist, 'site → /rune-studio/');
copyDir(docsRawDist, join(subpathDist, 'docs'), 'vitepress → /rune-studio/docs/');
copyDir(studioDist, join(subpathDist, 'studio'), 'studio → /rune-studio/studio/');

writeFileSync(
  join(combinedDist, '_redirects'),
  '/rune-studio/studio/* /rune-studio/studio/index.html 200\n'
);
console.log(
  '[build-combined] Wrote _redirects with SPA fallback for /rune-studio/studio/*'
);

rmSync(docsRawDist, { recursive: true, force: true });

console.log('\n[build-combined] Done. CF Pages output dir: apps/docs/.vitepress/dist');
