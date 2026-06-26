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
