// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 0 integration test (019 Task 0.6).
 *
 * Exercises the full parseWorkspaceViaRouter -> /api/parse Pages Function
 * round-trip in-process: client-side router code POSTs to a hijacked fetch
 * that delegates to the Pages Function handler directly, server-side parse
 * runs against the real Langium services, hydrationState is returned, and
 * client-side deserialization re-builds RosettaModel instances.
 *
 * Does NOT exercise: the curated-mirror server-to-server fetch (mocked) or
 * the browser parse-worker hydrate path (mocked via setBrowserParseImpl).
 * Those are covered by their own focused unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from '../../functions/api/parse.js';
import { parseWorkspaceViaRouter, setBrowserParseImpl, _defaultBrowserParse } from '../../src/services/workspace.js';
import type { ParseWorkspaceResponse } from '../../src/workers/parser-worker.js';

// A valid Rune DSL snippet with a namespace and one type declaration.
const SIMPLE_RUNE = 'namespace integration.test\ntype Quantity:\n  amount number (1..1)\n  currency string (0..1)\n';

// Stub ParseWorkspaceResponse used as the fallback browser-worker result.
const stubHydrate: ParseWorkspaceResponse = {
  type: 'parseWorkspaceResult',
  id: 'stub',
  models: [],
  parsedModels: [],
  deferredExports: [],
  errors: {}
};

describe('Phase 0 integration: workspace router → /api/parse handler', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Route any fetch('/api/parse', ...) call to the actual Pages Function handler in-process.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.endsWith('/api/parse')) {
        const request = new Request('http://test/api/parse', init);
        return await onRequestPost({ request } as never);
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    // Stub the browser worker fallback so we don't need a real Worker.
    setBrowserParseImpl(async () => stubHydrate);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Restore the real browser parse implementation.
    setBrowserParseImpl(_defaultBrowserParse);
  });

  it('parses user files via Pages Function and returns RosettaModel via deserialization', async () => {
    const result = await parseWorkspaceViaRouter([{ name: 'integration.rune', content: SIMPLE_RUNE }]);

    expect(result.type).toBe('parseWorkspaceResult');
    expect(result.errors).toEqual({});
    expect(result.models).toHaveLength(1);
    expect(result.parsedModels).toHaveLength(1);
    expect(result.parsedModels[0]!.filePath).toBe('integration.rune');

    // The deserialized model should be a real RosettaModel — verify expected shape.
    const model = result.models[0] as { name?: string; elements?: Array<{ name?: string; $type?: string }> };
    expect(model.name).toBe('integration.test');
    expect(model.elements?.some((e) => e.name === 'Quantity')).toBe(true);
  });

  it('returns errors per filePath when source has parser errors', async () => {
    const result = await parseWorkspaceViaRouter([
      { name: 'broken.rune', content: 'namespace x\ntype broken because (totally invalid syntax<<<' }
    ]);

    // The Pages Function returns errors keyed by filePath; the router preserves them.
    expect(result.errors['broken.rune']).toBeDefined();
    expect(result.errors['broken.rune']!.length).toBeGreaterThan(0);
  });

  it('handles empty workspace gracefully via browser fallback', async () => {
    // parseWorkspaceViaRouter still POSTs when files is empty — the Pages Function
    // returns 400, which causes the router to fall back to the browser parse impl.
    const fallbackSpy = vi.fn().mockResolvedValue(stubHydrate);
    setBrowserParseImpl(fallbackSpy);

    const result = await parseWorkspaceViaRouter([]);

    // 400 from Pages Function triggers browser fallback → stubHydrate.
    expect(result.type).toBe('parseWorkspaceResult');
    expect(fallbackSpy).toHaveBeenCalled();
  });

  it('falls back to browser parse impl when Pages Function returns non-2xx', async () => {
    // Override fetch to return 500 instead of routing to the handler.
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 500 })) as typeof fetch;

    const fallbackSpy = vi.fn().mockResolvedValue(stubHydrate);
    setBrowserParseImpl(fallbackSpy);

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: SIMPLE_RUNE }]);

    expect(fallbackSpy).toHaveBeenCalled();
  });
});
