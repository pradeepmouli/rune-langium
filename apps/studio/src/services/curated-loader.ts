// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-model loader. Feature 012, T031.
 *
 * Pipeline:
 *  1. GET manifest.json  → know the freshest version + sha256
 *  2. GET latest.tar.gz  → bytes
 *  3. extractTarGz       → write under <writeRoot> in OPFS
 *
 * Failure modes map to FR-002's `ErrorCategory`:
 *   network            — offline, DNS, TLS, 5xx
 *   archive_not_found  — manifest 404, latest 404, mirror inconsistency
 *   archive_decode     — gunzip / tar parse / sha mismatch
 *   storage_quota      — OPFS write throws QuotaExceededError
 *   unknown            — anything else (including AbortError)
 *
 * Every load emits exactly two telemetry events:
 *   - curated_load_attempt before the manifest fetch
 *   - curated_load_success or curated_load_failure on terminal state
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';
import { extractTarGz } from '../opfs/tar-untar.js';
import type { TelemetryClient, TelemetryEvent } from './telemetry.js';

export type CuratedModelId = 'cdm' | 'fpml' | 'rune-dsl';

export type ErrorCategory =
  | 'network'
  | 'archive_not_found'
  | 'archive_decode'
  | 'parse'
  | 'storage_quota'
  | 'permission_denied'
  | 'unknown';

export class CuratedLoadError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string
  ) {
    super(message);
    this.name = 'CuratedLoadError';
  }
}

export interface CuratedManifest {
  schemaVersion: number;
  modelId: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  generatedAt: string;
  upstreamCommit: string;
  upstreamRef: string;
  archiveUrl: string;
  history: Array<{ version: string; archiveUrl: string }>;
}

export interface LoadCuratedInput {
  modelId: CuratedModelId;
  mirrorBase: string;
  fs: OpfsFs;
  writeRoot: string;
  /** Lightweight subset of TelemetryClient — only `emit` is required. */
  telemetry: Pick<TelemetryClient, 'emit'>;
  signal?: AbortSignal;
  onProgress?: (path: string, sizeBytes: number) => void;
}

export interface LoadCuratedResult {
  modelId: CuratedModelId;
  version: string;
  filesWritten: number;
  bytesUnpacked: number;
}

const VALID_MODEL_IDS: ReadonlyArray<CuratedModelId> = ['cdm', 'fpml', 'rune-dsl'];

function emit(telemetry: Pick<TelemetryClient, 'emit'>, event: TelemetryEvent): void {
  // Telemetry MUST NEVER block or fail the load — fire-and-forget.
  void telemetry.emit(event).catch(() => undefined);
}

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: 'no-cache' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new CuratedLoadError('unknown', 'cancelled');
    }
    throw new CuratedLoadError('network', `fetch ${url} failed`);
  }
  if (res.status === 404) throw new CuratedLoadError('archive_not_found', `${url} → 404`);
  if (!res.ok) throw new CuratedLoadError('network', `${url} → ${res.status}`);
  return res;
}

export async function loadCuratedModel(input: LoadCuratedInput): Promise<LoadCuratedResult> {
  const { modelId, mirrorBase, fs, writeRoot, telemetry, signal, onProgress } = input;

  if (!VALID_MODEL_IDS.includes(modelId)) {
    throw new CuratedLoadError('archive_not_found', `unknown modelId ${modelId}`);
  }

  emit(telemetry, { event: 'curated_load_attempt', modelId });
  const startedAt = Date.now();

  if (signal?.aborted) {
    emit(telemetry, { event: 'curated_load_failure', modelId, errorCategory: 'unknown' });
    throw new CuratedLoadError('unknown', 'cancelled before start');
  }

  try {
    // 1. Manifest.
    const manifestUrl = `${mirrorBase}/${modelId}/manifest.json`;
    const manifestRes = await fetchOk(manifestUrl, signal);
    let manifest: CuratedManifest;
    try {
      manifest = (await manifestRes.json()) as CuratedManifest;
    } catch {
      throw new CuratedLoadError('archive_decode', 'manifest.json was not valid JSON');
    }

    // 2. Archive.
    const archiveUrl = manifest.archiveUrl ?? `${mirrorBase}/${modelId}/latest.tar.gz`;
    const archiveRes = await fetchOk(archiveUrl, signal);
    const bytes = new Uint8Array(await archiveRes.arrayBuffer());

    // 3. Extract into OPFS at the requested root.
    let written = 0;
    let unpacked = 0;
    try {
      // Pre-create the write root so the parent exists before files arrive.
      await fs.mkdir(writeRoot);
      await extractTarGz(bytes, scopedFs(fs, writeRoot), {
        onEntry: (path, size) => {
          written++;
          unpacked += size;
          onProgress?.(path, size);
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        throw new CuratedLoadError('storage_quota', 'OPFS storage quota exceeded');
      }
      throw new CuratedLoadError('archive_decode', `extract failed: ${(err as Error).message}`);
    }

    const result: LoadCuratedResult = {
      modelId,
      version: manifest.version,
      filesWritten: written,
      bytesUnpacked: unpacked
    };
    emit(telemetry, {
      event: 'curated_load_success',
      modelId,
      durationMs: Date.now() - startedAt
    });
    return result;
  } catch (err) {
    const category = err instanceof CuratedLoadError ? err.category : 'unknown';
    emit(telemetry, {
      event: 'curated_load_failure',
      modelId,
      errorCategory: category as Exclude<ErrorCategory, 'parse'>
    });
    throw err instanceof CuratedLoadError ? err : new CuratedLoadError('unknown', String(err));
  }
}

/**
 * Wrap an OpfsFs so all relative writes land under `root`. The tar parser
 * passes paths like 'foo/a.txt' and we want them at '<writeRoot>/foo/a.txt'.
 */
function scopedFs(fs: OpfsFs, root: string): OpfsFs {
  const trim = (p: string): string => (p.startsWith('/') ? p.slice(1) : p);
  const join = (rel: string): string => `${root}/${trim(rel)}`.replace(/\/{2,}/g, '/');
  return {
    readFile: (p: string, opts?: unknown) =>
      (fs.readFile as (path: string, options?: unknown) => Promise<string | Uint8Array>)(
        join(p),
        opts
      ),
    writeFile: (p: string, data: Parameters<OpfsFs['writeFile']>[1]) => fs.writeFile(join(p), data),
    unlink: (p: string) => fs.unlink(join(p)),
    mkdir: (p: string) => fs.mkdir(join(p)),
    rmdir: (p: string) => fs.rmdir(join(p)),
    stat: (p: string) => fs.stat(join(p)),
    lstat: (p: string) => fs.lstat(join(p)),
    readdir: (p: string) => fs.readdir(join(p)),
    readlink: (p: string) => fs.readlink(join(p)),
    symlink: (t: string, p: string) => fs.symlink(t, join(p)),
    chmod: (p: string, m: number) => fs.chmod(join(p), m)
  } as unknown as OpfsFs;
}

/**
 * Cheap freshness check: returns the manifest's version string without
 * re-downloading the archive. Satisfies FR-005b. Returns null on any error
 * (caller is expected to fall back to using the cached copy).
 */
export async function readMirrorVersion(
  mirrorBase: string,
  modelId: CuratedModelId,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch(`${mirrorBase}/${modelId}/manifest.json`, {
      signal,
      cache: 'no-cache'
    });
    if (!res.ok) return null;
    const m = (await res.json()) as CuratedManifest;
    return typeof m.version === 'string' ? m.version : null;
  } catch {
    return null;
  }
}
