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

import type { Dehydrated } from '@rune-langium/core';
import type {
  Data,
  Attribute,
  RosettaEnumeration,
  RosettaEnumValue,
  RosettaFunction,
  RosettaCardinality,
  TypeCall
} from '@rune-langium/core';
import { escapeId } from '../emit/rosetta/render-expression.js';
import { renderNode } from '../emit/rosetta/rosetta-render-core.js';
import type {
  SourceModel,
  SourceType,
  SourceAttribute,
  SourceEnum,
  SourceFunc,
  SourceFuncParam,
  SourceCardinality
} from './source-model.js';
import { translateConstraint, type ConditionNode } from './constraint-translator.js';
import {
  buildClassSynonym,
  buildAttributeSynonym,
  buildEnumValueSynonym,
  buildSynonymSourceDeclaration,
  type ClassSynonymNode,
  type SynonymNode,
  type EnumSynonymNode
} from './synonym-builder.js';
import {
  buildOperationAnnotationDecl,
  buildOperationAnnotationRef,
  renderOperationAnnotationDecl
} from './operation-carrier.js';
import type { ImportDiagnostic } from './diagnostics.js';

/**
 * `Data`/`Attribute`/`RosettaEnumeration`/`RosettaEnumValue`-shaped plain
 * objects — the core-generated `Dehydrated<T>` substrate (spec.md's Phase 2
 * addendum, BINDING: no invented node types), retrofitted from this
 * module's previously hand-rolled `DataNode`/`AttributeNode`/
 * `EnumerationNode`/`EnumValueNode` interfaces.
 *
 * Every synonym-bearing field (`synonyms`, `enumSynonyms`) is corrected to
 * synonym-builder.ts's own `ClassSynonymNode`/`SynonymNode`/
 * `EnumSynonymNode` aliases rather than `Dehydrated<Data>['synonyms']`
 * directly, and `DataNode.conditions` uses constraint-translator.ts's
 * `ConditionNode` — both modules document the same root cause (an
 * `Array<Reference<X>>`-typed field, e.g. `RosettaClassSynonym.sources` /
 * `ChoiceOperation.attributes`, is not dehydrated by `Dehydrated<T>`'s field
 * mapper, and a union-typed required field like `Condition.expression`
 * collapses when `Dehydrated<T>` is applied directly to the union) — see
 * constraint-translator.ts's and synonym-builder.ts's module docs for the
 * full explanation. This module does not re-derive the fix; it only
 * consumes the sibling modules' already-corrected aliases.
 *
 * `Dehydrated<T>` also makes every field — including ones optional on the
 * original interface (`Data.definition?`, `Attribute.definition?`,
 * `RosettaEnumValue.display?`, etc.) — a REQUIRED key of type `V |
 * undefined` rather than an optional key (`DehydratedField<F>` maps the
 * field's own type but the enclosing mapped type adds no `?` modifier). The
 * conditional-spread idiom this module already used (`...(x !== undefined
 * && { x })`, which OMITS the key entirely) still produces a valid runtime
 * value — omitting an optional key is assignable to `V | undefined` — so no
 * behavior change was needed here, only the type annotations below.
 */
export type AttributeNode = Omit<Dehydrated<Attribute>, 'synonyms'> & { synonyms: SynonymNode[] };

export type DataNode = Omit<Dehydrated<Data>, 'conditions' | 'synonyms' | 'attributes'> & {
  conditions: ConditionNode[];
  synonyms: ClassSynonymNode[];
  attributes: AttributeNode[];
};

/** See `DataNode`'s doc. */
export type EnumerationNode = Omit<Dehydrated<RosettaEnumeration>, 'synonyms' | 'enumValues'> & {
  synonyms: SynonymNode[];
  enumValues: EnumValueNode[];
};

/** See `DataNode`'s doc. */
export type EnumValueNode = Omit<Dehydrated<RosettaEnumValue>, 'enumSynonyms'> & { enumSynonyms: EnumSynonymNode[] };

