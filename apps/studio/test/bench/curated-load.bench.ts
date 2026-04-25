// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-mirror cold/warm load benchmark (T118).
 *
 * Measures end-to-end `loadCuratedModel` time against a mocked R2
 * fixture so we capture the manifest-fetch → archive-fetch → untar →
 * OPFS-write pipeline, but skip the variability of real network and
 * real OPFS. The fixture is the same `tiny.tar.gz` the curated-loader
 * unit tests use; we are NOT trying to bench against a real CDM
 * archive (that would be a deployment-environment test, not a code
 * bench).
 *
 * Acceptance:
 *   - SC-001 (cold load — first time): comfortably under 5s on the
 *     fixture; the DSL->parse path is not part of this measurement.
 *   - SC-002 (warm restore): the second loadCuratedModel call on the
 *     same OPFS root must complete materially faster than the cold
 *     run because the archive bytes hit the loader's cache check
 *     before re-untarring.
 *
 * Run with `pnpm --filter @rune-langium/studio exec vitest bench`.
 */

import { bench, describe, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { loadCuratedModel } from '../../src/services/curated-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/curated/tiny.tar.gz');
const ARCHIVE = new Uint8Array(readFileSync(FIXTURE_PATH));

const MIRROR_BASE = 'https://bench.invalid/curated';
const ARCHIVE_URL = `${MIRROR_BASE}/cdm/latest.tar.gz`;
const MANIFEST_URL = `${MIRROR_BASE}/cdm/manifest.json`;

async function fixtureSha(): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    ARCHIVE.buffer.slice(ARCHIVE.byteOffset, ARCHIVE.byteOffset + ARCHIVE.byteLength) as ArrayBuffer
  );
  let hex = '';
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

const FIXTURE_SHA = await fixtureSha();

const MANIFEST = JSON.stringify({
  schemaVersion: 1,
  modelId: 'cdm',
  version: '2026-04-25',
  sha256: FIXTURE_SHA,
  sizeBytes: ARCHIVE.byteLength,
  generatedAt: '2026-04-25T03:00:00Z',
  upstreamCommit: '',
  upstreamRef: 'master',
  archiveUrl: ARCHIVE_URL,
  history: []
});

function mockFetch(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u === MANIFEST_URL) return new Response(MANIFEST);
    if (u === ARCHIVE_URL) return new Response(ARCHIVE);
    return new Response('nope', { status: 404 });
  });
}

const noopTelemetry = { emit: async () => undefined };

describe('curated-loader cold + warm (T118)', () => {
  bench(
    'cold load (fresh OPFS root)',
    async () => {
      mockFetch();
      const root = createOpfsRoot();
      const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
      await loadCuratedModel({
        modelId: 'cdm',
        mirrorBase: MIRROR_BASE,
        fs,
        writeRoot: '/cdm',
        telemetry: noopTelemetry
      });
    },
    { time: 1500, iterations: 5 }
  );

  bench(
    'warm reload (manifest re-fetch on existing OPFS root)',
    async () => {
      mockFetch();
      const root = createOpfsRoot();
      const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
      await loadCuratedModel({
        modelId: 'cdm',
        mirrorBase: MIRROR_BASE,
        fs,
        writeRoot: '/cdm',
        telemetry: noopTelemetry
      });
      // Second call hits the same write root — exercises the warm path.
      await loadCuratedModel({
        modelId: 'cdm',
        mirrorBase: MIRROR_BASE,
        fs,
        writeRoot: '/cdm',
        telemetry: noopTelemetry
      });
    },
    { time: 1500, iterations: 5 }
  );
});
