// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, expect, it, vi } from 'vitest';

const { mockReadWorkbenchSettings, mockWriteWorkbenchSettings } = vi.hoisted(() => ({
  mockReadWorkbenchSettings: vi.fn(),
  mockWriteWorkbenchSettings: vi.fn()
}));

vi.mock('../../src/shell/workbench-settings.js', () => ({
  readWorkbenchSettings: mockReadWorkbenchSettings,
  writeWorkbenchSettings: mockWriteWorkbenchSettings
}));

import { createExportWorkbench } from '../../src/store/export-workbench-store.js';
import { exportInputKey, type ExportInput } from '../../src/services/export-request.js';
import type { ExportArtifact } from '../../src/services/export-artifact.js';

const input: ExportInput = {
  workspaceId: 'test',
  sourceRevision: 1,
  config: {
    target: 'typescript',
    selection: { namespaces: ['test'], declarations: [] },
    options: { typescript: { layout: 'barrel' } }
  },
  files: [{ name: 'test.rune', path: 'test.rune', content: 'namespace test', dirty: false }]
};

const artifact: ExportArtifact = {
  blob: new Blob(),
  filename: 'test.zip',
  manifest: { version: 1, target: 'typescript', files: [], diagnostics: [] },
  readText: async () => ''
};

afterEach(() => {
  mockReadWorkbenchSettings.mockReset();
  mockWriteWorkbenchSettings.mockReset();
});

it('rejects a completed result after its inputs change', async () => {
  let finish!: (result: ExportArtifact) => void;
  const generate = vi.fn(
    () =>
      new Promise<ExportArtifact>((resolve) => {
        finish = resolve;
      })
  );
  const store = createExportWorkbench(generate);

  const pending = store.getState().generate(input);
  store.getState().invalidate(input.sourceRevision + 1);
  finish(artifact);
  await pending;

  expect(store.getState().run.status).not.toBe('ready');
});

it('retains a completed artifact as stale when configuration changes', async () => {
  const store = createExportWorkbench(async () => artifact);

  await store.getState().generate(input);
  store.getState().configure({ ...input.config, target: 'zod' });

  expect(store.getState().run).toEqual({
    status: 'stale',
    inputKey: exportInputKey(input),
    artifact
  });
});

it('uses the same key for option objects with different insertion order', () => {
  const reordered: ExportInput = {
    ...input,
    config: {
      ...input.config,
      options: { typescript: { layout: 'barrel' }, unrelated: { z: 1, a: 2 } }
    }
  };
  const original: ExportInput = {
    ...input,
    config: {
      ...input.config,
      options: { unrelated: { a: 2, z: 1 }, typescript: { layout: 'barrel' } }
    }
  };
  expect(exportInputKey(reordered)).toBe(exportInputKey(original));
});

it('retains structured diagnostics for a failed export', async () => {
  const store = createExportWorkbench(async () => {
    throw Object.assign(new Error('Unknown selection'), {
      diagnostics: [{ severity: 'error', code: 'unknown-export-selection', message: 'Party is unavailable' }]
    });
  });

  await store.getState().generate(input);

  expect(store.getState().run).toEqual({
    status: 'failed',
    message: 'Unknown selection',
    diagnostics: [{ severity: 'error', code: 'unknown-export-selection', message: 'Party is unavailable' }]
  });
});

it('restores and persists preferences by workspace without retaining the artifact', async () => {
  mockReadWorkbenchSettings.mockResolvedValue({
    config: { ...input.config, target: 'zod' },
    activeFile: 'test/index.ts'
  });
  const store = createExportWorkbench(vi.fn());

  await store.getState().activate('workspace-a');

  expect(store.getState()).toMatchObject({
    workspaceId: 'workspace-a',
    config: { target: 'zod', selection: input.config.selection },
    activeFile: 'test/index.ts',
    run: { status: 'idle' }
  });
  store.getState().setActiveFile('test/model.ts');
  expect(mockWriteWorkbenchSettings).toHaveBeenCalledWith('workspace-a', 'export-workbench', {
    config: expect.objectContaining({ target: 'zod' }),
    activeFile: 'test/model.ts'
  });
});

it('keeps local export preferences when they change during activation', async () => {
  let restore!: (value: { config: ExportInput['config']; activeFile: string }) => void;
  mockReadWorkbenchSettings.mockImplementation(
    () => new Promise<{ config: ExportInput['config']; activeFile: string }>((resolve) => (restore = resolve))
  );
  const store = createExportWorkbench(vi.fn());
  const localConfig: ExportInput['config'] = {
    ...input.config,
    selection: { namespaces: ['local'], declarations: [] }
  };

  const activating = store.getState().activate('workspace-a');
  store.getState().configure(localConfig);
  store.getState().setActiveFile('local.ts');
  restore({ config: { ...input.config, target: 'zod' }, activeFile: 'restored.ts' });
  await activating;

  expect(store.getState()).toMatchObject({ config: localConfig, activeFile: 'local.ts' });
});
