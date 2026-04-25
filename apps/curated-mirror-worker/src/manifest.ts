// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-mirror manifest builder. Feature 012, T026.
 * Schema source of truth: data-model.md §3 + contracts/curated-mirror-http.md.
 */

export interface CuratedManifest {
  schemaVersion: 1;
  modelId: string;
  /** yyyy-mm-dd, monotonically increasing. */
  version: string;
  /** SHA-256 of latest.tar.gz, hex. */
  sha256: string;
  /** Size of latest.tar.gz in bytes. */
  sizeBytes: number;
  /** ISO-8601 UTC. */
  generatedAt: string;
  /** Upstream commit SHA (best-effort; falsy when unavailable). */
  upstreamCommit: string;
  /** Upstream branch / tag. */
  upstreamRef: string;
  /** Public archive URL. */
  archiveUrl: string;
  /** Most recent date-stamped archive URLs, oldest-first, capped at retention. */
  history: Array<{ version: string; archiveUrl: string }>;
}

export interface BuildManifestInput {
  modelId: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  generatedAt: string;
  upstreamCommit: string;
  upstreamRef: string;
  /** Existing archive versions in R2 for this modelId, oldest-first (≥ retention windows are pruned by the publisher before this is called). */
  historyVersions: string[];
}

const PUBLIC_ROOT = 'https://www.daikonic.dev/curated';

export function buildManifest(input: BuildManifestInput): CuratedManifest {
  return {
    schemaVersion: 1,
    modelId: input.modelId,
    version: input.version,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    generatedAt: input.generatedAt,
    upstreamCommit: input.upstreamCommit,
    upstreamRef: input.upstreamRef,
    archiveUrl: `${PUBLIC_ROOT}/${input.modelId}/latest.tar.gz`,
    history: input.historyVersions.map((v) => ({
      version: v,
      archiveUrl: `${PUBLIC_ROOT}/${input.modelId}/archives/${v}.tar.gz`
    }))
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const dataBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const buf = await crypto.subtle.digest('SHA-256', dataBuffer as ArrayBuffer);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return hex;
}
