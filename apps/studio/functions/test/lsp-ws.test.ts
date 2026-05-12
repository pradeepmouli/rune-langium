// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../api/lsp/ws/[token].js';

const mockEnv = {
  SESSION_SIGNING_KEY: 'a'.repeat(64),
  ALLOWED_ORIGIN: 'https://www.daikonic.dev',
  LSP_SESSION: {
    idFromName: () => ({ toString: () => 'do-id-stub' }),
    get: () => ({
      fetch: async () => new Response(null, { status: 101 })
    })
  } as unknown as DurableObjectNamespace,
  SESSION_RATE_LIMIT_KV: {} as KVNamespace
};

function makeUpgradeRequest(token: string): Request {
  return new Request('http://example.com/api/lsp/ws/' + token, {
    headers: {
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      Origin: 'https://www.daikonic.dev'
    }
  });
}

describe('GET /api/lsp/ws/[token]', () => {
  it('returns 426 for non-upgrade requests', async () => {
    // Origin must be allowed so we reach the upgrade check (origin fires first in handler)
    const req = new Request('http://example.com/api/lsp/ws/sometoken', {
      headers: { Origin: 'https://www.daikonic.dev' }
    });
    const res = await onRequestGet({ request: req, env: mockEnv, params: { token: 'sometoken' } } as never);
    expect(res.status).toBe(426);
  });

  it('returns 403 for disallowed origin', async () => {
    const req = new Request('http://example.com/api/lsp/ws/sometoken', {
      headers: {
        Upgrade: 'websocket',
        Origin: 'https://evil.com'
      }
    });
    const res = await onRequestGet({ request: req, env: mockEnv, params: { token: 'sometoken' } } as never);
    expect(res.status).toBe(403);
  });

  it('returns 401 for invalid token', async () => {
    const res = await onRequestGet({
      request: makeUpgradeRequest('bogus.token.signature'),
      env: mockEnv,
      params: { token: 'bogus.token.signature' }
    } as never);
    expect(res.status).toBe(401);
  });
});
