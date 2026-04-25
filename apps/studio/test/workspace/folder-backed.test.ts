// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T049 — folder-backed workspace tests.
 * Uses the OPFS test double (which models the FSA `FileSystemDirectoryHandle`
 * API the FSA flow consumes) as the stand-in for a user-picked folder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createOpfsRoot, type OpfsRoot, writeBytes } from '../setup/opfs-mock.js';
import {
  bindFolderToWorkspace,
  readFolderFile,
  writeFolderFile,
  listFolderFiles,
  isFolderReadOnly
} from '../../src/workspace/folder-backing.js';
import { _resetForTests, loadFolderHandle } from '../../src/workspace/persistence.js';

beforeEach(async () => {
  await _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('rune-studio');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('folder-backed workspace (T049)', () => {
  it('binding stores the FSA handle in the `handles` IDB store', async () => {
    const folder = createOpfsRoot();
    const id = 'ws-fb-1';
    await bindFolderToWorkspace(id, folder as unknown as FileSystemDirectoryHandle);
    const stored = await loadFolderHandle(id);
    expect(stored?.id).toBe(id);
    expect(stored?.lastPermission).toBe('granted');
  });

  it('writes round-trip to the bound folder', async () => {
    const folder = createOpfsRoot();
    const id = 'ws-fb-2';
    await bindFolderToWorkspace(id, folder as unknown as FileSystemDirectoryHandle);
    await writeFolderFile(folder as unknown as FileSystemDirectoryHandle, 'a/b.rosetta', 'hello');
    const back = await readFolderFile(
      folder as unknown as FileSystemDirectoryHandle,
      'a/b.rosetta'
    );
    expect(back).toBe('hello');
  });

  it('lists every file recursively under the bound folder', async () => {
    const folder: OpfsRoot = createOpfsRoot();
    await writeBytes(folder, new TextEncoder().encode('x'), 'top.rosetta');
    await writeBytes(folder, new TextEncoder().encode('y'), 'nested', 'inner.rosetta');
    const all = await listFolderFiles(folder as unknown as FileSystemDirectoryHandle);
    expect(all.sort()).toEqual(['nested/inner.rosetta', 'top.rosetta']);
  });

  it('isFolderReadOnly reflects revoked permission state', async () => {
    const folder = createOpfsRoot();
    const id = 'ws-fb-3';
    await bindFolderToWorkspace(id, folder as unknown as FileSystemDirectoryHandle);
    expect(await isFolderReadOnly(id)).toBe(false);
    // Manually mark permission as denied via the persistence store.
    const stored = await loadFolderHandle(id);
    if (stored) {
      stored.lastPermission = 'denied';
      const { saveFolderHandle } = await import('../../src/workspace/persistence.js');
      await saveFolderHandle(stored);
    }
    expect(await isFolderReadOnly(id)).toBe(true);
  });
});
