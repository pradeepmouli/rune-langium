// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { DurableObjectState } from '@cloudflare/workers-types';

/**
 * CodegenContainer — Durable Object lifecycle class required by wrangler
 * to link the `[[containers]]` binding to a named DO class.
 *
 * In production (CF Containers beta) this class manages the container
 * lifecycle and proxies requests to the running container process.
 * In local dev (`[dev] enable_containers = false`) it is never instantiated.
 *
 * The actual request routing goes through `env.CODEGEN.fetch()` (the
 * container binding in `index.ts`), NOT through this DO namespace directly.
 */
export class CodegenContainer {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    // In production, CF Containers routes requests to the container process
    // before this handler runs. If we somehow receive a fetch here, forward
    // it to the container via the runtime-provided ctx.container API.
    // This path is unreachable in local dev (enable_containers = false).
    const container = (
      this.state as unknown as { container?: { fetch(r: Request): Promise<Response> } }
    ).container;
    if (container) {
      return container.fetch(request);
    }
    return new Response(JSON.stringify({ error: 'container_unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
