// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Folder-backed workspaces — read/write directly against a
 * `FileSystemDirectoryHandle` the user picked via the File System Access
 * API. Edits round-trip to disk; the workspace is just a thin overlay.
 *
 * Persistence: the FSA handle is structured-cloneable, so we stash it in
 * IndexedDB's `handles` store keyed by workspace id. Permissions can be
 * revoked between sessions; `isFolderReadOnly()` reflects that state.
 */

import { saveFolderHandle, loadFolderHandle, type FolderHandleRecord } from './persistence.js';

export async function bindFolderToWorkspace(
  workspaceId: string,
  handle: FileSystemDirectoryHandle,
  permission: FolderHandleRecord['lastPermission'] = 'granted'
): Promise<void> {
  await saveFolderHandle({
    id: workspaceId,
    handle,
    lastPermission: permission
  });
}

export async function isFolderReadOnly(workspaceId: string): Promise<boolean> {
  const rec = await loadFolderHandle(workspaceId);
  if (!rec) return false;
  return rec.lastPermission !== 'granted';
}

export async function readFolderFile(
  root: FileSystemDirectoryHandle,
  relPath: string
): Promise<string> {
  const fh = await navigateToFile(root, relPath, false);
  const file = await fh.getFile();
  return file.text();
}

export async function writeFolderFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
  content: string
): Promise<void> {
  const fh = await navigateToFile(root, relPath, true);
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function listFolderFiles(
  root: FileSystemDirectoryHandle,
  prefix = ''
): Promise<string[]> {
  const out: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dir = root as any;
  for await (const [name, handle] of dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') {
      out.push(path);
    } else if (handle.kind === 'directory') {
      out.push(...(await listFolderFiles(handle as FileSystemDirectoryHandle, path)));
    }
  }
  return out;
}

async function navigateToFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
  create: boolean
): Promise<FileSystemFileHandle> {
  const parts = relPath.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('folder-backing: empty path');
  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create });
  }
  return dir.getFileHandle(parts[parts.length - 1]!, { create });
}
