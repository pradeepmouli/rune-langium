// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LSP Worker entry — scaffold for T036.
 *
 * Routes implemented in T039:
 *   POST /rune-studio/api/lsp/session   — mint HMAC-signed session token
 *   GET  /rune-studio/api/lsp/health    — reachability + langium-load probe
 *   WS   /rune-studio/api/lsp/ws/<tok>  — upgrade + forward to RuneLspSession DO
 *
 * The DO class is exported here so `wrangler.toml`'s
 * `[[durable_objects.bindings]] class_name = "RuneLspSession"` can resolve it.
 */

import { RuneLspSession } from './session.js';

export { RuneLspSession };

export interface Env {
  LSP_SESSION: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  /** HMAC-SHA256 secret for session token signing. Set via `wrangler secret put`. */
  SESSION_SIGNING_KEY?: string;
}

// T036 stub — real implementation lands in T039.
export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response(JSON.stringify({ error: 'not_implemented', task: 'T039' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
