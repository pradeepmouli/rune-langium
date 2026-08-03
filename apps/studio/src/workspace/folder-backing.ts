// @instrumentation-codemod-applied
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
import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

// `handle` (a FileSystemDirectoryHandle) isn't capturable; workspaceId +
// permission are safe structural values.
export const bindFolderToWorkspace = withInstrumentation(
  async function bindFolderToWorkspace(
    workspaceId: string,
    handle: FileSystemDirectoryHandle,
    permission: FolderHandleRecord['lastPermission'] = 'granted'
  ): Promise<void> {
    await saveFolderHandle({
      id: workspaceId,
      handle,
      lastPermission: permission
    });
  },
  {
    op: 'bindFolderToWorkspace',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [workspaceId, , permission] = value as [string, unknown, string | undefined];
      return { workspaceId, permission };
    }
  }
);

export const isFolderReadOnly = withInstrumentation(
  async function isFolderReadOnly(workspaceId: string): Promise<boolean> {
    const rec = await loadFolderHandle(workspaceId);
    if (!rec) return false;
    return rec.lastPermission !== 'granted';
  },
  { op: 'isFolderReadOnly', capture: Capture.Input | Capture.Output, sanitize: (value) => value }
);

// `relPath` is relative to whatever real folder the user picked — never
// includes their home directory / username, only relative sub-path
// segments — same safety category as uri.ts's workspace-relative paths.
// `root` (a FileSystemDirectoryHandle) and file content are not captured.
export const readFolderFile = withInstrumentation(
  async function readFolderFile(root: FileSystemDirectoryHandle, relPath: string): Promise<string> {
    const fh = await navigateToFile(root, relPath, false);
    const file = await fh.getFile();
    return file.text();
  },
  {
    op: 'readFolderFile',
    capture: Capture.Input,
    sanitize: (value, which) => (which === 'input' ? { relPath: (value as [unknown, string])[1] } : undefined)
  }
);

export const writeFolderFile = withInstrumentation(
  async function writeFolderFile(root: FileSystemDirectoryHandle, relPath: string, content: string): Promise<void> {
    const fh = await navigateToFile(root, relPath, true);
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  },
  {
    op: 'writeFolderFile',
    capture: Capture.Input,
    sanitize: (value, which) => (which === 'input' ? { relPath: (value as [unknown, string, string])[1] } : undefined)
  }
);

// Output is a list of relative paths within the user's chosen folder —
// same safety rationale as readFolderFile's relPath above.
export const listFolderFiles = withInstrumentation(
  async function listFolderFiles(root: FileSystemDirectoryHandle, prefix = ''): Promise<string[]> {
    const out: string[] = [];
    // `FileSystemDirectoryHandle.entries()` is declared in
    // lib.dom.asynciterable.d.ts as `[string, FileSystemHandle]`; the union is
    // narrowed below by `handle.kind`, no `any` cast needed.
    for await (const [name, handle] of root.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'file') {
        out.push(path);
      } else if (handle.kind === 'directory') {
        out.push(...(await listFolderFiles(handle, path)));
      }
    }
    return out;
  },
  {
    op: 'listFolderFiles',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);

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
