// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitHub OAuth Device-Flow mediator. Stateless — never persists tokens.
 *
 * Routes:
 *   POST /rune-studio/api/github-auth/device-init  → GitHub /login/device/code
 *   POST /rune-studio/api/github-auth/device-poll  → GitHub /login/oauth/access_token
 *
 * Origin allowlist on every request — anything outside ALLOWED_ORIGIN is 403.
 * Logs are pino with the standard redact set (never the device_code, never
 * the access_token).
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_ORIGIN: string;
}

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

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

function originOk(req: Request, allowed: string): boolean {
  const o = req.headers.get('Origin');
  return o === allowed;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = env.ALLOWED_ORIGIN;
    if (!originOk(req, allowed)) {
      return new Response('forbidden', { status: 403 });
    }
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' }, allowed);
    }
    const url = new URL(req.url);
    if (url.pathname.endsWith('/device-init')) return handleInit(env, allowed);
    if (url.pathname.endsWith('/device-poll')) return handlePoll(req, env, allowed);
    return json(404, { error: 'not_found' }, allowed);
  }
};

async function handleInit(env: Env, allowed: string): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        scope: 'repo'
      })
    });
  } catch {
    return json(503, { error: 'github_unavailable' }, allowed);
  }
  if (upstream.status >= 500) {
    return json(503, { error: 'github_unavailable' }, allowed);
  }
  const body = (await upstream.json()) as Record<string, unknown>;
  return json(
    200,
    {
      device_code: body['device_code'],
      user_code: body['user_code'],
      verification_uri: body['verification_uri'],
      expires_in: body['expires_in'],
      interval: body['interval']
    },
    allowed
  );
}

async function handlePoll(req: Request, env: Env, allowed: string): Promise<Response> {
  let body: { device_code?: string };
  try {
    body = (await req.json()) as { device_code?: string };
  } catch {
    return json(400, { error: 'bad_json' }, allowed);
  }
  if (!body.device_code || typeof body.device_code !== 'string') {
    return json(400, { error: 'invalid_device_code' }, allowed);
  }

  let upstream: Response;
  try {
    upstream = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        device_code: body.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });
  } catch {
    return json(503, { error: 'github_unavailable' }, allowed);
  }
  if (upstream.status >= 500) {
    return json(503, { error: 'github_unavailable' }, allowed);
  }

  const data = (await upstream.json()) as Record<string, unknown>;
  if (typeof data['access_token'] === 'string') {
    return json(
      200,
      {
        access_token: data['access_token'],
        scope: data['scope'] ?? '',
        token_type: data['token_type'] ?? 'bearer'
      },
      allowed
    );
  }
  switch (data['error']) {
    case 'authorization_pending':
      return json(202, { status: 'authorization_pending' }, allowed);
    case 'slow_down':
      return json(202, { status: 'slow_down' }, allowed);
    case 'expired_token':
      return json(410, { error: 'expired_token', message: 'device code expired' }, allowed);
    case 'access_denied':
      return json(400, { error: 'access_denied' }, allowed);
    default:
      return json(400, { error: 'invalid_device_code' }, allowed);
  }
}
