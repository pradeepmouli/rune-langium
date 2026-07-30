// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for saveWorkspaceFiles — specifically the git-backed vs browser-only
 * prune behaviour introduced to prevent silent remote data loss (PR #230).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOpfsRoot, type OpfsRoot, writeBytes, readBytes } from '../setup/opfs-mock.js';
import {
  deleteWorkspaceFiles,
  loadWorkspaceFiles,
  saveWorkspaceFiles,
  setWorkspaceFilesDeps
} from '../../src/workspace/workspace-files.js';
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

  it('prunes an editor-tracked .rosetta file no longer in the saved list, while leaving untracked files intact (#439)', async () => {
    const id = 'ws-git-2';

    await writeBytes(opfsRoot, new TextEncoder().encode('# readme'), id, 'files', 'README.md');
    await writeBytes(opfsRoot, new TextEncoder().encode('namespace a'), id, 'files', 'a.rosetta');
    await writeBytes(opfsRoot, new TextEncoder().encode('namespace b'), id, 'files', 'b.rosetta');

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'git-backed' })
    });

    // Establish the pruning baseline the way a real workspace-open flow
    // does — the editor must have actually known about b.rosetta for its
    // later absence to read as a deletion rather than "never tracked".
    await loadWorkspaceFiles(id);

    // The editor no longer lists b.rosetta — simulates the delete-file
    // action's onFilesChange(remaining) call.
    await saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a')]);

    // b.rosetta must actually be gone, not just absent from editor state —
    // otherwise the next loadWorkspaceFiles scan resurrects it.
    expect(await fileExists(opfsRoot, id, 'files', 'b.rosetta')).toBe(false);
    // The still-listed file and the untracked README are both unaffected.
    expect(await fileExists(opfsRoot, id, 'files', 'a.rosetta')).toBe(true);
    expect(await fileExists(opfsRoot, id, 'files', 'README.md')).toBe(true);
  });

  it('propagates a rename as a delete-of-old-path plus write-of-new-path (#439)', async () => {
    const id = 'ws-git-3';

    await writeBytes(opfsRoot, new TextEncoder().encode('namespace a'), id, 'files', 'old-name.rosetta');

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'git-backed' })
    });

    await loadWorkspaceFiles(id);

    // The editor now lists the renamed path instead of the old one — no
    // dedicated rename API exists, so this is exactly what a rename-via-
    // delete-and-recreate looks like from saveWorkspaceFilesNow's view.
    await saveWorkspaceFiles(id, [makeFile('new-name.rosetta', 'namespace a')]);

    expect(await fileExists(opfsRoot, id, 'files', 'old-name.rosetta')).toBe(false);
    expect(await fileExists(opfsRoot, id, 'files', 'new-name.rosetta')).toBe(true);
  });

  it('does not delete a file written by a background git sync that the editor never learned about (#439 round 2)', async () => {
    const id = 'ws-git-4';

    await writeBytes(opfsRoot, new TextEncoder().encode('namespace a'), id, 'files', 'a.rosetta');

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'git-backed' })
    });

    // Establish the baseline the way a real workspace-open flow does.
    await loadWorkspaceFiles(id);

    // A background git-sync fast-forward/merge writes a collaborator's new
    // file directly into OPFS, independent of any save call. The sync
    // engine's status subscription never refreshes the editor's `files`
    // state, so the editor genuinely has no idea this file exists.
    await writeBytes(opfsRoot, new TextEncoder().encode('namespace b'), id, 'files', 'new-from-sync.rosetta');

    // The editor makes a routine, unrelated edit and saves — it still only
    // lists a.rosetta. This must NOT be read as "the user deleted
    // new-from-sync.rosetta": that path was never in the editor's own
    // tracked-paths snapshot, so it's not a pruning candidate at all.
    await saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a\ntype X:')]);

    expect(await fileExists(opfsRoot, id, 'files', 'new-from-sync.rosetta')).toBe(true);
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

