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
  // 'NotFoundError' is the DOM exception name (FileSystemDirectoryHandle
  // APIs); 'ENOENT' is OpfsFs's isomorphic-git-shaped FsError name/code.
  return error instanceof Error && (error.name === 'NotFoundError' || error.name === 'ENOENT');
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
  /** Settles (success or failure) when the current in-flight write finishes. */
  runDone: Promise<void> | null;
}

const saveQueues = new Map<string, SaveQueueEntry>();

// Workspaces whose files have been deleted. A debounced/in-flight autosave
// queued before the delete (e.g. a keystroke handler that hasn't fired yet)
// must not resurrect the just-removed OPFS directory via the
// getDirectoryHandle(..., { create: true }) calls in saveWorkspaceFilesNow.
const deletedWorkspaceIds = new Set<string>();

// Per-workspace snapshot of the editor-tracked `.rosetta` paths this module
// itself last knew about (from `loadWorkspaceFiles` or the previous
// successful save) — issue #439, round 2. Deliberately NOT a live re-scan of
// the on-disk `files/` tree: a background git sync (fast-forward/merge) can
// write a collaborator's new file into that SAME directory independent of
// any save call, and the sync-status subscription never refreshes the
// editor's `files` state — diffing against live disk state would misread
// that freshly-synced file as user-deleted, unlink it, and the following
// stageAll would stage and push its deletion (silent remote data loss,
// exactly the failure mode the git-backed branch below exists to prevent).
// Diffing against this snapshot instead means a path the editor never knew
// about is simply never a pruning candidate, in either direction.
const lastKnownTrackedPaths = new Map<string, ReadonlySet<string>>();

export function saveWorkspaceFiles(workspaceId: string, files: readonly WorkspaceFile[]): Promise<void> {
  if (deletedWorkspaceIds.has(workspaceId)) {
    return Promise.resolve();
  }

  const queue = saveQueues.get(workspaceId) ?? { inFlight: false, pending: null, runDone: null };
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
  const run = saveWorkspaceFilesNow(workspaceId, files);
  queue.runDone = run.then(
    () => undefined,
    () => undefined
  );
  try {
    await run;
  } catch (error) {
    // A failed write must not strand anything queued behind it: reject those
    // waiters with the same error (rather than leaving them to hang forever)
    // and tear down the queue entry so the next call starts fresh instead of
    // later replaying this failure's stale, superseded snapshot.
    queue.inFlight = false;
    const stranded = queue.pending;
    queue.pending = null;
    saveQueues.delete(workspaceId);
    stranded?.waiters.forEach((w) => w.reject(error));
    throw error;
  }
  queue.inFlight = false;

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
  // loss. Instead, for git-backed workspaces we skip the wholesale prune
  // below and, separately, remove only the specific paths this module
  // itself previously tracked for this workspace (`lastKnownTrackedPaths`)
  // that the caller no longer lists (issue #439) — untracked repo files,
  // and any path the editor never itself loaded/saved, are never touched.
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
  const nextPaths = new Set(toStoredWorkspaceFiles(files).map((file) => file.path));

  if (isGitBacked) {
    // Remove previously-tracked paths the caller no longer lists
    // (deletions — and, as a side effect, renames, since a rename shows up
    // here as one path disappearing and a new one appearing in the write
    // loop below). `git.statusMatrix`-driven `stageAll` (in
    // notifySyncOnSave's engine) detects the resulting workdir absence and
    // stages the removal on its own — no separate git-staging step needed
    // here.
    const previousPaths = lastKnownTrackedPaths.get(workspaceId) ?? new Set<string>();
    for (const previousPath of previousPaths) {
      if (!nextPaths.has(previousPath)) {
        try {
          await fs.unlink(`/${workspaceId}/files/${previousPath}`);
        } catch (error) {
          // Already gone (e.g. a background sync independently removed it
          // too) — nothing left to prune.
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
    }
  }

  for (const file of toStoredWorkspaceFiles(files)) {
    await fs.writeFile(`/${workspaceId}/files/${file.path}`, file.content);
  }
  lastKnownTrackedPaths.set(workspaceId, nextPaths);
  notifySyncOnSave(workspaceId);
}

export async function loadWorkspaceFiles(workspaceId: string): Promise<WorkspaceFile[]> {
  const root = await deps.getOpfsRoot();
  const fs = new OpfsFs(root);
  const files: WorkspaceFile[] = [];

  await walkWorkspaceFiles(fs, `/${workspaceId}/files`, '', files);
  // Establish/refresh the pruning baseline (issue #439) from what's
  // actually on disk at load time — the moment the editor genuinely does
  // know about every currently-tracked path.
  lastKnownTrackedPaths.set(workspaceId, new Set(files.map((file) => file.path)));
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
  // Mark deleted before anything else (synchronously, before any await) so
  // no save requested from this point on can slip past the queue drain
  // below and later recreate the directory we're about to remove.
  deletedWorkspaceIds.add(workspaceId);

  const queue = saveQueues.get(workspaceId);
  if (queue) {
    // A not-yet-started save would just resurrect the directory once it
    // runs — cancel it instead of letting it start.
    const pending = queue.pending;
    queue.pending = null;
    if (pending) {
      const err = new Error(`Workspace ${workspaceId} was deleted before its queued save could run`);
      pending.waiters.forEach((w) => w.reject(err));
    }
    // Wait for an already-running write to actually finish so the delete
    // below doesn't race its still-open OPFS mutations.
    if (queue.runDone) {
      await queue.runDone;
    }
  }

  try {
    const root = await deps.getOpfsRoot();
    await root.removeEntry(workspaceId, { recursive: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    // The delete didn't actually happen — the caller (handleDeleteWorkspace)
    // surfaces this error and leaves the workspace active, so don't leave
    // it permanently unable to save: clear the tombstone before rethrowing.
    deletedWorkspaceIds.delete(workspaceId);
    throw error;
  }
}
