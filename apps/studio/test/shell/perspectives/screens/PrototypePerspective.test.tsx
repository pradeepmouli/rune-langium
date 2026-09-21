// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrototypePerspective } from '../../../../src/shell/perspectives/screens/PrototypePerspective.js';
import { useInstanceStore } from '../../../../src/store/instance-store.js';
import { usePrototypeViewStore } from '../../../../src/store/prototype-view-store.js';
import { installFakeValidatingWorkerForInstances } from '../../../helpers/fake-validating-worker.js';

describe('PrototypePerspective', () => {
  beforeEach(() => {
    useInstanceStore.setState({
      instances: {},
      validationErrors: {},
      validationStatus: {},
      schemas: new Map(),
      schemaErrors: new Map(),
      saveStates: {},
      recordRevisions: {}
    });
    usePrototypeViewStore.setState({
      workspaceId: null,
      state: { selectedId: null, query: '', typeFqn: null, inspectorTab: 'form', graphVisible: false }
    });
  });

  it('renders the empty state when no instance is selected', () => {
    render(<PrototypePerspective />);
    expect(screen.getByTestId('prototype-perspective')).toBeInTheDocument();
    expect(screen.getByText(/select or create an instance to inspect it/i)).toBeInTheDocument();
  });

  it('selecting a grid row opens its Form tab by default', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'Acme');
    render(<PrototypePerspective />);
    fireEvent.click(screen.getByRole('row', { name: /Acme/ }));
    expect(usePrototypeViewStore.getState().state.selectedId).toBe(id);
    expect(screen.getByRole('tab', { name: 'Form' })).toBeInTheDocument();
    expect(screen.getByText(/generating preview for the selected type/i)).toBeInTheDocument();
  });

  it('keeps Inspector details with the selected Form', () => {
    useInstanceStore.getState().createInstance('test.Party', 'Acme');
    render(<PrototypePerspective />);
    fireEvent.click(screen.getByRole('row', { name: /Acme/ }));
    expect(screen.getAllByText('Validation')).not.toHaveLength(0);
    expect(screen.getByText('Provenance')).toBeInTheDocument();
    expect(screen.getByLabelText('Instance payload')).toBeInTheDocument();
  });

  it('opens the shared creation dialog with imported JSON values', async () => {
    render(<PrototypePerspective />);
    const file = new File(['{"name":"Acme"}'], 'party.json', { type: 'application/json' });

    fireEvent.change(screen.getByLabelText('Import JSON'), { target: { files: [file] } });

    expect(await screen.findByRole('heading', { name: 'New instance' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Instance type' })).toBeVisible();
  });

  it('keeps malformed JSON out of the creation flow', async () => {
    render(<PrototypePerspective />);
    const file = new File(['{'], 'broken.json', { type: 'application/json' });

    fireEvent.change(screen.getByLabelText('Import JSON'), { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/JSON/i);
    expect(screen.queryByRole('heading', { name: 'New instance' })).not.toBeInTheDocument();
  });

  it('does not carry over stale field-level validation errors when switching between instances of the same type (finding #8)', () => {
    const partySchema = {
      schemaVersion: 1 as const,
      targetId: 'test.Party',
      title: 'Party',
      status: 'ready' as const,
      fields: [{ path: 'name', label: 'Name', kind: 'string' as const, required: true }]
    };
    useInstanceStore.setState((s) => ({
      schemas: new Map(s.schemas).set('test.Party', partySchema)
    }));
    installFakeValidatingWorkerForInstances(partySchema);
    const idA = useInstanceStore.getState().createInstance('test.Party', 'Instance A');
    const idB = useInstanceStore.getState().createInstance('test.Party', 'Instance B');
    // Instance B has its own genuinely-valid data (not just "never
    // touched") — createInstance/updateInstanceData validate eagerly on
    // every change (round-5 finding #2), so B's own validationErrors entry
    // is real, not absent-because-unvalidated. This isolates the actual
    // regression this test guards against: A's error must not leak onto
    // B, distinct from B correctly having no error of its own.
    act(() => {
      useInstanceStore.getState().updateInstanceData(idB, { name: 'Bob' });
    });

    render(<PrototypePerspective />);

    // Select instance A and blur its empty required field to produce a
    // validation error.
    act(() => {
      fireEvent.click(screen.getByRole('row', { name: /Instance A/ }));
    });
    act(() => {
      fireEvent.blur(screen.getByLabelText('Name'));
    });
    expect(screen.getAllByText('Name is required')).not.toHaveLength(0);

    // Switch to instance B — its Name field is genuinely valid, so it must
    // NOT show A's stale error.
    act(() => {
      fireEvent.click(screen.getByRole('row', { name: /Instance B/ }));
    });

    expect(screen.queryAllByText('Name is required')).toHaveLength(0);
    expect(useInstanceStore.getState().instances[idA]).toBeDefined();
    expect(useInstanceStore.getState().instances[idB]).toBeDefined();
  });
});
