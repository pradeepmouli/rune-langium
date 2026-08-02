// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { configureInstrumentation, type TelemetryRecord } from '../../src/services/instrumentation/core.js';

/**
 * Cloudflare Pages Functions have no Vite import.meta.env.PROD dead-code
 * elimination (Wrangler-built, not Vite-built) — gated at runtime by an
 * env binding instead. console.log(JSON.stringify(...)) is deliberate:
 * Cloudflare Workers Logs already scrapes structured console.log JSON
 * (the same pattern apps/telemetry-worker itself uses post-PR #451), so
 * this needs no new server-side plumbing.
 */
export function installInstrumentationEdgeSink(env: { INSTRUMENTATION_ENABLED?: string }): void {
  if (env.INSTRUMENTATION_ENABLED !== 'true') return;
  configureInstrumentation((record: TelemetryRecord) => {
    console.log(JSON.stringify(record));
  });
}
