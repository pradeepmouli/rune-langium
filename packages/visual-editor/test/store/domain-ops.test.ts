// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import type { Dehydrated } from '../../src/types.js';
import type {
  Annotation,
  Attribute,
  Choice,
  ChoiceOption,
  Data,
  RosettaEnumeration,
  RosettaEnumValue,
  RosettaFunction,
  RosettaRecordFeature,
  RosettaRecordType,
} from '@rune-langium/core';
import {
  addAttribute,
  addChoiceOption,
  addEnumValue,
  addFunctionInput,
  addRecordFeature,
  getAttributes,
  getChoiceOptions,
  getEnumValues,
  getFunctionInputs,
  getRecordFeatures,
  removeAttributeAt,
  removeChoiceOptionAt,
  removeEnumValueAt,
  removeFunctionInputAt,
  removeRecordFeatureAt,
} from '../../src/generated/domain-ops.js';

// ---------------------------------------------------------------------------
// Minimal test-fixture factories (type-level only — no Langium runtime)
// ---------------------------------------------------------------------------

function makeAttr(name: string): Dehydrated<Attribute> {
  return { $type: 'Attribute', name: { $type: 'ValidID', value: name } } as unknown as Dehydrated<Attribute>;
}

function makeChoiceOption(name: string): Dehydrated<ChoiceOption> {
  return { $type: 'ChoiceOption', name } as unknown as Dehydrated<ChoiceOption>;
}

function makeEnumValue(name: string): Dehydrated<RosettaEnumValue> {
  return { $type: 'RosettaEnumValue', name: { $type: 'ValidID', value: name } } as unknown as Dehydrated<RosettaEnumValue>;
}

function makeRecordFeature(name: string): Dehydrated<RosettaRecordFeature> {
  return { $type: 'RosettaRecordFeature', name: { $type: 'ValidID', value: name } } as unknown as Dehydrated<RosettaRecordFeature>;
}

function makeData(attrs: Dehydrated<Attribute>[] = []): Dehydrated<Data> {
  return { $type: 'Data', attributes: attrs } as unknown as Dehydrated<Data>;
}

function makeAnnotation(attrs: Dehydrated<Attribute>[] = []): Dehydrated<Annotation> {
  return { $type: 'Annotation', attributes: attrs } as unknown as Dehydrated<Annotation>;
}

function makeChoice(attrs: Dehydrated<ChoiceOption>[] = []): Dehydrated<Choice> {
  return { $type: 'Choice', attributes: attrs } as unknown as Dehydrated<Choice>;
}

function makeEnum(vals: Dehydrated<RosettaEnumValue>[] = []): Dehydrated<RosettaEnumeration> {
  return { $type: 'RosettaEnumeration', enumValues: vals } as unknown as Dehydrated<RosettaEnumeration>;
}

function makeFunction(inputs: Dehydrated<Attribute>[] = []): Dehydrated<RosettaFunction> {
  return { $type: 'RosettaFunction', inputs } as unknown as Dehydrated<RosettaFunction>;
}

function makeRecordType(features: Dehydrated<RosettaRecordFeature>[] = []): Dehydrated<RosettaRecordType> {
  return { $type: 'RosettaRecordType', features } as unknown as Dehydrated<RosettaRecordType>;
}

// ---------------------------------------------------------------------------
// Data / Annotation attributes
// ---------------------------------------------------------------------------

describe('getAttributes / addAttribute / removeAttributeAt', () => {
  it('getAttributes returns same array reference', () => {
    const arr: Dehydrated<Attribute>[] = [makeAttr('foo')];
    expect(getAttributes(makeData(arr))).toBe(arr);
    expect(getAttributes(makeAnnotation(arr))).toBe(arr);
  });

  it('addAttribute appends in-place on Data', () => {
    const node = makeData();
    const a = makeAttr('a');
    addAttribute(node, a);
    expect(getAttributes(node)).toHaveLength(1);
    expect(getAttributes(node)[0]).toBe(a);
  });

  it('addAttribute appends in-place on Annotation', () => {
    const node = makeAnnotation();
    const a = makeAttr('x');
    addAttribute(node, a);
    expect(getAttributes(node)).toHaveLength(1);
    expect(getAttributes(node)[0]).toBe(a);
  });

  it('removeAttributeAt splices the correct index', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const c = makeAttr('c');
    const node = makeData([a, b, c]);
    removeAttributeAt(node, 1);
    expect(getAttributes(node)).toEqual([a, c]);
  });

  it('removeAttributeAt index 0 leaves tail intact', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const node = makeData([a, b]);
    removeAttributeAt(node, 0);
    expect(getAttributes(node)).toEqual([b]);
  });
});

