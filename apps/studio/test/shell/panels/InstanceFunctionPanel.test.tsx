// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { fireEvent, render, screen } from '@testing-library/react';
import type { TypeGraphNode } from '@rune-langium/visual-editor';
import { useEditorStore } from '@rune-langium/visual-editor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewSessionClient } from '../../../src/services/preview-session-client.js';
import { PreviewSessionContext } from '../../../src/shell/providers/preview-session-context.js';
import { InstanceFunctionPanel } from '../../../src/shell/panels/InstanceFunctionPanel.js';
import { usePrototypeNavigationStore } from '../../../src/services/prototype-navigation.js';
import { usePrototypeViewStore } from '../../../src/store/prototype-view-store.js';

vi.mock('../../../src/components/WorkspaceTypePicker.js', () => ({
  WorkspaceTypePicker: ({ onSelect }: { onSelect(typeFqn: string | null): void }) => (
    <button type="button" onClick={() => onSelect('test.BuildParty')}>
      Choose test.BuildParty
    </button>
  )
}));

vi.mock('../../../src/components/FormPreviewPanel.js', () => ({
  FormPreviewPanel: () => <div data-testid="function-input-form" />
}));

function graphNode(id: string, namespace: string, data: object): TypeGraphNode {
  return { id, data, meta: { namespace } } as TypeGraphNode;
}

describe('InstanceFunctionPanel', () => {
  beforeEach(() => {
    useEditorStore.setState({
      nodesById: new Map([
        [
          'test.BuildParty',
          graphNode('test.BuildParty', 'test', {
            $type: 'RosettaFunction',
            output: { typeCall: { type: { $refText: 'Party' } }, card: { inf: 1, sup: 1 } }
          })
        ],
        ['test.Party', graphNode('test.Party', 'test', { $type: 'Data', name: 'Party' })]
      ])
    });
    usePrototypeViewStore.setState({
      workspaceId: 'workspace-a',
      state: {
        selectedId: null,
        query: '',
        typeFqn: null,
        inspectorTab: 'functions',
        graphVisible: false,
        compactPane: 'inspector'
      }
    });
    usePrototypeNavigationStore.setState({ pending: null });
  });

  it('saves a successful singular Data result through the shared Prototype creation intent', async () => {
    const client: PreviewSessionClient = {
      schema: vi.fn().mockResolvedValue({ schemaVersion: 1, targetId: 'test.BuildParty', status: 'ready', fields: [] }),
      execute: vi.fn().mockResolvedValue({ name: 'Acme' }),
      dispose: vi.fn()
    };
    render(
      <PreviewSessionContext.Provider value={() => client}>
        <InstanceFunctionPanel instanceId="missing-instance" />
      </PreviewSessionContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose test.BuildParty' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));

    expect(await screen.findByRole('button', { name: 'Save result as instance…' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save result as instance…' }));

    expect(usePrototypeNavigationStore.getState().pending).toEqual({
      workspaceId: 'workspace-a',
      intent: { kind: 'create', seed: { typeFqn: 'test.Party', data: { name: 'Acme' } } }
    });
  });
});
