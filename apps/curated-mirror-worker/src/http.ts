// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Read-side HTTP routing for the curated mirror (T008 scaffold).
 *
 * Routes (per contracts/curated-mirror-http.md):
 *   GET /curated/<modelId>/manifest.json
 *   GET /curated/<modelId>/latest.tar.gz
 *   GET /curated/<modelId>/archives/<version>.tar.gz
 *
 * This file lays out the routing skeleton + R2 read scaffolding. T028 fills
 * in conditional-fetch (ETag / If-None-Match), Content-Length passthrough,
 * and the full failure-mode catalogue from the contract.
 */

import type { Env } from './index.js';

const ALLOWED_MODEL_IDS = new Set(['cdm', 'fpml', 'rune-dsl']);
const ALLOWED_ORIGIN = 'https://www.daikonic.dev';

/** Match `/curated/<modelId>/<rest>` — segments separated by '/'. */
const PATH_RE = /^\/curated\/([^/]+)\/(.+)$/;

export async function handleCuratedRead(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' });
  }
  const url = new URL(req.url);
  const match = PATH_RE.exec(url.pathname);
  if (!match) return json(404, { error: 'not_found' });

  const [, modelId, rest] = match as unknown as [string, string, string];
  if (!ALLOWED_MODEL_IDS.has(modelId)) {
    return json(404, { error: 'unknown_model_id', modelId });
  }

  const r2Key = `curated/${modelId}/${rest}`;
  const obj = await env.rune_curated_mirror.get(r2Key);
  if (!obj) return json(404, { error: 'archive_not_found', modelId, key: rest });

  // Defaults; T028 specialises by route (manifest gets max-age=300 + ETag,
  // archives get max-age=86400 + immutable).
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  headers.set('Vary', 'Origin');
  if (rest.endsWith('manifest.json')) {
    headers.set('Cache-Control', 'public, max-age=300');
    headers.set('Content-Type', 'application/json; charset=utf-8');
  } else if (rest.endsWith('.tar.gz')) {
    headers.set('Cache-Control', 'public, max-age=86400, immutable');
    headers.set('Content-Type', 'application/gzip');
  }
  headers.set('ETag', obj.httpEtag);

  return new Response(req.method === 'HEAD' ? null : obj.body, {
    status: 200,
    headers
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN
    }
  });
}
