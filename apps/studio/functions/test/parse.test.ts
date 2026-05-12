// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../api/parse.js';

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/parse (stub)', () => {
  it('returns 501 Not Implemented', async () => {
    const res = await onRequestPost({ request: makeRequest({}) } as never);
    expect(res.status).toBe(501);
  });
});
