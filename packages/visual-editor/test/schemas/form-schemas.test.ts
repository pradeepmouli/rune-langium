// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Conformance tests for form-surface Zod schemas.
 *
 * Validates that the schemas correctly parse valid form data and
 * reject invalid inputs. Also verifies runtime conformance by
 * parsing real AnyGraphNode fixtures through the schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  dataTypeFormSchema,
  enumFormSchema,
  choiceFormSchema,
  functionFormSchema,
  metadataSchema,
  attributeSchema,
  enumValueSchema
} from '../../src/schemas/form-schemas.js';

// ---------------------------------------------------------------------------
// metadataSchema
// ---------------------------------------------------------------------------

describe('metadataSchema', () => {
  it('accepts empty strings', () => {
    const result = metadataSchema.parse({ definition: '', comments: '' });
    expect(result).toEqual({ definition: '', comments: '' });
  });

  it('accepts full values', () => {
    const result = metadataSchema.parse({
      definition: 'A trading event',
      comments: '// version 2'
    });
    expect(result.definition).toBe('A trading event');
    expect(result.comments).toBe('// version 2');
  });
});

// ---------------------------------------------------------------------------
// attributeSchema
// ---------------------------------------------------------------------------

describe('attributeSchema', () => {
  it('rejects empty name', () => {
    expect(() => attributeSchema.parse({ name: '' })).toThrow();
  });

  it('accepts full attribute fields', () => {
    const result = attributeSchema.parse({
      name: 'quantity',
      typeName: 'string',
      cardinality: '(1..1)'
    });
    expect(result).toEqual({ name: 'quantity', typeName: 'string', cardinality: '(1..1)' });
  });

  it('accepts full attribute', () => {
    const result = attributeSchema.parse({
      name: 'notional',
      typeName: 'number',
      cardinality: '(0..*)'
    });
    expect(result.name).toBe('notional');
    expect(result.typeName).toBe('number');
    expect(result.cardinality).toBe('(0..*)');
  });
});

// ---------------------------------------------------------------------------
// enumValueSchema
// ---------------------------------------------------------------------------

describe('enumValueSchema', () => {
  it('rejects empty name', () => {
    expect(() => enumValueSchema.parse({ name: '' })).toThrow();
  });

  it('accepts name and empty displayName', () => {
    const result = enumValueSchema.parse({ name: 'ACTIVE', displayName: '' });
    expect(result).toEqual({ name: 'ACTIVE', displayName: '' });
  });

  it('accepts name and displayName', () => {
    const result = enumValueSchema.parse({ name: 'CANCELLED', displayName: 'Cancelled' });
    expect(result.displayName).toBe('Cancelled');
  });
});

// ---------------------------------------------------------------------------
// dataTypeFormSchema
// ---------------------------------------------------------------------------

describe('dataTypeFormSchema', () => {
  it('rejects empty name', () => {
    expect(() => dataTypeFormSchema.parse({ name: '', members: [] })).toThrow();
  });

  it('accepts name and empty parentName', () => {
    const result = dataTypeFormSchema.parse({ name: 'Trade', parentName: '', members: [] });
    expect(result).toEqual({ name: 'Trade', parentName: '', members: [] });
  });

  it('accepts name and parentName', () => {
    const result = dataTypeFormSchema.parse({
      name: 'CreditTrade',
      parentName: 'Trade',
      members: []
    });
    expect(result.parentName).toBe('Trade');
  });
});

// ---------------------------------------------------------------------------
// enumFormSchema
// ---------------------------------------------------------------------------

describe('enumFormSchema', () => {
  it('rejects empty name', () => {
    expect(() => enumFormSchema.parse({ name: '' })).toThrow();
  });

  it('accepts name and empty parentName', () => {
    const result = enumFormSchema.parse({ name: 'TradeStatusEnum', parentName: '' });
    expect(result.name).toBe('TradeStatusEnum');
    expect(result.parentName).toBe('');
  });
});

// ---------------------------------------------------------------------------
// choiceFormSchema
// ---------------------------------------------------------------------------

describe('choiceFormSchema', () => {
  it('rejects empty name', () => {
    expect(() => choiceFormSchema.parse({ name: '' })).toThrow();
  });

  it('accepts valid name', () => {
    const result = choiceFormSchema.parse({ name: 'PaymentInstruction' });
    expect(result.name).toBe('PaymentInstruction');
  });
});

