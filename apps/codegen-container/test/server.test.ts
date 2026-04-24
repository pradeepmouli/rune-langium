// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Container HTTP wrapper unit tests (T007).
 *
 * Pure-TypeScript tests — do NOT spawn the real CLI; instead, we inject a
 * stubbed CodegenServiceProxy so we can verify routing, response shapes,
 * and log redaction in isolation from Java/Docker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContainerServer } from '../src/server.js';
import type { Server } from 'node:http';
import type { CodeGenerationRequest, CodeGenerationResult } from '@rune-langium/codegen';

// Deterministic fake of the codegen proxy.
class FakeCodegenProxy {
  public listLanguagesCalls = 0;
  public generateCalls: CodeGenerationRequest[] = [];
  public shouldThrow: Error | null = null;

  async listLanguages() {
    this.listLanguagesCalls++;
    if (this.shouldThrow) throw this.shouldThrow;
    return [
      { id: 'java', class: 'org.isda.cdm.JavaGenerator' },
      { id: 'typescript', class: 'org.isda.cdm.TsGenerator' }
    ];
  }

  async generate(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    this.generateCalls.push(request);
    if (this.shouldThrow) throw this.shouldThrow;
    return {
      language: request.language,
      files: [
        { path: `Generated.${request.language === 'typescript' ? 'ts' : 'java'}`, content: '// ok' }
      ],
      errors: []
    };
  }

  async isAvailable() {
    return !this.shouldThrow;
  }
}

function fetchFromServer(server: Server, path: string, init?: RequestInit): Promise<Response> {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server not listening on TCP');
  return fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

describe('container HTTP wrapper', () => {
  let fake: FakeCodegenProxy;
  let server: Server;

  beforeEach(async () => {
    fake = new FakeCodegenProxy();
    server = createContainerServer({ proxy: fake as never });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  describe('GET /api/generate/health', () => {
    it('returns ok + language list from the underlying proxy', async () => {
      const res = await fetchFromServer(server, '/api/generate/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        cold_start_likely: boolean;
        languages: string[];
      };
      expect(body.status).toBe('ok');
      expect(body.languages).toEqual(['java', 'typescript']);
      expect(body.cold_start_likely).toBe(false);
    });

    it('returns 503 + descriptive message when the proxy is unavailable', async () => {
      fake.shouldThrow = new Error('codegen-cli.sh not found');
      const res = await fetchFromServer(server, '/api/generate/health');
      expect(res.status).toBe(503);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.status).toBe('unavailable');
      expect(body.message).toContain('temporarily unavailable');
    });
  });

  describe('POST /api/generate', () => {
    const validRequest: CodeGenerationRequest = {
      language: 'typescript',
      files: [{ path: 'demo.rosetta', content: 'namespace demo\ntype Foo:\n  bar string (1..1)\n' }]
    };

    it('forwards the request to proxy.generate and returns its result verbatim', async () => {
      const res = await fetchFromServer(server, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest)
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as CodeGenerationResult;
      expect(body.language).toBe('typescript');
      expect(body.files).toHaveLength(1);
      expect(body.errors).toEqual([]);

      expect(fake.generateCalls).toHaveLength(1);
      expect(fake.generateCalls[0]).toEqual(validRequest);
    });

    it('returns 422 when the result contains errors (parse/validation failure)', async () => {
      // Override proxy to return an error-bearing result.
      const errRequest: CodeGenerationRequest = { language: 'typescript', files: [] };
      const res = await fetchFromServer(server, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errRequest)
      });
      // Our fake always returns empty errors, so this test drives the
      // "downstream returned errors" branch via a different fake.
      // Swap in a proxy that returns errors:
      const errProxy = {
        listLanguages: async () => [],
        isAvailable: async () => true,
        generate: async () => ({
          language: 'typescript',
          files: [],
          errors: [{ sourceFile: 'x.rosetta', construct: 't', message: 'bad syntax' }]
        })
      };
      await new Promise<void>((r) => server.close(() => r()));
      server = createContainerServer({ proxy: errProxy as never });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const res2 = await fetchFromServer(server, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errRequest)
      });
      expect(res2.status).toBe(422);
      const body = (await res2.json()) as CodeGenerationResult;
      expect(body.errors).toHaveLength(1);
      // Sanity: first probe also came back as 200 or 422 (don't care; we replaced the server).
      expect(res.status).toBeGreaterThanOrEqual(200);
    });

    it('returns 400 on malformed JSON body', async () => {
      const res = await fetchFromServer(server, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json'
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 when the proxy throws', async () => {
      fake.shouldThrow = new Error('CLI subprocess crashed');
      const res = await fetchFromServer(server, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest)
      });
      expect(res.status).toBe(500);
    });
  });

  describe('log redaction (FR-008 / SC-008)', () => {
    it('does not log request.files[].content to stdout/stderr', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const sensitiveRequest: CodeGenerationRequest = {
        language: 'typescript',
        files: [
          {
            path: 'secret.rosetta',
            content:
              'namespace secret; type Password: token string (1..1)  // MY_SECRET_VALUE_12345'
          }
        ]
      };

      await fetchFromServer(server, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensitiveRequest)
      });

      const allWrites = [
        ...stdoutSpy.mock.calls.map((call) => String(call[0])),
        ...stderrSpy.mock.calls.map((call) => String(call[0]))
      ].join('\n');

      expect(allWrites).not.toContain('MY_SECRET_VALUE_12345');
      expect(allWrites).not.toContain('Password');
      expect(allWrites).not.toContain('namespace secret');

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });

  describe('routing', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await fetchFromServer(server, '/not-a-real-endpoint');
      expect(res.status).toBe(404);
    });

    it('returns 405 for wrong method on a known path', async () => {
      const res = await fetchFromServer(server, '/api/generate', { method: 'GET' });
      expect(res.status).toBe(405);
    });
  });
});
