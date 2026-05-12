// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Server-side curated bundle fetcher for the /api/parse Pages Function.
 *
 * Fetches a curated archive from the mirror and extracts `.rosetta` files,
 * then parses each document through Langium to build the same CuratedDocument
 * shape the browser path produces.
 *
 * The tar walker is lifted from apps/curated-mirror-worker/src/serialized-artifact.ts —
 * that code was purpose-built for a Workers-compatible environment (no browser
 * APIs, pure TypeScript + pako).
 */

import { inflate } from 'pako';
import { createRuneDslServices } from '@rune-langium/core';
import type { RosettaModel } from '@rune-langium/core';
import { EmptyFileSystem, URI, type AstNode, type LangiumDocument } from 'langium';

const CURATED_MIRROR_BASE = 'https://www.daikonic.dev/curated';

const BLOCK = 512;

export interface CuratedDocument {
  uri: string;
  content: string;
  serializedModel: string;
  exports: Array<{ type: string; name: string; path: string }>;
}

export class CuratedBundleUnavailableError extends Error {
  constructor(
    public readonly bundleId: string,
    public readonly version: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(`curated_bundle_unavailable: ${bundleId}@${version}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'CuratedBundleUnavailableError';
  }
}

/**
 * Per-isolate cache keyed by `${id}@${version}`. Cloudflare Pages Functions
 * reuse the same isolate across many requests, so without a cache the
 * debounced editor reparse (~every keystroke) would re-fetch + re-inflate +
 * re-parse the entire CDM corpus on every call, exceeding Pages CPU/memory
 * budgets and hanging the editor.
 *
 * Pinned versions are content-addressable (immutable) so we cache the parsed
 * result indefinitely for the isolate's lifetime. `latest` is intentionally
 * NOT cached because its content can shift under us.
 *
 * We cache the Promise (not the resolved value) so concurrent requests for
 * the same bundle dedupe to a single fetch+parse instead of stampeding the
 * curated-mirror. On failure we evict the entry so the next request retries.
 */
const bundleCache = new Map<string, Promise<CuratedDocument[]>>();

export async function fetchCuratedBundle(id: string, version: string): Promise<CuratedDocument[]> {
  const cacheable = version !== 'latest';
  const cacheKey = `${id}@${version}`;
  if (cacheable) {
    const hit = bundleCache.get(cacheKey);
    if (hit) return hit;
  }

  const work = fetchAndParseBundle(id, version);
  if (cacheable) {
    bundleCache.set(cacheKey, work);
    work.catch(() => {
      // Don't pin a failed fetch in the cache — let the next request retry.
      if (bundleCache.get(cacheKey) === work) {
        bundleCache.delete(cacheKey);
      }
    });
  }
  return work;
}

async function fetchAndParseBundle(id: string, version: string): Promise<CuratedDocument[]> {
  const url =
    version === 'latest'
      ? `${CURATED_MIRROR_BASE}/${id}/latest.tar.gz`
      : `${CURATED_MIRROR_BASE}/${id}/archives/${version}.tar.gz`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new CuratedBundleUnavailableError(id, version, undefined, err);
  }
  if (!res.ok) {
    throw new CuratedBundleUnavailableError(id, version, res.status);
  }

  const gzBuffer = new Uint8Array(await res.arrayBuffer());
  let tarBuffer: Uint8Array;
  try {
    tarBuffer = inflate(gzBuffer);
  } catch (err) {
    throw new CuratedBundleUnavailableError(id, version, undefined, err);
  }

  return walkTarEntries(tarBuffer, id, version);
}

// ── Tar walker ────────────────────────────────────────────────────────────────
// Lifted from apps/curated-mirror-worker/src/serialized-artifact.ts with minor
// adaptations: instead of calling a serializer on the bundled Langium instance,
// we run a fresh service here (same pattern as apps/studio/functions/api/parse.ts).

interface TarEntry {
  path: string;
  size: number;
  typeflag: string;
  dataOffset: number;
}

function isAllZero(block: Uint8Array): boolean {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}

function parseTarEntry(block: Uint8Array, dataOffset: number): TarEntry {
  const decoder = new TextDecoder('utf-8');
  const slice = (start: number, end: number): string => {
    const sub = block.subarray(start, end);
    let last = sub.length;
    while (last > 0 && sub[last - 1] === 0) last--;
    return decoder.decode(sub.subarray(0, last));
  };

  const name = slice(0, 100);
  const sizeOctal = slice(124, 136).trim();
  const typeflag = slice(156, 157) || '\0';
  const prefix = slice(345, 500);
  const size = sizeOctal.length > 0 ? parseInt(sizeOctal, 8) : 0;
  const rawPath = prefix.length > 0 ? `${prefix}/${name}` : name;

  return {
    path: cleanPath(rawPath),
    size,
    typeflag,
    dataOffset
  };
}

function cleanPath(raw: string): string {
  let path = raw;
  if (path.startsWith('./')) path = path.slice(2);
  if (path.endsWith('/')) path = path.slice(0, -1);
  if (path.length === 0) return '';
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error(`tar: rejected unsafe path (${raw})`);
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`tar: rejected path-traversal entry (${raw})`);
    }
  }
  return path;
}

function readRosettaFilesFromTar(tar: Uint8Array): Array<{ path: string; content: string }> {
  const decoder = new TextDecoder('utf-8');
  const files: Array<{ path: string; content: string }> = [];

  let offset = 0;
  while (offset + BLOCK <= tar.byteLength) {
    const headerBlock = tar.subarray(offset, offset + BLOCK);
    if (isAllZero(headerBlock)) break;
    const entry = parseTarEntry(headerBlock, offset + BLOCK);
    offset += BLOCK;

    const dataBlocks = Math.ceil(entry.size / BLOCK);
    const dataEnd = entry.dataOffset + entry.size;

    if (entry.typeflag === '0' || entry.typeflag === '\0' || entry.typeflag === '') {
      if (entry.path.endsWith('.rosetta')) {
        files.push({
          path: entry.path,
          content: decoder.decode(tar.subarray(entry.dataOffset, dataEnd))
        });
      }
    } else if (entry.typeflag === '5' || entry.typeflag === 'g' || entry.typeflag === 'x') {
      // Directories and PAX headers — skip.
    } else if (entry.typeflag === '1' || entry.typeflag === '2') {
      throw new Error(`tar: links not supported (path=${entry.path})`);
    } else {
      throw new Error(`tar: unsupported typeflag '${entry.typeflag}' (path=${entry.path})`);
    }

    offset += dataBlocks * BLOCK;
  }

  return files;
}

async function walkTarEntries(tarBuffer: Uint8Array, bundleId: string, _version: string): Promise<CuratedDocument[]> {
  const rosettaFiles = readRosettaFilesFromTar(tarBuffer);
  if (rosettaFiles.length === 0) {
    return [];
  }

  // Parse through Langium — same pattern as apps/studio/functions/api/parse.ts
  const { RuneDsl } = createRuneDslServices(EmptyFileSystem);
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;
  const serializer = RuneDsl.serializer.JsonSerializer;

  const docs: LangiumDocument<AstNode>[] = rosettaFiles.map((file) =>
    factory.fromString(file.content, URI.parse(`file:///${bundleId}/${file.path}`))
  );
  await builder.build(docs, { validation: false });

  const result: CuratedDocument[] = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    const file = rosettaFiles[i]!;
    const model = doc.parseResult.value as RosettaModel | undefined;
    if (!model) continue;

    const serializedModel = serializer.serialize(model);

    // Build exports from model elements — mirrors serialized-artifact.ts logic.
    const exports: Array<{ type: string; name: string; path: string }> = [];
    const rawName = model.name as string;
    const namespace = rawName ? rawName.replace(/^"|"$/g, '') : '';

    for (const elem of model.elements) {
      const e = elem as { $type: string; name?: string };
      if (e.name) {
        exports.push({
          type: e.$type,
          name: e.name,
          path: namespace ? `${namespace}.${e.name}` : e.name
        });
      }
    }

    // Emit the URI as a bare path (no `file://`) so the browser worker's
    // deferredModelJson key matches what linkDocument(filePath) looks up.
    result.push({
      uri: `${bundleId}/${file.path}`,
      content: file.content,
      serializedModel,
      exports
    });
  }

  return result;
}
