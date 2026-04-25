// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-model loader.
 *
 * Pipeline:
 *  1. GET manifest.json  → schema-validated; `sha256` and `version` extracted.
 *  2. GET latest.tar.gz  → bytes (URL is always derived from `mirrorBase`;
 *     the manifest's own `archiveUrl` is informational, not trusted).
 *  3. SHA-256 verification — bytes MUST match `manifest.sha256` before
 *     extraction starts.
 *  4. extractTarGz       → write under `<writeRoot>` in OPFS.
 *
 * Failure modes map 1:1 to `ErrorCategory` in @rune-langium/curated-schema.
 * Every load emits `curated_load_attempt` on entry plus exactly one of
 * `curated_load_success` / `curated_load_failure` on terminal state. The
 * telemetry path is fire-and-forget — telemetry MUST NEVER block the load.
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';
import { extractTarGz } from '../opfs/tar-untar.js';
import type { TelemetryClient, TelemetryEvent } from './telemetry.js';
import {
  CURATED_MODEL_IDS,
  parseManifest,
  type CuratedManifest,
  type CuratedModelId,
  type ErrorCategory
} from '@rune-langium/curated-schema';

export type { CuratedModelId, CuratedManifest, ErrorCategory };

export class CuratedLoadError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string
  ) {
    super(message);
    this.name = 'CuratedLoadError';
  }
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

const VALID_MODEL_IDS = new Set<string>(CURATED_MODEL_IDS);

function emit(telemetry: Pick<TelemetryClient, 'emit'>, event: TelemetryEvent): void {
  // Telemetry MUST NEVER block or fail the load — fire-and-forget.
  void telemetry.emit(event).catch(() => undefined);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  let hex = '';
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function isQuotaExceeded(err: unknown): boolean {
  return err instanceof Error && err.name === 'QuotaExceededError';
}

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: 'no-cache' });
  } catch (err) {
    if (isAbortError(err)) throw new CuratedLoadError('cancelled', 'load cancelled');
    throw new CuratedLoadError('network', `fetch ${url} failed`);
  }
  if (res.status === 404) throw new CuratedLoadError('archive_not_found', `${url} → 404`);
  if (!res.ok) throw new CuratedLoadError('network', `${url} → ${res.status}`);
  return res;
}

export async function loadCuratedModel(input: LoadCuratedInput): Promise<LoadCuratedResult> {
  const { modelId, mirrorBase, fs, writeRoot, telemetry, signal, onProgress } = input;

  if (!VALID_MODEL_IDS.has(modelId)) {
    throw new CuratedLoadError('archive_not_found', `unknown modelId ${modelId}`);
  }

  emit(telemetry, { event: 'curated_load_attempt', modelId });
  const startedAt = Date.now();

  if (signal?.aborted) {
    emit(telemetry, { event: 'curated_load_failure', modelId, errorCategory: 'cancelled' });
    throw new CuratedLoadError('cancelled', 'cancelled before start');
  }

  try {
    // 1. Manifest.
    const manifestUrl = `${mirrorBase}/${modelId}/manifest.json`;
    const manifestRes = await fetchOk(manifestUrl, signal);
    let rawJson: unknown;
    try {
      rawJson = await manifestRes.json();
    } catch {
      throw new CuratedLoadError('archive_decode', 'manifest.json was not valid JSON');
    }
    const parsed = parseManifest(rawJson);
    if (!parsed.ok) {
      throw new CuratedLoadError('archive_decode', `manifest schema violation: ${parsed.reason}`);
    }
    const manifest = parsed.manifest;

    // 2. Archive — always derive the URL from mirrorBase. The manifest's
    // own `archiveUrl` field is informational only; trusting it would let a
    // tampered manifest redirect us to fetch attacker bytes.
    const archiveUrl = `${mirrorBase}/${modelId}/latest.tar.gz`;
    const archiveRes = await fetchOk(archiveUrl, signal);
    const bytes = new Uint8Array(await archiveRes.arrayBuffer());

    // Verify the bytes match the manifest's claimed sha256 BEFORE feeding
    // them to the tar parser. The schema already enforces the regex shape.
    const observed = await sha256Hex(bytes);
    if (observed.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new CuratedLoadError(
        'archive_decode',
        `sha256 mismatch (manifest=${manifest.sha256.slice(0, 8)}…, observed=${observed.slice(0, 8)}…)`
      );
    }

    // 3. Extract into OPFS at the requested root.
    let written = 0;
    let unpacked = 0;
    try {
      await fs.mkdir(writeRoot);
      await extractTarGz(bytes, fs, {
        pathPrefix: writeRoot,
        onEntry: (path, size) => {
          written++;
          unpacked += size;
          onProgress?.(path, size);
        }
      });
    } catch (err) {
      if (isQuotaExceeded(err)) {
        throw new CuratedLoadError('storage_quota', 'OPFS storage quota exceeded');
      }
      if (err instanceof Error && err.name === 'NotAllowedError') {
        throw new CuratedLoadError('permission_denied', 'OPFS permission denied');
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
    const category: ErrorCategory = err instanceof CuratedLoadError ? err.category : 'unknown';
    emit(telemetry, { event: 'curated_load_failure', modelId, errorCategory: category });
    if (err instanceof CuratedLoadError) throw err;
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    throw new CuratedLoadError('unknown', message);
  }
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
