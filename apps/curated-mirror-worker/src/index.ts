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
  RETENTION: { ARCHIVES_PER_MODEL: string };
}

function parseSources(env: Env): CuratedSource[] {
  try {
    const parsed = JSON.parse(env.CURATED_SOURCES) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CuratedSource[];
  } catch (err) {
    logger.error({ err: String(err) }, 'curated-mirror.parse-sources.failed');
    return [];
  }
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const sources = parseSources(env);
    const retention = parseInt(env.RETENTION?.ARCHIVES_PER_MODEL ?? '14', 10);
    await publishCuratedMirrors({
      sources,
      bucket: env.rune_curated_mirror as unknown as Parameters<
        typeof publishCuratedMirrors
      >[0]['bucket'],
      retention: Number.isFinite(retention) ? retention : 14
    });
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    return handleCuratedRead(req, env);
  }
};
