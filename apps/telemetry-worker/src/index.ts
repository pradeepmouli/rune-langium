// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Telemetry ingest Worker (T003 skeleton).
 *
 * Real schema validation + DO routing land in T110. Today this just
 * exposes the DO class export and a 501 stub fetch handler so wrangler
 * can deploy the migration.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

export interface Env {
  TELEMETRY: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
}

/**
 * Per-day aggregator. T110 fills in the counter logic; for now it just
 * exists so the v1 DO migration in wrangler.toml has a class to attach.
 */
export class TelemetryAggregator {
  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(_req: Request): Promise<Response> {
    return new Response('not_implemented', { status: 501 });
  }
}

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'not_implemented',
        message: 'telemetry-worker scaffold; T110 fills this in'
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
