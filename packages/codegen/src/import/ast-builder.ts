// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ast-builder — `SourceModel` → Rune AST-shaped plain objects
 * (`Data` / `RosettaEnumeration` / `Condition`), ready for `renderModel()`.
 *
 * Shared across every future `sources/*-reader.ts` importer (spec.md's
 * "Module Structure") — this module has no JSON Schema (or TypeScript/SQL/
 * Pydantic) awareness at all, only `SourceModel`/`ConstraintIR`.
 *
 * Node shapes are grounded against `rosetta-render-core.ts` + the grammar
 * (not invented) — see constraint-translator.ts's module doc for the
 * literal/expression shapes and synonym-builder.ts's module doc for the
 * three distinct synonym-node shapes (`RosettaClassSynonym` on `Data`;
 * `RosettaSynonym` shared by `Attribute`/`Enumeration`; `RosettaEnumSynonym`
 * on `RosettaEnumValue`).
 */

import { escapeId } from '../emit/rosetta/render-expression.js';
import type { SourceModel, SourceType, SourceAttribute, SourceEnum, SourceCardinality } from './source-model.js';
import { translateConstraint, type ConditionNode } from './constraint-translator.js';
import {
  buildClassSynonym,
  buildAttributeSynonym,
  buildEnumValueSynonym,
  buildSynonymSourceDeclaration
} from './synonym-builder.js';
import type { ImportDiagnostic } from './diagnostics.js';

/** A `Data`-shaped plain object (see rosetta-render-core.ts's `renderData`). */
export interface DataNode {
  $type: 'Data';
  name: string;
  superType?: { $refText: string };
  definition?: string;
  annotations: never[];
  references: never[];
  synonyms: ReturnType<typeof buildClassSynonym>[];
  attributes: AttributeNode[];
  conditions: ConditionNode[];
}

/** An `Attribute`-shaped plain object (see rosetta-render-core.ts's `renderAttribute`). */
export interface AttributeNode {
  $type: 'Attribute';
  name: string;
  typeCall: { type: { $refText: string } };
  card: { inf: number; sup?: number; unbounded?: boolean };
  definition?: string;
  annotations: never[];
  references: never[];
  synonyms: ReturnType<typeof buildAttributeSynonym>[];
  labels: never[];
  ruleReferences: never[];
}

/** A `RosettaEnumeration`-shaped plain object (see rosetta-render-core.ts's `renderEnum`). */
export interface EnumerationNode {
  $type: 'RosettaEnumeration';
  name: string;
  definition?: string;
  annotations: never[];
  references: never[];
  synonyms: ReturnType<typeof buildAttributeSynonym>[];
  enumValues: EnumValueNode[];
}

/** A `RosettaEnumValue`-shaped plain object (see rosetta-render-core.ts's `renderEnumValue`). */
export interface EnumValueNode {
  $type: 'RosettaEnumValue';
  name: string;
  display?: string;
  definition?: string;
  annotations: never[];
  references: never[];
  enumSynonyms: ReturnType<typeof buildEnumValueSynonym>[];
}

/** Converts a `SourceCardinality` to the grammar's `RosettaCardinality` field shape. */
function toCardinality(card: SourceCardinality): AttributeNode['card'] {
  if (card.sup === undefined) return { inf: card.inf, unbounded: true };
  return { inf: card.inf, sup: card.sup };
}

/**
 * Builds one `Attribute` node. Attribute-level `constraints` are NOT
 * translated here — the grammar has no attribute-scoped condition (only
 * `Data`/`Choice`/`RosettaFunction`/`RosettaTypeAlias` carry `conditions`),
 * so `buildDataType` pulls every attribute's constraints up and translates
 * them alongside the type's own.
 */
function buildAttribute(
  attr: SourceAttribute,
  sourceName: SourceModel['sourceName'],
  emitSynonyms: boolean
): AttributeNode {
  return {
    $type: 'Attribute',
    name: escapeId(attr.name),
    typeCall: { type: { $refText: attr.typeName } },
    card: toCardinality(attr.cardinality),
    ...(attr.description !== undefined && { definition: attr.description }),
    annotations: [],
    references: [],
    synonyms: emitSynonyms ? [buildAttributeSynonym(sourceName, attr.sourceKey)] : [],
    labels: [],
    ruleReferences: []
  };
}

