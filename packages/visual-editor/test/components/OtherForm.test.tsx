// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for OtherForm component rendering.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OtherForm } from '../../src/components/panels/OtherForm.js';
import type { AnyGraphNode } from '../../src/types.js';

describe('OtherForm', () => {
  const mockNodeData: AnyGraphNode = {
    $type: 'Data',
    name: 'Trade',
    namespace: 'test.model',
    definition: 'Represents a trade event',
    attributes: [
      {
        $type: 'Attribute',
        name: 'tradeDate',
        typeCall: { $type: 'TypeCall', type: { $refText: 'date' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      },
      {
        $type: 'Attribute',
        name: 'product',
        typeCall: { $type: 'TypeCall', type: { $refText: 'Product' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      }
    ],
    superType: { $refText: 'Event' },
    conditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;

  it('renders nothing when nodeData is null', () => {
    const { container } = render(<OtherForm nodeData={null} />);
    expect(container.textContent).toBe('');
  });

  it('renders validation errors when present', () => {
    const dataWithErrors: AnyGraphNode = {
      ...mockNodeData,
      errors: [{ nodeId: 'test', severity: 'error', message: 'Circular inheritance detected' }]
    } as AnyGraphNode;
    render(<OtherForm nodeData={dataWithErrors} />);
    expect(screen.getByText('Circular inheritance detected')).toBeTruthy();
  });
});
