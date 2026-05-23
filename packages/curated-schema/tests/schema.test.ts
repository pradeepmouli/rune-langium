// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { CuratedModelIdSchema, CURATED_MODEL_IDS, ErrorCategorySchema, CuratedManifestSchema, parseManifest } from '../src/index.js';

const VALID_MANIFEST = {
  schemaVersion: 1,
  modelId: 'cdm',
  version: '2026-04-25',
  sha256: 'a'.repeat(64),
  sizeBytes: 702,
  generatedAt: '2026-04-25T03:00:00Z',
  upstreamCommit: '',
  upstreamRef: 'master',
  archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
  history: []
};

describe('CuratedManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const r = parseManifest(VALID_MANIFEST);
    expect(r.ok).toBe(true);
  });

  it('rejects an unsupported schemaVersion', () => {
    const r = parseManifest({ ...VALID_MANIFEST, schemaVersion: 99 });
    expect(r.ok).toBe(false);
  });

  it('accepts schemaVersion 2 with a namespaces map', () => {
    const m = {
      schemaVersion: 2,
      modelId: 'cdm',
      version: '2026-05-22',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base': {
          deps: ['cdm.base.math'],
          exports: [{ type: 'Data', name: 'Foo' }],
          artifact: 'artifacts/2026-05-22/ns/cdm.base.json.gz'
        }
      }
    };
    expect(CuratedManifestSchema.safeParse(m).success).toBe(true);
  });

  it('still accepts a v1 manifest without namespaces', () => {
    const m = {
      schemaVersion: 1,
      modelId: 'cdm',
      version: '2026-05-22',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: []
    };
    expect(CuratedManifestSchema.safeParse(m).success).toBe(true);
  });

  it('rejects a malformed sha256', () => {
    const r = parseManifest({ ...VALID_MANIFEST, sha256: 'not-hex' });
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed version', () => {
    const r = parseManifest({ ...VALID_MANIFEST, version: '2026/04/25' });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown modelId', () => {
    const r = parseManifest({ ...VALID_MANIFEST, modelId: 'totally-new' });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-URL archiveUrl', () => {
    const r = parseManifest({ ...VALID_MANIFEST, archiveUrl: 'not a url' });
    expect(r.ok).toBe(false);
  });

  it('rejects a manifest whose namespaces entry has an empty artifact string', () => {
    const m = {
      schemaVersion: 2,
      modelId: 'cdm',
      version: '2026-05-22',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base': {
          deps: [],
          exports: [{ type: 'Data', name: 'Foo' }],
          artifact: '' // empty string — must fail
        }
      }
    };
    expect(CuratedManifestSchema.safeParse(m).success).toBe(false);
  });
});

describe('CuratedModelIdSchema + CURATED_MODEL_IDS', () => {
  it('exports the locked enum members via CURATED_MODEL_IDS', () => {
    expect([...CURATED_MODEL_IDS].sort()).toEqual(['cdm', 'fpml', 'rune-dsl']);
  });

  it('rejects unknown ids', () => {
    expect(CuratedModelIdSchema.safeParse('xyzzy').success).toBe(false);
  });
});

describe('ErrorCategorySchema', () => {
  it('includes a `cancelled` category for user-aborted loads', () => {
    expect(ErrorCategorySchema.safeParse('cancelled').success).toBe(true);
  });

  it('rejects unknown categories', () => {
    expect(ErrorCategorySchema.safeParse('explosions').success).toBe(false);
  });
});
