// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for saveWorkspaceFiles — specifically the git-backed vs browser-only
 * prune behaviour introduced to prevent silent remote data loss (PR #230).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOpfsRoot, type OpfsRoot, writeBytes, readBytes } from '../setup/opfs-mock.js';
import { saveWorkspaceFiles, setWorkspaceFilesDeps } from '../../src/workspace/workspace-files.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

// Stub notifySyncOnSave so the test doesn't reach the real git-sync service.
vi.mock('../../src/services/git-sync.js', () => ({
  notifySyncOnSave: vi.fn()
}));

function makeFile(path: string, content: string): WorkspaceFile {
  return { name: path.split('/').pop()!, path, content, dirty: false };
}

let opfsRoot: OpfsRoot;

beforeEach(() => {
  opfsRoot = createOpfsRoot();
});

async function fileExists(root: OpfsRoot, ...path: string[]): Promise<boolean> {
  try {
    await readBytes(root, ...path);
    return true;
  } catch {
    return false;
  }
}

describe('saveWorkspaceFiles — git-backed: preserve untracked tree', () => {
  it('leaves README.md (untracked repo file) intact after save', async () => {
    const id = 'ws-git-1';

    // Pre-create the workspace/files tree with an untracked README and a
    // .rosetta file, simulating what a git clone would leave on disk.
    await writeBytes(opfsRoot, new TextEncoder().encode('# readme'), id, 'files', 'README.md');
    await writeBytes(opfsRoot, new TextEncoder().encode('namespace a'), id, 'files', 'a.rosetta');

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'git-backed' })
    });

    // Editor only knows about a.rosetta — README is untracked by the editor.
    await saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a\ntype X:')]);

    // The untracked README must still be present — the prune was skipped.
    expect(await fileExists(opfsRoot, id, 'files', 'README.md')).toBe(true);

    // The editor-tracked file should have been written (updated content).
    const content = new TextDecoder().decode(await readBytes(opfsRoot, id, 'files', 'a.rosetta'));
    expect(content).toBe('namespace a\ntype X:');
  });
});

describe('saveWorkspaceFiles — browser-only: prune preserves existing behaviour', () => {
  it('removes files not in the saved list (prune happens)', async () => {
    const id = 'ws-browser-1';

    // Pre-create an extra file that the editor will no longer track.
    await writeBytes(opfsRoot, new TextEncoder().encode('old'), id, 'files', 'old.rosetta');

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'browser-only' })
    });

    // Save only new.rosetta — old.rosetta should be pruned.
    await saveWorkspaceFiles(id, [makeFile('new.rosetta', 'namespace b')]);

    // old.rosetta must have been removed by the prune.
    expect(await fileExists(opfsRoot, id, 'files', 'old.rosetta')).toBe(false);

    // new.rosetta must exist.
    expect(await fileExists(opfsRoot, id, 'files', 'new.rosetta')).toBe(true);
  });
});

describe('saveWorkspaceFiles — concurrent calls for the same workspace (#395)', () => {
  it('never runs two removeEntry("files") mutations concurrently, and the latest snapshot wins', async () => {
    const id = 'ws-race-1';

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'browser-only' })
    });

    // Pre-create the workspace + an existing tracked file so the FIRST
    // save's removeEntry('files', {recursive:true}) does real work (not a
    // NotFoundError no-op), giving a genuine interleaving opportunity.
    await writeBytes(opfsRoot, new TextEncoder().encode('old'), id, 'files', 'a.rosetta');
    const wsDir = await opfsRoot.getDirectoryHandle(id, { create: true });

    // Instrument removeEntry to detect re-entrancy and inject a delay, so
    // a broken (unserialized) implementation would have a real window to
    // race two overlapping calls.
    let active = 0;
    let maxActive = 0;
    const originalRemoveEntry = wsDir.removeEntry.bind(wsDir);
    wsDir.removeEntry = async (name: string, opts?: { recursive?: boolean }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      try {
        return await originalRemoveEntry(name, opts);
      } finally {
        active -= 1;
      }
    };

    // Fire two saves back-to-back, without awaiting the first — mirrors
    // App.tsx's handleFilesChange firing a fresh save per keystroke.
    const p1 = saveWorkspaceFiles(id, [makeFile('a.rosetta', 'content-A')]);
    const p2 = saveWorkspaceFiles(id, [makeFile('a.rosetta', 'content-B')]);

    await expect(Promise.all([p1, p2])).resolves.toBeDefined();

    expect(maxActive, 'removeEntry("files") must never run concurrently').toBe(1);

    // The later call's snapshot is the one that ends up persisted.
    const content = new TextDecoder().decode(await readBytes(opfsRoot, id, 'files', 'a.rosetta'));
    expect(content).toBe('content-B');
  });

  it('rejects a queued save (rather than hanging forever) when the in-flight write fails, and recovers on the next call', async () => {
    const id = 'ws-race-2';

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'browser-only' })
    });

    await writeBytes(opfsRoot, new TextEncoder().encode('old'), id, 'files', 'a.rosetta');
    const wsDir = await opfsRoot.getDirectoryHandle(id, { create: true });

    // Fail only the FIRST removeEntry call (the in-flight save), so the
    // queued second save never gets its own turn to run — it should be
    // rejected outright rather than left to hang, and a later, independent
    // third call should succeed normally (proving the queue entry for this
    // workspace was torn down, not left stuck mid-flight).
    const originalRemoveEntry = wsDir.removeEntry.bind(wsDir);
    let call = 0;
    const injectedError = new Error('simulated OPFS write failure');
    wsDir.removeEntry = async (name: string, opts?: { recursive?: boolean }) => {
      call += 1;
      if (call === 1) {
        await new Promise((r) => setTimeout(r, 5));
        throw injectedError;
      }
      return originalRemoveEntry(name, opts);
    };

    const p1 = saveWorkspaceFiles(id, [makeFile('a.rosetta', 'content-A')]);
    const p2 = saveWorkspaceFiles(id, [makeFile('a.rosetta', 'content-B')]);

    await expect(p1).rejects.toBe(injectedError);
    await expect(p2).rejects.toBe(injectedError);

    // A subsequent, independent save must succeed — the queue must not be
    // left permanently broken by the earlier failure.
    await expect(saveWorkspaceFiles(id, [makeFile('a.rosetta', 'content-C')])).resolves.toBeUndefined();
    const content = new TextDecoder().decode(await readBytes(opfsRoot, id, 'files', 'a.rosetta'));
    expect(content).toBe('content-C');
  });
});
