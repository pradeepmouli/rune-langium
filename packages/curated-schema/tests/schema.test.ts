// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import {
  CuratedManifestSchema,
  CuratedModelIdSchema,
  CURATED_MODEL_IDS,
  ErrorCategorySchema,
  parseManifest
} from '../src/index.js';

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

  it('rejects a stale schemaVersion', () => {
    const r = parseManifest({ ...VALID_MANIFEST, schemaVersion: 2 });
    expect(r.ok).toBe(false);
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
