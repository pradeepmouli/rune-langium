// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it } from 'vitest';
import { useCodegenStore } from '../../src/store/codegen-store.js';

describe('useCodegenStore', () => {
  beforeEach(() => {
    useCodegenStore.getState().resetCodegenState();
  });

  it('sets the selected code preview target and marks the snapshot waiting', () => {
    useCodegenStore.getState().setCodePreviewTarget('typescript');

    expect(useCodegenStore.getState().codePreviewTarget).toBe('typescript');
    expect(useCodegenStore.getState().currentRequestId).toBe('codegen:typescript:0');
    expect(useCodegenStore.getState().snapshot).toMatchObject({
      status: 'waiting',
      target: 'typescript'
    });
  });

  it('issues a fresh request id when code preview generation begins', () => {
    const requestId = useCodegenStore.getState().beginCodePreviewRequest('zod');

    expect(requestId).toMatch(/^codegen:zod:/);
    expect(useCodegenStore.getState().currentRequestId).toBe(requestId);
    expect(useCodegenStore.getState().snapshot).toMatchObject({
      status: 'waiting',
      target: 'zod'
    });
  });

  it('stores the last generated preview result and preserves it when stale', () => {
    useCodegenStore.getState().receiveCodePreviewResult({
      target: 'zod',
      files: [
        {
          relativePath: 'trade.zod.ts',
          content: 'export const TradeSchema = z.object({});',
          sourceMap: []
        }
      ]
    });
    useCodegenStore.getState().markCodePreviewStale({
      target: 'zod',
      message: 'Fix model errors to refresh the code preview.'
    });

    expect(useCodegenStore.getState().snapshot).toMatchObject({
      status: 'stale',
      target: 'zod',
      activeRelativePath: 'trade.zod.ts',
      files: [{ relativePath: 'trade.zod.ts', content: 'export const TradeSchema = z.object({});' }]
    });
  });

  it('marks the preview unavailable when stale is received before any generated output', () => {
    useCodegenStore
      .getState()
      .markCodePreviewStale({ target: 'zod', message: 'No files are loaded for code preview.' });

    expect(useCodegenStore.getState().snapshot).toMatchObject({
      status: 'unavailable',
      target: 'zod',
      message: 'No files are loaded for code preview.'
    });
  });

  it('preserves the selected generated file when a refreshed result still contains it', () => {
    useCodegenStore.getState().receiveCodePreviewResult({
      target: 'zod',
      files: [
        { relativePath: 'alpha.zod.ts', content: 'alpha', sourceMap: [] },
        { relativePath: 'beta.zod.ts', content: 'beta', sourceMap: [] }
      ]
    });
    useCodegenStore.getState().setActiveCodePreviewFile('beta.zod.ts');
    useCodegenStore.getState().receiveCodePreviewResult({
      target: 'zod',
      files: [
        { relativePath: 'alpha.zod.ts', content: 'alpha2', sourceMap: [] },
        { relativePath: 'beta.zod.ts', content: 'beta2', sourceMap: [] }
      ]
    });

    expect(useCodegenStore.getState().snapshot).toMatchObject({
      status: 'ready',
      activeRelativePath: 'beta.zod.ts'
    });
  });

  it('clears stale generated files when the preview becomes unavailable', () => {
    useCodegenStore.getState().receiveCodePreviewResult({
      target: 'zod',
      files: [{ relativePath: 'alpha.zod.ts', content: 'alpha', sourceMap: [] }]
    });

    useCodegenStore
      .getState()
      .markCodePreviewUnavailable({ target: 'zod', message: 'Code generation failed.' });

    expect(useCodegenStore.getState().snapshot).toEqual({
      status: 'unavailable',
      target: 'zod',
      message: 'Code generation failed.'
    });
  });
});
