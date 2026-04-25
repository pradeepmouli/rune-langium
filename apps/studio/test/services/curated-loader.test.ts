// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T030 — curated-loader tests.
 * Asserts the full client-side flow: manifest fetch → archive fetch →
 * untar → OPFS write, including telemetry emit and the FR-002 error
 * category catalogue.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { loadCuratedModel, type ErrorCategory } from '../../src/services/curated-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/curated/tiny.tar.gz');
function fixtureBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

const ARCHIVE_URL = 'https://www.daikonic.dev/curated/cdm/latest.tar.gz';
const MANIFEST_URL = 'https://www.daikonic.dev/curated/cdm/manifest.json';

// Hoist sha256 of the fixture once. Cheap; avoids async handlers below.
const FIXTURE_SHA: string = await (async () => {
  const bytes = fixtureBytes();
  const buf = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  let hex = '';
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, '0');
  return hex;
})();

function makeManifest(version = '2026-04-25', overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    modelId: 'cdm',
    version,
    sha256: FIXTURE_SHA,
    sizeBytes: 702,
    generatedAt: '2026-04-25T03:00:00Z',
    upstreamCommit: '',
    upstreamRef: 'master',
    // NB: the loader IGNORES this URL — see C1 in the security review.
    archiveUrl: ARCHIVE_URL,
    history: [],
    ...overrides
  });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
let telemetryEmit: ReturnType<typeof vi.fn>;

function mockNetwork(handler: (url: string) => Response | Promise<Response>) {
  fetchSpy.mockImplementation(async (url: string | URL) => handler(String(url)));
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  telemetryEmit = vi.fn().mockResolvedValue(undefined);
});
afterEach(() => fetchSpy.mockRestore());

function newFs() {
  const root = createOpfsRoot();
  return {
    root,
    fs: new OpfsFs(root as unknown as FileSystemDirectoryHandle)
  };
}

describe('loadCuratedModel — happy path (T030)', () => {
  it('fetches manifest, fetches archive, unpacks into OPFS', async () => {
    const archive = fixtureBytes();
    mockNetwork((url) => {
      if (url === MANIFEST_URL) return new Response(makeManifest());
      if (url === ARCHIVE_URL) return new Response(archive);
      return new Response('nope', { status: 404 });
    });

    const { fs } = newFs();
    const result = await loadCuratedModel({
      modelId: 'cdm',
      mirrorBase: 'https://www.daikonic.dev/curated',
      fs,
      writeRoot: '/cdm-ws',
      telemetry: { emit: telemetryEmit }
    });

    expect(result.version).toBe('2026-04-25');
    expect(result.filesWritten).toBe(3);
    expect((await fs.readFile('/cdm-ws/foo/a.txt', 'utf8')) as string).toBe('hello world\n');
  });

  it('emits curated_load_attempt then curated_load_success', async () => {
    mockNetwork((url) => {
      if (url === MANIFEST_URL) return new Response(makeManifest());
      return new Response(fixtureBytes());
    });
    const { fs } = newFs();
    await loadCuratedModel({
      modelId: 'cdm',
      mirrorBase: 'https://www.daikonic.dev/curated',
      fs,
      writeRoot: '/cdm',
      telemetry: { emit: telemetryEmit }
    });
    const events = telemetryEmit.mock.calls.map(
      (c: unknown[]) => (c[0] as { event: string }).event
    );
    expect(events[0]).toBe('curated_load_attempt');
    expect(events.at(-1)).toBe('curated_load_success');
  });
});

