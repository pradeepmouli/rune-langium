// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstanceGraphPanel } from '../../../src/shell/panels/InstanceGraphPanel.js';

const flow = vi.fn(() => <div data-testid="flow" />);
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: unknown) => flow(props),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => null
}));

describe('InstanceGraphPanel', () => {
  it('renders containment nodes without inventing an external-id edge', () => {
    render(
      <InstanceGraphPanel
        record={{
          id: 'one',
          name: 'Party',
          typeFqn: 'test.Party',
          data: { externalId: 'two', address: { city: 'London' } },
          createdAt: 0,
          modifiedAt: 0
        }}
      />
    );
    expect(screen.getByLabelText('Payload graph')).toBeInTheDocument();
    const props = flow.mock.calls[0][0] as { nodes: Array<{ data: { label: string } }>; edges: unknown[] };
    expect(props.nodes.map((node) => node.data.label)).toEqual(['Party', '/address']);
    expect(props.edges).toHaveLength(1);
  });
});
