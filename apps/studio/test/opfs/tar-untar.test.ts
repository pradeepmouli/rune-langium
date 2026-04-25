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

// ---------------------------------------------------------------------------
// Synthesised ustar blocks — exercises rejection paths the canned fixture
// cannot reach. Each helper builds a 512-byte ustar header with a given
// typeflag + name, then a single 512-byte data block (zeros), then the
// two trailing zero blocks that signal end-of-archive. We gzip the whole
// thing with pako so extractTarGz's gunzip step is also exercised.
// ---------------------------------------------------------------------------

import { deflate, gzip } from 'pako';

function buildHeader(name: string, typeflag: string, size = 0): Uint8Array {
  const block = new Uint8Array(512);
  // name (0..100)
  const nameBytes = new TextEncoder().encode(name);
  block.set(nameBytes.subarray(0, Math.min(nameBytes.length, 100)), 0);
  // mode (100..108) — '0000644\0'
  block.set(new TextEncoder().encode('0000644\0'), 100);
  // uid/gid (108..124) — '0000000\0'
  block.set(new TextEncoder().encode('0000000\0'), 108);
  block.set(new TextEncoder().encode('0000000\0'), 116);
  // size (124..136) — 11 octal digits + NUL
  const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
  block.set(new TextEncoder().encode(sizeOctal), 124);
  // mtime (136..148)
  block.set(new TextEncoder().encode('00000000000\0'), 136);
  // chksum placeholder spaces (148..156)
  for (let i = 148; i < 156; i++) block[i] = 0x20;
  // typeflag (156)
  block[156] = typeflag.charCodeAt(0);
  // ustar magic (257..263) "ustar\0", version "00" (263..265)
  block.set(new TextEncoder().encode('ustar\0'), 257);
  block.set(new TextEncoder().encode('00'), 263);
  // (we don't compute a real checksum — extractTarGz doesn't verify it)
  return block;
}

function packTar(...entries: Array<{ header: Uint8Array; data?: Uint8Array }>): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const e of entries) {
    blocks.push(e.header);
    if (e.data) {
      const padded = new Uint8Array(Math.ceil(e.data.length / 512) * 512);
      padded.set(e.data, 0);
      blocks.push(padded);
    }
  }
  blocks.push(new Uint8Array(512), new Uint8Array(512)); // EOF
  let total = 0;
  for (const b of blocks) total += b.length;
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) {
    merged.set(b, off);
    off += b.length;
  }
  return gzip(merged);
}

describe('extractTarGz — rejection paths (T010 hardening)', () => {
  it('rejects a path-traversal entry', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const archive = packTar({ header: buildHeader('../escape.txt', '0', 0) });
    await expect(extractTarGz(archive, fs)).rejects.toThrow(/path-traversal|unsafe/);
  });

  it('rejects an absolute path', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const archive = packTar({ header: buildHeader('/etc/passwd', '0', 0) });
    await expect(extractTarGz(archive, fs)).rejects.toThrow(/unsafe/);
  });

  it('rejects backslash separators (Windows-style)', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const archive = packTar({ header: buildHeader('foo\\bar.txt', '0', 0) });
    await expect(extractTarGz(archive, fs)).rejects.toThrow(/unsafe/);
  });

  it('accepts legitimate filenames containing dots', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const data = new TextEncoder().encode('hi');
    const archive = packTar({
      header: buildHeader('a..b.txt', '0', data.length),
      data
    });
    await extractTarGz(archive, fs);
    expect((await fs.readFile('/a..b.txt', 'utf8')) as string).toBe('hi');
  });

  it('rejects hard links (typeflag 1)', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const archive = packTar({ header: buildHeader('hard.txt', '1', 0) });
    await expect(extractTarGz(archive, fs)).rejects.toThrow(/links/);
  });

  it('rejects symbolic links (typeflag 2)', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const archive = packTar({ header: buildHeader('sym.txt', '2', 0) });
    await expect(extractTarGz(archive, fs)).rejects.toThrow(/links/);
  });

  it('rejects unknown typeflags loudly', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const archive = packTar({ header: buildHeader('weird', '7', 0) });
    await expect(extractTarGz(archive, fs)).rejects.toThrow(/unsupported typeflag/);
  });

  it('silently skips PAX global headers (typeflag g)', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const data = new TextEncoder().encode('hi');
    const paxData = new TextEncoder().encode('30 mtime=1700000000.000000\n');
    const archive = packTar(
      { header: buildHeader('pax_global', 'g', paxData.length), data: paxData },
      { header: buildHeader('real.txt', '0', data.length), data }
    );
    await extractTarGz(archive, fs);
    expect((await fs.readFile('/real.txt', 'utf8')) as string).toBe('hi');
  });

  it('silently skips PAX extended headers (typeflag x)', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const data = new TextEncoder().encode('hi');
    const paxData = new TextEncoder().encode('25 path=longer.txt\n');
    const archive = packTar(
      { header: buildHeader('pax_ext', 'x', paxData.length), data: paxData },
      { header: buildHeader('real.txt', '0', data.length), data }
    );
    await extractTarGz(archive, fs);
    expect((await fs.readFile('/real.txt', 'utf8')) as string).toBe('hi');
  });
});

// silence unused import warning if pako exposes both functions but we only use gzip
void deflate;
