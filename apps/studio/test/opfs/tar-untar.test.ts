// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T012 — in-browser tar.gz extraction tests against a vendored fixture.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createOpfsRoot, readBytes, type OpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { extractTarGz } from '../../src/opfs/tar-untar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../fixtures/curated/tiny.tar.gz');

function loadFixture(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE));
}

describe('extractTarGz (T012)', () => {
  it('writes every file from the archive into the OPFS root', async () => {
    const root: OpfsRoot = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const bytes = loadFixture();

    await extractTarGz(bytes, fs);

    expect(await fs.readdir('/')).toEqual(expect.arrayContaining(['foo', 'bar']));
    expect((await fs.readFile('/foo/a.txt', 'utf8')) as string).toBe('hello world\n');
    expect((await fs.readFile('/foo/b.txt', 'utf8')) as string).toBe('second file\n');
    expect((await fs.readFile('/bar/c.txt', 'utf8')) as string).toBe('in bar\n');
  });

  it('reports each emitted entry to the optional progress callback', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const bytes = loadFixture();

    const seen: string[] = [];
    await extractTarGz(bytes, fs, {
      onEntry: (path) => seen.push(path)
    });

    // Three files, sorted for stable assertion regardless of tar order.
    expect(seen.sort()).toEqual(['bar/c.txt', 'foo/a.txt', 'foo/b.txt']);
  });

  it('preserves byte-exact content for each file', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    await extractTarGz(loadFixture(), fs);

    const a = await readBytes(root, 'foo', 'a.txt');
    expect(new TextDecoder().decode(a)).toBe('hello world\n');
  });

  it('rejects on a corrupt gzip header', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const garbage = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(extractTarGz(garbage, fs)).rejects.toThrow();
  });
});
