// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { OpfsFs } from '../opfs/opfs-fs.js';
import type { WorkspaceFile } from '../services/workspace.js';
import { notifySyncOnSave } from '../services/git-sync.js';
import { loadWorkspace } from './persistence.js';

interface WorkspaceFilesDeps {
  getOpfsRoot: () => Promise<FileSystemDirectoryHandle>;
  loadWorkspaceFn: (id: string) => Promise<{ kind: string } | undefined>;
}

let deps: WorkspaceFilesDeps = {
  async getOpfsRoot() {
    if (!navigator.storage?.getDirectory) {
      throw new Error('Origin Private File System is not available in this browser');
    }
    return navigator.storage.getDirectory();
  },
  loadWorkspaceFn: loadWorkspace
};

export function setWorkspaceFilesDeps(next: Partial<WorkspaceFilesDeps>): void {
  deps = { ...deps, ...next };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotFoundError';
}

function toStoredWorkspaceFiles(files: readonly WorkspaceFile[]): WorkspaceFile[] {
  return files.filter((file) => !file.readOnly);
}

// ────────────────────────────────────────────────────────────────────────
// Per-workspace save serialization (issue #395)
//
// The non-git-backed path below does an unconditional removeEntry('files',
// { recursive: true }) followed by recreating the directory and rewriting
// every file. Callers (e.g. App.tsx's handleFilesChange, fired on every
// Source-editor keystroke with no upstream debounce) can and do call this
// concurrently for the SAME workspace — a later call's removeEntry then
// races an earlier call's still-open file writes, and OPFS throws
// NoModificationAllowedError. Serialize + coalesce per workspaceId here so
// EVERY caller is safe by construction, not just the one that triggered
// this bug: at most one save actually runs OPFS mutations at a time, and
// any saves requested while one is in flight collapse into a single
// trailing save of the latest snapshot (a typing burst becomes "the save
// already running" + "one save with the final content", not N racing
// saves that mostly fail and mostly never persist).
interface SaveQueueEntry {
  inFlight: boolean;
  /** Most recently requested, not-yet-started snapshot (if any). */
  pending: {
    files: readonly WorkspaceFile[];
    waiters: Array<{ resolve: () => void; reject: (err: unknown) => void }>;
  } | null;
}

const saveQueues = new Map<string, SaveQueueEntry>();

export function saveWorkspaceFiles(workspaceId: string, files: readonly WorkspaceFile[]): Promise<void> {
  const queue = saveQueues.get(workspaceId) ?? { inFlight: false, pending: null };
  saveQueues.set(workspaceId, queue);

  if (queue.inFlight) {
    return new Promise<void>((resolve, reject) => {
      if (queue.pending) {
        // A newer snapshot supersedes the previously-queued one — no need to
        // persist an intermediate state once a later one is already known.
        queue.pending.files = files;
        queue.pending.waiters.push({ resolve, reject });
      } else {
        queue.pending = { files, waiters: [{ resolve, reject }] };
      }
    });
  }

  return runQueuedSave(workspaceId, files, queue);
}

async function runQueuedSave(
  workspaceId: string,
  files: readonly WorkspaceFile[],
  queue: SaveQueueEntry
): Promise<void> {
  queue.inFlight = true;
  try {
    await saveWorkspaceFilesNow(workspaceId, files);
  } finally {
    queue.inFlight = false;
  }

  const next = queue.pending;
  queue.pending = null;
  if (next) {
    // Don't await — this call's promise settles once ITS OWN write is
    // done; the coalesced follow-up settles its own waiters independently.
    void runQueuedSave(workspaceId, next.files, queue).then(
      () => next.waiters.forEach((w) => w.resolve()),
      (err: unknown) => next.waiters.forEach((w) => w.reject(err))
    );
  } else {
    saveQueues.delete(workspaceId);
  }
}

async function saveWorkspaceFilesNow(workspaceId: string, files: readonly WorkspaceFile[]): Promise<void> {
  const root = await deps.getOpfsRoot();

  // Determine the workspace kind before touching OPFS.
  //
  // For git-backed workspaces, the cloned repo contains files the editor
  // does NOT track (README, CI configs, non-.rosetta files). Pruning the
  // entire `files/` tree and rewriting only the editor's list would delete
  // those untracked files; the subsequent notifySyncOnSave → stageAll would
  // then stage those deletions and push them upstream — silent remote data
  // loss. Instead, for git-backed workspaces we skip the prune and write
  // listed files in place, leaving untracked repo files intact.
  //
  // Known limitation: editor-side file deletions and renames do not yet
  // propagate to the working tree for git-backed workspaces. This errs on
  // the side of keeping files; explicit delete/rename tracking is a
  // follow-up task.
  const ws = await deps.loadWorkspaceFn(workspaceId);
  const isGitBacked = ws?.kind === 'git-backed';

  const workspaceDir = await root.getDirectoryHandle(workspaceId, { create: true });

  if (!isGitBacked) {
    try {
      await workspaceDir.removeEntry('files', { recursive: true });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  await workspaceDir.getDirectoryHandle('files', { create: true });
  await workspaceDir.getDirectoryHandle('.studio', { create: true });

  const fs = new OpfsFs(root);
  for (const file of toStoredWorkspaceFiles(files)) {
    await fs.writeFile(`/${workspaceId}/files/${file.path}`, file.content);
  }
  notifySyncOnSave(workspaceId);
}

export async function loadWorkspaceFiles(workspaceId: string): Promise<WorkspaceFile[]> {
  const root = await deps.getOpfsRoot();
  const fs = new OpfsFs(root);
  const files: WorkspaceFile[] = [];

  await walkWorkspaceFiles(fs, `/${workspaceId}/files`, '', files);
  return files;
}

async function walkWorkspaceFiles(
  fs: OpfsFs,
  rootPath: string,
  relativePath: string,
  out: WorkspaceFile[]
): Promise<void> {
  const dirPath = relativePath ? `${rootPath}/${relativePath}` : rootPath;

  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    const childRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
    const childPath = `${rootPath}/${childRelativePath}`;

    let stat;
    try {
      stat = await fs.stat(childPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      await walkWorkspaceFiles(fs, rootPath, childRelativePath, out);
      continue;
    }

    if (!entry.endsWith('.rosetta')) {
      continue;
    }

    const content = (await fs.readFile(childPath, 'utf8')) as string;
    out.push({
      name: entry,
      path: childRelativePath,
      content,
      dirty: false
    });
  }
}

export async function deleteWorkspaceFiles(workspaceId: string): Promise<void> {
  const root = await deps.getOpfsRoot();
  try {
    await root.removeEntry(workspaceId, { recursive: true });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}
