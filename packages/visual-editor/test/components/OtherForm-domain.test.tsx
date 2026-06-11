// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Deliverable C — regression guard for OtherForm rendered output when
 * the parent-name read is re-pointed through `toDomain(d).extends`.
 *
 * Tests assert the RENDERED OUTPUT (member names, type links, parent name)
 * is UNCHANGED after the refactor for Data, Enum, Func (routed through
 * toDomain.extends) and Choice, Record, Annotation (kept on direct reads).
 *
 * Written BEFORE the refactor; green baseline asserts current behavior.
 * The refactor must keep them green.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OtherForm } from '../../src/components/panels/OtherForm.js';
import type { AnyGraphNode } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Node fixtures
// ---------------------------------------------------------------------------

function makeAttr(name: string, typeRef: string, inf = 1, sup = 1) {
  return {
    $type: 'Attribute',
    name,
    typeCall: { $type: 'TypeCall', type: { $refText: typeRef } },
    card: { $type: 'RosettaCardinality', inf, sup, unbounded: false },
    override: false
  };
}

const DATA_NODE: AnyGraphNode = {
  $type: 'Data',
  name: 'Trade',
  namespace: 'test.model',
  definition: 'A financial trade',
  superType: { $refText: 'Event' },
  attributes: [makeAttr('tradeDate', 'date'), makeAttr('product', 'Product')],
  conditions: [],
  annotations: [],
  synonyms: [],
  references: [],
  position: { x: 0, y: 0 },
  hasExternalRefs: false,
  errors: []
} as AnyGraphNode;

const ENUM_NODE: AnyGraphNode = {
  $type: 'RosettaEnumeration',
  name: 'CurrencyEnum',
  namespace: 'test.model',
  definition: 'Currency codes',
  parent: { $refText: 'BaseEnum' },
  enumValues: [
    { $type: 'RosettaEnumValue', name: 'USD' },
    { $type: 'RosettaEnumValue', name: 'EUR' },
    { $type: 'RosettaEnumValue', name: 'GBP' }
  ],
  annotations: [],
  synonyms: [],
  references: [],
  position: { x: 0, y: 0 },
  hasExternalRefs: false,
  errors: []
} as AnyGraphNode;

const FUNC_NODE: AnyGraphNode = {
  $type: 'RosettaFunction',
  name: 'CalcInterest',
  namespace: 'test.model',
  definition: 'Calculates interest',
  superFunction: { $refText: 'BaseCalc' },
  inputs: [makeAttr('principal', 'number'), makeAttr('rate', 'number')],
  output: makeAttr('result', 'number'),
  conditions: [],
  postConditions: [],
  annotations: [],
  shortcuts: [],
  operations: [],
  references: [],
  position: { x: 0, y: 0 },
  hasExternalRefs: false,
  errors: []
} as AnyGraphNode;

const CHOICE_NODE: AnyGraphNode = {
  $type: 'Choice',
  name: 'PaymentType',
  namespace: 'test.model',
  attributes: [
    { $type: 'ChoiceOption', typeCall: { $type: 'TypeCall', type: { $refText: 'CashPayment' } } },
    { $type: 'ChoiceOption', typeCall: { $type: 'TypeCall', type: { $refText: 'PhysicalSettlement' } } }
  ],
  annotations: [],
  synonyms: [],
  position: { x: 0, y: 0 },
  hasExternalRefs: false,
  errors: []
} as AnyGraphNode;

const RECORD_NODE: AnyGraphNode = {
  $type: 'RosettaRecordType',
  name: 'MyRecord',
  namespace: 'test.model',
  features: [
    {
      $type: 'RosettaRecordFeature',
      name: 'recordDate',
      typeCall: { $type: 'TypeCall', type: { $refText: 'date' } },
      card: { $type: 'RosettaCardinality', inf: 1, sup: 1, unbounded: false }
    }
  ],
  position: { x: 0, y: 0 },
  hasExternalRefs: false,
  errors: []
} as AnyGraphNode;

const ANNOTATION_NODE: AnyGraphNode = {
  $type: 'Annotation',
  name: 'MyAnnotation',
  namespace: 'test.model',
  attributes: [makeAttr('label', 'string')],
  position: { x: 0, y: 0 },
  hasExternalRefs: false,
  errors: []
} as AnyGraphNode;

// ---------------------------------------------------------------------------
// Tests — parent name rendering
// ---------------------------------------------------------------------------

