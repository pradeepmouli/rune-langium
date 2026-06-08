// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Deliverable A — information-completeness + type-faithfulness test for the
 * generated `toDomain` projection.
 *
 * Verifies:
 *  1. $type discriminant is retained (as the exact literal string).
 *  2. Information-completeness: every non-$internal, non-GraphMetadata key on
 *     the source node is represented on the domain projection (directly or via
 *     its normalised alias).
 *  3. Cross-ref faithfulness: a cross-ref source `{ $refText }` object is
 *     flattened to a plain string on the domain.
 *  4. No-merge / lossless: `conditions` and `postConditions` on a
 *     RosettaFunction are BOTH preserved and distinct.
 *  5. Additive normalisations: `extends` aliases the inheritance ref, `members`
 *     aliases the member array — and the source fields are STILL present.
 *  6. Narrowable: a `switch (dom.$type)` compiles and narrows correctly.
 */

import { describe, it, expect } from 'vitest';
import { toDomain } from '../../src/generated/domain.js';
import type { AnyDomain, DataDomain } from '../../src/generated/domain.js';

// ---------------------------------------------------------------------------
// GraphMetadata view-fields (must NOT be expected on the domain projection)
// ---------------------------------------------------------------------------

const GRAPH_META = new Set<string>([
  'namespace',
  'position',
  'errors',
  'isReadOnly',
  'hasExternalRefs',
  'comments',
  'deferred'
]);

// ---------------------------------------------------------------------------
// Minimal in-memory node helpers
// ---------------------------------------------------------------------------

/** Build a minimal attribute sub-object with `{ $refText }` type ref. */
function makeAttr(name: string, typeRef: string) {
  return {
    $type: 'Attribute',
    name,
    typeCall: { $type: 'TypeCall', type: { $refText: typeRef } },
    card: { $type: 'RosettaCardinality', inf: 1, sup: 1, unbounded: false },
    override: false
  };
}

/** Build a minimal Condition sub-object. */
function makeCondition(expression: string) {
  return {
    $type: 'Condition',
    name: expression,
    // minimal condition — toDomainCondition does not require any cross-refs
  };
}

// ---------------------------------------------------------------------------
// Tests: DataDomain
// ---------------------------------------------------------------------------

