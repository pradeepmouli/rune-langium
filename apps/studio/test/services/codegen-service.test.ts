// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * BrowserCodegenProxy unit tests (T021 → drives the Turnstile-token-header
 * forwarding + hosted-vs-local endpoint branching).
 *
 * Stubs `fetch` — no real HTTP traffic in CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BrowserCodegenProxy,
  createPreviewGenerateMessage,
  createPreviewSetFilesMessage,
  isPreviewWorkerMessage
} from '../../src/services/codegen-service.js';

describe('BrowserCodegenProxy.generate — turnstile token forwarding (T021)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ files: [{ path: 'F.ts', content: '// ok' }], errors: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('forwards X-Turnstile-Token header when provided', async () => {
    const proxy = new BrowserCodegenProxy('/rune-studio');
    await proxy.generate({ language: 'typescript', files: [] }, undefined, {
      turnstileToken: 'fresh-token-12345'
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Turnstile-Token']).toBe('fresh-token-12345');
  });

  it('omits X-Turnstile-Token when not provided (returning-session path)', async () => {
    const proxy = new BrowserCodegenProxy('/rune-studio');
    await proxy.generate({ language: 'typescript', files: [] });

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Turnstile-Token']).toBeUndefined();
  });

  it('posts to `${baseUrl}/api/generate` regardless of token presence', async () => {
    const proxy = new BrowserCodegenProxy('/rune-studio');
    await proxy.generate({ language: 'typescript', files: [] });
    expect(fetchSpy.mock.calls[0]![0]).toBe('/rune-studio/api/generate');
  });

  it('sends `credentials: include` on hosted so session cookies ride along', async () => {
    const proxy = new BrowserCodegenProxy('/rune-studio');
    await proxy.generate({ language: 'typescript', files: [] }, undefined, { turnstileToken: 't' });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('sends `credentials: omit` on local so CORS wildcard origin works', async () => {
    const proxy = new BrowserCodegenProxy('http://localhost:8377');
    await proxy.generate({ language: 'typescript', files: [] });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('omit');
  });
});

describe('BrowserCodegenProxy — hosted vs local endpoint branching', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('listLanguages()', () => {
    it('uses /api/generate/health on hosted (relative base)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', languages: ['java', 'typescript'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const proxy = new BrowserCodegenProxy('/rune-studio');
      const langs = await proxy.listLanguages();

      expect(fetchSpy.mock.calls[0]![0]).toBe('/rune-studio/api/generate/health');
      expect(langs.map((l) => l.id)).toEqual(['java', 'typescript']);
    });

    it('uses /api/languages on local (localhost base)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ languages: [{ id: 'java', class: 'X' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const proxy = new BrowserCodegenProxy('http://localhost:8377');
      await proxy.listLanguages();

      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8377/api/languages');
    });

    it('throws when language discovery returns a non-OK hosted response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('nope', { status: 503 }));

      const proxy = new BrowserCodegenProxy('/rune-studio');

      await expect(proxy.listLanguages()).rejects.toThrow(
        /language discovery failed \(http 503\)/i
      );
    });
  });

  describe('isAvailable()', () => {
    it('uses /api/generate/health on hosted', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', languages: [] }), { status: 200 })
      );

      const proxy = new BrowserCodegenProxy('/rune-studio');
      const ok = await proxy.isAvailable();
      expect(fetchSpy.mock.calls[0]![0]).toBe('/rune-studio/api/generate/health');
      expect(ok).toBe(true);
    });

    it('uses /api/health on local', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const proxy = new BrowserCodegenProxy('http://localhost:8377');
      await proxy.isAvailable();
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8377/api/health');
    });

    it('returns false on network error (hosted)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network'));
      const proxy = new BrowserCodegenProxy('/rune-studio');
      expect(await proxy.isAvailable()).toBe(false);
    });
  });
});

