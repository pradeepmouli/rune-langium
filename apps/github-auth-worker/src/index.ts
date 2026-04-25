// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitHub Device-Flow auth mediator (T002 skeleton).
 *
 * Real device-init / device-poll routes land in T052. This file just
 * exposes a 404-everything fetch handler so wrangler can deploy.
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_ORIGIN: string;
}

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'not_implemented',
        message: 'github-auth-worker scaffold; T052 fills this in'
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
