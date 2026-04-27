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
  VITE_GITHUB_URL: 'https://github.com/pradeepmouli/rune-langium',
  // Hosted codegen service (feature 011-export-code-cf). Base URL is
  // same-origin so the browser never makes cross-origin calls during
  // Export Code. The Turnstile site key can be provided via env at build
  // time; falls back to Turnstile's documented "always-pass" dummy key
  // so preview builds never break for lack of a real key. Production
  // deploys MUST set TURNSTILE_SITE_KEY in the CF Pages build env.
  VITE_CODEGEN_URL: process.env.VITE_CODEGEN_URL ?? '/rune-studio',
  VITE_TURNSTILE_SITE_KEY:
    process.env.VITE_TURNSTILE_SITE_KEY ??
    process.env.TURNSTILE_SITE_KEY ??
    '1x00000000000000000000AA'
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
  // Ensure only the parent of `to` exists; cpSync creates `to` itself and
  // copies `from`'s contents into it. Pre-creating `to` can cause some Node
  // versions to nest the source under `to/<basename(from)>`.
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[build-combined] copied ${label}: ${from} → ${to}`);
}

rmSync(combinedDist, { recursive: true, force: true });
rmSync(docsRawDist, { recursive: true, force: true });

run('Generating typedoc API markdown', 'pnpm run docs:api', docsRoot);
run(
  'Building VitePress docs (base=/rune-studio/docs/)',
  'pnpm exec vitepress build --outDir ./.vitepress/dist-docs-raw',
  docsRoot
);

run(
  'Building Rune Studio (base=/rune-studio/studio/)',
  'pnpm --filter @rune-langium/studio build',
  repoRoot
);

// `copyDir` creates `subpathDist` itself (so its contents are not nested).
copyDir(siteRoot, subpathDist, 'site → /rune-studio/');
copyDir(docsRawDist, join(subpathDist, 'docs'), 'vitepress → /rune-studio/docs/');
copyDir(studioDist, join(subpathDist, 'studio'), 'studio → /rune-studio/studio/');

writeFileSync(
  join(combinedDist, '_redirects'),
  '/rune-studio/studio/* /rune-studio/studio/index.html 200\n'
);
console.log('[build-combined] Wrote _redirects with SPA fallback for /rune-studio/studio/*');

rmSync(docsRawDist, { recursive: true, force: true });

console.log('\n[build-combined] Done. CF Pages output dir: apps/docs/.vitepress/dist');
