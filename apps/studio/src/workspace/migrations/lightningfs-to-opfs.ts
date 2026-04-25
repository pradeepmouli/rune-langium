// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * One-shot, cut-clean migration from the legacy LightningFS-backed
 * IndexedDB stores to OPFS. Per FR-017:
 *
 *  - On success: legacy file content is copied into a fresh "Migrated
 *    workspace" under OPFS and the legacy IDB DBs are deleted in the same
 *    pass. `@isomorphic-git/lightning-fs` is removed from the runtime
 *    dependency in the same release.
 *  - On failure: legacy DBs are kept and an "export legacy data" Blob is
 *    produced (a JSON dump of every key + base64 bytes). The user can
 *    save the blob and rerun migration in a fresh tab.
 *
 * The walk is intentionally lenient: LightningFS's exact internal shape
 * is not part of this contract. Anything not parseable as `(path, bytes)`
 * is recorded in the export bundle and skipped from the OPFS write.
 */

import { OpfsFs } from '../../opfs/opfs-fs.js';
import { saveSetting, saveWorkspace, type WorkspaceRecord } from '../persistence.js';

export const LEGACY_DB_NAMES = ['fs', 'lightning-fs-cache'] as const;
const LEGACY_STORE_NAMES = ['!root', 'files'];

export type MigrationResult =
  | { kind: 'no-op' }
  | { kind: 'migrated'; workspaceId: string; fileCount: number }
  | { kind: 'failed'; reason: string; exportBlob: Blob };

export interface MigrationInput {
  opfsRoot: FileSystemDirectoryHandle;
  studioVersion: string;
}

interface LegacyEntry {
  path: string;
  bytes: Uint8Array | null;
  raw: unknown;
}

export async function migrateLightningFsToOpfs(input: MigrationInput): Promise<MigrationResult> {
  const collected: LegacyEntry[] = [];
  let foundAny = false;

  for (const dbName of LEGACY_DB_NAMES) {
    const present = await openExistingDb(dbName);
    if (!present) continue;
    foundAny = true;
    try {
      const entries = await readAllEntries(present);
      collected.push(...entries);
    } finally {
      present.close();
    }
  }

  if (!foundAny) return { kind: 'no-op' };

  // Pre-build a JSON export bundle. We always have it ready in case the
  // OPFS half fails — the user is never left without a recovery path.
  const exportBlob = buildExportBlob(collected);

  // Try to write everything into OPFS. If anything throws, the legacy DBs
  // remain intact and we surface the export.
  const id = generateUlid();
  const fs = new OpfsFs(input.opfsRoot);
  try {
    await fs.mkdir(`/${id}`);
    await fs.mkdir(`/${id}/files`);
    await fs.mkdir(`/${id}/.studio`);
    let fileCount = 0;
    for (const e of collected) {
      if (!e.bytes) continue;
      const safe = e.path.replace(/^\/+/, '');
      if (!safe) continue;
      await fs.writeFile(`/${id}/files/${safe}`, e.bytes);
      fileCount++;
    }

    // Persist the workspace record + bump the migration sentinel BEFORE
    // we drop the legacy DBs so a crash mid-migration is recoverable from
    // the persisted state alone.
    const now = new Date().toISOString();
    const ws: WorkspaceRecord = {
      id,
      name: 'Migrated workspace',
      createdAt: now,
      lastOpenedAt: now,
      kind: 'browser-only',
      layout: { version: 1, writtenBy: input.studioVersion, dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 1
    };
    await saveWorkspace(ws);
    await saveSetting('design-system-version', input.studioVersion);

    // Cut-clean: drop the legacy DBs in the same pass.
    for (const dbName of LEGACY_DB_NAMES) {
      await deleteDb(dbName);
    }
    return { kind: 'migrated', workspaceId: id, fileCount };
  } catch (err) {
    return {
      kind: 'failed',
      reason: err instanceof Error ? err.message : String(err),
      exportBlob
    };
  }
}

// ---------- IndexedDB walk helpers ----------

function openExistingDb(name: string): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      // We weren't supposed to create it — abort the upgrade transaction
      // so onsuccess sees an empty store list and we treat it as absent.
      req.transaction?.abort();
    };
    req.onsuccess = () => {
      const db = req.result;
      // Heuristic: if the DB has no object stores, it didn't really exist.
      // (`open(name)` without a version creates a v1 DB on first call.)
      if (db.objectStoreNames.length === 0) {
        db.close();
        indexedDB.deleteDatabase(name);
        resolve(null);
        return;
      }
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function readAllEntries(db: IDBDatabase): Promise<LegacyEntry[]> {
  const out: LegacyEntry[] = [];
  // We don't know the legacy store name a priori — LightningFS@4 uses
  // `!root` but variations may exist. Walk every object store the DB
  // actually has rather than guessing.
  const names = Array.from(db.objectStoreNames);
  for (const storeName of names) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const path = String(cursor.key);
        const value = cursor.value;
        out.push({
          path,
          bytes: coerceBytes(value),
          raw: value
        });
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  return out;
}

function coerceBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  // Node Buffer — IndexedDB shims sometimes preserve Buffer through clone.
  if (typeof value === 'object' && value !== null && 'byteLength' in value && 'buffer' in value) {
    const v = value as { buffer: ArrayBufferLike; byteOffset?: number; byteLength: number };
    return new Uint8Array(v.buffer, v.byteOffset ?? 0, v.byteLength);
  }
  // Plain numeric array shape (rare; some shims store `Array<number>`).
  if (Array.isArray(value) && value.every((b) => typeof b === 'number')) {
    return new Uint8Array(value as number[]);
  }
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return null;
}

function deleteDb(name: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function buildExportBlob(entries: LegacyEntry[]): Blob {
  const dump = entries.map((e) => ({
    path: e.path,
    bytes: e.bytes ? Array.from(e.bytes.subarray(0, Math.min(e.bytes.length, 1024 * 1024))) : null,
    note: e.bytes ? undefined : `non-binary value (${typeof e.raw})`
  }));
  return new Blob([JSON.stringify({ schemaVersion: 1, entries: dump }, null, 2)], {
    type: 'application/json'
  });
}

// ---------- ULID (duplicated from workspace-manager to avoid a circular import) ----------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateUlid(): string {
  let time = Date.now();
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = CROCKFORD[time & 31] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let randPart = '';
  for (const b of bytes) randPart += CROCKFORD[b & 31];
  return timePart + randPart;
}
