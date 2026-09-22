// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ExportPerspective } from '../../src/shell/perspectives/screens/ExportPerspective.js';

const { state, mockGenerate, mockActivate, mockConfigure, mockInvalidate, mockSetActiveFile, mockCancel } = vi.hoisted(
  () => {
    const store = {
      config: {
        target: 'typescript' as const,
        selection: { namespaces: [], declarations: [] },
        options: { typescript: { layout: 'barrel' } }
      },
      run: { status: 'idle' as const },
      activeFile: undefined as string | undefined,
      generate: vi.fn(),
      activate: vi.fn().mockResolvedValue(undefined),
      configure: vi.fn(),
      invalidate: vi.fn(),
      setActiveFile: vi.fn(),
      cancel: vi.fn()
    };
    return {
      state: store,
      mockGenerate: store.generate,
      mockActivate: store.activate,
      mockConfigure: store.configure,
      mockInvalidate: store.invalidate,
      mockSetActiveFile: store.setActiveFile,
      mockCancel: store.cancel
    };
  }
);

let capturedGenerate: (() => void) | undefined;

vi.mock('../../src/store/export-workbench-store.js', () => ({
  useExportWorkbenchStore: Object.assign(<T,>(selector: (value: typeof state) => T) => selector(state), {
    getState: () => state
  })
}));
vi.mock('../../src/shell/panels/ExportSelectionPanel.js', () => ({
  ExportSelectionPanel: () => <div data-testid="mock-export-selection-panel" />
}));
vi.mock('../../src/shell/panels/ExportSettingsPanel.js', () => ({
  ExportSettingsPanel: (props: { onGenerate(): void }) => {
    capturedGenerate = props.onGenerate;
    return <div data-testid="mock-export-settings-panel" />;
  }
}));
vi.mock('../../src/shell/panels/ExportPreviewPanel.js', () => ({
  ExportPreviewPanel: () => <div data-testid="mock-export-preview-panel" />
}));
vi.mock('../../src/shell/WorkbenchHost.js', () => ({
  WorkbenchHost: ({ definition }: { definition: { panels: Record<string, () => React.ReactElement> } }) => (
    <div data-testid="mock-export-workbench">
      {Object.entries(definition.panels).map(([id, Panel]) => (
        <Panel key={id} />
      ))}
    </div>
  )
}));

beforeEach(() => {
  state.config = {
    target: 'typescript',
    selection: { namespaces: [], declarations: [] },
    options: { typescript: { layout: 'barrel' } }
  };
  state.run = { status: 'idle' };
  capturedGenerate = undefined;
  mockGenerate.mockClear();
  mockActivate.mockClear();
  mockConfigure.mockClear();
  mockInvalidate.mockClear();
  mockSetActiveFile.mockClear();
  mockCancel.mockClear();
});

it('composes stable selection, settings, and preview workbench panels', async () => {
  render(<ExportPerspective workspaceId="workspace-a" />);
  await screen.findByTestId('mock-export-workbench');
  expect(screen.getByTestId('export-selection')).toContainElement(screen.getByTestId('mock-export-selection-panel'));
  expect(screen.getByTestId('export-settings')).toContainElement(screen.getByTestId('mock-export-settings-panel'));
  expect(screen.getByTestId('export-preview')).toContainElement(screen.getByTestId('mock-export-preview-panel'));
  expect(mockActivate).toHaveBeenCalledWith('workspace-a');
});

it('invalidates the artifact when a curated bundle version changes', () => {
  const files = [
    {
      name: '.bundle-marker',
      path: '[cdm]/.bundle-marker',
      content: '',
      dirty: false,
      readOnly: true,
      serializedModelJson: '{}',
      bundleId: 'cdm',
      bundleVersion: 'first'
    }
  ];
  const { rerender } = render(<ExportPerspective workspaceId="workspace-a" files={files} />);
  expect(mockInvalidate).toHaveBeenCalledTimes(1);

  rerender(<ExportPerspective workspaceId="workspace-a" files={[{ ...files[0]!, bundleVersion: 'second' }]} />);

  expect(mockInvalidate).toHaveBeenCalledTimes(2);
});

it('captures the selected roots and workspace files exactly once when generating', async () => {
  state.config = {
    ...state.config,
    selection: { namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] }
  };
  const files = [{ name: 'test.rune', path: 'test.rune', content: 'namespace test', dirty: false }];
  render(<ExportPerspective workspaceId="workspace-a" files={files} />);
  await screen.findByTestId('mock-export-workbench');

  act(() => capturedGenerate?.());

  expect(mockGenerate).toHaveBeenCalledOnce();
  expect(mockGenerate).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: 'workspace-a', config: state.config, files })
  );
});
