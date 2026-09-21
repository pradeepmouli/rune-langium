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

it('shows declarations included by the resolved dependency closure', () => {
  render(
    <ExportPreviewPanel
      run={{
        status: 'ready',
        inputKey: 'input',
        artifact: {
          ...artifact,
          manifest: {
            ...artifact.manifest,
            resolvedSelection: {
              explicit: [{ namespace: 'test', name: 'Party', kind: 'Data' }],
              included: [
                { namespace: 'test', name: 'Party', kind: 'Data' },
                { namespace: 'test', name: 'Address', kind: 'Data' }
              ]
            }
          }
        }
      }}
      onDownload={vi.fn()}
    />
  );
  expect(screen.getByText('Includes 1 dependency declaration')).toBeTruthy();
});

it('switches between text files in one captured artifact', async () => {
  const multiFileArtifact = {
    ...artifact,
    manifest: {
      ...artifact.manifest,
      files: [
        { path: 'first.ts', kind: 'text' as const, bytes: 1 },
        { path: 'second.ts', kind: 'text' as const, bytes: 1 }
      ]
    },
    readText: vi.fn().mockImplementation(async (path: string) => path)
  };
  render(
    <ExportPreviewPanel
      run={{ status: 'ready', inputKey: 'input', artifact: multiFileArtifact }}
      onDownload={vi.fn()}
    />
  );

  const picker = await screen.findByRole('combobox', { name: 'Generated export file' });
  await import('@testing-library/user-event').then(async ({ default: userEvent }) => {
    await userEvent.selectOptions(picker, 'second.ts');
  });
  expect(await screen.findByLabelText('Generated export code')).toHaveTextContent('second.ts');
});

it('reports the selected preview file to the workspace workbench', async () => {
  const onActiveFileChange = vi.fn();
  const multiFileArtifact = {
    ...artifact,
    manifest: {
      ...artifact.manifest,
      files: [
        { path: 'first.ts', kind: 'text' as const, bytes: 1 },
        { path: 'second.ts', kind: 'text' as const, bytes: 1 }
      ]
    },
    readText: vi.fn().mockResolvedValue('export {}')
  };
  render(
    <ExportPreviewPanel
      run={{ status: 'ready', inputKey: 'input', artifact: multiFileArtifact }}
      activeFile="second.ts"
      onActiveFileChange={onActiveFileChange}
      onDownload={vi.fn()}
    />
  );

  const picker = await screen.findByRole('combobox', { name: 'Generated export file' });
  await import('@testing-library/user-event').then(async ({ default: userEvent }) => {
    await userEvent.selectOptions(picker, 'first.ts');
  });
  expect(onActiveFileChange).toHaveBeenLastCalledWith('first.ts');
});
