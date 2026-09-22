// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosettaModel } from '@rune-langium/core';
import type { PreviewSessionClient } from '../../../src/services/preview-session-client.js';
import { PreviewSessionContext } from '../../../src/shell/providers/preview-session-context.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';
import { InstanceFunctionPanel } from '../../../src/shell/panels/InstanceFunctionPanel.js';
import { usePrototypeNavigationStore } from '../../../src/services/prototype-navigation.js';
import { usePrototypeViewStore } from '../../../src/store/prototype-view-store.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

vi.mock('../../../src/components/WorkspaceTypePicker.js', () => ({
  WorkspaceTypePicker: ({ onSelectOption }: { onSelectOption(option: { value: string } | null): void }) => (
    <button type="button" onClick={() => onSelectOption({ value: 'test.BuildParty#RosettaFunction' })}>
      Choose test.BuildParty
    </button>
  )
}));

vi.mock('../../../src/components/FormPreviewPanel.js', () => ({
  FormPreviewPanel: ({ onExecute }: { onExecute?: unknown }) => (
    <div data-testid="function-input-form">{onExecute ? 'embedded run enabled' : 'embedded run unavailable'}</div>
  )
}));

function functionModels(): RosettaModel[] {
  const model = { name: 'test', elements: [] } as unknown as RosettaModel;
  const party = { $type: 'Data', name: 'Party', $container: model };
  const buildParty = {
    $type: 'RosettaFunction',
    name: 'BuildParty',
    $container: model,
    inputs: [],
    output: { card: { inf: 1, sup: 1 }, typeCall: { type: { ref: party } } }
  };
  model.elements.push(party as never, buildParty as never);
  return [model];
}

const workspace: WorkspaceState = {
  workspaceId: 'workspace-a',
  workspaceKind: 'browser-only',
  workspaceName: 'workspace-a',
  fileCount: 0,
  files: [],
  models: functionModels(),
  parsedModels: [],
  deferredExports: [],
  parseErrors: new Map()
};

describe('InstanceFunctionPanel', () => {
  beforeEach(() => {
    workspace.models = functionModels();
    usePrototypeViewStore.setState({
      workspaceId: 'workspace-a',
      state: {
        selectedId: null,
        query: '',
        typeFqn: null,
        inspectorTab: 'functions',
        graphVisible: false
      }
    });
    usePrototypeNavigationStore.setState({ pending: null });
    useInstanceStore.setState({
      instances: {},
      validationErrors: {},
      validationStatus: {},
      saveStates: {},
      recordRevisions: {}
    });
  });

  it('saves a successful singular Data result through the shared Prototype creation intent', async () => {
    const client: PreviewSessionClient = {
      schema: vi.fn().mockResolvedValue({ schemaVersion: 1, targetId: 'test.BuildParty', status: 'ready', fields: [] }),
      execute: vi.fn().mockResolvedValue({ name: 'Acme' }),
      dispose: vi.fn()
    };
    render(
      <WorkspaceStateContext.Provider value={workspace}>
        <PreviewSessionContext.Provider value={() => client}>
          <InstanceFunctionPanel instanceId="missing-instance" />
        </PreviewSessionContext.Provider>
      </WorkspaceStateContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose test.BuildParty' }));
    expect(await screen.findByText('embedded run unavailable')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));

    expect(await screen.findByRole('button', { name: 'Save result as instance…' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save result as instance…' }));

    expect(usePrototypeNavigationStore.getState().pending).toEqual({
      workspaceId: 'workspace-a',
      intent: { kind: 'create', seed: { typeFqn: 'test.Party', data: { name: 'Acme' } } }
    });
  });

  it('disposes the function session and clears its selection when the inspected instance changes', async () => {
    const client: PreviewSessionClient = {
      schema: vi.fn().mockResolvedValue({ schemaVersion: 1, targetId: 'test.BuildParty', status: 'ready', fields: [] }),
      execute: vi.fn().mockResolvedValue({ name: 'Acme' }),
      dispose: vi.fn()
    };
    const renderPanel = (instanceId: string) => (
      <WorkspaceStateContext.Provider value={workspace}>
        <PreviewSessionContext.Provider value={() => client}>
          <InstanceFunctionPanel instanceId={instanceId} />
        </PreviewSessionContext.Provider>
      </WorkspaceStateContext.Provider>
    );
    const { rerender } = render(renderPanel('instance-a'));

    fireEvent.click(screen.getByRole('button', { name: 'Choose test.BuildParty' }));
    expect(await screen.findByText('embedded run unavailable')).toBeVisible();

    rerender(renderPanel('instance-b'));

    expect(screen.getByText('Choose a function to run.')).toBeVisible();
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });

  it('offers instance binding only to inputs that accept the selected instance type', async () => {
    const instanceId = useInstanceStore.getState().createInstance('test.Party', 'Acme', { name: 'Acme' });
    const client: PreviewSessionClient = {
      schema: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        targetId: 'test.BuildParty',
        status: 'ready',
        kind: 'function',
        fields: [
          {
            path: 'names',
            label: 'Names',
            kind: 'array',
            required: false,
            children: [{ path: 'names[]', label: 'Name', kind: 'string', required: true }]
          },
          {
            path: 'address',
            label: 'Address',
            kind: 'object',
            required: true,
            referencedTypeFqn: 'test.Address',
            children: []
          },
          {
            path: 'parties',
            label: 'Parties',
            kind: 'array',
            required: false,
            children: [
              {
                path: 'parties[]',
                label: 'Party',
                kind: 'object',
                required: true,
                referencedTypeFqn: 'test.Party',
                children: []
              }
            ]
          }
        ]
      }),
      execute: vi.fn(),
      dispose: vi.fn()
    };
    render(
      <WorkspaceStateContext.Provider value={workspace}>
        <PreviewSessionContext.Provider value={() => client}>
          <InstanceFunctionPanel instanceId={instanceId} />
        </PreviewSessionContext.Provider>
      </WorkspaceStateContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose test.BuildParty' }));

    expect(await screen.findByRole('button', { name: 'Use Acme for Parties' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Use Acme for Names' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use Acme for Address' })).not.toBeInTheDocument();
  });
});
