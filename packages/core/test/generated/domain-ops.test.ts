// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import {
  addAnnotationAttributes,
  addChoiceAttributes,
  addDataAttributes,
  addRosettaEnumerationEnumValues,
  addRosettaFunctionInputs,
  addRosettaRecordTypeFeatures,
  removeAnnotationAttributesAt,
  removeChoiceAttributesAt,
  removeDataAttributesAt,
  removeRosettaEnumerationEnumValuesAt,
  removeRosettaFunctionInputsAt,
  removeRosettaRecordTypeFeaturesAt,
} from '../../src/generated/domain.js';

// ---------------------------------------------------------------------------
// Minimal test-fixture factories (type-level only — no Langium runtime)
// ---------------------------------------------------------------------------

function makeAttr(name: string) {
  return { $type: 'Attribute' as const, name };
}

function makeChoiceOption(name: string) {
  return { $type: 'ChoiceOption' as const, name };
}

function makeEnumValue(name: string) {
  return { $type: 'RosettaEnumValue' as const, name };
}

function makeRecordFeature(name: string) {
  return { $type: 'RosettaRecordFeature' as const, name };
}

function makeData(attributes: ReturnType<typeof makeAttr>[] = []) {
  return { $type: 'Data' as const, name: 'TestData', attributes };
}

function makeAnnotation(attributes: ReturnType<typeof makeAttr>[] = []) {
  return { $type: 'Annotation' as const, name: 'TestAnnotation', attributes };
}

function makeChoice(attributes: ReturnType<typeof makeChoiceOption>[] = []) {
  return { $type: 'Choice' as const, name: 'TestChoice', attributes };
}

function makeEnum(enumValues: ReturnType<typeof makeEnumValue>[] = []) {
  return { $type: 'RosettaEnumeration' as const, name: 'TestEnum', enumValues };
}

function makeFunction(inputs: ReturnType<typeof makeAttr>[] = []) {
  return { $type: 'RosettaFunction' as const, name: 'testFunc', inputs };
}

function makeRecordType(features: ReturnType<typeof makeRecordFeature>[] = []) {
  return { $type: 'RosettaRecordType' as const, name: 'TestRecord', features };
}

// ---------------------------------------------------------------------------
// Data attributes
// ---------------------------------------------------------------------------

describe('addDataAttributes / removeDataAttributesAt', () => {
  it('addDataAttributes appends in-place', () => {
    const node = makeData();
    const a = makeAttr('a');
    addDataAttributes(node, a);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0]).toBe(a);
  });

  it('removeDataAttributesAt splices the correct index', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const c = makeAttr('c');
    const node = makeData([a, b, c]);
    removeDataAttributesAt(node, 1);
    expect(node.attributes).toEqual([a, c]);
  });

  it('removeDataAttributesAt index 0 leaves tail intact', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const node = makeData([a, b]);
    removeDataAttributesAt(node, 0);
    expect(node.attributes).toEqual([b]);
  });
});

// ---------------------------------------------------------------------------
// Annotation attributes
// ---------------------------------------------------------------------------

describe('addAnnotationAttributes / removeAnnotationAttributesAt', () => {
  it('addAnnotationAttributes appends in-place', () => {
    const node = makeAnnotation();
    const a = makeAttr('x');
    addAnnotationAttributes(node, a);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0]).toBe(a);
  });

  it('removeAnnotationAttributesAt splices correctly', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const node = makeAnnotation([a, b]);
    removeAnnotationAttributesAt(node, 0);
    expect(node.attributes).toEqual([b]);
  });
});

// ---------------------------------------------------------------------------
// Choice attributes (ChoiceOption items)
// ---------------------------------------------------------------------------

describe('addChoiceAttributes / removeChoiceAttributesAt', () => {
  it('addChoiceAttributes appends', () => {
    const node = makeChoice();
    const opt = makeChoiceOption('o');
    addChoiceAttributes(node, opt);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0]).toBe(opt);
  });

  it('removeChoiceAttributesAt removes middle element', () => {
    const a = makeChoiceOption('a');
    const b = makeChoiceOption('b');
    const c = makeChoiceOption('c');
    const node = makeChoice([a, b, c]);
    removeChoiceAttributesAt(node, 1);
    expect(node.attributes).toEqual([a, c]);
  });
});

// ---------------------------------------------------------------------------
// RosettaEnumeration enumValues
// ---------------------------------------------------------------------------

describe('addRosettaEnumerationEnumValues / removeRosettaEnumerationEnumValuesAt', () => {
  it('addRosettaEnumerationEnumValues appends', () => {
    const node = makeEnum();
    const v = makeEnumValue('V');
    addRosettaEnumerationEnumValues(node, v);
    expect(node.enumValues).toHaveLength(1);
    expect(node.enumValues[0]).toBe(v);
  });

  it('removeRosettaEnumerationEnumValuesAt removes last element', () => {
    const a = makeEnumValue('a');
    const b = makeEnumValue('b');
    const node = makeEnum([a, b]);
    removeRosettaEnumerationEnumValuesAt(node, 1);
    expect(node.enumValues).toEqual([a]);
  });
});

// ---------------------------------------------------------------------------
// RosettaFunction inputs
// ---------------------------------------------------------------------------

describe('addRosettaFunctionInputs / removeRosettaFunctionInputsAt', () => {
  it('addRosettaFunctionInputs appends', () => {
    const node = makeFunction();
    const a = makeAttr('arg');
    addRosettaFunctionInputs(node, a);
    expect(node.inputs).toHaveLength(1);
    expect(node.inputs[0]).toBe(a);
  });

  it('removeRosettaFunctionInputsAt removes first element', () => {
    const a = makeAttr('a');
    const b = makeAttr('b');
    const node = makeFunction([a, b]);
    removeRosettaFunctionInputsAt(node, 0);
    expect(node.inputs).toEqual([b]);
  });
});

// ---------------------------------------------------------------------------
// RosettaRecordType features
// ---------------------------------------------------------------------------

describe('addRosettaRecordTypeFeatures / removeRosettaRecordTypeFeaturesAt', () => {
  it('addRosettaRecordTypeFeatures appends', () => {
    const node = makeRecordType();
    const f = makeRecordFeature('feat');
    addRosettaRecordTypeFeatures(node, f);
    expect(node.features).toHaveLength(1);
    expect(node.features[0]).toBe(f);
  });

  it('removeRosettaRecordTypeFeaturesAt removes middle element', () => {
    const a = makeRecordFeature('a');
    const b = makeRecordFeature('b');
    const c = makeRecordFeature('c');
    const node = makeRecordType([a, b, c]);
    removeRosettaRecordTypeFeaturesAt(node, 1);
    expect(node.features).toEqual([a, c]);
  });
});
