// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseWorkspaceViaRouter, setBrowserParseImpl, _defaultBrowserParse } from '../../src/services/workspace.js';
import type { ParseWorkspaceResponse } from '../../src/workers/parser-worker.js';

const stubParseResponse: ParseWorkspaceResponse = {
  type: 'parseWorkspaceResult',
  id: 'stub',
  models: [],
  parsedModels: [],
  deferredExports: [],
  errors: {}
};

describe('parseWorkspace routing', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Restore default browser-parse impl in case a test injected a spy.
    if (_defaultBrowserParse) setBrowserParseImpl(_defaultBrowserParse);
  });

  it('POSTs to /api/parse for parseWorkspace requests', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          deferredExports: [],
          errors: {},
          hydrationState: { documents: [] }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    // Inject a no-op browser-parse impl so the hydrate step doesn't try to talk to a real worker.
    setBrowserParseImpl(async () => stubParseResponse);

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: 'namespace x\ntype T:\n  a string (1..1)' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/parse');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('falls back to browser worker when /api/parse returns 5xx', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));

    const browserSpy = vi.fn().mockResolvedValue(stubParseResponse);
    setBrowserParseImpl(browserSpy);

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: 'namespace x\ntype T:\n  a string (1..1)' }]);

    expect(browserSpy).toHaveBeenCalled();
  });

  it('falls back to browser worker when /api/parse fetch throws', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockRejectedValue(new TypeError('Network down'));

    const browserSpy = vi.fn().mockResolvedValue(stubParseResponse);
    setBrowserParseImpl(browserSpy);

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: 'namespace x\ntype T:\n  a string (1..1)' }]);

    expect(browserSpy).toHaveBeenCalled();
  });
});
