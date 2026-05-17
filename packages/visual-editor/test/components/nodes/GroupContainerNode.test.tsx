// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupContainerNode } from '../../../src/components/nodes/GroupContainerNode.js';
import { expansionKey } from '../../../src/types/structure-view.js';
import type { StructureRow, StructureExpansionKey } from '../../../src/types/structure-view.js';

const NS = 'cdm.base';
const BASE_TYPE_NAME = 'TradeBase';
const BASE_TYPE_ID = `${NS}::${BASE_TYPE_NAME}`;

const dataRow: StructureRow = {
  attrName: 'economics',
  typeName: 'Economics',
  typeKind: 'Data',
  cardinality: '0..1',
  isOptional: true,
  isInherited: true
};

const enumRow: StructureRow = {
  attrName: 'tradeID',
  typeName: 'string',
  typeKind: 'BasicType',
  cardinality: '0..1',
  isOptional: true,
  isInherited: true
};

const baseRows: StructureRow[] = [dataRow, enumRow];

// ---------------------------------------------------------------------------
// Legacy test (preserved — base-type scope basic rendering)
// ---------------------------------------------------------------------------

describe('GroupContainerNode — base-type scope', () => {
  it('renders base type name and base rows directly inside the yellow body', () => {
    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows: [enumRow]
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );
    expect(screen.getByText(BASE_TYPE_NAME)).toBeInTheDocument();
    expect(screen.getByText('tradeID')).toBeInTheDocument();
    expect(screen.getByText('string')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Codex P2 / PR #191 — expansion chevron on inherited rows
// ---------------------------------------------------------------------------

describe('GroupContainerNode — base-type expansion chevron (Codex P2, PR #191)', () => {
  const dataRowKey: StructureExpansionKey = {
    namespaceUri: NS,
    typeId: BASE_TYPE_ID,
    attrName: dataRow.attrName
  };

  it('renders a chevron button for a Data row and a spacer for a non-expandable row', () => {
    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );
    // Data row → chevron button present
    expect(screen.getByTestId(`base-expand-row-${dataRow.attrName}`)).toBeInTheDocument();
    // BasicType row → no chevron button
    expect(screen.queryByTestId(`base-expand-row-${enumRow.attrName}`)).toBeNull();
  });

  it('renders the chevron in EXPANDED state when expansionMap marks the Data row as expanded', () => {
    const expandedMap = new Map([[expansionKey(dataRowKey), true]]);

    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows,
          expansionMap: expandedMap
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    expect(chevronBtn).toHaveAttribute('aria-expanded', 'true');
    expect(chevronBtn).toHaveAttribute('aria-label', `Collapse ${dataRow.attrName}`);
  });

  it('renders the chevron in COLLAPSED state when expansionMap marks the Data row as false', () => {
    const collapsedMap = new Map([[expansionKey(dataRowKey), false]]);

    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows,
          expansionMap: collapsedMap
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    expect(chevronBtn).toHaveAttribute('aria-expanded', 'false');
    expect(chevronBtn).toHaveAttribute('aria-label', `Expand ${dataRow.attrName}`);
  });

  it('calls onToggleExpansion with the canonical base-type key on chevron click', () => {
    const onToggle = vi.fn();

    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows,
          onToggleExpansion: onToggle
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    fireEvent.click(chevronBtn);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith({
      namespaceUri: NS,
      typeId: BASE_TYPE_ID,
      attrName: dataRow.attrName
    } satisfies StructureExpansionKey);
  });

  it('aria-label is meaningful — contains the row attribute name', () => {
    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows: [dataRow]
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    const label = chevronBtn.getAttribute('aria-label') ?? '';
    expect(label).toContain(dataRow.attrName);
  });

  it('does not call onToggleExpansion when it is not provided (no crash)', () => {
    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows: [dataRow]
          // no onToggleExpansion
        }}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    // Should not throw
    expect(() => fireEvent.click(chevronBtn)).not.toThrow();
  });
});
