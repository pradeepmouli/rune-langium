// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated-mirror Worker entry (T001 skeleton).
 *
 * Real publisher logic lands in T026. This file just exposes the
 * `scheduled` handler so wrangler can deploy something today.
 */

import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import { handleCuratedRead } from './http.js';

export interface Env {
  /** R2 bucket binding — matches wrangler.toml [[r2_buckets]].binding. */
  rune_curated_mirror: R2Bucket;
  CURATED_SOURCES: string;
  RETENTION: { ARCHIVES_PER_MODEL: string };
}

export default {
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    // T026 will replace this with the real publisher loop.
    return;
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    return handleCuratedRead(req, env);
  }
};
