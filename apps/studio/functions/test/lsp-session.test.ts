// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../api/lsp/session.js';

function makeRequest(body: unknown, origin = 'https://www.daikonic.dev'): Request {
  return new Request('http://example.com/api/lsp/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin
    },
    body: JSON.stringify(body)
  });
}

const mockEnv = {
  SESSION_SIGNING_KEY: 'a'.repeat(64),
  ALLOWED_ORIGIN: 'https://www.daikonic.dev',
  LSP_SESSION: {} as DurableObjectNamespace,
  SESSION_RATE_LIMIT_KV: {} as KVNamespace
};

describe('POST /api/lsp/session', () => {
  it('returns 200 with a signed token for valid request', async () => {
    const res = await onRequestPost({
      request: makeRequest({ workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA' }),
      env: mockEnv
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(typeof body.token).toBe('string');
    expect(typeof body.expiresAt).toBe('number');
  });

  it('returns 403 for disallowed origin', async () => {
    const res = await onRequestPost({
      request: makeRequest({ workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA' }, 'https://evil.com'),
      env: mockEnv
    } as never);
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing workspaceId', async () => {
    const res = await onRequestPost({
      request: makeRequest({}),
      env: mockEnv
    } as never);
    expect(res.status).toBe(400);
  });
});
