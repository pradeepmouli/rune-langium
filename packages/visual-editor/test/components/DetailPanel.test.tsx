/**
 * Unit tests for DetailPanel component rendering.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailPanel } from '../../src/components/panels/DetailPanel.js';
import type { TypeNodeData } from '../../src/types.js';

describe('DetailPanel', () => {
  const mockNodeData: TypeNodeData = {
    kind: 'data',
    name: 'Trade',
    namespace: 'test.model',
    definition: 'Represents a trade event',
    members: [
      { name: 'tradeDate', typeName: 'date', cardinality: '(1..1)', isOverride: false },
      { name: 'product', typeName: 'Product', cardinality: '(1..1)', isOverride: false }
    ],
    parentName: 'Event',
    hasExternalRefs: false,
    errors: []
  };

  it('renders type name and kind', () => {
    render(<DetailPanel nodeData={mockNodeData} />);
    expect(screen.getByText('Trade')).toBeTruthy();
    expect(screen.getByText('data')).toBeTruthy();
  });

  it('renders namespace', () => {
    render(<DetailPanel nodeData={mockNodeData} />);
    expect(screen.getByText('test.model')).toBeTruthy();
  });

  it('renders definition when present', () => {
    render(<DetailPanel nodeData={mockNodeData} />);
    expect(screen.getByText('Represents a trade event')).toBeTruthy();
  });

  it('renders member list', () => {
    render(<DetailPanel nodeData={mockNodeData} />);
    expect(screen.getByText('tradeDate')).toBeTruthy();
    expect(screen.getByText('product')).toBeTruthy();
  });

  it('renders parent name when present', () => {
    render(<DetailPanel nodeData={mockNodeData} />);
    expect(screen.getByText('Event')).toBeTruthy();
  });

  it('renders nothing when nodeData is null', () => {
    const { container } = render(<DetailPanel nodeData={null} />);
    expect(container.textContent).toBe('');
  });

  it('renders validation errors when present', () => {
    const dataWithErrors: TypeNodeData = {
      ...mockNodeData,
      errors: [{ nodeId: 'test', severity: 'error', message: 'Circular inheritance detected' }]
    };
    render(<DetailPanel nodeData={dataWithErrors} />);
    expect(screen.getByText('Circular inheritance detected')).toBeTruthy();
  });
});
