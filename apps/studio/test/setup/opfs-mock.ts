// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * In-memory OPFS test double. Implements only the subset of the
 * FileSystem Access API our `OpfsFs` adapter (T011) consumes:
 * directory + file handles, getFileHandle/getDirectoryHandle with `create`,
 * removeEntry recursive, async iteration via .entries(), createWritable +
 * write() + close(), and getFile().arrayBuffer().
 *
 * Symlinks and permissions are not modelled — OPFS doesn't have them.
 */

class MemFile {
  kind = 'file' as const;
  data: Uint8Array;
  lastModified: number;
  constructor(
    public name: string,
    data: Uint8Array = new Uint8Array(0)
  ) {
    this.data = data;
    this.lastModified = Date.now();
  }
  async getFile() {
    const data = this.data;
    return {
      name: this.name,
      size: data.byteLength,
      type: '',
      lastModified: this.lastModified,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      text: async () => new TextDecoder().decode(data),
      stream: () => new Blob([data]).stream()
    };
  }
  async createWritable(): Promise<MemWritable> {
    return new MemWritable(this);
  }
}

class MemWritable {
  private chunks: Uint8Array[] = [];
  constructor(private file: MemFile) {}
  async write(data: ArrayBufferView | ArrayBuffer | Blob | string): Promise<void> {
    if (typeof data === 'string') {
      this.chunks.push(new TextEncoder().encode(data));
    } else if (data instanceof Blob) {
      this.chunks.push(new Uint8Array(await data.arrayBuffer()));
    } else if (data instanceof ArrayBuffer) {
      this.chunks.push(new Uint8Array(data));
    } else {
      const view = data as ArrayBufferView;
      this.chunks.push(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
  }
  async close(): Promise<void> {
    let total = 0;
    for (const c of this.chunks) total += c.byteLength;
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    this.file.data = merged;
    this.file.lastModified = Date.now();
  }
  async truncate(_size: number): Promise<void> {
    /* unused by our adapter */
  }
  async seek(_pos: number): Promise<void> {
    /* unused by our adapter */
  }
}

class MemDir {
  kind = 'directory' as const;
  private children = new Map<string, MemDir | MemFile>();
  constructor(public name: string) {}

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MemFile> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') {
        throw makeDomError('TypeMismatchError', `${name} is a directory`);
      }
      return existing;
    }
    if (!opts?.create) {
      throw makeDomError('NotFoundError', name);
    }
    const f = new MemFile(name);
    this.children.set(name, f);
    return f;
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MemDir> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') {
        throw makeDomError('TypeMismatchError', `${name} is a file`);
      }
      return existing;
    }
    if (!opts?.create) {
      throw makeDomError('NotFoundError', name);
    }
    const d = new MemDir(name);
    this.children.set(name, d);
    return d;
  }

  async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
    const child = this.children.get(name);
    if (!child) throw makeDomError('NotFoundError', name);
    if (child.kind === 'directory') {
      const hasChildren = (child as MemDir).children.size > 0;
      if (hasChildren && !opts?.recursive) {
        throw makeDomError('InvalidModificationError', `${name} is not empty`);
      }
    }
    this.children.delete(name);
  }

  async *entries(): AsyncGenerator<[string, MemDir | MemFile]> {
    for (const [k, v] of this.children) yield [k, v];
  }
  async *keys(): AsyncGenerator<string> {
    for (const k of this.children.keys()) yield k;
  }
  async *values(): AsyncGenerator<MemDir | MemFile> {
    for (const v of this.children.values()) yield v;
  }
  [Symbol.asyncIterator]() {
    return this.entries();
  }
}

function makeDomError(name: string, msg: string): Error {
  const err = new Error(msg);
  err.name = name;
  return err;
}

/** Create a fresh empty OPFS root for one test. */
export function createOpfsRoot(): MemDir {
  return new MemDir('/');
}

/** Convenience — read whole file contents as bytes. */
export async function readBytes(dir: MemDir, ...path: string[]): Promise<Uint8Array> {
  let cur: MemDir = dir;
  for (let i = 0; i < path.length - 1; i++) {
    cur = await cur.getDirectoryHandle(path[i]!);
  }
  const f = await cur.getFileHandle(path[path.length - 1]!);
  const file = await f.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/** Convenience — write bytes at a path, creating any missing dirs. */
export async function writeBytes(dir: MemDir, bytes: Uint8Array, ...path: string[]): Promise<void> {
  let cur: MemDir = dir;
  for (let i = 0; i < path.length - 1; i++) {
    cur = await cur.getDirectoryHandle(path[i]!, { create: true });
  }
  const f = await cur.getFileHandle(path[path.length - 1]!, { create: true });
  const w = await f.createWritable();
  await w.write(bytes);
  await w.close();
}

export type OpfsRoot = MemDir;