describe('deleteWorkspaceFiles — serializes with the save queue (#416 follow-up)', () => {
  it('does not resurrect the workspace directory when delete races an in-flight save', async () => {
    const id = 'ws-delete-race-1';

    // Delay loadWorkspaceFn (the first await inside saveWorkspaceFilesNow)
    // so the save is genuinely still in flight — with real OPFS mutations
    // not yet run — when deleteWorkspaceFiles is called.
    let loadCalls = 0;
    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => {
        loadCalls += 1;
        if (loadCalls === 1) {
          await new Promise((r) => setTimeout(r, 5));
        }
        return { kind: 'browser-only' };
      }
    });

    const savePromise = saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a')]);
    const deletePromise = deleteWorkspaceFiles(id);

    await expect(savePromise).resolves.toBeUndefined();
    await expect(deletePromise).resolves.toBeUndefined();

    // The delete must run AFTER the in-flight save's writes land, and the
    // directory must end up gone — not resurrected by the save's
    // getDirectoryHandle(..., { create: true }) calls running after removeEntry.
    await expect(opfsRoot.getDirectoryHandle(id)).rejects.toThrow();
  });

  it('cancels a still-queued (not yet started) save instead of letting it recreate a deleted workspace', async () => {
    const id = 'ws-delete-race-2';

    let loadCalls = 0;
    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => {
        loadCalls += 1;
        if (loadCalls === 1) {
          await new Promise((r) => setTimeout(r, 5));
        }
        return { kind: 'browser-only' };
      }
    });

    // First save starts (goes in-flight, gated by the delay above); second
    // save queues behind it as `pending`.
    const firstSave = saveWorkspaceFiles(id, [makeFile('a.rosetta', 'content-A')]);
    const secondSave = saveWorkspaceFiles(id, [makeFile('b.rosetta', 'content-B')]);
    // Attach the rejection assertion immediately — deleteWorkspaceFiles
    // rejects secondSave synchronously below, and Node flags a promise as
    // unhandled if nothing observes it within the same microtask turn.
    const secondSaveRejects = expect(secondSave).rejects.toThrow(/deleted/);

    const deletePromise = deleteWorkspaceFiles(id);

    await expect(firstSave).resolves.toBeUndefined();
    await secondSaveRejects;
    await expect(deletePromise).resolves.toBeUndefined();

    // The cancelled second save's file must never have been written, and
    // the directory must end up fully removed.
    await expect(opfsRoot.getDirectoryHandle(id)).rejects.toThrow();
  });

  it('ignores a save requested for a workspace that was already deleted', async () => {
    const id = 'ws-delete-race-3';

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'browser-only' })
    });

    await saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a')]);
    await deleteWorkspaceFiles(id);

    // A stale debounced autosave firing after the delete must not
    // resurrect the directory.
    await expect(saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a')])).resolves.toBeUndefined();
    await expect(opfsRoot.getDirectoryHandle(id)).rejects.toThrow();
  });

  it('clears the deletion tombstone when the delete itself fails, so the still-active workspace can keep saving', async () => {
    const id = 'ws-delete-race-4';

    setWorkspaceFilesDeps({
      getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle,
      loadWorkspaceFn: async (_workspaceId: string) => ({ kind: 'browser-only' })
    });

    await saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a')]);

    // Simulate a real (non-NotFoundError) OPFS failure during delete, e.g.
    // a permission or quota error — deletion doesn't actually happen.
    const injectedError = new Error('simulated OPFS permission failure');
    const originalRemoveEntry = opfsRoot.removeEntry.bind(opfsRoot);
    opfsRoot.removeEntry = async (name: string, opts?: { recursive?: boolean }) => {
      if (name === id) {
        throw injectedError;
      }
      return originalRemoveEntry(name, opts);
    };

    await expect(deleteWorkspaceFiles(id)).rejects.toBe(injectedError);
    opfsRoot.removeEntry = originalRemoveEntry;

    // The caller (handleDeleteWorkspace) surfaces this error and leaves the
    // workspace active — a subsequent save must actually persist, not
    // silently no-op because the tombstone was never cleared.
    await expect(saveWorkspaceFiles(id, [makeFile('a.rosetta', 'namespace a\ntype X:')])).resolves.toBeUndefined();
    const content = new TextDecoder().decode(await readBytes(opfsRoot, id, 'files', 'a.rosetta'));
    expect(content).toBe('namespace a\ntype X:');
  });
});
