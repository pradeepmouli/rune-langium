// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DataNode } from '../../../src/components/nodes/DataNode.js';
import type { StructureRow } from '../../../src/types/structure-view.js';

// Canonical StructureRow shape as emitted by layoutStructureGraph
const rows: StructureRow[] = [
  {
    attrName: 'tradeDate',
    typeName: 'date',
    typeKind: 'BasicType',
    cardinality: '0..1',
    isOptional: true,
    isInherited: false
  },
  {
    attrName: 'economics',
    typeName: 'Economics',
    typeKind: 'Data',
    cardinality: '0..*',
    isOptional: true,
    isInherited: false
  }
];

const data = {
  $type: 'Data',
  id: 'Trade',
  kind: 'data',
  name: 'Trade',
  namespaceUri: 'test.ns',
  rows,
  expansions: new Map(),
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
    const data2 = {
      ...data,
      cellComponents: {
        name: ({ value, nodeId: _n, attrName: _a }: { value: string; nodeId: string; attrName: string }) => (
          <Custom value={value} />
        )
      }
    };
    renderInFlow(<DataNode data={data2 as any} selected={false} id="Trade" type="data" />);
    const cells = screen.getAllByTestId('custom-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveTextContent('tradeDate');
  });
});
