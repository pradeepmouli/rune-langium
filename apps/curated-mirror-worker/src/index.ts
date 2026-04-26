// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-mirror Worker entry.
 *
 * Two responsibilities:
 *  - `scheduled`: nightly Cron Trigger; fetches each curated source from
 *    GitHub's codeload archive endpoint and uploads to R2 via `publisher`.
 *  - `fetch`:     same-origin read route at `/curated/<id>/...` serving
 *    manifests + archives back to Studio (handler in `./http.ts`).
 */

import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import { handleCuratedRead } from './http.js';
import { publishCuratedMirrors, type CuratedSource } from './publisher.js';
import { logger } from './log.js';

export interface Env {
  /** R2 bucket binding — matches wrangler.toml [[r2_buckets]].binding. */
  rune_curated_mirror: R2Bucket;
  CURATED_SOURCES: string;
  ALLOWED_ORIGIN: string;
  /**
   * Wrangler `[vars.RETENTION]` is rendered as a top-level string env var
   * named `RETENTION_ARCHIVES_PER_MODEL`, NOT as a nested object — wrangler
   * doesn't preserve nested table shape for runtime env. Keep both forms
   * supported for ops convenience: read the flat name first, fall back to
   * the legacy nested shape if a future wrangler change re-enables it.
   */
  RETENTION_ARCHIVES_PER_MODEL?: string;
  RETENTION?: { ARCHIVES_PER_MODEL?: string };
}

const DEFAULT_RETENTION = 14;

function readRetention(env: Env): number {
  const raw = env.RETENTION_ARCHIVES_PER_MODEL ?? env.RETENTION?.ARCHIVES_PER_MODEL;
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION;
}

function parseSources(env: Env): CuratedSource[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.CURATED_SOURCES);
  } catch (err) {
    // Hard-fail: a Worker that runs the cron with zero sources is
    // operationally indistinguishable from one whose cron is silently
    // disabled. Throwing makes the misconfig loud in CF observability.
    logger.error(
      { err: errMessage(err), raw_preview: String(env.CURATED_SOURCES).slice(0, 256) },
      'curated-mirror.parse-sources.failed'
    );
    throw new Error(`CURATED_SOURCES is not valid JSON: ${errMessage(err)}`);
  }
  if (!Array.isArray(parsed)) {
    logger.error({}, 'curated-mirror.parse-sources.not_array');
    throw new Error('CURATED_SOURCES must be a JSON array');
  }
  return parsed as CuratedSource[];
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const sources = parseSources(env);
    await publishCuratedMirrors({
      sources,
      bucket: env.rune_curated_mirror as unknown as Parameters<
        typeof publishCuratedMirrors
      >[0]['bucket'],
      retention: readRetention(env)
    });
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    return handleCuratedRead(req, env);
  }
};
