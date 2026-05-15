// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DataNode } from '../../../src/components/nodes/DataNode.js';

// formatCardinality expects { inf, sup?, unbounded } shape
const data = {
  $type: 'Data',
  name: 'Trade',
  attributes: [
    { name: 'tradeDate', typeCall: { type: { $refText: 'date' } }, card: { inf: 0, sup: 1, unbounded: false } },
    { name: 'economics', typeCall: { type: { $refText: 'Economics' } }, card: { inf: 0, unbounded: true } }
  ],
  variant: 'structure'
};

function renderInFlow(jsx: React.ReactNode) {
  return render(<ReactFlowProvider>{jsx}</ReactFlowProvider>);
}

describe('DataNode — structure variant', () => {
  it('renders a children-slot region next to rows', () => {
    renderInFlow(<DataNode data={data as any} selected={false} id="Trade" type="data" />);
    expect(screen.getByTestId('data-node-children')).toBeInTheDocument();
  });

  it('emits a per-row source Handle for each member', () => {
    renderInFlow(<DataNode data={data as any} selected={false} id="Trade" type="data" />);
    expect(screen.getByTestId('row-handle-tradeDate')).toBeInTheDocument();
    expect(screen.getByTestId('row-handle-economics')).toBeInTheDocument();
  });

  it('renders injected cell components when provided in data.cellComponents', () => {
    const Custom = ({ value }: { value: string }) => <em data-testid="custom-cell">{value}</em>;
    const data2 = { ...data, cellComponents: { name: (props: any) => <Custom value={props.value} /> } };
    renderInFlow(<DataNode data={data2 as any} selected={false} id="Trade" type="data" />);
    const cells = screen.getAllByTestId('custom-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveTextContent('tradeDate');
  });
});
