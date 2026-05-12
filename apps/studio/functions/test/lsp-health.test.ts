// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../api/lsp/health.js';

describe('GET /api/lsp/health', () => {
  it('returns 200 with status payload', async () => {
    const req = new Request('http://example.com/api/lsp/health');
    const res = await onRequestGet({ request: req } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      version: string;
      langium_loaded: boolean;
      uptime_seconds: number;
    };
    // @rune-langium/lsp-server is a workspace dep of studio — it should import.
    expect(body.ok).toBe(true);
    expect(body.langium_loaded).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime_seconds).toBe('number');
  });
});
