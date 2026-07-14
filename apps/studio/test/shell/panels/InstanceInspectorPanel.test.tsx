// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceInspectorPanel } from '../../../src/shell/panels/InstanceInspectorPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

describe('InstanceInspectorPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, validationErrors: {} });
  });

  it('shows raw JSON and a validation summary for the selected instance', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().updateInstanceData(id, { name: 'Acme' });
    // updateInstanceData auto-dispatches a validate request; grab its requestId
    // to simulate the worker's async reply, the same way real production code does.
    const requestId = postMessage.mock.calls.at(-1)?.[0]?.requestId as string;
    useInstanceStore.getState().receiveValidateResult(requestId, [{ path: 'name', message: 'too short' }]);
    render(<InstanceInspectorPanel instanceId={id} />);
    expect(screen.getByText(/"Acme"/)).toBeInTheDocument();
    expect(screen.getByText('too short')).toBeInTheDocument();
  });
});