describe('toDomain — DataDomain (information-completeness + faithfulness)', () => {
  const dataNode = {
    $type: 'Data' as const,
    name: 'Trade',
    superType: { $refText: 'Event' },
    definition: 'A financial trade',
    attributes: [makeAttr('tradeDate', 'date'), makeAttr('product', 'Product')],
    conditions: [makeCondition('condition1')],
    references: [],
    annotations: [],
    synonyms: [],
    // GraphMetadata fields (should NOT show up as expected semantic keys)
    namespace: 'test.model',
    position: { x: 10, y: 20 },
    errors: [],
    hasExternalRefs: false,
    isReadOnly: false,
    comments: []
  };

  const dom = toDomain(dataNode) as DataDomain;

  it('1. retains $type as the exact literal', () => {
    expect(dom.$type).toBe('Data');
  });

  it('2. information-completeness: every semantic key is represented on dom', () => {
    const expectedSemanticKeys = Object.keys(dataNode).filter(
      (k) => !k.startsWith('$') && !GRAPH_META.has(k)
    );
    // The normalisations `extends` and `members` are additive aliases — not input keys —
    // so we check only forward (every input semantic key must appear on dom, either
    // directly or via its alias).
    for (const k of expectedSemanticKeys) {
      // Direct presence or aliased via `extends` (superType → extends) or `members`
      // (attributes → members).
      const present = k in dom || (k === 'superType' && 'extends' in dom) || (k === 'attributes' && 'members' in dom);
      expect(present, `key '${k}' must be represented on DataDomain`).toBe(true);
    }
  });

  it('3. cross-ref faithfulness: superType is a string equal to $refText', () => {
    expect(typeof dom.superType).toBe('string');
    expect(dom.superType).toBe('Event');
  });

  it('5a. additive normalisation: dom.extends aliases superType', () => {
    expect(dom.extends).toBe('Event');
    // original field still present
    expect(dom.superType).toBe('Event');
  });

  it('5b. additive normalisation: dom.members aliases dom.attributes', () => {
    expect(Array.isArray(dom.members)).toBe(true);
    expect(Array.isArray(dom.attributes)).toBe(true);
    expect(dom.members).toHaveLength(2);
    expect(dom.attributes).toHaveLength(2);
  });

  it('5c. attributes are projected to AttributeDomain objects (name preserved)', () => {
    expect(dom.attributes![0].name).toBe('tradeDate');
    expect(dom.attributes![1].name).toBe('product');
  });

  it('6. narrowable: switch on dom.$type narrows to DataDomain', () => {
    let sawData = false;
    const anyDom: AnyDomain = dom;
    switch (anyDom.$type) {
      case 'Data': {
        // TypeScript must narrow here: `anyDom.attributes` should be accessible.
        const attrs = anyDom.attributes;
        expect(Array.isArray(attrs)).toBe(true);
        sawData = true;
        break;
      }
      default:
        break;
    }
    expect(sawData).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: RosettaFunctionDomain
// ---------------------------------------------------------------------------

describe('toDomain — RosettaFunctionDomain (no-merge + faithfulness)', () => {
  const funcNode = {
    $type: 'RosettaFunction' as const,
    name: 'CalcInterest',
    superFunction: { $refText: 'BaseCalc' },
    definition: 'Calculates interest',
    inputs: [makeAttr('principal', 'number'), makeAttr('rate', 'number')],
    output: makeAttr('result', 'number'),
    conditions: [makeCondition('pre1'), makeCondition('pre2')],
    postConditions: [makeCondition('post1')],
    references: [],
    annotations: [],
    shortcuts: [],
    operations: [],
    dispatchAttribute: undefined,
    dispatchValue: undefined,
    // GraphMetadata
    namespace: 'test.funcs',
    position: { x: 0, y: 0 },
    errors: [],
    hasExternalRefs: false
  };

  const dom = toDomain(funcNode) as Extract<AnyDomain, { $type: 'RosettaFunction' }>;

  it('1. retains $type as the exact literal', () => {
    expect(dom.$type).toBe('RosettaFunction');
  });

  it('2. information-completeness: every semantic key is represented on dom', () => {
    const expectedSemanticKeys = Object.keys(funcNode).filter(
      (k) => !k.startsWith('$') && !GRAPH_META.has(k)
    );
    for (const k of expectedSemanticKeys) {
      const present =
        k in dom ||
        (k === 'superFunction' && 'extends' in dom) ||
        (k === 'inputs' && 'members' in dom);
      expect(present, `key '${k}' must be represented on RosettaFunctionDomain`).toBe(true);
    }
  });

  it('3. cross-ref faithfulness: superFunction is a plain string', () => {
    expect(typeof dom.superFunction).toBe('string');
    expect(dom.superFunction).toBe('BaseCalc');
  });

  it('4. no-merge: conditions and postConditions are BOTH present and DISTINCT', () => {
    expect(Array.isArray(dom.conditions)).toBe(true);
    expect(Array.isArray(dom.postConditions)).toBe(true);
    expect(dom.conditions).toHaveLength(2);
    expect(dom.postConditions).toHaveLength(1);
    // They must refer to different arrays (not aliases)
    expect(dom.conditions).not.toBe(dom.postConditions);
  });

  it('5a. additive normalisation: dom.extends aliases superFunction', () => {
    expect(dom.extends).toBe('BaseCalc');
    expect(dom.superFunction).toBe('BaseCalc');
  });

  it('5b. additive normalisation: dom.members aliases dom.inputs', () => {
    expect(Array.isArray(dom.members)).toBe(true);
    expect(Array.isArray(dom.inputs)).toBe(true);
    expect(dom.members).toHaveLength(2);
    expect(dom.inputs).toHaveLength(2);
  });

  it('6. narrowable: switch on dom.$type narrows to RosettaFunctionDomain', () => {
    let sawFunc = false;
    const anyDom: AnyDomain = dom;
    switch (anyDom.$type) {
      case 'RosettaFunction': {
        const inputs = anyDom.inputs;
        expect(Array.isArray(inputs)).toBe(true);
        sawFunc = true;
        break;
      }
      default:
        break;
    }
    expect(sawFunc).toBe(true);
  });
});
