// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrototypePerspective } from '../../../../src/shell/perspectives/screens/PrototypePerspective.js';
import { useInstanceStore } from '../../../../src/store/instance-store.js';

describe('PrototypePerspective', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, validationErrors: {}, schemas: new Map() });
  });

  it('renders the empty state when no instance is selected', () => {
    render(<PrototypePerspective />);
    expect(screen.getByTestId('prototype-perspective')).toBeInTheDocument();
    expect(screen.getByText(/select an instance from the list, or create one/i)).toBeInTheDocument();
  });

  it('creating an instance via the explorer selects it and shows the Fields tab by default', () => {
    render(<PrototypePerspective />);

    fireEvent.change(screen.getByLabelText('New instance type'), { target: { value: 'test.Party' } });
    fireEvent.change(screen.getByLabelText('New instance name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // Empty state is gone, tabs are present, Fields tab active by default —
    // InstanceFormPanel has no worker attached in this test, so it renders
    // its "waiting" status (matching InstanceFormPanel.test.tsx's own pattern).
    expect(screen.queryByText(/select an instance from the list, or create one/i)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.getByText(/generating preview for the selected type/i)).toBeInTheDocument();
  });

  it('switching to the Inspector tab shows InstanceInspectorPanel content for the same instance', () => {
    render(<PrototypePerspective />);

    fireEvent.change(screen.getByLabelText('New instance type'), { target: { value: 'test.Party' } });
    fireEvent.change(screen.getByLabelText('New instance name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
    act(() => {
      fireEvent.click(inspectorTab);
    });

    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.getByText('Provenance')).toBeInTheDocument();
    expect(screen.getByText('Raw JSON')).toBeInTheDocument();
  });
});
