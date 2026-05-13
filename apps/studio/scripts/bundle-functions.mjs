#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
//
// Pre-bundle CF Pages Functions to self-contained JS so CF Pages git-integration
// can deploy them without needing to resolve npm deps at deploy time.
//
// Why: CF Pages git-integration scans `<Root Directory>/functions/` at the
// repo root and tries to bundle the .ts files with its own esbuild. With pnpm
// workspaces, the function deps (langium, zod, pako, pino, @rune-langium/core)
// live in `apps/studio/node_modules/`, not at the repo root — so CF's bundler
// can't resolve them and fails with "Could not resolve 'langium'", etc.
//
// This script runs from `apps/studio/` where node_modules is intact, bundles
// each route entry with all imports inlined, and writes pre-bundled .js files
// to the output directory. CF Pages then deploys those without re-bundling.
//
// Usage:
//   node scripts/bundle-functions.mjs <output-dir>
//
// Example:
//   node scripts/bundle-functions.mjs ../../functions

import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const FUNCTIONS_SRC = 'functions';
const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: bundle-functions.mjs <output-dir>');
  process.exit(2);
}

// Route entries are .ts files in functions/ NOT under test/ or lib/.
// lib/ files get included transitively via bundling.
function findRouteEntries(dir, entries = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === 'test' || name === 'lib') continue;
      findRouteEntries(full, entries);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.test.ts')) {
      entries.push(full);
    }
  }
  return entries;
}

const entries = findRouteEntries(FUNCTIONS_SRC);
console.log(`[bundle-functions] found ${entries.length} route entries`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const rel = relative(FUNCTIONS_SRC, entry).replace(/\.ts$/, '.js');
  const outfile = join(outDir, rel);
  mkdirSync(dirname(outfile), { recursive: true });

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'neutral',
    // CF Pages Functions run in the Workers runtime — ES2022 + ESM.
    target: 'es2022',
    format: 'esm',
    outfile,
    external: [
      // Workers runtime built-ins; CF supplies these at runtime.
      'cloudflare:*',
      '__STATIC_CONTENT_MANIFEST',
      // Node built-ins — CF Pages `nodejs_compat` polyfills these. The
      // langium / pino / vscode-uri transitive imports use both the
      // `node:` prefix and the legacy bare names, so externalize both.
      'node:*',
      'fs',
      'path',
      'url',
      'util',
      'crypto',
      'os',
      'child_process',
      'net',
      'http',
      'https',
      'stream',
      'events',
      'buffer',
      'module',
      'worker_threads',
      'tty',
      'tls',
      'zlib',
      'assert',
      'querystring'
    ],
    // Prefer workerd condition, then worker, then default.
    conditions: ['workerd', 'worker'],
    mainFields: ['module', 'main'],
    // Keep names readable so error messages from production point at our
    // source rather than mangled identifiers.
    minifySyntax: false,
    minifyIdentifiers: false,
    minifyWhitespace: true,
    // Inline maps would bloat the deploy. CF Pages doesn't surface them.
    sourcemap: false,
    // `tsconfig` lookup defaults to nearest tsconfig.json from the source
    // file — the apps/studio/functions/tsconfig.json handles this.
    tsconfig: 'functions/tsconfig.json',
    logLevel: 'warning'
  });
  console.log(`[bundle-functions] bundled: ${entry} → ${outfile}`);
}

console.log(`[bundle-functions] done. ${entries.length} routes → ${outDir}`);
