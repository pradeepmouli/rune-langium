// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Read-side HTTP routing for the curated mirror.
 *
 * Routes (per contracts/curated-mirror-http.md):
 *   GET /curated/<modelId>/manifest.json   — short cache + ETag, 304 on If-None-Match match
 *   GET /curated/<modelId>/latest.tar.gz   — long immutable cache
 *   GET /curated/<modelId>/archives/<version>.tar.gz
 *
 * CORS headers are emitted on every response (success and error); the
 * studio client lives at the same origin in prod but other consumers
 * benefit from explicit allowlist. Every read writes a structured log
 * line so the SC-008 observability claim is verifiable.
 */

import type { Env } from './index.js';
import { CURATED_MODEL_IDS } from '@rune-langium/curated-schema';
import { logger, logRead } from './log.js';

const ALLOWED_MODEL_IDS = new Set<string>(CURATED_MODEL_IDS);
const PATH_RE = /^\/curated\/([^/]+)\/(.+)$/;

export async function handleCuratedRead(req: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const allowedOrigin = env.ALLOWED_ORIGIN;
  const method = req.method;
  const path = url.pathname;

  function done(res: Response, cacheHit?: boolean): Response {
    logRead({
      method,
      path,
      status: res.status,
      durationMs: Date.now() - startedAt,
      cacheHit
    });
    return res;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return done(json(405, { error: 'method_not_allowed' }, allowedOrigin));
  }
  const match = PATH_RE.exec(path);
  if (!match) return done(json(404, { error: 'not_found' }, allowedOrigin));

  const [, modelId, rest] = match as unknown as [string, string, string];
  if (!ALLOWED_MODEL_IDS.has(modelId)) {
    return done(json(404, { error: 'unknown_model_id', modelId }, allowedOrigin));
  }

  const r2Key = `curated/${modelId}/${rest}`;
  let obj;
  try {
    obj = await env.rune_curated_mirror.get(r2Key);
  } catch (err) {
    logger.error({ r2_key: r2Key, err: errMessage(err) }, 'curated-mirror.read.r2_failed');
    return done(json(503, { error: 'mirror_unavailable' }, allowedOrigin));
  }
  if (!obj) {
    return done(json(404, { error: 'archive_not_found', modelId, key: rest }, allowedOrigin));
  }

  const isManifest = rest.endsWith('manifest.json');
  const isArchive = rest.endsWith('.tar.gz');
  const isLatestSerializedArtifact = rest.endsWith('latest.serialized.json.gz');
  const isVersionedSerializedArtifact = /artifacts\/.+\.serialized\.json\.gz$/.test(rest);
  let cacheControl: string | null = null;
  if (isManifest) cacheControl = 'public, max-age=300';
  else if (isArchive) cacheControl = 'public, max-age=86400, immutable';
  else if (isLatestSerializedArtifact) cacheControl = 'public, max-age=300';
  else if (isVersionedSerializedArtifact) cacheControl = 'public, max-age=86400, immutable';

  // Conditional GET — return 304 with no body if If-None-Match matches.
  // Manifest probes from the studio's stale-while-revalidate path are
  // hot; 304s drop the response body cost to near-zero.
  const ifNoneMatch = req.headers.get('If-None-Match');
  if (ifNoneMatch && etagMatches(ifNoneMatch, obj.httpEtag)) {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Vary', 'Origin');
    headers.set('ETag', obj.httpEtag);
    if (cacheControl) headers.set('Cache-Control', cacheControl);
    return done(new Response(null, { status: 304, headers }), true);
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Vary', 'Origin');
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  if (isManifest) headers.set('Content-Type', 'application/json; charset=utf-8');
  else if (isArchive) headers.set('Content-Type', 'application/gzip');
  else if (isLatestSerializedArtifact || isVersionedSerializedArtifact) {
    headers.set('Content-Type', 'application/gzip');
  }
  headers.set('ETag', obj.httpEtag);

  return done(new Response(method === 'HEAD' ? null : obj.body, { status: 200, headers }), false);
}

/**
 * Match an `If-None-Match` header against an object's `httpEtag`.
 * Per RFC 7232, the header may carry a list of etags or `*`. We
 * accept either an exact match or a `W/"..."` weak-tag equivalent.
 */
function etagMatches(ifNoneMatch: string, etag: string): boolean {
  if (ifNoneMatch.trim() === '*') return true;
  const candidates = ifNoneMatch
    .split(',')
    .map((s) => s.trim())
    .map((s) => s.replace(/^W\//, ''));
  const stripped = etag.replace(/^W\//, '');
  return candidates.includes(stripped);
}

function json(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin'
    }
  });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
