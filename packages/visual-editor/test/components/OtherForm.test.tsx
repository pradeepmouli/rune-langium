// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for OtherForm component rendering.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OtherForm } from '../../src/components/panels/OtherForm.js';
import type { AnyGraphNode } from '../../src/types.js';
import { testMeta } from '../helpers/node-meta.js';

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
    const { container } = render(<OtherForm nodeData={null} meta={testMeta('test.model')} />);
    expect(container.textContent).toBe('');
  });

  it('renders validation errors when present', () => {
    // Validation errors are UI metadata — they live on the node.meta sibling.
    const meta = testMeta('test.model', {
      errors: [{ nodeId: 'test', severity: 'error', message: 'Circular inheritance detected' }]
    });
    render(<OtherForm nodeData={mockNodeData} meta={meta} />);
    expect(screen.getByText('Circular inheritance detected')).toBeTruthy();
  });
});
