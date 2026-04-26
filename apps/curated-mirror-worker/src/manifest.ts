// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-mirror manifest builder. Schema is the single source of truth in
 * `@rune-langium/curated-schema`; this module builds and writes records that
 * conform to it.
 */

import type { CuratedManifest, CuratedModelId } from '@rune-langium/curated-schema';

export type { CuratedManifest };

export interface BuildManifestInput {
  modelId: CuratedModelId;
  version: string;
  sha256: string;
  sizeBytes: number;
  generatedAt: string;
  upstreamCommit: string;
  upstreamRef: string;
  /** Existing archive versions in R2 for this modelId, oldest-first. */
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
