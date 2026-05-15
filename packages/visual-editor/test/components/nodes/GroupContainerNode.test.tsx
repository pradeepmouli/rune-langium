// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupContainerNode } from '../../../src/components/nodes/GroupContainerNode.js';
import type { StructureRow } from '../../../src/types/structure-view.js';

const baseRows: StructureRow[] = [
  {
    attrName: 'tradeID',
    typeName: 'string',
    typeKind: 'BasicType',
    cardinality: '0..1',
    isOptional: true,
    isInherited: true
  }
];

describe('GroupContainerNode — base-type scope', () => {
  it('renders base type name and base rows directly inside the yellow body', () => {
    render(
      <GroupContainerNode
        data={{ scope: 'base-type', baseTypeName: 'TradeBase', baseRows }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );
    expect(screen.getByText('TradeBase')).toBeInTheDocument();
    expect(screen.getByText('tradeID')).toBeInTheDocument();
    expect(screen.getByText('string')).toBeInTheDocument();
  });
});
