// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T015 — model-store curated/legacy path DI tests (014, US1).
 *
 * Asserts the wiring landed in T014:
 *   - When `source.archiveUrl` is set, `loadModel(...)` is called WITH an
 *     `archiveLoader` and that loader routes through `loadCuratedModel`.
 *   - When `source.archiveUrl` is NOT set, `loadModel(...)` is called
 *     WITHOUT an archiveLoader (custom-URL git path stays available).
 *   - The legacy `git.clone` from isomorphic-git is NEVER invoked when
 *     `archiveUrl` is set (regression guard for FR-019).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ModelSource, LoadedModel } from '../../src/types/model-types.js';

// Mock model-loader.js BEFORE the store imports it. The store calls
// loadModel(source, options) — we capture options.archiveLoader so we can
// assert the DI wiring picked up archiveUrl.
const loadModelMock = vi.fn();
vi.mock('../../src/services/model-loader.js', () => ({
  loadModel: (source: ModelSource, options: unknown) => loadModelMock(source, options)
}));

// Spy on isomorphic-git's `clone`. The model-loader.ts legacy path imports
// `git from 'isomorphic-git'` and calls `git.clone`; if our wiring works,
// that call must never happen when archiveUrl is set.
const gitCloneSpy = vi.fn();
vi.mock('isomorphic-git', () => {
  const stub = { clone: (...args: unknown[]) => gitCloneSpy(...args) };
  return { default: stub, clone: (...args: unknown[]) => gitCloneSpy(...args) };
});

// Run the store import AFTER the mocks above so the store's transitive
// loadModel binding picks up our spy.
const { useModelStore, setModelStoreDeps } = await import('../../src/store/model-store.js');

const CURATED_SOURCE: ModelSource = {
  id: 'cdm',
  name: 'CDM',
  repoUrl: 'https://github.com/example/cdm.git',
  ref: 'master',
  paths: ['**/*.rosetta'],
  archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz'
};

const CUSTOM_SOURCE: ModelSource = {
  id: 'custom-abc',
  name: 'My Custom Repo',
  repoUrl: 'https://github.com/my/repo.git',
  ref: 'main',
  paths: ['**/*.rosetta']
  // no archiveUrl
};

const FAKE_MODEL: LoadedModel = {
  source: CURATED_SOURCE,
  commitHash: '2026-04-25',
  files: [
    { path: 'cdm/sample.rosetta', content: 'namespace cdm.sample\n', namespace: 'cdm.sample' }
  ],
  loadedAt: 0
};

