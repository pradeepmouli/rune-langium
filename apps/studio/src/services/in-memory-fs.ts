// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Minimal in-memory FS for transient `isomorphic-git` clones.
 *
 * Replaces `@isomorphic-git/lightning-fs` for the one remaining caller
 * (`model-loader.ts`) — the git-clone-from-arbitrary-URL path. We don't
 * need persistence: model-loader walks the working tree for `.rosetta`
 * files and stores the parsed result in `CachedModel` (IDB). The cloned
 * tree itself is throwaway, so an in-memory store is faster, smaller,
 * and frees us of the LightningFS dependency.
 *
 * Interface conforms to the subset of `node:fs/promises` documented at
 * https://isomorphic-git.org/docs/en/fs (writeFile / readFile / mkdir /
 * rmdir / unlink / readdir / stat / lstat / readlink / symlink / chmod).
 *
 * NOT meant as a general filesystem — workspace storage uses `OpfsFs`
 * (which is real OPFS-backed). This shim exists solely for ephemeral
 * git clones.
 */

interface MemNode {
  type: 'file' | 'dir';
  data?: Uint8Array;
  mode: number;
  mtimeMs: number;
}

class MemFsError extends Error {
  code: string;
  constructor(code: 'ENOENT' | 'EEXIST' | 'EISDIR' | 'ENOTDIR' | 'ENOTEMPTY', path: string) {
    super(`${code}: ${path}`);
    this.code = code;
    this.name = code;
  }
}

const fileMode = 0o100644;
const dirMode = 0o040755;

function norm(p: string): string {
  // Collapse repeated slashes; drop trailing slash; preserve leading slash.
  const collapsed = p.replace(/\/{2,}/g, '/');
  if (collapsed === '/') return '/';
  return collapsed.replace(/\/$/, '');
}

function parentOf(p: string): string {
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return '/';
  return p.slice(0, idx);
}

interface MemStatResult {
  type: 'file' | 'dir';
  size: number;
  mtimeMs: number;
  mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface InMemFsPromises {
  readFile(
    path: string,
    opts?: { encoding?: 'utf8' | 'utf-8' | null } | string
  ): Promise<Uint8Array | string>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<MemStatResult>;
  lstat(path: string): Promise<MemStatResult>;
  readlink(path: string): Promise<string>;
  symlink(target: string, path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
}

export class InMemoryFs {
  private nodes = new Map<string, MemNode>();

  constructor() {
    this.nodes.set('/', { type: 'dir', mode: dirMode, mtimeMs: Date.now() });
  }

  promises: InMemFsPromises = {
    readFile: async (path, opts) => {
      const p = norm(path);
      const node = this.nodes.get(p);
      if (!node) throw new MemFsError('ENOENT', p);
      if (node.type !== 'file') throw new MemFsError('EISDIR', p);
      const enc = typeof opts === 'string' ? opts : opts?.encoding;
      if (enc === 'utf8' || enc === 'utf-8') {
        return new TextDecoder().decode(node.data ?? new Uint8Array(0));
      }
      return node.data ?? new Uint8Array(0);
    },
    writeFile: async (path, data) => {
      const p = norm(path);
      // mkdir-p the parent.
      const parent = parentOf(p);
      this.ensureDir(parent);
      const bytes =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data instanceof Uint8Array
            ? data
            : new Uint8Array(data as ArrayBufferLike);
      this.nodes.set(p, { type: 'file', data: bytes, mode: fileMode, mtimeMs: Date.now() });
    },
    mkdir: async (path, opts) => {
      const p = norm(path);
      if (opts?.recursive) {
        this.ensureDir(p);
        return;
      }
      const parent = parentOf(p);
      if (!this.nodes.has(parent) || this.nodes.get(parent)!.type !== 'dir') {
        throw new MemFsError('ENOENT', parent);
      }
      if (this.nodes.has(p)) throw new MemFsError('EEXIST', p);
      this.nodes.set(p, { type: 'dir', mode: dirMode, mtimeMs: Date.now() });
    },
    rmdir: async (path) => {
      const p = norm(path);
      const node = this.nodes.get(p);
      if (!node) throw new MemFsError('ENOENT', p);
      if (node.type !== 'dir') throw new MemFsError('ENOTDIR', p);
      // Empty check.
      const childPrefix = p === '/' ? '/' : p + '/';
      for (const k of this.nodes.keys()) {
        if (k !== p && k.startsWith(childPrefix)) {
          throw new MemFsError('ENOTEMPTY', p);
        }
      }
      this.nodes.delete(p);
    },
    unlink: async (path) => {
      const p = norm(path);
      const node = this.nodes.get(p);
      if (!node) throw new MemFsError('ENOENT', p);
      if (node.type !== 'file') throw new MemFsError('EISDIR', p);
      this.nodes.delete(p);
    },
    readdir: async (path) => {
      const p = norm(path);
      const node = this.nodes.get(p);
      if (!node) throw new MemFsError('ENOENT', p);
      if (node.type !== 'dir') throw new MemFsError('ENOTDIR', p);
      const prefix = p === '/' ? '/' : p + '/';
      const seen = new Set<string>();
      for (const k of this.nodes.keys()) {
        if (k === p) continue;
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const slash = rest.indexOf('/');
        seen.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return Array.from(seen).sort();
    },
    stat: async (path) => {
      const p = norm(path);
      const node = this.nodes.get(p);
      if (!node) throw new MemFsError('ENOENT', p);
      const type = node.type;
      const size = type === 'file' ? (node.data?.byteLength ?? 0) : 0;
      return {
        type,
        size,
        mtimeMs: node.mtimeMs,
        mode: node.mode,
        isFile: () => type === 'file',
        isDirectory: () => type === 'dir',
        isSymbolicLink: () => false
      };
    },
    lstat: async (path) => this.promises.stat(path),
    readlink: async (path) => {
      throw new MemFsError('ENOENT', path);
    },
    symlink: async () => {
      // No-op — isomorphic-git emits these only for the rare submodule case.
    },
    chmod: async (path, mode) => {
      const p = norm(path);
      const node = this.nodes.get(p);
      if (!node) throw new MemFsError('ENOENT', p);
      node.mode = mode;
    }
  };

  private ensureDir(path: string): void {
    const p = norm(path);
    if (p === '/') return;
    const parts = p.split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur += '/' + part;
      const existing = this.nodes.get(cur);
      if (existing) {
        if (existing.type !== 'dir') throw new MemFsError('ENOTDIR', cur);
        continue;
      }
      this.nodes.set(cur, { type: 'dir', mode: dirMode, mtimeMs: Date.now() });
    }
  }
}
