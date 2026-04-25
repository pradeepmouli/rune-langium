// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Publisher — runs on the Cron schedule.
 *
 * For each curated source:
 *   1. fetch codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{ref}
 *   2. read the response body as bytes
 *   3. SHA-256 the bytes
 *   4. upload to archives/<yyyy-mm-dd>.tar.gz
 *   5. upload to latest.tar.gz (stable URL for clients)
 *   6. write manifest.json with version + sha + history (capped at retention)
 *   7. prune older archives beyond retention
 *
 * If any source fails, the others continue. The result records published
 * vs failed model ids so the scheduled handler can surface them in logs.
 */

import { buildManifest, sha256Hex, type CuratedManifest } from './manifest.js';
import { logger, logPublish } from './log.js';
import type { CuratedModelId } from '@rune-langium/curated-schema';

export interface CuratedSource {
  id: CuratedModelId;
  owner: string;
  repo: string;
  ref: string;
}

export interface MinimalR2Bucket {
  get(
    key: string
  ): Promise<{ arrayBuffer: () => Promise<ArrayBuffer>; text: () => Promise<string> } | null>;
  put(
    key: string,
    body: Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  delete(key: string | string[]): Promise<unknown>;
  list(opts?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
}

export interface PublishOptions {
  sources: CuratedSource[];
  bucket: MinimalR2Bucket;
  /** Max archives kept per modelId. Older ones pruned. */
  retention: number;
  /** Override "today" — used by tests to make assertions deterministic. */
  now?: () => Date;
}

export interface PublishResult {
  published: string[];
  failed: string[];
  manifests: Record<string, CuratedManifest>;
}

const ARCHIVE_BASE = 'https://codeload.github.com';

function todayStr(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function listArchives(bucket: MinimalR2Bucket, modelId: string): Promise<string[]> {
  const prefix = `curated/${modelId}/archives/`;
  const result = await bucket.list({ prefix });
  return result.objects
    .map((o) => o.key)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length).replace(/\.tar\.gz$/, ''))
    .sort();
}

export async function publishCuratedMirrors(options: PublishOptions): Promise<PublishResult> {
  const { sources, bucket, retention } = options;
  const now = options.now?.() ?? new Date();
  const version = todayStr(now);
  const result: PublishResult = { published: [], failed: [], manifests: {} };

  for (const source of sources) {
    const startedAt = Date.now();
    try {
      const url = `${ARCHIVE_BASE}/${source.owner}/${source.repo}/tar.gz/refs/heads/${source.ref}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());

      const archiveKey = `curated/${source.id}/archives/${version}.tar.gz`;
      const latestKey = `curated/${source.id}/latest.tar.gz`;
      const manifestKey = `curated/${source.id}/manifest.json`;

      const sha = await sha256Hex(buf);
      const httpMetadata = { contentType: 'application/gzip' };
      await bucket.put(archiveKey, buf, { httpMetadata });
      await bucket.put(latestKey, buf, { httpMetadata });

      // Determine retained history. Sort old → new, keep the most recent
      // `retention - 1` then append today's version.
      const existing = await listArchives(bucket, source.id);
      const sorted = existing.filter((v) => v !== version).sort();
      const toPrune = sorted.slice(0, Math.max(0, sorted.length - (retention - 1)));
      const kept = sorted.slice(Math.max(0, sorted.length - (retention - 1)));
      const historyVersions = [...kept, version].sort();

      for (const v of toPrune) {
        await bucket.delete(`curated/${source.id}/archives/${v}.tar.gz`);
      }

      const manifest = buildManifest({
        modelId: source.id,
        version,
        sha256: sha,
        sizeBytes: buf.byteLength,
        generatedAt: now.toISOString(),
        upstreamCommit: '',
        upstreamRef: source.ref,
        historyVersions
      });
      await bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' }
      });

      result.published.push(source.id);
      result.manifests[source.id] = manifest;
      logPublish({
        modelId: source.id,
        status: 'published',
        durationMs: Date.now() - startedAt,
        sizeBytes: buf.byteLength,
        archivesPruned: toPrune.length
      });
    } catch (err) {
      // Log the cause — a bare `result.failed.push` makes a publisher bug
      // (TypeError, R2 5xx, sha256 failure) operationally indistinguishable
      // from "GitHub was down."
      logger.error(
        {
          model_id: source.id,
          err:
            err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err
        },
        'curated-mirror.publish.failed'
      );
      result.failed.push(source.id);
      logPublish({
        modelId: source.id,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        errorCategory: err instanceof Error ? err.name : 'unknown'
      });
    }
  }

  return result;
}
