// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T040 / T042 — LightningFS → OPFS cut-clean migration tests.
 *
 * Per FR-017:
 *  - Happy path: legacy `fs` IDB content moves to OPFS under a new
 *    default workspace, AND the legacy IDB is deleted in the same pass.
 *  - Failure path: when the OPFS write half throws, the legacy DB MUST
 *    remain intact and an export blob is produced for the user.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createOpfsRoot, type OpfsRoot } from '../../setup/opfs-mock.js';
import {
  migrateLightningFsToOpfs,
  LEGACY_DB_NAMES
} from '../../../src/workspace/migrations/lightningfs-to-opfs.js';
import { _resetForTests } from '../../../src/workspace/persistence.js';

/**
 * Seed a fake `fs` IDB DB with a few file entries. We model only the bits
 * the migration walks: the `!root` object store keyed by absolute paths
 * with Uint8Array values. (LightningFS@4 has more structure than this; the
 * migration is shaped to walk whatever it finds and not crash on unknowns.)
 */
async function seedLegacyFs(files: Record<string, Uint8Array>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('fs', 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('!root')) db.createObjectStore('!root');
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['!root'], 'readwrite');
      const store = tx.objectStore('!root');
      for (const [path, bytes] of Object.entries(files)) store.put(bytes, path);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}

async function dbExists(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let upgraded = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      upgraded = true;
    };
    req.onsuccess = () => {
      req.result.close();
      if (upgraded) indexedDB.deleteDatabase(name);
      resolve(!upgraded);
    };
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(true);
  });
}

let opfs: OpfsRoot;

beforeEach(async () => {
  await _resetForTests();
  for (const name of [...LEGACY_DB_NAMES, 'rune-studio']) {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
  opfs = createOpfsRoot();
});

describe('migrateLightningFsToOpfs — happy path (T040)', () => {
  it('returns no-op when no legacy DBs exist', async () => {
    const result = await migrateLightningFsToOpfs({
      opfsRoot: opfs as unknown as FileSystemDirectoryHandle,
      studioVersion: '0.1.0'
    });
    expect(result.kind).toBe('no-op');
  });

  it('moves legacy entries into a new default workspace and deletes the legacy DB', async () => {
    await seedLegacyFs({
      '/foo.rosetta': new TextEncoder().encode('namespace foo\n'),
      '/bar/baz.rosetta': new TextEncoder().encode('namespace bar.baz\n')
    });

    const result = await migrateLightningFsToOpfs({
      opfsRoot: opfs as unknown as FileSystemDirectoryHandle,
      studioVersion: '0.1.0'
    });
    expect(result.kind).toBe('migrated');
    if (result.kind !== 'migrated') return;

    expect(result.workspaceId).toBeTruthy();
    expect(result.fileCount).toBe(2);

    // The two files landed under <wsId>/files/...
    const root = opfs as unknown as FileSystemDirectoryHandle;
    const ws = await root.getDirectoryHandle(result.workspaceId);
    const files = await ws.getDirectoryHandle('files');
    const top = await files.getFileHandle('foo.rosetta');
    expect(top).toBeDefined();
    const bar = await files.getDirectoryHandle('bar');
    const baz = await bar.getFileHandle('baz.rosetta');
    expect(baz).toBeDefined();

    // Cut-clean: legacy DB is gone.
    expect(await dbExists('fs')).toBe(false);
  });
});

describe('migrateLightningFsToOpfs — failure path (T042)', () => {
  it('keeps legacy DB intact and surfaces an export blob when OPFS write fails', async () => {
    await seedLegacyFs({ '/x.rosetta': new TextEncoder().encode('x') });

    const sabotaged = {
      async getDirectoryHandle() {
        throw new Error('OPFS sabotage');
      },
      async removeEntry() {},
      entries: async function* () {},
      keys: async function* () {},
      values: async function* () {}
    } as unknown as FileSystemDirectoryHandle;

    const result = await migrateLightningFsToOpfs({
      opfsRoot: sabotaged,
      studioVersion: '0.1.0'
    });
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.exportBlob).toBeInstanceOf(Blob);
      expect(result.exportBlob.size).toBeGreaterThan(0);
      expect(result.reason).toMatch(/OPFS sabotage|sabotage/);
    }

    // CRITICAL: legacy DB MUST still exist after a failed migration.
    expect(await dbExists('fs')).toBe(true);
  });
});
