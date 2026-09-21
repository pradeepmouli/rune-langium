// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExportPreviewPanel } from '../../../src/shell/panels/ExportPreviewPanel.js';

const artifact = {
  blob: new Blob(['archive']),
  filename: 'test.zip',
  manifest: {
    version: 1 as const,
    target: 'typescript' as const,
    files: [{ path: 'test.ts', kind: 'text' as const, bytes: 22 }],
    diagnostics: []
  },
  readText: vi.fn().mockResolvedValue('export interface Party {}')
};

it('renders text from the captured export artifact and downloads it on demand', async () => {
  const onDownload = vi.fn();
  render(<ExportPreviewPanel run={{ status: 'ready', inputKey: 'input', artifact }} onDownload={onDownload} />);

  expect(await screen.findByText('export interface Party {}')).toBeTruthy();
  screen.getByRole('button', { name: 'Download export' }).click();
  expect(onDownload).toHaveBeenCalledOnce();
  expect(artifact.readText).toHaveBeenCalledWith('test.ts');
});

it('does not offer a stale artifact for download', () => {
  render(<ExportPreviewPanel run={{ status: 'stale', inputKey: 'input', artifact }} onDownload={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Download export' })).toBeDisabled();
});