describe('BrowserCodegenProxy.isHostedService()', () => {
  it('returns true for relative base URLs (CF deploy)', () => {
    expect(new BrowserCodegenProxy('/rune-studio').isHostedService()).toBe(true);
  });

  it('returns true for non-localhost absolute URLs', () => {
    expect(new BrowserCodegenProxy('https://www.daikonic.dev/rune-studio').isHostedService()).toBe(
      true
    );
  });

  it('returns false for localhost (local dev)', () => {
    expect(new BrowserCodegenProxy('http://localhost:8377').isHostedService()).toBe(false);
    expect(new BrowserCodegenProxy('http://127.0.0.1:8377').isHostedService()).toBe(false);
  });
});

describe('preview worker message helpers', () => {
  it('serializes preview:setFiles with browser-safe file entries', () => {
    expect(
      createPreviewSetFilesMessage(
        [{ uri: 'file:///trade.rosetta', content: 'namespace "x"' }],
        'preview:test.preview.Trade:1'
      )
    ).toEqual({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "x"' }],
      requestId: 'preview:test.preview.Trade:1'
    });
  });

  it('serializes preview:generate with fully-qualified target identity', () => {
    expect(
      createPreviewGenerateMessage('test.preview.Trade', 'preview:test.preview.Trade:2')
    ).toEqual({
      type: 'preview:generate',
      targetId: 'test.preview.Trade',
      requestId: 'preview:test.preview.Trade:2'
    });
  });

  it('recognizes preview result and stale worker messages', () => {
    expect(
      isPreviewWorkerMessage({
        type: 'preview:result',
        targetId: 'test.preview.Trade',
        requestId: 'preview:test.preview.Trade:2',
        schema: {
          schemaVersion: 1,
          targetId: 'test.preview.Trade',
          title: 'Trade',
          status: 'ready',
          fields: []
        }
      })
    ).toBe(true);
    expect(
      isPreviewWorkerMessage({
        type: 'preview:stale',
        requestId: 'preview:test.preview.Trade:3',
        reason: 'no-files',
        message: 'No files'
      })
    ).toBe(true);
    expect(isPreviewWorkerMessage({ type: 'codegen:outdated' })).toBe(false);
    expect(
      isPreviewWorkerMessage({
        type: 'preview:result',
        targetId: 'test.preview.Trade',
        requestId: 'preview:test.preview.Trade:2',
        schema: {
          schemaVersion: 2,
          targetId: 'test.preview.Trade',
          title: 'Trade',
          status: 'ready',
          fields: []
        }
      })
    ).toBe(false);
    expect(
      isPreviewWorkerMessage({
        type: 'preview:stale',
        requestId: 'preview:test.preview.Trade:3',
        reason: 'mystery',
        message: 'No files'
      })
    ).toBe(false);
  });

  it('recognizes parse-error and generation-error stale payloads as preview worker messages', () => {
    expect(
      isPreviewWorkerMessage({
        type: 'preview:stale',
        targetId: 'test.preview.Trade',
        requestId: 'preview:test.preview.Trade:4',
        reason: 'parse-error',
        message: 'Fix model errors to refresh the form preview.'
      })
    ).toBe(true);
    expect(
      isPreviewWorkerMessage({
        type: 'preview:stale',
        targetId: 'test.preview.Trade',
        requestId: 'preview:test.preview.Trade:5',
        reason: 'generation-error',
        message: 'Preview schema generation failed.'
      })
    ).toBe(true);
  });

  it('does not treat preview request messages as worker output payloads', () => {
    expect(isPreviewWorkerMessage({ type: 'preview:setFiles', files: [] })).toBe(false);
    expect(
      isPreviewWorkerMessage({
        type: 'preview:generate',
        targetId: 'test.preview.Trade',
        requestId: 'preview:test.preview.Trade:6'
      })
    ).toBe(false);
  });

  it('rejects malformed preview worker messages that only match on type', () => {
    expect(isPreviewWorkerMessage({ type: 'preview:result', targetId: 'x' })).toBe(false);
    expect(isPreviewWorkerMessage({ type: 'preview:stale', reason: 'no-files' })).toBe(false);
  });
});
