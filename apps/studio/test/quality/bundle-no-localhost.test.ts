// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Bundle hygiene regression — prod build MUST NOT ship `localhost:5173`
 * (or any other dev-server URL) reachable in browser-runtime code paths.
 *
 * Prod-smoke 2026-05-20 (Defect D4) reported the URL bar navigating from
 * `https://www.daikonic.dev/rune-studio/studio/` to `http://localhost:5173/editor`
 * after a Recent Workspaces / Close workspace click. The leak's lineage:
 * `apps/studio/src/config.ts` used `'http://localhost:5173'` as the
 * `typeof window === 'undefined'` fallback for `origin`. Even though the
 * fallback shouldn't fire in a browser, the literal string ended up in
 * the bundle and a tooling path (HMR client probe, devtools "open in editor",
 * Vite's `__BASE__` shim) could route navigation there.
 *
 * This test scans `apps/studio/dist/assets/*.js` after `pnpm --filter
 * @rune-langium/studio build` and fails the moment a dev-server URL slips
 * back in. Localhost URLs in SSR/Node fallback branches use `localhost:8788`
 * (wrangler-dev) which is also forbidden in the browser bundle if any code
 * path can reach it without `typeof window === 'undefined'`.
 *
 * The test is skipped when no built bundle exists (e.g. fresh checkout
 * without `pnpm build`) so it doesn't block local unit-test runs that
 * skip the build step.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '../../dist/assets');

const FORBIDDEN_URL_PATTERNS = [
  // Vite dev-server URL — the literal leak from D4. NEVER ship this in prod.
  'localhost:5173',
  // Older dev port range from earlier studio configs; if any reappears we
  // want to know before deploy.
  'localhost:5174',
  'localhost:5175'
];

function listBundleFiles(): string[] {
  if (!existsSync(DIST_DIR)) return [];
  return readdirSync(DIST_DIR)
    .filter((name) => name.endsWith('.js'))
    .map((name) => resolve(DIST_DIR, name));
}

describe('prod bundle contains no dev-server URLs (D4 / workspace-state-pipeline)', () => {
  const bundleFiles = listBundleFiles();

  it.skipIf(bundleFiles.length === 0)(
    'no JS asset under dist/assets references localhost:5173',
    () => {
      const offenders: Array<{ file: string; pattern: string; context: string }> = [];
      for (const file of bundleFiles) {
        const content = readFileSync(file, 'utf8');
        for (const pattern of FORBIDDEN_URL_PATTERNS) {
          const idx = content.indexOf(pattern);
          if (idx >= 0) {
            const start = Math.max(0, idx - 80);
            const end = Math.min(content.length, idx + pattern.length + 80);
            offenders.push({
              file: file.replace(DIST_DIR, '<dist>/assets'),
              pattern,
              context: content.slice(start, end)
            });
          }
        }
      }
      if (offenders.length > 0) {
        const detail = offenders
          .map((o) => `  ${o.file}: contains "${o.pattern}"\n    near: ${o.context}`)
          .join('\n');
        throw new Error(
          `Forbidden dev-server URL(s) reached the production bundle:\n${detail}\n\n` +
            'These ship to every prod user and can leak into URL bars, source-map link-throughs, ' +
            'or HMR ping probes. Replace any `http://localhost:5173`-style literal with ' +
            '`window.location.origin` (browser branch) or `http://localhost:8788` (wrangler-dev / SSR fallback).'
        );
      }
      expect(offenders).toEqual([]);
    }
  );
});
