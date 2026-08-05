// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * apps/lsp-worker/ is now a DO-only Worker (spec 019 Phase 3).
 *
 * All HTTP route handlers that used to live here (`POST /api/lsp/session`,
 * `GET /api/lsp/health`, `GET /api/lsp/ws/<token>` — plus the `./auth.ts`
 * token/origin/nonce layer and the `./log.ts` structured logger they used)
 * were migrated to Cloudflare Pages Functions at
 * `apps/studio/functions/api/lsp/*` (backed by `apps/studio/functions/lib/`)
 * and have been removed from this package.
 *
 * This Worker now exists solely to host the `RuneLspSession` Durable Object
 * class that the Pages Functions bind to via `apps/studio/wrangler.toml`'s
 * `[[durable_objects.bindings]]` (`script_name = "rune-lsp-worker"`).
 * Cloudflare Pages cannot host Durable Objects itself — only bind to a
 * Worker that owns the namespace — so this Worker process must stay
 * deployed even though it no longer serves any HTTP routes directly.
 *
 * `[[routes]]` was removed from `wrangler.toml`, so no public traffic
 * should reach `fetch()` below; it 404s as defence-in-depth against
 * misconfiguration.
 */

export { RuneLspSession } from './session.js';

export default {
  async fetch(): Promise<Response> {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} satisfies ExportedHandler;
