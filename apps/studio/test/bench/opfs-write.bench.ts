// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * OPFS write throughput benchmark (T117).
 *
 * Measures the cost of writing a 500-file fixture tree through the
 * `OpfsFs` adapter that backs `isomorphic-git` and the workspace
 * persistence layer. Uses the in-memory `createOpfsRoot()` fake from
 * the test setup (jsdom has no real OPFS), so this bench measures the
 * adapter's per-call overhead, not the browser's storage performance.
 *
 * Acceptance: Principle IV latency budget — a 500-file write tree must
 * complete inside the budget set by SC-002 (≤5s end-to-end restore).
 *
 * Run with `pnpm --filter @rune-langium/studio exec vitest bench`.
 */

import { bench, describe } from 'vitest';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';

const FILE_COUNT = 500;
const FILE_BYTES = 256;

function buildContent(): Uint8Array {
  const buf = new Uint8Array(FILE_BYTES);
  for (let i = 0; i < FILE_BYTES; i++) buf[i] = i & 0xff;
  return buf;
}

function buildFsTreePaths(): string[] {
  // 25 directories × 20 files = 500 leaves
  const out: string[] = [];
  for (let d = 0; d < 25; d++) {
    for (let f = 0; f < 20; f++) {
      out.push(`/group${d}/file${f}.bin`);
    }
  }
  return out;
}

const TREE = buildFsTreePaths();
const CONTENT = buildContent();

describe('OPFS write throughput (T117)', () => {
  bench(
    `writeFile × ${FILE_COUNT} (sequential)`,
    async () => {
      const root = createOpfsRoot();
      const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
      for (const path of TREE) {
        await fs.writeFile(path, CONTENT);
      }
    },
    { time: 1000 }
  );

  bench(
    `writeFile × ${FILE_COUNT} (concurrent)`,
    async () => {
      const root = createOpfsRoot();
      const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
      await Promise.all(TREE.map((path) => fs.writeFile(path, CONTENT)));
    },
    { time: 1000 }
  );

  bench(
    `readFile × ${FILE_COUNT} after a sequential write`,
    async () => {
      const root = createOpfsRoot();
      const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
      for (const path of TREE) {
        await fs.writeFile(path, CONTENT);
      }
      for (const path of TREE) {
        await fs.readFile(path);
      }
    },
    { time: 1000 }
  );
});
