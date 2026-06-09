// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * domain-ops — typed get/add/removeAt operations over Dehydrated<T> nodes.
 *
 * One function group per member-container (field + element type). Replaces the
 * deleted domain.ts @ts-nocheck artifact; these are minimal, correctly-typed
 * wrappers that the Phase-3 recipes and store cutover will consume.
 *
 * Groups:
 *   Data / Annotation  →  .attributes  : Attribute[]
 *   Choice             →  .attributes  : ChoiceOption[]
 *   RosettaEnumeration →  .enumValues  : RosettaEnumValue[]
 *   RosettaFunction    →  .inputs      : Attribute[]
 *   RosettaRecordType  →  .features    : RosettaRecordFeature[]
 */

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
import type { Dehydrated } from '../types.js';

// ---------------------------------------------------------------------------
// Data / Annotation — .attributes: Attribute[]
// ---------------------------------------------------------------------------

export function getAttributes(node: Dehydrated<Data> | Dehydrated<Annotation>): Dehydrated<Attribute>[] {
  return node.attributes as Dehydrated<Attribute>[];
}

export function addAttribute(
  node: Dehydrated<Data> | Dehydrated<Annotation>,
  attr: Dehydrated<Attribute>,
): void {
  (node.attributes as Dehydrated<Attribute>[]).push(attr);
}

export function removeAttributeAt(node: Dehydrated<Data> | Dehydrated<Annotation>, index: number): void {
  (node.attributes as Dehydrated<Attribute>[]).splice(index, 1);
}

// ---------------------------------------------------------------------------
// Choice — .attributes: ChoiceOption[]
// (field name is .attributes, but the element type is ChoiceOption, not Attribute)
// ---------------------------------------------------------------------------

export function getChoiceOptions(node: Dehydrated<Choice>): Dehydrated<ChoiceOption>[] {
  return node.attributes as Dehydrated<ChoiceOption>[];
}

export function addChoiceOption(node: Dehydrated<Choice>, opt: Dehydrated<ChoiceOption>): void {
  (node.attributes as Dehydrated<ChoiceOption>[]).push(opt);
}

export function removeChoiceOptionAt(node: Dehydrated<Choice>, index: number): void {
  (node.attributes as Dehydrated<ChoiceOption>[]).splice(index, 1);
}

// ---------------------------------------------------------------------------
// RosettaEnumeration — .enumValues: RosettaEnumValue[]
// ---------------------------------------------------------------------------

export function getEnumValues(node: Dehydrated<RosettaEnumeration>): Dehydrated<RosettaEnumValue>[] {
  return node.enumValues as Dehydrated<RosettaEnumValue>[];
}

export function addEnumValue(
  node: Dehydrated<RosettaEnumeration>,
  val: Dehydrated<RosettaEnumValue>,
): void {
  (node.enumValues as Dehydrated<RosettaEnumValue>[]).push(val);
}

export function removeEnumValueAt(node: Dehydrated<RosettaEnumeration>, index: number): void {
  (node.enumValues as Dehydrated<RosettaEnumValue>[]).splice(index, 1);
}

// ---------------------------------------------------------------------------
// RosettaFunction — .inputs: Attribute[]
// ---------------------------------------------------------------------------

export function getFunctionInputs(node: Dehydrated<RosettaFunction>): Dehydrated<Attribute>[] {
  return node.inputs as Dehydrated<Attribute>[];
}

export function addFunctionInput(
  node: Dehydrated<RosettaFunction>,
  input: Dehydrated<Attribute>,
): void {
  (node.inputs as Dehydrated<Attribute>[]).push(input);
}

export function removeFunctionInputAt(node: Dehydrated<RosettaFunction>, index: number): void {
  (node.inputs as Dehydrated<Attribute>[]).splice(index, 1);
}

// ---------------------------------------------------------------------------
// RosettaRecordType — .features: RosettaRecordFeature[]
// ---------------------------------------------------------------------------

export function getRecordFeatures(node: Dehydrated<RosettaRecordType>): Dehydrated<RosettaRecordFeature>[] {
  return node.features as Dehydrated<RosettaRecordFeature>[];
}

export function addRecordFeature(
  node: Dehydrated<RosettaRecordType>,
  feat: Dehydrated<RosettaRecordFeature>,
): void {
  (node.features as Dehydrated<RosettaRecordFeature>[]).push(feat);
}

export function removeRecordFeatureAt(node: Dehydrated<RosettaRecordType>, index: number): void {
  (node.features as Dehydrated<RosettaRecordFeature>[]).splice(index, 1);
}
