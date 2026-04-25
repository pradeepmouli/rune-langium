// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * extractTarGz — gunzip + ustar parse + write into OPFS.
 *
 * Why not `tar-stream`: the curated mirrors are < 5MB compressed and we
 * already pay the bundle cost of `pako`. A purpose-built ustar parser
 * is small and ships at ~1KB gzipped vs ~30KB for tar-stream.
 *
 * Supported entry kinds: regular files (typeflag '0' or NUL) and directories
 * (typeflag '5'). Paths are bounded by ustar's 100-byte name + 155-byte
 * prefix.
 *
 * Rejected (throws): hard links (typeflag '1'), symbolic links ('2'), and
 * any entry whose path contains a traversal segment, an empty segment,
 * `.` / `..`, a backslash, a leading `/`, or a NUL.
 *
 * Skipped (silently): PAX global headers ('g') and PAX extended headers
 * ('x') — for our curated sources the next ustar header is sufficient. Any
 * other unknown typeflag is rejected to fail loudly rather than silently
 * truncate to "we ignore the data."
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
  /**
   * Optional prefix prepended to every entry path before it's written to
   * the FS. e.g. with `pathPrefix: '/cdm-ws'` an entry `foo/a.txt` lands at
   * `/cdm-ws/foo/a.txt`. Lets callers scope an archive to a workspace
   * subdirectory without wrapping the whole `OpfsFs` interface.
   */
  pathPrefix?: string;
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

    const prefix = options.pathPrefix ? options.pathPrefix.replace(/\/$/, '') : '';
    if (header.typeflag === '5') {
      const cleaned = cleanPath(header.name);
      if (cleaned && (!options.shouldExtract || options.shouldExtract(cleaned + '/'))) {
        await fs.mkdir(`${prefix}/${cleaned}`);
      }
    } else if (header.typeflag === '0' || header.typeflag === '\0' || header.typeflag === '') {
      const cleaned = cleanPath(header.name);
      if (cleaned && (!options.shouldExtract || options.shouldExtract(cleaned))) {
        const data = tar.subarray(offset, dataEnd);
        await fs.writeFile(`${prefix}/${cleaned}`, data);
        options.onEntry?.(cleaned, header.size);
      }
    } else if (header.typeflag === 'g' || header.typeflag === 'x') {
      // PAX headers — next ustar header carries the canonical name.
    } else if (header.typeflag === '1' || header.typeflag === '2') {
      throw new Error(`tar: links not supported (path=${header.name})`);
    } else {
      throw new Error(`tar: unsupported typeflag '${header.typeflag}' (path=${header.name})`);
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
  if (p.startsWith('./')) p = p.slice(2);
  if (p.endsWith('/')) p = p.slice(0, -1);
  if (p.length === 0) return '';

  // Reject absolute paths, NUL bytes, and Windows separators outright.
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) {
    throw new Error(`tar: rejected unsafe path (${raw})`);
  }

  // Walk segments and reject any that would escape the root or are empty.
  // This catches '..' as a whole segment without rejecting legitimate
  // names like 'a..b.txt'.
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') {
      throw new Error(`tar: rejected path-traversal entry (${raw})`);
    }
  }
  return p;
}

function isAllZero(block: Uint8Array): boolean {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}