/**
 * Builds one `Data` node from a `SourceType`, translating both type-level
 * constraints and every attribute's constraints into `Condition` nodes
 * attached at the type level (Rune conditions are always type-scoped —
 * there is no attribute-scoped condition in the grammar; `Attribute` has no
 * `conditions` field, only `Data`/`Choice`/`RosettaFunction`/`RosettaTypeAlias` do).
 */
export function buildDataType(
  type: SourceType,
  sourceName: SourceModel['sourceName'],
  emitSynonyms: boolean,
  diagnostics: ImportDiagnostic[]
): DataNode {
  const usedConditionNames = new Set<string>();
  const conditions: ConditionNode[] = [];

  for (const ir of type.constraints) {
    conditions.push(translateConstraint(ir, usedConditionNames, diagnostics));
  }
  for (const attr of type.attributes) {
    for (const ir of attr.constraints) {
      conditions.push(translateConstraint(ir, usedConditionNames, diagnostics));
    }
  }

  return {
    $type: 'Data',
    name: escapeId(type.name),
    ...(type.extends !== undefined && { superType: { $refText: type.extends } }),
    ...(type.description !== undefined && { definition: type.description }),
    annotations: [],
    references: [],
    synonyms: emitSynonyms ? [buildClassSynonym(sourceName, type.sourceKey)] : [],
    attributes: type.attributes.map((a) => buildAttribute(a, sourceName, emitSynonyms)),
    conditions
  };
}

/** Builds one `RosettaEnumeration` node from a `SourceEnum`. */
export function buildEnumeration(
  sourceEnum: SourceEnum,
  sourceName: SourceModel['sourceName'],
  emitSynonyms: boolean
): EnumerationNode {
  return {
    $type: 'RosettaEnumeration',
    name: escapeId(sourceEnum.name),
    annotations: [],
    references: [],
    synonyms: emitSynonyms ? [buildAttributeSynonym(sourceName, sourceEnum.sourceKey)] : [],
    enumValues: sourceEnum.values.map((v) => ({
      $type: 'RosettaEnumValue' as const,
      name: escapeId(v.name),
      ...(v.displayName !== undefined && { display: v.displayName }),
      ...(v.description !== undefined && { definition: v.description }),
      annotations: [],
      references: [],
      enumSynonyms:
        emitSynonyms && v.displayName !== undefined ? [buildEnumValueSynonym(sourceName, v.displayName)] : []
    }))
  };
}

export interface BuildModelOptions {
  /** Suppress synonym annotations entirely (`--no-synonyms`). Default: emit (spec.md MVP default). */
  emitSynonyms?: boolean;
}

export interface BuiltModel {
  /** Ready for `renderModel({ name: model.namespace, version: '0.0.0', elements })`. */
  elements: Array<DataNode | EnumerationNode>;
  /** The `synonym source <Name>` declaration text, or `undefined` when synonyms are suppressed — see synonym-builder.ts's module doc for why this is spliced in as literal text rather than an `elements` member. */
  synonymSourceDeclaration?: string;
  diagnostics: ImportDiagnostic[];
}

/** Builds every `Data`/`RosettaEnumeration` node for a `SourceModel`. */
export function buildModel(model: SourceModel, options: BuildModelOptions = {}): BuiltModel {
  const emitSynonyms = options.emitSynonyms ?? true;
  const diagnostics: ImportDiagnostic[] = [];

  const elements: Array<DataNode | EnumerationNode> = [
    ...model.enums.map((e) => buildEnumeration(e, model.sourceName, emitSynonyms)),
    ...model.types.map((t) => buildDataType(t, model.sourceName, emitSynonyms, diagnostics))
  ];

  return {
    elements,
    ...(emitSynonyms && { synonymSourceDeclaration: buildSynonymSourceDeclaration(model.sourceName) }),
    diagnostics
  };
}