/**
 * A `RosettaFunction`-shaped plain object (spec.md Phase 2b Implementation
 * Addendum decision 4's inbound half — the OpenAPI reader's `paths`
 * consumption). `annotations` carries the func↔operation carrier
 * (`operation-carrier.ts`'s `buildOperationAnnotationRef`), never
 * `synonyms` — `RosettaFunction` has no `Synonyms` fragment (T2's
 * grammar-verification finding). `inputs`/`output` reuse `AttributeNode`
 * (the same `Dehydrated<Attribute>` correction `DataNode`'s attributes
 * use) since a func's inputs/output ARE `Attribute` nodes in the grammar.
 * `conditions`/`operations`/`postConditions`/`shortcuts` are always empty —
 * a reconstructed func from an OpenAPI operation has no Rune expression
 * body to derive (it is legally an ABSTRACT func, `operations+=Operation*`
 * permits zero — verified via a real parse in
 * test/import/openapi-operations.test.ts).
 */
export type FunctionNode = Omit<
  Dehydrated<RosettaFunction>,
  'inputs' | 'output' | 'shortcuts' | 'conditions' | 'operations' | 'postConditions'
> & {
  inputs: AttributeNode[];
  output: AttributeNode;
  shortcuts: never[];
  conditions: never[];
  operations: never[];
  postConditions: never[];
};

/** Converts a `SourceCardinality` to the grammar's `RosettaCardinality` field shape. */
function toCardinality(card: SourceCardinality): Dehydrated<RosettaCardinality> {
  if (card.sup === undefined) return { $type: 'RosettaCardinality', inf: card.inf, unbounded: true, sup: undefined };
  return { $type: 'RosettaCardinality', inf: card.inf, sup: card.sup, unbounded: false };
}

/** Converts a Rune type name to the grammar's `TypeCall` field shape (`Attribute.typeCall: TypeCall`, a required nested node, not the bare `{ type: {$refText} }` this module used pre-retrofit). */
function toTypeCall(typeName: string): Dehydrated<TypeCall> {
  return { $type: 'TypeCall', type: { $refText: typeName }, arguments: [] };
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
    // `override`/`typeCallArgs` are both REQUIRED on the real grammar's
    // `Attribute` (drift finding: the pre-retrofit hand-rolled `AttributeNode`
    // omitted both, silently). Imported attributes are never `override`
    // (there is no base-attribute redeclaration in the importer's model) and
    // never carry type-call arguments (the importer never emits a
    // parameterized type reference).
    override: false,
    typeCall: toTypeCall(attr.typeName),
    typeCallArgs: [],
    card: toCardinality(attr.cardinality),
    definition: attr.description,
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
    superType: type.extends !== undefined ? { $refText: type.extends } : undefined,
    definition: type.description,
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
    // `parent` (enum-inheritance, `enum X extends Y:`) is a REQUIRED key on
    // `Dehydrated<RosettaEnumeration>` (drift finding: silently missing from
    // the pre-retrofit hand-rolled `EnumerationNode`) — the importer never
    // derives an enum parent, so this is always `undefined`.
    parent: undefined,
    definition: undefined,
    annotations: [],
    references: [],
    synonyms: emitSynonyms ? [buildAttributeSynonym(sourceName, sourceEnum.sourceKey)] : [],
    enumValues: sourceEnum.values.map(
      (v): EnumValueNode => ({
        $type: 'RosettaEnumValue',
        name: escapeId(v.name),
        // `display`/`definition` are REQUIRED keys of type `string | undefined`
        // under `Dehydrated<T>` (same gap constraint-translator.ts documents
        // for `Condition.definition`/`name` — an optional field on the real
        // AST interface still needs its key present, just possibly
        // `undefined`), so these are assigned directly rather than
        // conditionally spread.
        display: v.displayName,
        definition: v.description,
        annotations: [],
        references: [],
        // The synonym records the ORIGINAL SOURCE literal (v.sourceKey), never
        // v.displayName — displayName is a presentational label (may come from
        // the outbound emitter's own x-rune-enum-display map) and is not
        // necessarily the value the source schema actually used (reviewer
        // finding: emitting displayName here silently recorded the wrong
        // value whenever a display map was present).
        enumSynonyms: emitSynonyms ? [buildEnumValueSynonym(sourceName, v.sourceKey)] : []
      })
    )
  };
}

