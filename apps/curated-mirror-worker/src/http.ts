// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Read-side HTTP routing for the curated mirror.
 *
 * Routes (per contracts/curated-mirror-http.md):
 *   GET /curated/<modelId>/manifest.json   — short cache + ETag
 *   GET /curated/<modelId>/latest.tar.gz   — long immutable cache
 *   GET /curated/<modelId>/archives/<version>.tar.gz
 *
 * Conditional `If-None-Match` 304 handling is not yet implemented; the
 * client's freshness probe still works because manifest fetches are cheap
 * and the proxy cache (max-age=300) absorbs most of them.
 */

import type { Env } from './index.js';
import { CURATED_MODEL_IDS } from '@rune-langium/curated-schema';

const ALLOWED_MODEL_IDS = new Set<string>(CURATED_MODEL_IDS);

/** Match `/curated/<modelId>/<rest>` — segments separated by '/'. */
const PATH_RE = /^\/curated\/([^/]+)\/(.+)$/;

export async function handleCuratedRead(req: Request, env: Env): Promise<Response> {
  const allowedOrigin = env.ALLOWED_ORIGIN;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' }, allowedOrigin);
  }
  const url = new URL(req.url);
  const match = PATH_RE.exec(url.pathname);
  if (!match) return json(404, { error: 'not_found' }, allowedOrigin);

  const [, modelId, rest] = match as unknown as [string, string, string];
  if (!ALLOWED_MODEL_IDS.has(modelId)) {
    return json(404, { error: 'unknown_model_id', modelId }, allowedOrigin);
  }

  const r2Key = `curated/${modelId}/${rest}`;
  let obj;
  try {
    obj = await env.rune_curated_mirror.get(r2Key);
  } catch {
    // Transient R2 read failure — surface 503, not a stack trace.
    return json(503, { error: 'mirror_unavailable' }, allowedOrigin);
  }
  if (!obj) return json(404, { error: 'archive_not_found', modelId, key: rest }, allowedOrigin);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
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

function json(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin
    }
  });
}
