// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for downloadTargetViaRouter + CodegenDownloadError
 * (018 Phase 0 Task 0.12).
 *
 * Exercises the Download flow: POST to /api/codegen, parse the
 * Content-Disposition filename, trigger a browser save, surface
 * structured diagnostics on failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTargetViaRouter, CodegenDownloadError } from '../../src/services/workspace.js';

const FILES = [{ path: 'x.rune', content: 'namespace x\ntype T:\n  a string (1..1)\n' }];

function mockFetch(
  impl: (url: string, init: RequestInit | undefined) => Response | Promise<Response>
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    return impl(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeFakeAnchor() {
  return {
    href: '',
    download: '',
    style: { display: '' } as { display: string },
    click: vi.fn()
  } as unknown as HTMLAnchorElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloadTargetViaRouter', () => {
  it('POSTs { files, target, options } to /api/codegen', async () => {
    const fetchMock = mockFetch(
      () =>
        new Response('export const Schema = z.object({})', {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="x.zod.ts"'
          }
        })
    );
    // Stub out the document API so the test doesn't hit jsdom layout.
    const fakeAnchor = makeFakeAnchor();
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'appendChild').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'removeChild').mockReturnValue(fakeAnchor);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    await downloadTargetViaRouter(FILES, 'zod');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/codegen');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ files: FILES, target: 'zod', options: {} });
  });

  it('parses the filename from Content-Disposition and triggers a click', async () => {
    mockFetch(
      () =>
        new Response('schema-content', {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="custom-name.zod.ts"'
          }
        })
    );
    const fakeAnchor = makeFakeAnchor();
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'appendChild').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'removeChild').mockReturnValue(fakeAnchor);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    await downloadTargetViaRouter(FILES, 'zod');

    expect(fakeAnchor.download).toBe('custom-name.zod.ts');
    expect((fakeAnchor.click as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(fakeAnchor.href).toBe('blob:test');
  });

  it('falls back to "<target>-output" when Content-Disposition is missing', async () => {
    mockFetch(() => new Response('body', { status: 200 }));
    const fakeAnchor = makeFakeAnchor();
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'appendChild').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'removeChild').mockReturnValue(fakeAnchor);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    await downloadTargetViaRouter(FILES, 'json-schema');

    expect(fakeAnchor.download).toBe('json-schema-output');
  });

  it('throws CodegenDownloadError with diagnostics on a 400 JSON envelope', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'Target not implemented',
            diagnostics: [{ severity: 'error', code: 'not-implemented', message: "Target 'sql' is not implemented." }]
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    );

    await expect(downloadTargetViaRouter(FILES, 'sql')).rejects.toMatchObject({
      name: 'CodegenDownloadError',
      status: 400,
      message: 'Target not implemented'
    });
  });

  it('throws CodegenDownloadError with empty diagnostics when the error body is non-JSON', async () => {
    mockFetch(() => new Response('<html>502 from edge</html>', { status: 502 }));

    const promise = downloadTargetViaRouter(FILES, 'zod');
    await expect(promise).rejects.toBeInstanceOf(CodegenDownloadError);
    await expect(promise).rejects.toMatchObject({
      status: 502,
      diagnostics: []
    });
  });
});
