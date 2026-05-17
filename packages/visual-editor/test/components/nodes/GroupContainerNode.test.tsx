// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupContainerNode } from '../../../src/components/nodes/GroupContainerNode.js';
import { expansionKey } from '../../../src/types/structure-view.js';
import type { StructureRow, StructureExpansionKey } from '../../../src/types/structure-view.js';

const NS = 'cdm.base';
const BASE_TYPE_NAME = 'TradeBase';
// React Flow id for the base container node (used in ownerInstancePath after fix).
const BASE_CONTAINER_ID = 'cdm.trade::Trade::__base::cdm.base::TradeBase';

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
        id={BASE_CONTAINER_ID}
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
  // Phase 14d (fix): ownerInstancePath = [...(instancePath ?? []), id].
  // For this fixture: no instancePath in data, id = BASE_CONTAINER_ID.
  // → ownerInstancePath = [BASE_CONTAINER_ID].
  const dataRowKey: StructureExpansionKey = {
    namespaceUri: NS,
    typeId: BASE_TYPE_NAME,
    attrName: dataRow.attrName,
    instancePath: [BASE_CONTAINER_ID]
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
        id={BASE_CONTAINER_ID}
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
        id={BASE_CONTAINER_ID}
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
        id={BASE_CONTAINER_ID}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    expect(chevronBtn).toHaveAttribute('aria-expanded', 'false');
    expect(chevronBtn).toHaveAttribute('aria-label', `Expand ${dataRow.attrName}`);
  });

  it('calls onToggleExpansion with the self-inclusive instancePath key on chevron click', () => {
    // Phase 14d (fix): ownerInstancePath = [...(instancePath ?? []), id]
    // No data.instancePath → ownerInstancePath = [BASE_CONTAINER_ID]
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
        id={BASE_CONTAINER_ID}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    fireEvent.click(chevronBtn);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith({
      namespaceUri: NS,
      typeId: BASE_TYPE_NAME,
      attrName: dataRow.attrName,
      instancePath: [BASE_CONTAINER_ID]
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
        id={BASE_CONTAINER_ID}
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
        id={BASE_CONTAINER_ID}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );

    const chevronBtn = screen.getByTestId(`base-expand-row-${dataRow.attrName}`);
    // Should not throw
    expect(() => fireEvent.click(chevronBtn)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase 14d (fix) — per-instance parity for base container nodes
//
// Two visible occurrences of the same base type (e.g., TradeBase wrapping
// buyer's Trade and seller's Trade) must have independent chevron keys.
// ---------------------------------------------------------------------------

describe('GroupContainerNode — Phase 14d fix — per-instance parity', () => {
  const partyDataRow: StructureRow = {
    attrName: 'party',
    typeName: 'Party',
    typeKind: 'Data',
    cardinality: '0..1',
    isOptional: true,
    isInherited: true
  };

  const BUYER_BASE_ID = 'cdm.trade::Trade::buyer::cdm.trade::Trade::__base::cdm.base::TradeBase';
  const SELLER_BASE_ID = 'cdm.trade::Trade::seller::cdm.trade::Trade::__base::cdm.base::TradeBase';

  const BUYER_EXPANDED_KEY = expansionKey({
    namespaceUri: NS,
    typeId: BASE_TYPE_NAME,
    attrName: 'party',
    instancePath: [BUYER_BASE_ID]
  });
  const SELLER_EXPANDED_KEY = expansionKey({
    namespaceUri: NS,
    typeId: BASE_TYPE_NAME,
    attrName: 'party',
    instancePath: [SELLER_BASE_ID]
  });

  it('buyer and seller base container keys serialize to DIFFERENT strings', () => {
    expect(BUYER_EXPANDED_KEY).not.toBe(SELLER_EXPANDED_KEY);
  });

  it('chevron on buyer base container fires key with buyer rfId', () => {
    const buyerToggle = vi.fn();
    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows: [partyDataRow],
          onToggleExpansion: buyerToggle
        }}
        id={BUYER_BASE_ID}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );
    fireEvent.click(screen.getByTestId('base-expand-row-party'));
    expect(buyerToggle).toHaveBeenCalledTimes(1);
    const fired = buyerToggle.mock.calls[0][0] as StructureExpansionKey;
    expect(fired.instancePath).toEqual([BUYER_BASE_ID]);
    expect(fired.instancePath).not.toContain(SELLER_BASE_ID);
  });

  it('buyer-expanded map shows EXPANDED for buyer base, COLLAPSED for seller base', () => {
    const buyerOnlyMap = new Map<string, boolean>([[BUYER_EXPANDED_KEY, true]]);

    const { unmount } = render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows: [partyDataRow],
          expansionMap: buyerOnlyMap
        }}
        id={BUYER_BASE_ID}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );
    expect(screen.getByTestId('base-expand-row-party')).toHaveAttribute('aria-expanded', 'true');
    unmount();

    render(
      <GroupContainerNode
        data={{
          scope: 'base-type',
          baseTypeName: BASE_TYPE_NAME,
          baseTypeNamespaceUri: NS,
          baseRows: [partyDataRow],
          expansionMap: buyerOnlyMap
        }}
        id={SELLER_BASE_ID}
        // @ts-expect-error — NodeProps fields not all needed for unit test
      />
    );
    expect(screen.getByTestId('base-expand-row-party')).toHaveAttribute('aria-expanded', 'false');
  });
});
