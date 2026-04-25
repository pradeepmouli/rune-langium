// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T010 — OpfsFs adapter contract tests.
 *
 * Validates the isomorphic-git-shaped FS interface our adapter exposes.
 * Uses the in-memory OPFS test double from `tests/setup/opfs-mock.ts`.
 */

import { describe, it, expect } from 'vitest';
import { createOpfsRoot, type OpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';

function newFs(): { fs: OpfsFs; root: OpfsRoot } {
  const root = createOpfsRoot();
  const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
  return { fs, root };
}

describe('OpfsFs — readFile / writeFile (T010)', () => {
  it('writes then reads back UTF-8 string content', async () => {
    const { fs } = newFs();
    await fs.writeFile('/hello.txt', 'world');
    const data = await fs.readFile('/hello.txt', 'utf8');
    expect(data).toBe('world');
  });

  it('writes then reads back binary content', async () => {
    const { fs } = newFs();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await fs.writeFile('/bin.dat', bytes);
    const back = (await fs.readFile('/bin.dat')) as Uint8Array;
    expect(Array.from(back)).toEqual([1, 2, 3, 4, 5]);
  });

  it('readFile throws ENOENT for a missing file', async () => {
    const { fs } = newFs();
    await expect(fs.readFile('/nope.txt')).rejects.toThrow(/ENOENT/);
  });

  it('writeFile auto-creates parent directories', async () => {
    const { fs } = newFs();
    await fs.writeFile('/a/b/c/leaf.txt', 'hi');
    expect(await fs.readFile('/a/b/c/leaf.txt', 'utf8')).toBe('hi');
  });
});

describe('OpfsFs — mkdir / rmdir / unlink', () => {
  it('mkdir -p creates nested directories', async () => {
    const { fs } = newFs();
    await fs.mkdir('/a/b/c');
    const list = await fs.readdir('/a/b');
    expect(list).toContain('c');
  });

  it('mkdir is idempotent when the path already exists', async () => {
    const { fs } = newFs();
    await fs.mkdir('/a');
    await fs.mkdir('/a');
    expect(await fs.readdir('/')).toContain('a');
  });

  it('unlink removes a file', async () => {
    const { fs } = newFs();
    await fs.writeFile('/x.txt', 'x');
    await fs.unlink('/x.txt');
    await expect(fs.readFile('/x.txt')).rejects.toThrow(/ENOENT/);
  });

  it('rmdir removes an empty directory', async () => {
    const { fs } = newFs();
    await fs.mkdir('/empty');
    await fs.rmdir('/empty');
    await expect(fs.readdir('/empty')).rejects.toThrow(/ENOENT/);
  });

  it('rmdir refuses non-empty directory by default', async () => {
    const { fs } = newFs();
    await fs.writeFile('/d/inside', 'x');
    await expect(fs.rmdir('/d')).rejects.toThrow(/ENOTEMPTY|not empty/i);
  });
});

describe('OpfsFs — stat / lstat / readdir', () => {
  it('stat reports file size and type', async () => {
    const { fs } = newFs();
    await fs.writeFile('/f.txt', 'hello');
    const s = await fs.stat('/f.txt');
    expect(s.size).toBe(5);
    expect(s.isFile()).toBe(true);
    expect(s.isDirectory()).toBe(false);
    expect(s.isSymbolicLink()).toBe(false);
    expect(typeof s.mtimeMs).toBe('number');
  });

  it('stat reports directory type', async () => {
    const { fs } = newFs();
    await fs.mkdir('/d');
    const s = await fs.stat('/d');
    expect(s.isFile()).toBe(false);
    expect(s.isDirectory()).toBe(true);
  });

  it('lstat behaves like stat (no real symlinks in OPFS)', async () => {
    const { fs } = newFs();
    await fs.writeFile('/f.txt', '');
    const s = await fs.lstat('/f.txt');
    expect(s.isFile()).toBe(true);
  });

  it('readdir returns sorted child names', async () => {
    const { fs } = newFs();
    await fs.writeFile('/d/c', '');
    await fs.writeFile('/d/a', '');
    await fs.writeFile('/d/b', '');
    const names = await fs.readdir('/d');
    expect(names).toEqual(['a', 'b', 'c']);
  });
});

describe('OpfsFs — symlinks + chmod (no-op surface)', () => {
  it('readlink throws ENOENT (we do not model symlinks)', async () => {
    const { fs } = newFs();
    await expect(fs.readlink('/anything')).rejects.toThrow(/ENOENT|not.*supported/i);
  });

  it('symlink resolves successfully but is a no-op', async () => {
    const { fs } = newFs();
    await expect(fs.symlink('/target', '/link')).resolves.toBeUndefined();
  });

  it('chmod resolves successfully but is a no-op', async () => {
    const { fs } = newFs();
    await fs.writeFile('/f', 'x');
    await expect(fs.chmod('/f', 0o644)).resolves.toBeUndefined();
  });
});
