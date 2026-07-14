// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormPreviewSchema } from '@rune-langium/codegen/export';
import { InstanceFormPanel } from '../../../src/shell/panels/InstanceFormPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

const partySchema: FormPreviewSchema = {
  schemaVersion: 1,
  targetId: 'test.instance.Party',
  title: 'Party',
  status: 'ready',
  fields: [{ path: 'name', label: 'Name', kind: 'string', required: true }]
};

describe('InstanceFormPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({
      instances: {},
      validationErrors: {},
      schemas: new Map(),
      schemaErrors: new Map()
    });
  });

  it('dispatches a schema fetch for the instance typeFqn on mount, on its own instance:generateSchema channel (finding #6/#7)', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.instance.Party', 'My Party');

    render(<InstanceFormPanel instanceId={id} />);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'instance:generateSchema', typeFqn: 'test.instance.Party' })
    );
  });

  it('renders an "unavailable" status once a schema fetch fails, instead of staying stuck on "Generating…" forever (finding #7)', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.instance.Party', 'My Party');

    render(<InstanceFormPanel instanceId={id} />);
    expect(screen.getByText(/generating preview for the selected type/i)).toBeInTheDocument();

    const requestId = postMessage.mock.calls[0]![0].requestId as string;
    act(() => {
      useInstanceStore
        .getState()
        .receiveSchemaStale(
          requestId,
          'unsupported-target',
          'No form preview schema is available for test.instance.Party.'
        );
    });

    expect(screen.getByText('No form preview schema is available for test.instance.Party.')).toBeInTheDocument();
  });

  it('renders a waiting status before the schema arrives, then a ready form once schemas has it', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.instance.Party', 'My Party');

    render(<InstanceFormPanel instanceId={id} />);

    expect(screen.getByText(/generating preview for the selected type/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Party' })).not.toBeInTheDocument();

    const requestId = postMessage.mock.calls[0]![0].requestId as string;
    act(() => {
      useInstanceStore.getState().receiveSchemaResult(requestId, partySchema);
    });

    expect(screen.getByRole('heading', { name: 'Party' })).toBeInTheDocument();
  });

  it('an edit + blur calls updateInstanceData with the instance id and the full updated values object', () => {
    useInstanceStore.setState((s) => ({ schemas: new Map(s.schemas).set('test.instance.Party', partySchema) }));
    const id = useInstanceStore.getState().createInstance('test.instance.Party', 'My Party');
    const updateInstanceDataSpy = vi.spyOn(useInstanceStore.getState(), 'updateInstanceData');

    render(<InstanceFormPanel instanceId={id} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    fireEvent.blur(screen.getByLabelText('Name'));

    expect(updateInstanceDataSpy).toHaveBeenCalledWith(id, { name: 'Acme' });
    expect(useInstanceStore.getState().instances[id]!.data).toEqual({ name: 'Acme' });

    updateInstanceDataSpy.mockRestore();
  });

  it('renders "Instance not found." for an unknown instanceId without crashing', () => {
    render(<InstanceFormPanel instanceId="does-not-exist" />);

    expect(screen.getByRole('status')).toHaveTextContent('Instance not found.');
  });
});
