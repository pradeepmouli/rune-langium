// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InstanceGridPanel } from '../../../src/shell/panels/InstanceGridPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';
import { usePrototypeViewStore } from '../../../src/store/prototype-view-store.js';

describe('InstanceGridPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({
      instances: {},
      validationErrors: {},
      validationStatus: {},
      saveStates: {},
      recordRevisions: {}
    });
    usePrototypeViewStore.setState({
      state: {
        selectedId: null,
        query: '',
        typeFqn: null,
        inspectorTab: 'form',
        graphVisible: false,
        compactPane: 'inspector'
      }
    });
  });

  it('renames an instance through the lifecycle action', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'Acme');
    render(<InstanceGridPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Instance name'), { target: { value: 'Acme Holdings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename', exact: true }));

    expect(useInstanceStore.getState().instances[id]?.name).toBe('Acme Holdings');
  });

  it('requires confirmation before deleting an instance', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'Acme');
    render(<InstanceGridPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete instance?' })).toBeVisible();
    expect(useInstanceStore.getState().instances[id]).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useInstanceStore.getState().instances[id]).toBeDefined();
  });
});