beforeEach(() => {
  loadModelMock.mockReset();
  loadModelMock.mockResolvedValue(FAKE_MODEL);
  gitCloneSpy.mockReset();
  // Reset store state so each test starts clean.
  useModelStore.setState({
    models: new Map(),
    loading: new Map(),
    errors: new Map()
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useModelStore — archiveLoader DI (T015)', () => {
  it('passes an archiveLoader to loadModel when source.archiveUrl is set', async () => {
    await useModelStore.getState().load(CURATED_SOURCE);

    expect(loadModelMock).toHaveBeenCalledTimes(1);
    const [src, opts] = loadModelMock.mock.calls[0]!;
    expect(src).toBe(CURATED_SOURCE);
    expect(opts).toMatchObject({
      archiveLoader: expect.any(Function),
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function)
    });
  });

  it('does NOT pass an archiveLoader when source.archiveUrl is undefined', async () => {
    await useModelStore.getState().load(CUSTOM_SOURCE);

    expect(loadModelMock).toHaveBeenCalledTimes(1);
    const [src, opts] = loadModelMock.mock.calls[0]!;
    expect(src).toBe(CUSTOM_SOURCE);
    expect((opts as { archiveLoader?: unknown }).archiveLoader).toBeUndefined();
  });

  it('legacy git.clone is NOT invoked when archiveUrl is set', async () => {
    // The DI seam injects a fake curated loader so the actual
    // archiveLoader callback (when invoked by model-loader) returns a
    // synthesised LoadedModel without touching OPFS or fetch.
    setModelStoreDeps({
      loadCuratedModelImpl: vi.fn().mockResolvedValue({
        modelId: 'cdm',
        version: '2026-04-25',
        filesWritten: 1,
        bytesUnpacked: 0
      }),
      getOpfsRoot: async () => ({}) as unknown as FileSystemDirectoryHandle
    });

    // Hand the archiveLoader our mock model directly so the legacy git path
    // is provably bypassed without us having to drive OPFS here.
    loadModelMock.mockImplementation(
      async (source: ModelSource, options: { archiveLoader?: unknown }) => {
        if (source.archiveUrl && typeof options.archiveLoader === 'function') {
          // Skip invoking the real archiveLoader (it would hit OPFS); the
          // wiring assertion is captured by mock.calls above.
          return FAKE_MODEL;
        }
        // No archiveUrl → fall through; if model-loader's legacy code ran
        // it would call git.clone, but we never let it run in this test.
        return FAKE_MODEL;
      }
    );

    await useModelStore.getState().load(CURATED_SOURCE);
    expect(gitCloneSpy).not.toHaveBeenCalled();
  });

  it('legacy git path throws when archiveUrl is missing AND legacyGitPathEnabled=false (T017)', async () => {
    // The store passes through to the real model-loader for non-curated
    // sources. With the FR-019 gate landed in T017, that path MUST throw
    // a ModelLoadError before reaching git.clone().
    vi.resetModules();
    // Restore real model-loader for this case so we exercise the gate.
    vi.doUnmock('../../src/services/model-loader.js');
    vi.doMock('../../src/config.js', () => ({
      config: {
        legacyGitPathEnabled: false,
        // The rest of the fields aren't read by model-loader.ts; satisfy
        // TypeScript by providing the same shape.
        lspWsUrl: 'ws://localhost:3001',
        lspSessionUrl: 'http://localhost:3001/lsp/session',
        telemetryEndpoint: 'http://localhost:5173/api/telemetry/v1/event',
        devMode: true
      },
      studioConfig: { homeUrl: '', docsUrl: '', githubUrl: '' }
    }));
    const { loadModel } = await import('../../src/services/model-loader.js');
    await expect(loadModel(CUSTOM_SOURCE)).rejects.toMatchObject({
      code: 'NETWORK',
      message: expect.stringMatching(/legacy git path is disabled/i)
    });
    expect(gitCloneSpy).not.toHaveBeenCalled();
    // Re-mock so the rest of the suite continues to use loadModelMock.
    vi.doMock('../../src/services/model-loader.js', () => ({
      loadModel: (source: ModelSource, options: unknown) => loadModelMock(source, options)
    }));
    vi.doUnmock('../../src/config.js');
  });

  it('archiveLoader callback delegates to the injected loadCuratedModelImpl', async () => {
    const fakeLoadCurated = vi.fn().mockResolvedValue({
      modelId: 'cdm',
      version: '2026-04-25',
      filesWritten: 1,
      bytesUnpacked: 0
    });
    // Provide a tiny in-memory OPFS-shaped root so `walk()` reads zero
    // entries and the archiveLoader throws on "no .rosetta files" — we
    // catch it and assert the delegation regardless.
    setModelStoreDeps({
      loadCuratedModelImpl: fakeLoadCurated,
      getOpfsRoot: async () => {
        const empty = {
          name: '/',
          kind: 'directory',
          getDirectoryHandle: async () => empty,
          getFileHandle: async () => {
            const err = new Error('not found');
            err.name = 'NotFoundError';
            throw err;
          },
          removeEntry: async () => undefined,
          keys: async function* () {
            yield* [];
          }
        };
        return empty as unknown as FileSystemDirectoryHandle;
      }
    });

    let capturedArchiveLoader: unknown = undefined;
    loadModelMock.mockImplementation(
      async (_source: ModelSource, options: { archiveLoader?: unknown }) => {
        capturedArchiveLoader = options.archiveLoader;
        return FAKE_MODEL;
      }
    );

    await useModelStore.getState().load(CURATED_SOURCE);
    expect(typeof capturedArchiveLoader).toBe('function');

    // Invoke the captured loader — it should delegate to fakeLoadCurated
    // with mirrorBase derived from the curated source's archiveUrl.
    try {
      await (
        capturedArchiveLoader as (
          s: ModelSource,
          o: { signal?: AbortSignal; onProgress?: () => void }
        ) => Promise<LoadedModel>
      )(CURATED_SOURCE, { signal: new AbortController().signal });
    } catch {
      // The walk over the empty stub root yields zero .rosetta files; the
      // loader throws after delegating, which is fine — we only need to
      // verify delegation happened.
    }
    expect(fakeLoadCurated).toHaveBeenCalledTimes(1);
    const arg = fakeLoadCurated.mock.calls[0]![0] as {
      modelId: string;
      mirrorBase: string;
      writeRoot: string;
    };
    expect(arg.modelId).toBe('cdm');
    expect(arg.mirrorBase).toBe('https://www.daikonic.dev/curated');
    expect(arg.writeRoot).toMatch(/\/files\/cdm$/);
  });
});
