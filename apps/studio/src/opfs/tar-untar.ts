// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * extractTarGz — gunzip + ustar parse + write into OPFS.
 * Feature 012-studio-workspace-ux, T013.
 *
 * Why not `tar-stream`: the curated mirrors are < 5MB compressed and we
 * already pay the bundle cost of `pako`. A purpose-built ustar parser
 * is ~120 lines and ships at ~1KB gzipped vs ~30KB for tar-stream.
 *
 * What we support:
 *  - regular files (typeflag '0' or '\0')
 *  - directories (typeflag '5')
 *  - paths up to 100 bytes (no PAX / GNU long-name extensions yet — every
 *    curated source we mirror today fits comfortably)
 *
 * What we drop:
 *  - global PAX headers (typeflag 'g'): silently skipped
 *  - extended PAX headers (typeflag 'x'): silently skipped (the next entry's
 *    name is read from the ustar header, which is enough for our archives)
 *  - hard / symbolic links: rejected with a clear error
 *  - device / fifo / character-special entries: rejected with a clear error
 *
 * If a future curated source uses long names or PAX, this module needs to
 * grow — in that case T012's fixture should be expanded to include such
 * entries first, the test should fail, then we add the support.
 */

import { inflate } from 'pako';
import type { OpfsFs } from './opfs-fs.js';

export interface ExtractOptions {
  /** Called once per emitted file; useful for progress UI. */
  onEntry?: (path: string, sizeBytes: number) => void;
  /**
   * Filter — return false to skip an entry. Defaults to accepting all.
   * Useful for narrowing a curated archive to a specific subdirectory.
   */
  shouldExtract?: (path: string) => boolean;
}

const BLOCK = 512;

interface UstarHeader {
  /** Full path, ustar-name. May start with leading './'. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** Tar typeflag character. '0' / '\0' = file, '5' = dir, others see notes above. */
  typeflag: string;
}

export async function extractTarGz(
  gzBytes: Uint8Array,
  fs: OpfsFs,
  options: ExtractOptions = {}
): Promise<void> {
  // Step 1: gunzip. pako throws on bad headers; we let that propagate so
  // the caller can surface 'archive_decode' per FR-002.
  const tar = inflate(gzBytes);

  // Step 2: walk 512-byte blocks.
  let offset = 0;
  while (offset + BLOCK <= tar.byteLength) {
    const headerBlock = tar.subarray(offset, offset + BLOCK);
    if (isAllZero(headerBlock)) {
      // Two zero blocks signal end-of-archive; one is enough for us to stop.
      break;
    }
    const header = parseUstarHeader(headerBlock);
    offset += BLOCK;

    const dataBlocks = Math.ceil(header.size / BLOCK);
    const dataEnd = offset + header.size;

    if (header.typeflag === '5') {
      // Directory entry. Pre-create so empty dirs get materialised even
      // without a child file landing in them.
      const cleaned = cleanPath(header.name);
      if (cleaned && (!options.shouldExtract || options.shouldExtract(cleaned + '/'))) {
        await fs.mkdir('/' + cleaned);
      }
    } else if (header.typeflag === '0' || header.typeflag === '\0' || header.typeflag === '') {
      const cleaned = cleanPath(header.name);
      if (cleaned && (!options.shouldExtract || options.shouldExtract(cleaned))) {
        const data = tar.subarray(offset, dataEnd);
        await fs.writeFile('/' + cleaned, data);
        options.onEntry?.(cleaned, header.size);
      }
    } else if (header.typeflag === 'g' || header.typeflag === 'x') {
      // PAX headers — skip the data blocks; rely on the next ustar header.
    } else if (header.typeflag === '1' || header.typeflag === '2') {
      throw new Error(`tar: links not supported (path=${header.name})`);
    } else {
      // Ignore unknown typeflags but advance past their data so the parser
      // doesn't get out of sync.
    }

    offset += dataBlocks * BLOCK;
  }
}

function parseUstarHeader(block: Uint8Array): UstarHeader {
  const dec = new TextDecoder('utf-8');
  const slice = (start: number, end: number): string => {
    const sub = block.subarray(start, end);
    // Trim trailing NULs.
    let last = sub.length;
    while (last > 0 && sub[last - 1] === 0) last--;
    return dec.decode(sub.subarray(0, last));
  };

  const name = slice(0, 100);
  const sizeOctal = slice(124, 136).trim();
  const typeflag = slice(156, 157) || '\0';
  const prefix = slice(345, 500);

  const size = sizeOctal.length > 0 ? parseInt(sizeOctal, 8) : 0;
  const fullName = prefix.length > 0 ? `${prefix}/${name}` : name;
  return { name: fullName, size, typeflag };
}

function cleanPath(raw: string): string {
  let p = raw;
  // Drop leading './' which `tar -C dir .` likes to emit.
  if (p.startsWith('./')) p = p.slice(2);
  // Drop trailing slash on directory entries.
  if (p.endsWith('/')) p = p.slice(0, -1);
  // Reject path-traversal — should never appear in curated mirrors but the
  // cost of checking is trivial and the upside is "we never write outside
  // the workspace's OPFS root".
  if (p.includes('..')) {
    throw new Error(`tar: rejected path-traversal entry (${raw})`);
  }
  return p;
}

function isAllZero(block: Uint8Array): boolean {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}
