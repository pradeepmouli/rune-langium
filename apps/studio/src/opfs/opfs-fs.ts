// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * OpfsFs — `isomorphic-git`-shaped filesystem adapter over OPFS
 * (Origin Private File System).
 *
 * Implements the subset of `node:fs/promises` that `isomorphic-git`
 * documents at https://isomorphic-git.org/docs/en/fs:
 *   readFile, writeFile, unlink, readdir, mkdir, rmdir, stat, lstat,
 *   readlink, symlink, chmod.
 *
 * OPFS doesn't have symlinks or POSIX permissions, so:
 *  - `symlink` and `chmod` resolve as no-ops.
 *  - `readlink` always rejects with an ENOENT-shaped error.
 *  - `lstat` aliases `stat`.
 *
 * Errors are thrown with shape `{ code: 'ENOENT' | 'EEXIST' | 'EISDIR'
 * | 'ENOTDIR' | 'ENOTEMPTY', message }` so isomorphic-git's downstream
 * checks see the codes it expects.
 */

const POSIX_SEP = '/';

export interface FsStat {
  type: 'file' | 'dir';
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  dev: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

type Encoding = 'utf8' | 'utf-8';
type ReadFileOptions = { encoding?: Encoding | null } | Encoding;
type WriteFileData = string | Uint8Array | ArrayBuffer | ArrayBufferView;

class FsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = code;
  }
}

function splitPath(path: string): string[] {
  const norm = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (norm.length === 0) return [];
  // Filter out '.' segments — isomorphic-git produces paths like
  // '/<dir>/.' when walking, and POSIX treats '.' as the current dir.
  return norm.split(POSIX_SEP).filter((s) => s !== '.' && s !== '');
}

function joinPath(parts: string[]): string {
  return '/' + parts.join('/');
}

function isDomError(err: unknown, name: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === name
  );
}

export class OpfsFs {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  // ---------- internal navigation helpers ----------

  private async getDir(parts: string[], create = false): Promise<FileSystemDirectoryHandle> {
    let cur = this.root;
    for (const part of parts) {
      try {
        cur = await cur.getDirectoryHandle(part, { create });
      } catch (err) {
        if (isDomError(err, 'NotFoundError')) {
          throw new FsError('ENOENT', joinPath(parts));
        }
        if (isDomError(err, 'TypeMismatchError')) {
          throw new FsError('ENOTDIR', joinPath(parts));
        }
        throw err;
      }
    }
    return cur;
  }

  private async getFile(path: string, create = false): Promise<FileSystemFileHandle> {
    const parts = splitPath(path);
    if (parts.length === 0) throw new FsError('EISDIR', path);
    const last = parts[parts.length - 1]!;
    const dir = await this.getDir(parts.slice(0, -1), create);
    try {
      return await dir.getFileHandle(last, { create });
    } catch (err) {
      if (isDomError(err, 'NotFoundError')) throw new FsError('ENOENT', path);
      if (isDomError(err, 'TypeMismatchError')) throw new FsError('EISDIR', path);
      throw err;
    }
  }

  // ---------- isomorphic-git surface ----------

  async readFile(path: string, options?: ReadFileOptions): Promise<string | Uint8Array> {
    const fh = await this.getFile(path, false);
    const file = await fh.getFile();
    const buf = new Uint8Array(await file.arrayBuffer());
    const enc = typeof options === 'string' ? options : options?.encoding;
    if (enc === 'utf8' || enc === 'utf-8') return new TextDecoder().decode(buf);
    return buf;
  }

  async writeFile(path: string, data: WriteFileData): Promise<void> {
    const fh = await this.getFile(path, true);
    let w: FileSystemWritableFileStream;
    try {
      w = await fh.createWritable();
    } catch (err) {
      throw translateWriteError(err, path);
    }
    try {
      // Wrapping in a Blob normalises string / Uint8Array / ArrayBuffer /
      // ArrayBufferView and avoids the SharedArrayBuffer type-narrowing
      // problem on FileSystemWritableFileStream.write().
      if (typeof data === 'string') {
        await w.write(data);
      } else {
        await w.write(new Blob([data as BlobPart]));
      }
      await w.close();
    } catch (err) {
      throw translateWriteError(err, path);
    }
  }

