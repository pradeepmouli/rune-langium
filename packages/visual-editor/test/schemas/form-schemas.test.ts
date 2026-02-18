/**
 * Conformance tests for form-surface Zod schemas.
 *
 * Validates that the schemas correctly parse valid form data and
 * reject invalid inputs. Also verifies runtime conformance by
 * parsing real TypeNodeData fixtures through the schemas.
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
    expect(() => dataTypeFormSchema.parse({ name: '' })).toThrow();
  });

  it('accepts name and empty parentName', () => {
    const result = dataTypeFormSchema.parse({ name: 'Trade', parentName: '' });
    expect(result).toEqual({ name: 'Trade', parentName: '' });
  });

  it('accepts name and parentName', () => {
    const result = dataTypeFormSchema.parse({ name: 'CreditTrade', parentName: 'Trade' });
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
// Runtime conformance: parse actual TypeNodeData projections
// ---------------------------------------------------------------------------

describe('runtime conformance with TypeNodeData', () => {
  it('dataTypeFormSchema parses TypeNodeData<data> fields', () => {
    const nodeData = {
      kind: 'data' as const,
      name: 'Trade',
      namespace: 'cdm.event',
      parentName: 'Event',
      members: [],
      hasExternalRefs: false,
      errors: []
    };
    // Extract only the form-surface fields
    const result = dataTypeFormSchema.parse({
      name: nodeData.name,
      parentName: nodeData.parentName
    });
    expect(result.name).toBe('Trade');
    expect(result.parentName).toBe('Event');
  });

  it('enumFormSchema parses TypeNodeData<enum> fields', () => {
    const nodeData = {
      kind: 'enum' as const,
      name: 'ActionEnum',
      namespace: 'cdm.event',
      parentName: undefined,
      members: [],
      hasExternalRefs: false,
      errors: []
    };
    const result = enumFormSchema.parse({
      name: nodeData.name,
      parentName: nodeData.parentName ?? ''
    });
    expect(result.name).toBe('ActionEnum');
    expect(result.parentName).toBe('');
  });

  it('functionFormSchema parses TypeNodeData<func> fields', () => {
    const nodeData = {
      kind: 'func' as const,
      name: 'Qualify',
      namespace: 'cdm.event.qualification',
      outputType: 'boolean',
      expressionText: 'trade exists',
      members: [],
      hasExternalRefs: false,
      errors: []
    };
    const result = functionFormSchema.parse({
      name: nodeData.name,
      outputType: nodeData.outputType,
      expressionText: nodeData.expressionText
    });
    expect(result.name).toBe('Qualify');
    expect(result.outputType).toBe('boolean');
  });

  it('metadataSchema parses TypeNodeData metadata fields', () => {
    const nodeData = {
      kind: 'data' as const,
      name: 'Trade',
      namespace: 'cdm.event',
      definition: 'Represents a trade execution event.',
      comments: 'Added in CDM 2.0',
      members: [],
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

  it('attributeSchema parses MemberDisplay fields', () => {
    const member = {
      name: 'notionalAmount',
      typeName: 'Money',
      cardinality: '(1..1)',
      isOverride: false
    };
    const result = attributeSchema.parse({
      name: member.name,
      typeName: member.typeName,
      cardinality: member.cardinality
    });
    expect(result.name).toBe('notionalAmount');
    expect(result.typeName).toBe('Money');
  });
});
