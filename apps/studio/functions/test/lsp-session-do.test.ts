// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Placeholder test for RuneLspSession DO (Task 1.3, 019 Phase 1).
 *
 * The original session-mint contract tests in apps/lsp-worker/test/session.test.ts
 * exercise the full Worker index entry point (not the DO class directly).
 * A parallel Pages Function for the session-mint endpoint is added in Task 1.4;
 * the contract tests will live there once the Pages Function handler exists.
 *
 * For now this file asserts the DO class can be imported and instantiated
 * with a minimal DurableObjectState stub — a smoke test for the module
 * boundary without requiring a Cloudflare `cloudflare:test` environment.
 *
 * TODO (Task 1.6): add full WS-upgrade contract tests once the
 * /api/lsp/ws/[token].ts Pages Function and its re-export of RuneLspSession
 * are in place.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import { describe, it, expect } from 'vitest';
import { RuneLspSession } from '../lib/lsp-session-do.js';

// Minimal DurableObjectState stub — enough to construct the class.
function makeFakeState(): DurableObjectState {
  return {
    id: { toString: () => 'fake-do-id-for-test' },
    storage: {
      get: async () => undefined,
      put: async () => undefined,
      delete: async () => undefined,
      list: async () => new Map()
    },
    blockConcurrencyWhile: async (fn: () => Promise<void>) => fn()
    // acceptWebSocket intentionally omitted to trigger the fallback branch.
  } as unknown as DurableObjectState;
}

describe('RuneLspSession DO (smoke)', () => {
  it('can be imported and constructed with a minimal state stub', () => {
    // If this throws, the module boundary or import resolution is broken.
    const session = new RuneLspSession(makeFakeState());
    expect(session).toBeInstanceOf(RuneLspSession);
  });

  it('fetch() returns 426 when Upgrade header is absent', async () => {
    const session = new RuneLspSession(makeFakeState());
    const req = new Request('http://localhost/api/lsp/ws/fake-token');
    const res = await session.fetch(req);
    expect(res.status).toBe(426);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('upgrade_required');
  });
});