// ---------------------------------------------------------------------------
// Choice options
// ---------------------------------------------------------------------------

describe('getChoiceOptions / addChoiceOption / removeChoiceOptionAt', () => {
  it('getChoiceOptions returns same array reference', () => {
    const arr: Dehydrated<ChoiceOption>[] = [makeChoiceOption('opt')];
    expect(getChoiceOptions(makeChoice(arr))).toBe(arr);
  });

  it('addChoiceOption appends', () => {
    const node = makeChoice();
    const opt = makeChoiceOption('o');
    addChoiceOption(node, opt);
    expect(getChoiceOptions(node)).toHaveLength(1);
    expect(getChoiceOptions(node)[0]).toBe(opt);
  });

  it('removeChoiceOptionAt removes middle element', () => {
    const a = makeChoiceOption('a');
    const b = makeChoiceOption('b');
    const c = makeChoiceOption('c');
    const node = makeChoice([a, b, c]);
    removeChoiceOptionAt(node, 1);
    expect(getChoiceOptions(node)).toEqual([a, c]);
  });
});

// ---------------------------------------------------------------------------
// Enum values
// ---------------------------------------------------------------------------

describe('getEnumValues / addEnumValue / removeEnumValueAt', () => {
  it('getEnumValues returns same array reference', () => {
    const arr: Dehydrated<RosettaEnumValue>[] = [makeEnumValue('E')];
    expect(getEnumValues(makeEnum(arr))).toBe(arr);
  });

  it('addEnumValue appends', () => {
    const node = makeEnum();
    const v = makeEnumValue('V');
    addEnumValue(node, v);
    expect(getEnumValues(node)).toHaveLength(1);
    expect(getEnumValues(node)[0]).toBe(v);
  });

  it('removeEnumValueAt removes last element', () => {
    const a = makeEnumValue('a');
    const b = makeEnumValue('b');
    const node = makeEnum([a, b]);
    removeEnumValueAt(node, 1);
    expect(getEnumValues(node)).toEqual([a]);
  });
});

// ---------------------------------------------------------------------------
// Function inputs
// ---------------------------------------------------------------------------

describe('getFunctionInputs / addFunctionInput / removeFunctionInputAt', () => {
  it('getFunctionInputs returns same array reference', () => {
    const arr: Dehydrated<Attribute>[] = [makeAttr('in')];
    expect(getFunctionInputs(makeFunction(arr))).toBe(arr);
  });

  it('addFunctionInput appends', () => {
    const node = makeFunction();
    const a = makeAttr('arg');
    addFunctionInput(node, a);
    expect(getFunctionInputs(node)).toHaveLength(1);
  });

  it('removeFunctionInputAt removes first element', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const node = makeFunction([a, b]);
    removeFunctionInputAt(node, 0);
    expect(getFunctionInputs(node)).toEqual([b]);
  });
});

// ---------------------------------------------------------------------------
// Record features
// ---------------------------------------------------------------------------

describe('getRecordFeatures / addRecordFeature / removeRecordFeatureAt', () => {
  it('getRecordFeatures returns same array reference', () => {
    const arr: Dehydrated<RosettaRecordFeature>[] = [makeRecordFeature('f')];
    expect(getRecordFeatures(makeRecordType(arr))).toBe(arr);
  });

  it('addRecordFeature appends', () => {
    const node = makeRecordType();
    const f = makeRecordFeature('feat');
    addRecordFeature(node, f);
    expect(getRecordFeatures(node)).toHaveLength(1);
  });

  it('removeRecordFeatureAt removes middle element', () => {
    const a = makeRecordFeature('a');
    const b = makeRecordFeature('b');
    const c = makeRecordFeature('c');
    const node = makeRecordType([a, b, c]);
    removeRecordFeatureAt(node, 1);
    expect(getRecordFeatures(node)).toEqual([a, c]);
  });
});