/**
 * Builds one func input/output `Attribute` node from a `SourceFuncParam` —
 * distinct from `buildAttribute` (which takes a `SourceAttribute`: a
 * type's own attribute, carrying `sourceKey`/synonyms neither of which a
 * func parameter has, since `RosettaFunction` has no `Synonyms` fragment,
 * T2's grammar-verification finding).
 */
function buildFuncParam(param: SourceFuncParam): AttributeNode {
  return {
    $type: 'Attribute',
    override: false,
    name: escapeId(param.name),
    typeCall: toTypeCall(param.typeName),
    typeCallArgs: [],
    card: toCardinality(param.cardinality),
    definition: undefined,
    annotations: [],
    references: [],
    synonyms: [],
    labels: [],
    ruleReferences: []
  };
}

/**
 * Builds one `RosettaFunction` node from a `SourceFunc` (spec.md Phase 2b
 * Implementation Addendum decision 4's inbound half). Always abstract (no
 * `operations`/body) — see `FunctionNode`'s doc. Attaches the
 * func↔operation carrier annotation (T2's `operation-carrier.ts`) so the
 * emitted `.rune` records the exact "METHOD /path" string this func was
 * reconstructed from, closing the round trip.
 */
export function buildFunc(sourceFunc: SourceFunc): FunctionNode {
  return {
    $type: 'RosettaFunction',
    name: escapeId(sourceFunc.name),
    dispatchAttribute: undefined,
    dispatchValue: undefined,
    superFunction: undefined,
    definition: sourceFunc.description,
    annotations: [buildOperationAnnotationRef(sourceFunc.operation)],
    references: [],
    inputs: sourceFunc.inputs.map(buildFuncParam),
    output: buildFuncParam(sourceFunc.output),
    shortcuts: [],
    conditions: [],
    operations: [],
    postConditions: []
  };
}

export interface BuildModelOptions {
  /** Suppress synonym annotations entirely (`--no-synonyms`). Default: emit (spec.md MVP default). */
  emitSynonyms?: boolean;
}

export interface BuiltModel {
  /** Ready for `renderModel({ name: model.namespace, version: '0.0.0', elements })`. */
  elements: Array<DataNode | EnumerationNode | FunctionNode>;
  /** The `synonym source <Name>` declaration text, or `undefined` when synonyms are suppressed — see synonym-builder.ts's module doc for why this is spliced in as literal text rather than an `elements` member. */
  synonymSourceDeclaration?: string;
  /** The `annotation openApi: ...` declaration text, present only when `model.funcs` is non-empty — see operation-carrier.ts's module doc for why this is spliced in as literal text (no `renderNode` case exists for `Annotation`) rather than an `elements` member. */
  operationAnnotationDeclaration?: string;
  diagnostics: ImportDiagnostic[];
}

/** Builds every `Data`/`RosettaEnumeration`/`RosettaFunction` node for a `SourceModel`. */
export function buildModel(model: SourceModel, options: BuildModelOptions = {}): BuiltModel {
  const emitSynonyms = options.emitSynonyms ?? true;
  const diagnostics: ImportDiagnostic[] = [];

  const elements: Array<DataNode | EnumerationNode | FunctionNode> = [
    ...model.enums.map((e) => buildEnumeration(e, model.sourceName, emitSynonyms)),
    ...model.types.map((t) => buildDataType(t, model.sourceName, emitSynonyms, diagnostics)),
    ...model.funcs.map((f) => buildFunc(f))
  ];

  const operationAnnotationDecl = buildOperationAnnotationDecl();
  const operationAttrText = renderNode(
    operationAnnotationDecl.attributes[0] as never,
    (c) => renderNode(c, () => '') ?? ''
  );

  return {
    elements,
    ...(model.funcs.length > 0 &&
      operationAttrText !== null && {
        operationAnnotationDeclaration: renderOperationAnnotationDecl(operationAnnotationDecl, operationAttrText)
      }),
    ...(emitSynonyms && { synonymSourceDeclaration: buildSynonymSourceDeclaration(model.sourceName) }),
    diagnostics
  };
}
