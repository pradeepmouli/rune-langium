#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Studio JS bundle size regression guard (019 Phase 2, Task 2.5).
 *
 * Walks `apps/studio/dist/assets/` and sums all `.js` / `.mjs` byte sizes.
 * Fails non-zero if the total exceeds `STUDIO_MAX_BUNDLE_BYTES`.
 *
 * Baseline (captured after 019 Phase 2 LSP-retirement on 2026-05-12):
 *   6,279,619 bytes — see commit removing apps/studio/src/workers/lsp-worker.ts.
 *
 * Default gate: 6,593,600 bytes (~5% headroom above baseline). Set the
 * `STUDIO_MAX_BUNDLE_BYTES` env var in CI to override, e.g. after an
 * intentional dependency bump.
 */

import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIST = fileURLToPath(new URL('../dist/assets', import.meta.url));
const DEFAULT_MAX_BYTES = 6_593_600;
// GitHub Actions expands `${{ vars.X }}` to an empty string when the variable
// is unset, not undefined — so `??` doesn't fall through. Treat empty/whitespace
// the same as unset so CI uses the default ceiling without manual configuration.
const rawLimit = process.env.STUDIO_MAX_BUNDLE_BYTES;
const limitOverride = rawLimit && rawLimit.trim().length > 0 ? Number(rawLimit) : undefined;
const MAX_BYTES = limitOverride ?? DEFAULT_MAX_BYTES;

if (!Number.isFinite(MAX_BYTES) || MAX_BYTES <= 0) {
  console.error(`STUDIO_MAX_BUNDLE_BYTES must be a positive integer, got: ${rawLimit}`);
  process.exit(2);
}

async function dirTotal(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`Bundle directory not found: ${dir}`);
      console.error('Run "pnpm --filter @rune-langium/studio build" first.');
      process.exit(2);
    }
    throw err;
  }
  let total = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirTotal(path);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      total += (await stat(path)).size;
    }
  }
  return total;
}

const total = await dirTotal(DIST);
const formatted = total.toLocaleString();
const limit = MAX_BYTES.toLocaleString();
console.log(`Studio JS bundle total: ${formatted} bytes (limit ${limit})`);

if (total > MAX_BYTES) {
  console.error(`Bundle exceeds limit by ${(total - MAX_BYTES).toLocaleString()} bytes.`);
  console.error('Either reduce the bundle or bump STUDIO_MAX_BUNDLE_BYTES intentionally (with a CHANGELOG entry).');
  process.exit(1);
}
