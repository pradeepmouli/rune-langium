// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWorkspaceFiles } from '../../src/services/workspace.js';

describe('curated loaded-status from deferredExports', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('registers list-only deferredExports namespaces as refOnly files when the closure is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          errors: {},
          hydrationState: { documents: [] },
          deferredExports: [
            { filePath: 'cdm/cdm.base.datetime', namespace: 'cdm.base.datetime', exports: [{ type: 'Data', name: 'A' }] },
            { filePath: 'cdm/cdm.base.math', namespace: 'cdm.base.math', exports: [{ type: 'Data', name: 'B' }] }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as Response
    );

    const result = await parseWorkspaceFiles([
      { name: 'cdm/.bundle-marker', path: 'cdm/.bundle-marker', content: '', dirty: false, bundleId: 'cdm', bundleVersion: 'latest', serializedModelJson: '{}' }
    ] as Parameters<typeof parseWorkspaceFiles>[0]);

    const files = result.curatedRefOnlyFiles?.['cdm'] ?? [];
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.refOnly === true)).toBe(true);
    expect(new Set(files.map((f) => f.namespace))).toEqual(new Set(['cdm.base.datetime', 'cdm.base.math']));
  });
});
