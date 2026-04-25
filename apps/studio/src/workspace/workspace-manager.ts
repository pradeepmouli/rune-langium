// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * WorkspaceManager — high-level lifecycle API. Feature 012, T019.
 *
 * Wires three primitives:
 *  - persistence (T015): IndexedDB metadata
 *  - OpfsFs (T011): file content
 *  - WorkspaceOwnership (T017): cross-tab single-writer
 *
 * Out of scope for T019 (handled by later tasks):
 *  - Folder-backed handle binding (T050)
 *  - Git-backed init / pull / push (T056)
 *  - Tab restore + dirty buffers (T046, T048)
 *  - Curated-model loader binding (T031)
 */

import { OpfsFs } from '../opfs/opfs-fs.js';
import {
  saveWorkspace,
  loadWorkspace,
  deleteWorkspace as removeWorkspace,
  listRecents as listRecentsFromDb,
  type WorkspaceRecord,
  type RecentWorkspaceRecord
} from './persistence.js';
import { WorkspaceOwnership } from '../services/multi-tab-broadcast.js';

export interface WorkspaceManagerOptions {
  opfsRoot: FileSystemDirectoryHandle;
  tabId: string;
  studioVersion: string;
}

export interface OpenOptions {
  /** Override the broadcast claim timeout. Default 250ms. */
  claimTimeoutMs?: number;
}

export class WorkspaceManager {
  private readonly fs: OpfsFs;
  private readonly ownership: WorkspaceOwnership;
  /** ws-id → true iff this tab is read-only on it (peer owns). */
  private readonlyState = new Map<string, boolean>();

  constructor(private readonly opts: WorkspaceManagerOptions) {
    this.fs = new OpfsFs(opts.opfsRoot);
    this.ownership = new WorkspaceOwnership(opts.tabId);
  }

  /** Create a fresh browser-only workspace and return its record. */
  async create(name: string): Promise<WorkspaceRecord> {
    const id = generateUlid();
    const now = new Date().toISOString();
    const ws: WorkspaceRecord = {
      id,
      name,
      createdAt: now,
      lastOpenedAt: now,
      kind: 'browser-only',
      layout: { version: 1, writtenBy: this.opts.studioVersion, dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 1
    };
    // Reserve the OPFS dir up-front so writes never trip on a missing root.
    await this.fs.mkdir('/' + id);
    await this.fs.mkdir('/' + id + '/files');
    await this.fs.mkdir('/' + id + '/.studio');

    await saveWorkspace(ws);
    // We claim ownership on create; failure here is benign — it just means
    // a stale ghost claim from a closed tab denied us. We still write the
    // record so the user can retry from their tab.
    await this.ownership.claim(id);
    return ws;
  }

  /**
   * Open an existing workspace. Returns undefined if it doesn't exist.
   * Bumps `lastOpenedAt`. Falls into read-only mode if a peer tab owns it.
   */
  async open(id: string, options: OpenOptions = {}): Promise<WorkspaceRecord | undefined> {
    const ws = await loadWorkspace(id);
    if (!ws) return undefined;

    ws.lastOpenedAt = new Date().toISOString();
    await saveWorkspace(ws);

    const claimed = await this.ownership.claim(id, { timeoutMs: options.claimTimeoutMs });
    this.readonlyState.set(id, !claimed);
    return ws;
  }

  /** Close — flush + release ownership. */
  async close(id: string): Promise<void> {
    this.ownership.release(id);
    this.readonlyState.delete(id);
  }

  /** Delete metadata + OPFS tree. Irreversible. */
  async delete(id: string): Promise<void> {
    this.ownership.release(id);
    this.readonlyState.delete(id);
    await removeWorkspace(id);
    // OPFS removeEntry is on the parent — use the root handle directly.
    try {
      await this.opts.opfsRoot.removeEntry(id, { recursive: true });
    } catch {
      // If the dir doesn't exist, deleting the metadata is enough.
    }
  }

  async listRecents(): Promise<RecentWorkspaceRecord[]> {
    return listRecentsFromDb();
  }

  isOwner(id: string): boolean {
    return this.ownership.isOwner(id);
  }

  isReadOnly(id: string): boolean {
    return this.readonlyState.get(id) ?? false;
  }
}

// ---------- ULID ----------
//
// 26-char Crockford-base32 ULID. We only use it for workspace ids so we
// don't need full monotonicity guarantees — just stable, sortable, URL-safe.
// Implementation crib: https://github.com/ulid/spec

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateUlid(): string {
  const time = Date.now();
  const timePart = encodeBase32(time, 10);
  const randPart = randomBase32(16);
  return timePart + randPart;
}

function encodeBase32(num: number, length: number): string {
  let out = '';
  let n = num;
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[n & 31] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function randomBase32(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CROCKFORD[b & 31];
  return out;
}
