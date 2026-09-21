// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, it, vi } from 'vitest';
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
