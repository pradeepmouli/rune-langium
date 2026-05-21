// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Env } from './index.js';

const PREFIX = '/git/';
const ALLOWED_GIT_HOST = 'github.com';

/**
 * Authenticated git smart-HTTP forwarder. isomorphic-git sends requests to
 * `${corsProxy}/<host>/<path>`; we strip the prefix, require the host to be
 * github.com, reconstruct `https://github.com/<path>`, pass through the
 * client's Authorization header (Basic user:token), and forward method +
 * body + git content-type headers. The token is never logged.
 */
export async function handleGitProxy(req: Request, _env: Env, allowedOrigin: string): Promise<Response> {
  const url = new URL(req.url);
  const idx = url.pathname.indexOf(PREFIX);
  if (idx === -1) return new Response('not_found', { status: 404 });
  const rest = url.pathname.slice(idx + PREFIX.length); // "<host>/<path...>"
  const slash = rest.indexOf('/');
  if (slash === -1) return new Response('bad_request', { status: 400 });
  const host = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (host !== ALLOWED_GIT_HOST) return new Response('bad_request', { status: 400 });

  // Restrict to git smart-HTTP endpoints only — reject arbitrary path traversal
  // attempts that could reach e.g. /contents, /releases, or raw files.
  const GIT_ENDPOINTS = ['/info/refs', '/git-upload-pack', '/git-receive-pack'];
  if (!GIT_ENDPOINTS.some((e) => path.endsWith(e) || ('/' + path).endsWith(e))) {
    return new Response('bad_request', { status: 400 });
  }

  const target = `https://${host}/${path}${url.search}`;
  const headers = new Headers();
  const auth = req.headers.get('Authorization');
  if (auth) headers.set('Authorization', auth);
  const ct = req.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  const accept = req.headers.get('Accept');
  if (accept) headers.set('Accept', accept);
  const gp = req.headers.get('Git-Protocol');
  if (gp) headers.set('Git-Protocol', gp);
  headers.set('User-Agent', 'rune-studio-git-proxy');

  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half'; // required when body is a ReadableStream
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return new Response('upstream_unavailable', { status: 503 });
  }

  const outHeaders = new Headers(upstream.headers);
  outHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
  outHeaders.set('Vary', 'Origin');
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}