  async unlink(path: string): Promise<void> {
    const parts = splitPath(path);
    if (parts.length === 0) throw new FsError('EISDIR', path);
    const last = parts[parts.length - 1]!;
    const dir = await this.getDir(parts.slice(0, -1));
    try {
      await dir.removeEntry(last);
    } catch (err) {
      if (isDomError(err, 'NotFoundError')) throw new FsError('ENOENT', path);
      throw err;
    }
  }

  async mkdir(path: string): Promise<void> {
    const parts = splitPath(path);
    // mkdir -p semantics: get-or-create the full path. Idempotent.
    await this.getDir(parts, true);
  }

  async rmdir(path: string): Promise<void> {
    const parts = splitPath(path);
    if (parts.length === 0) throw new FsError('ENOTEMPTY', path);
    const last = parts[parts.length - 1]!;
    const parent = await this.getDir(parts.slice(0, -1));
    try {
      // recursive: false — refuse non-empty dirs (POSIX rmdir semantics).
      await parent.removeEntry(last, { recursive: false });
    } catch (err) {
      if (isDomError(err, 'NotFoundError')) throw new FsError('ENOENT', path);
      if (isDomError(err, 'InvalidModificationError')) throw new FsError('ENOTEMPTY', path);
      throw err;
    }
  }

  async stat(path: string): Promise<FsStat> {
    const parts = splitPath(path);
    if (parts.length === 0) {
      // root is a directory
      // OPFS doesn't expose dir mtimes; emit a stable zero so
      // isomorphic-git's index cache stays valid across calls.
      // (A `Date.now()` mtime invalidates every dir on every walk.)
      return makeStat('dir', 0, 0);
    }
    const last = parts[parts.length - 1]!;
    const parent = await this.getDir(parts.slice(0, -1));
    // Try file first.
    try {
      const fh = await parent.getFileHandle(last);
      const f = await fh.getFile();
      return makeStat('file', f.size, f.lastModified);
    } catch (err) {
      if (!isDomError(err, 'NotFoundError') && !isDomError(err, 'TypeMismatchError')) throw err;
    }
    // Then directory.
    try {
      await parent.getDirectoryHandle(last);
      // OPFS doesn't expose dir mtimes; emit a stable zero so
      // isomorphic-git's index cache stays valid across calls.
      // (A `Date.now()` mtime invalidates every dir on every walk.)
      return makeStat('dir', 0, 0);
    } catch (err) {
      if (isDomError(err, 'NotFoundError')) throw new FsError('ENOENT', path);
      throw err;
    }
  }

  async lstat(path: string): Promise<FsStat> {
    return this.stat(path);
  }

  async readdir(path: string): Promise<string[]> {
    const dir = await this.getDir(splitPath(path));
    const names: string[] = [];
    for await (const name of dir.keys()) names.push(name);
    names.sort();
    return names;
  }

  async readlink(path: string): Promise<string> {
    throw new FsError('ENOENT', `OPFS does not support symlinks (${path})`);
  }

  async symlink(_target: string, _path: string): Promise<void> {
    // No-op: OPFS has no symlinks. isomorphic-git with our usage doesn't write any.
  }

  async chmod(_path: string, _mode: number): Promise<void> {
    // No-op: OPFS has no POSIX permission bits.
  }
}

function translateWriteError(err: unknown, path: string): Error {
  if (err instanceof Error) {
    if (err.name === 'QuotaExceededError') return err; // bubble through; loader maps to storage_quota
    if (err.name === 'NotAllowedError') return err; // bubble through; loader maps to permission_denied
    if (isDomError(err, 'NotFoundError')) return new FsError('ENOENT', path);
    if (isDomError(err, 'TypeMismatchError')) return new FsError('EISDIR', path);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function makeStat(type: 'file' | 'dir', size: number, mtimeMs: number): FsStat {
  const fixedMode = type === 'file' ? 0o100644 : 0o040755;
  return {
    type,
    size,
    mtimeMs,
    ctimeMs: mtimeMs,
    ino: 0,
    mode: fixedMode,
    uid: 0,
    gid: 0,
    dev: 0,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
    isSymbolicLink: () => false
  };
}
