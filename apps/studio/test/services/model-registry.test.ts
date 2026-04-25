// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T032 — model-registry refactor: curated entries now expose
 * `archiveUrl` (R2 mirror path) alongside the legacy `repoUrl`/`ref`
 * (kept for the custom-URL flow per FR-007).
 */

import { describe, it, expect } from 'vitest';
import { getModelRegistry, getModelSource } from '../../src/services/model-registry.js';

describe('model-registry — curated entries (T032)', () => {
  it('still exposes the three curated ids', () => {
    const ids = getModelRegistry().map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['cdm', 'fpml', 'rune-dsl']));
  });

  it('CDM has an archiveUrl pointing at the production mirror', () => {
    const cdm = getModelSource('cdm');
    expect(cdm).toBeDefined();
    expect(cdm!.archiveUrl).toBe('https://www.daikonic.dev/curated/cdm/latest.tar.gz');
  });

  it('preserves repoUrl + ref for the custom-URL flow (FR-007)', () => {
    const cdm = getModelSource('cdm');
    expect(cdm!.repoUrl).toMatch(/REGnosys\/rosetta-cdm/);
    expect(cdm!.ref).toBe('master');
  });

  it('returns undefined for unknown ids', () => {
    expect(getModelSource('does-not-exist')).toBeUndefined();
  });
});
