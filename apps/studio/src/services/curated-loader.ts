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
  parseSerializedWorkspaceArtifact,
  parseManifest,
  type CuratedSerializedWorkspaceArtifact,
  type CuratedManifest,
  type CuratedModelId,
  type ErrorCategory
} from '@rune-langium/curated-schema';
import { inflate } from 'pako';

export type { CuratedSerializedWorkspaceArtifact, CuratedModelId, CuratedManifest, ErrorCategory };

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
  serializedWorkspace?: CuratedSerializedWorkspaceArtifact;
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
  return hasErrorName(err, 'AbortError');
}

function isQuotaExceeded(err: unknown): boolean {
  return hasErrorName(err, 'QuotaExceededError');
}

/**
 * Walk the Error.cause chain looking for an entry whose `.name` matches.
 * The tar parser re-throws with extra path attribution but preserves
 * the original DOMException as `cause`, so we must inspect both.
 */
function hasErrorName(err: unknown, name: string): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur; depth++) {
    if (cur instanceof Error && cur.name === name) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
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

async function tryLoadSerializedWorkspaceArtifact(
  manifest: CuratedManifest,
  mirrorBase: string,
  modelId: CuratedModelId,
  signal?: AbortSignal
): Promise<CuratedSerializedWorkspaceArtifact | undefined> {
  const artifactRef = manifest.artifacts?.serializedWorkspace;
  if (!artifactRef) return undefined;

  const artifactUrl = `${mirrorBase}/${modelId}/latest.serialized.json.gz`;
  const response = await fetchOk(artifactUrl, signal);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const observed = await sha256Hex(bytes);
  if (observed.toLowerCase() !== artifactRef.sha256.toLowerCase()) {
    throw new CuratedLoadError(
      'archive_decode',
      `serialized artifact sha256 mismatch (manifest=${artifactRef.sha256.slice(0, 8)}…, observed=${observed.slice(0, 8)}…)`
    );
  }

  let jsonText: string;
  try {
    jsonText = new TextDecoder('utf-8').decode(inflate(bytes));
  } catch (err) {
    throw new CuratedLoadError(
      'archive_decode',
      `serialized artifact gunzip failed: ${errMessage(err)}`
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(jsonText);
  } catch {
    throw new CuratedLoadError('archive_decode', 'serialized artifact was not valid JSON');
  }

  const parsed = parseSerializedWorkspaceArtifact(rawJson);
  if (!parsed.ok) {
    throw new CuratedLoadError(
      'archive_decode',
      `serialized artifact schema violation: ${parsed.reason}`
    );
  }

  return parsed.artifact;
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
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await archiveRes.arrayBuffer());
    } catch (err) {
      // arrayBuffer() failures (mid-download network drop, browser
      // decompression failure, length mismatch) are network problems,
      // not archive problems. fetchOk() only catches the initial fetch.
      if (isAbortError(err)) {
        throw new CuratedLoadError('cancelled', 'load cancelled');
      }
      throw new CuratedLoadError('network', `download ${archiveUrl} interrupted`);
    }

    // SECURITY INVARIANT: bytes are NEVER passed to extractTarGz unless
    // the SHA matches the manifest. The tar parser is hardened, but
    // treating the archive as untrusted input until the digest matches
    // is the actual mitigation here.
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
      // FR-002 categories must distinguish user-actionable cases. Quota
      // and permission are explicit; anything else here we cannot map to
      // a specific category from the path traversed (we already passed
      // SHA verification, so the bytes are not a decode failure). Bucket
      // it as `unknown` — the user will see "Something went wrong" and
      // the telemetry counter will reflect the rare path correctly.
      if (isAbortError(err)) {
        throw new CuratedLoadError('cancelled', 'load cancelled');
      }
      if (isQuotaExceeded(err)) {
        throw new CuratedLoadError('storage_quota', 'OPFS storage quota exceeded');
      }
      if (hasErrorName(err, 'NotAllowedError')) {
        throw new CuratedLoadError('permission_denied', 'OPFS permission denied');
      }
      throw new CuratedLoadError('unknown', `extract failed: ${errMessage(err)}`);
    }

    let serializedWorkspace: CuratedSerializedWorkspaceArtifact | undefined;
    if (manifest.artifacts?.serializedWorkspace) {
      try {
        serializedWorkspace = await tryLoadSerializedWorkspaceArtifact(
          manifest,
          mirrorBase,
          modelId,
          signal
        );
      } catch (err) {
        console.warn(
          '[curated-loader] serialized workspace artifact unavailable; falling back to source parse',
          err
        );
      }
    }

    const result: LoadCuratedResult = {
      modelId,
      version: manifest.version,
      filesWritten: written,
      bytesUnpacked: unpacked,
      serializedWorkspace
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
 * re-downloading the archive.
 *
 * The result is a discriminated union so callers can distinguish the
 * three observable states — they drive different stale-while-revalidate
 * behaviour:
 *   - `ok`           → mirror is reachable; serve fresh / refresh cache
 *   - `unreachable`  → mirror or network is down; keep cached copy silently
 *   - `malformed`    → mirror responded but the manifest is broken; surface
 *                      an "update prompt failed" toast so the user knows
 *                      the cache may now be stale relative to upstream
 */
export type ReadMirrorVersionResult =
  | { kind: 'ok'; version: string }
  | { kind: 'unreachable' }
  | { kind: 'malformed' };

export async function readMirrorVersion(
  mirrorBase: string,
  modelId: CuratedModelId,
  signal?: AbortSignal
): Promise<ReadMirrorVersionResult> {
  let res: Response;
  try {
    res = await fetch(`${mirrorBase}/${modelId}/manifest.json`, {
      signal,
      cache: 'no-cache'
    });
  } catch {
    return { kind: 'unreachable' };
  }
  if (!res.ok) return { kind: 'unreachable' };
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { kind: 'malformed' };
  }
  // Use the canonical schema: a malformed manifest is observably distinct
  // from "we couldn't reach the mirror" and must drive different UX.
  const parsed = parseManifest(raw);
  if (!parsed.ok) return { kind: 'malformed' };
  return { kind: 'ok', version: parsed.manifest.version };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