// ---------------------------------------------------------------------------
// functionFormSchema
// ---------------------------------------------------------------------------

describe('functionFormSchema', () => {
  it('rejects empty name', () => {
    expect(() => functionFormSchema.parse({ name: '' })).toThrow();
  });

  it('accepts name with empty optional fields', () => {
    const result = functionFormSchema.parse({
      name: 'CalculateNotional',
      outputType: '',
      expressionText: ''
    });
    expect(result).toEqual({
      name: 'CalculateNotional',
      outputType: '',
      expressionText: ''
    });
  });

  it('accepts all fields', () => {
    const result = functionFormSchema.parse({
      name: 'CalculateNotional',
      outputType: 'number',
      expressionText: 'trade -> quantity * trade -> price'
    });
    expect(result.outputType).toBe('number');
    expect(result.expressionText).toBe('trade -> quantity * trade -> price');
  });
});

// ---------------------------------------------------------------------------
// Runtime conformance: parse actual AnyGraphNode projections
// ---------------------------------------------------------------------------

describe('runtime conformance with AnyGraphNode', () => {
  it('dataTypeFormSchema parses GraphNode<Data> fields', () => {
    const nodeData = {
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.event',
      superType: { $refText: 'Event' },
      attributes: [],
      conditions: [],
      annotations: [],
      synonyms: [],
      position: { x: 0, y: 0 },
      hasExternalRefs: false,
      errors: []
    };
    // Extract only the form-surface fields
    const result = dataTypeFormSchema.parse({
      name: nodeData.name,
      parentName: nodeData.superType?.$refText ?? '',
      members: []
    });
    expect(result.name).toBe('Trade');
    expect(result.parentName).toBe('Event');
  });

  it('enumFormSchema parses GraphNode<RosettaEnumeration> fields', () => {
    const nodeData = {
      $type: 'RosettaEnumeration' as const,
      name: 'ActionEnum',
      namespace: 'cdm.event',
      parent: undefined,
      enumValues: [],
      synonyms: [],
      position: { x: 0, y: 0 },
      hasExternalRefs: false,
      errors: []
    };
    const result = enumFormSchema.parse({
      name: nodeData.name,
      parentName: nodeData.parent?.$refText ?? ''
    });
    expect(result.name).toBe('ActionEnum');
    expect(result.parentName).toBe('');
  });

  it('functionFormSchema parses GraphNode<RosettaFunction> fields', () => {
    const nodeData = {
      $type: 'RosettaFunction' as const,
      name: 'Qualify',
      namespace: 'cdm.event.qualification',
      output: { typeCall: { $type: 'TypeCall' as const, type: { $refText: 'boolean' } } },
      expressionText: 'trade exists',
      inputs: [],
      conditions: [],
      postConditions: [],
      annotations: [],
      synonyms: [],
      position: { x: 0, y: 0 },
      hasExternalRefs: false,
      errors: []
    };
    const result = functionFormSchema.parse({
      name: nodeData.name,
      outputType: nodeData.output?.typeCall?.type?.$refText ?? '',
      expressionText: nodeData.expressionText
    });
    expect(result.name).toBe('Qualify');
    expect(result.outputType).toBe('boolean');
  });

  it('metadataSchema parses AnyGraphNode metadata fields', () => {
    const nodeData = {
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.event',
      definition: 'Represents a trade execution event.',
      comments: 'Added in CDM 2.0',
      attributes: [],
      conditions: [],
      annotations: [],
      synonyms: [],
      position: { x: 0, y: 0 },
      hasExternalRefs: false,
      errors: []
    };
    const result = metadataSchema.parse({
      definition: nodeData.definition,
      comments: nodeData.comments
    });
    expect(result.definition).toBe('Represents a trade execution event.');
    expect(result.comments).toBe('Added in CDM 2.0');
  });

  it('attributeSchema parses Attribute model fields', () => {
    const attribute = {
      $type: 'Attribute' as const,
      name: 'notionalAmount',
      typeCall: { $type: 'TypeCall' as const, type: { $refText: 'Money' } },
      card: { inf: 1, sup: 1, unbounded: false },
      override: false
    };
    const result = attributeSchema.parse({
      name: attribute.name,
      typeName: attribute.typeCall.type.$refText,
      cardinality: '(1..1)'
    });
    expect(result.name).toBe('notionalAmount');
    expect(result.typeName).toBe('Money');
  });
});
