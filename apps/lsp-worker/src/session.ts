// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * RuneLspSession Durable Object — scaffold for T036.
 *
 * Real implementation lands in T041 per `data-model.md` §1 +
 * `contracts/lsp-worker.md` "LSP messages handled". The DO holds the
 * langium services, the per-document state, and the WebSocket. Hibernation
 * via `acceptWebSocket()` so the connection survives 30s idle without
 * keeping the langium graph in memory.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

export class RuneLspSession {
  // T036 placeholder — real fields appear in T041.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly state: DurableObjectState) {}

  async fetch(_req: Request): Promise<Response> {
    return new Response(JSON.stringify({ error: 'not_implemented', task: 'T041' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
