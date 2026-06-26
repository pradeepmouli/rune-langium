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

export async function saveWorkspaceFiles(workspaceId: string, files: readonly WorkspaceFile[]): Promise<void> {
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
