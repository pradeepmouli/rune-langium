// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Codegen Worker entry (feature 011-export-code-cf).
 *
 * Routing skeleton (T009). Real Turnstile / rate-limit / container
 * orchestration lands in T018 / T024 / T025 — handlers here are
 * deliberately minimal stubs so the routing contract can be tested
 * in isolation and refined without churning the router.
 */

import type { WorkerEnv } from './types.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

/**
 * Router entry — exported for direct unit-testing (see test/routing.test.ts).
 * The default export in `fetch` wires this into the CF Worker runtime.
 */
export async function handleRequest(req: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/rune-studio/, ''); // allow both /api/generate and /rune-studio/api/generate

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (path === '/api/generate/health') {
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    return handleHealth(req, env);
  }

  if (path === '/api/generate') {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    return handleGenerate(req, env);
  }

  return json(404, { error: 'not_found' });
}

/**
 * Stub health handler. T024 replaces this with cached-language-list fallback
 * and cold_start_likely signaling backed by KV.
 */
async function handleHealth(_req: Request, env: WorkerEnv): Promise<Response> {
  try {
    const upstream = await env.CODEGEN.fetch(
      new Request('http://codegen/api/generate/health', { method: 'GET' })
    );
    if (!upstream.ok) {
      return json(503, { status: 'unavailable', message: 'upstream health failed' });
    }
    // Passthrough the container's response body for now; T024 enriches with
    // cold_start_likely timing heuristics and KV-cached fallback.
    const body = await upstream.text();
    return new Response(body, { status: 200, headers: JSON_HEADERS });
  } catch (_err) {
    return json(503, {
      status: 'unavailable',
      message: 'The code generation service is temporarily unavailable.'
    });
  }
}

/**
 * Stub generate handler. T018 replaces this with full Turnstile → DO → Container
 * orchestration. For now it forwards verbatim to the container binding so the
 * routing skeleton tests can exercise the happy path.
 */
async function handleGenerate(req: Request, env: WorkerEnv): Promise<Response> {
  try {
    const upstream = await env.CODEGEN.fetch(
      new Request('http://codegen/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await req.text()
      })
    );
    const body = await upstream.text();
    return new Response(body, { status: upstream.status, headers: JSON_HEADERS });
  } catch (_err) {
    return json(502, { error: 'upstream_failure', message: 'stub path — container unreachable' });
  }
}

export default {
  fetch: handleRequest
};