describe('loadCuratedModel — failure mapping (FR-002)', () => {
  async function runAndExpectError(handler: (u: string) => Response, expected: ErrorCategory) {
    mockNetwork(handler);
    const { fs } = newFs();
    await expect(
      loadCuratedModel({
        modelId: 'cdm',
        mirrorBase: 'https://www.daikonic.dev/curated',
        fs,
        writeRoot: '/cdm',
        telemetry: { emit: telemetryEmit }
      })
    ).rejects.toMatchObject({ category: expected });
    const lastEvent = telemetryEmit.mock.calls.at(-1)?.[0] as
      | { event: string; errorCategory?: string }
      | undefined;
    expect(lastEvent?.event).toBe('curated_load_failure');
    expect(lastEvent?.errorCategory).toBe(expected);
  }

  it('manifest 404 → archive_not_found', async () => {
    await runAndExpectError(() => new Response('nope', { status: 404 }), 'archive_not_found');
  });

  it('archive 404 (manifest 200) → archive_not_found', async () => {
    await runAndExpectError((u) => {
      if (u === MANIFEST_URL) return new Response(makeManifest());
      return new Response('', { status: 404 });
    }, 'archive_not_found');
  });

  it('5xx upstream → network', async () => {
    await runAndExpectError(() => new Response('boom', { status: 500 }), 'network');
  });

  it('corrupt archive bytes → archive_decode', async () => {
    await runAndExpectError((u) => {
      if (u === MANIFEST_URL) return new Response(makeManifest());
      return new Response(new Uint8Array([0, 1, 2, 3]));
    }, 'archive_decode');
  });

  it('OPFS NotAllowedError → permission_denied', async () => {
    mockNetwork((u) => {
      if (u === MANIFEST_URL) return new Response(makeManifest());
      return new Response(fixtureBytes());
    });
    // Sabotage the FS so the first write throws NotAllowedError.
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    const original = fs.writeFile.bind(fs);
    let firstCall = true;
    fs.writeFile = async (...args: Parameters<typeof original>) => {
      if (firstCall) {
        firstCall = false;
        const err = new Error('denied');
        err.name = 'NotAllowedError';
        throw err;
      }
      return original(...args);
    };
    await expect(
      loadCuratedModel({
        modelId: 'cdm',
        mirrorBase: 'https://www.daikonic.dev/curated',
        fs,
        writeRoot: '/cdm',
        telemetry: { emit: telemetryEmit }
      })
    ).rejects.toMatchObject({ category: 'permission_denied' });
  });

  it('sha256 mismatch between manifest and bytes → archive_decode', async () => {
    await runAndExpectError((u) => {
      if (u === MANIFEST_URL) {
        return new Response(makeManifest('2026-04-25', { sha256: 'b'.repeat(64) }));
      }
      return new Response(fixtureBytes());
    }, 'archive_decode');
  });
});

describe('loadCuratedModel — security: ignores manifest archiveUrl (C1)', () => {
  it('always fetches from `${mirrorBase}/${modelId}/latest.tar.gz` regardless of manifest', async () => {
    const fetched: string[] = [];
    mockNetwork((url) => {
      fetched.push(url);
      if (url === MANIFEST_URL) {
        return new Response(
          makeManifest('2026-04-25', { archiveUrl: 'https://attacker.example/payload.tar.gz' })
        );
      }
      if (url === ARCHIVE_URL) return new Response(fixtureBytes());
      return new Response('nope', { status: 404 });
    });
    const { fs } = newFs();
    await loadCuratedModel({
      modelId: 'cdm',
      mirrorBase: 'https://www.daikonic.dev/curated',
      fs,
      writeRoot: '/cdm',
      telemetry: { emit: telemetryEmit }
    });
    // The attacker URL should never have been fetched.
    expect(fetched).not.toContain('https://attacker.example/payload.tar.gz');
    expect(fetched).toContain(ARCHIVE_URL);
  });
});

describe('loadCuratedModel — cancellation', () => {
  it('respects an already-aborted signal and writes nothing', async () => {
    const ctl = new AbortController();
    ctl.abort();
    mockNetwork(() => new Response(fixtureBytes()));
    const { fs, root } = newFs();
    await expect(
      loadCuratedModel({
        modelId: 'cdm',
        mirrorBase: 'https://www.daikonic.dev/curated',
        fs,
        writeRoot: '/cdm',
        telemetry: { emit: telemetryEmit },
        signal: ctl.signal
      })
    ).rejects.toMatchObject({ category: 'cancelled' });
    // No writes should have landed.
    const r = root as unknown as { entries(): AsyncIterableIterator<[string, unknown]> };
    const names: string[] = [];
    for await (const [n] of r.entries()) names.push(n);
    expect(names).not.toContain('cdm');
  });
});