describe('OtherForm parent name rendering (Deliverable C baseline)', () => {
  it('Data: renders parent name from superType.$refText', () => {
    render(<OtherForm nodeData={DATA_NODE} />);
    // ExtendsField renders the parentName as a TypeLink inside the "Extends" section
    expect(screen.getByText('Event')).toBeTruthy();
    expect(screen.getByText('Extends')).toBeTruthy();
  });

  it('RosettaEnumeration: renders parent name from parent.$refText', () => {
    render(<OtherForm nodeData={ENUM_NODE} />);
    expect(screen.getByText('BaseEnum')).toBeTruthy();
    expect(screen.getByText('Extends')).toBeTruthy();
  });

  it('RosettaFunction: renders parent name from superFunction.$refText', () => {
    render(<OtherForm nodeData={FUNC_NODE} />);
    expect(screen.getByText('BaseCalc')).toBeTruthy();
    expect(screen.getByText('Extends')).toBeTruthy();
  });

  it('Choice: renders no Extends section (no inheritance)', () => {
    render(<OtherForm nodeData={CHOICE_NODE} />);
    expect(screen.queryByText('Extends')).toBeNull();
  });

  // Graceful-degradation guard: curated nodes now carry `$type` (Phase 2
  // typeKind→$type unification), but OtherForm must still render WITHOUT
  // throwing when handed an unexpected/legacy shape. Routing the parent-name
  // through the generated `toDomain` (which throws `Unknown node type: …` on
  // an unrecognized `$type`) would crash the form via FormErrorBoundary on
  // exactly these nodes. The direct getRefText chain returns `undefined`
  // gracefully — this test locks that in.
  it('curated $type-less node (typeKind only): renders without throwing, no Extends', () => {
    const curatedNode = {
      typeKind: 'enum',
      name: 'CuratedEnum',
      namespace: 'curated.ns',
      enumValues: [{ name: 'A' }, { name: 'B' }],
      position: { x: 0, y: 0 },
      hasExternalRefs: false,
      errors: []
    } as unknown as AnyGraphNode;

    expect(() => render(<OtherForm nodeData={curatedNode} refOnly />)).not.toThrow();
    // The node still renders (name visible), and no error-boundary fallback text.
    expect(screen.getByText('CuratedEnum')).toBeTruthy();
    expect(screen.queryByText(/Failed to render/i)).toBeNull();
    // No inheritance field present → no Extends section.
    expect(screen.queryByText('Extends')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — member list rendering
// ---------------------------------------------------------------------------

describe('OtherForm member list rendering (Deliverable C baseline)', () => {
  it('Data: renders attribute names and type refs', () => {
    render(<OtherForm nodeData={DATA_NODE} />);
    expect(screen.getByText('tradeDate')).toBeTruthy();
    expect(screen.getByText('product')).toBeTruthy();
    // type names visible as TypeLink text
    expect(screen.getByText('date')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
  });

  it('RosettaEnumeration: renders enum value names (no type links)', () => {
    render(<OtherForm nodeData={ENUM_NODE} />);
    expect(screen.getByText('USD')).toBeTruthy();
    expect(screen.getByText('EUR')).toBeTruthy();
    expect(screen.getByText('GBP')).toBeTruthy();
  });

  it('RosettaFunction: renders input names and type refs', () => {
    render(<OtherForm nodeData={FUNC_NODE} />);
    expect(screen.getByText('principal')).toBeTruthy();
    expect(screen.getByText('rate')).toBeTruthy();
    expect(screen.getAllByText('number').length).toBeGreaterThan(0);
  });

  it('Choice: uses TYPE name as member display name', () => {
    render(<OtherForm nodeData={CHOICE_NODE} />);
    // Choice options display typeRef as the name (may appear multiple times in DOM)
    expect(screen.getAllByText('CashPayment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PhysicalSettlement').length).toBeGreaterThan(0);
  });

  it('RosettaRecordType: renders feature names and type refs', () => {
    render(<OtherForm nodeData={RECORD_NODE} />);
    expect(screen.getByText('recordDate')).toBeTruthy();
    expect(screen.getByText('date')).toBeTruthy();
  });

  it('Annotation: renders attribute names and type refs', () => {
    render(<OtherForm nodeData={ANNOTATION_NODE} />);
    expect(screen.getByText('label')).toBeTruthy();
    expect(screen.getByText('string')).toBeTruthy();
  });
});
