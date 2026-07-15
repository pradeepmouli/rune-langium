// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import {
  isChoice,
  isData,
  isRosettaBasicType,
  isRosettaEnumeration,
  isRosettaFunction,
  isRosettaModel,
  isRosettaRecordType,
  isRosettaTypeAlias,
  type Attribute,
  type Choice,
  type ChoiceOption,
  type Data,
  type RosettaCardinality,
  type RosettaEnumeration,
  type RosettaFunction,
  type RosettaModel,
  type RosettaTypeAlias
} from '@rune-langium/core';
import type {
  FormPreviewSchema,
  GeneratePreviewSchemaOptions,
  PreviewField,
  PreviewFieldKind,
  PreviewSourceMapEntry
} from './types.js';
import { choiceOptionFieldName } from './emit/base-namespace-emitter.js';

function humanizeLabel(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

const SCHEMA_VERSION = 1;
const DEFAULT_MAX_DEPTH = 3;

export interface NamespaceIndex {
  namespace: string;
  dataByName: Map<string, { node: Data; sourceUri: string }>;
  enumByName: Map<string, { node: RosettaEnumeration; sourceUri: string }>;
  typeAliasByName: Map<string, { node: RosettaTypeAlias; sourceUri: string }>;
  choiceByName: Map<string, { node: Choice; sourceUri: string }>;
  funcByName: Map<string, { node: RosettaFunction; sourceUri: string }>;
  duplicateDataNames: Set<string>;
}

interface FieldContext {
  namespace: NamespaceIndex;
  unsupportedFeatures: Set<string>;
  sourceMap: PreviewSourceMapEntry[];
  sourceUri: string;
  maxDepth: number;
  depth: number;
  path: string;
  label: string;
  seenTypes: Set<string>;
}

const BUILTIN_KIND_MAP: Record<string, Extract<PreviewFieldKind, 'string' | 'number' | 'boolean'>> = {
  string: 'string',
  int: 'number',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  dateTime: 'string',
  zonedDateTime: 'string',
  time: 'string',
  productType: 'string',
  eventType: 'string'
};

export function generatePreviewSchemas(
  documents: LangiumDocument | LangiumDocument[],
  options: GeneratePreviewSchemaOptions = {}
): FormPreviewSchema[] {
  const docs = Array.isArray(documents) ? documents : [documents];
  const namespaces = buildNamespaceIndexes(docs);
  const schemas: FormPreviewSchema[] = [];

  for (const namespace of namespaces) {
    // Data types
    const dataNames = Array.from(namespace.dataByName.keys()).sort();
    for (const name of dataNames) {
      const data = namespace.dataByName.get(name)!;
      const targetId = `${namespace.namespace}.${name}`;
      if (options.targetId && options.targetId !== targetId) continue;
      if (namespace.duplicateDataNames.has(name)) {
        schemas.push(buildDuplicateTargetSchema(data.node, targetId));
        continue;
      }
      schemas.push(
        buildDataSchema(data.node, data.sourceUri, namespace, targetId, options.maxDepth ?? DEFAULT_MAX_DEPTH)
      );
    }

    // Type aliases
    const aliasNames = Array.from(namespace.typeAliasByName.keys()).sort();
    for (const name of aliasNames) {
      const alias = namespace.typeAliasByName.get(name)!;
      const targetId = `${namespace.namespace}.${name}`;
      if (options.targetId && options.targetId !== targetId) continue;
      schemas.push(buildTypeAliasSchema(alias.node, alias.sourceUri, namespace, targetId));
    }

    // Choice types
    const choiceNames = Array.from(namespace.choiceByName.keys()).sort();
    for (const name of choiceNames) {
      const choice = namespace.choiceByName.get(name)!;
      const targetId = `${namespace.namespace}.${name}`;
      if (options.targetId && options.targetId !== targetId) continue;
      schemas.push(buildChoiceSchema(choice.node, choice.sourceUri, namespace, targetId));
    }

    // Functions
    const funcNames = Array.from(namespace.funcByName.keys()).sort();
    for (const name of funcNames) {
      const func = namespace.funcByName.get(name)!;
      const targetId = `${namespace.namespace}.${name}`;
      if (options.targetId && options.targetId !== targetId) continue;
      schemas.push(buildFunctionSchema(func.node, func.sourceUri, namespace, targetId));
    }
  }

  return schemas;
}

export function buildNamespaceIndexes(docs: LangiumDocument[]): NamespaceIndex[] {
  const byNamespace = new Map<string, NamespaceIndex>();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    const namespace = normalizeNamespace((model as RosettaModel).name);
    if (!namespace) continue;

    let index = byNamespace.get(namespace);
    if (!index) {
      index = {
        namespace,
        dataByName: new Map(),
        enumByName: new Map(),
        typeAliasByName: new Map(),
        choiceByName: new Map(),
        funcByName: new Map(),
        duplicateDataNames: new Set()
      };
      byNamespace.set(namespace, index);
    }

    for (const element of (model as RosettaModel).elements) {
      if (isData(element)) {
        if (index.dataByName.has(element.name)) {
          index.duplicateDataNames.add(element.name);
          continue;
        }
        index.dataByName.set(element.name, { node: element, sourceUri: doc.uri.toString() });
      } else if (isRosettaEnumeration(element)) {
        index.enumByName.set(element.name, { node: element, sourceUri: doc.uri.toString() });
      } else if (isRosettaTypeAlias(element)) {
        index.typeAliasByName.set(element.name, { node: element, sourceUri: doc.uri.toString() });
      } else if (isChoice(element)) {
        index.choiceByName.set(element.name, { node: element, sourceUri: doc.uri.toString() });
      } else if (isRosettaFunction(element)) {
        index.funcByName.set(element.name, { node: element, sourceUri: doc.uri.toString() });
      }
    }
  }

  return Array.from(byNamespace.values()).sort((a, b) => a.namespace.localeCompare(b.namespace));
}

function normalizeNamespace(name: unknown): string {
  if (typeof name === 'string') {
    return name.replace(/^"|"$/g, '');
  }
  if (
    name &&
    typeof name === 'object' &&
    'segments' in name &&
    Array.isArray((name as { segments?: unknown }).segments)
  ) {
    return (name as { segments: string[] }).segments.join('.');
  }
  return String(name ?? '');
}

/**
 * Result of walking a Data's `extends` chain: its own + inherited
 * `Attribute` AST nodes, PLUS (round-5 finding #1) the Choice the chain
 * terminates at, if any.
 */
interface InheritedAttributesResult {
  attributes: Attribute[];
  /**
   * Set when the `extends` chain terminates at a Choice ancestor (a Data's
   * `superType` reference is typed `DataOrChoice`, and a Choice can't
   * itself `extends` anything, so it's always the terminal ancestor —
   * mirrors `buildAttributeTypesMap`'s own Data/Choice walk in
   * base-namespace-emitter.ts). `buildDataSchema`'s top-level call site,
   * `buildTypeAliasSchema`'s data-alias branch, and `objectField`'s nested
   * attribute expansion all expand this into pseudo-fields — the first two
   * build a schema whose `fields` sit directly at the root, while
   * `objectField` passes its ambient field path to `buildChoiceOptionField`
   * via `pathPrefix` so the Choice option fields' `path` (e.g.
   * `constituent.commodity`) is correctly prefixed instead of bare. The one
   * remaining consumer of this helper that does NOT yet expand a Choice
   * ancestor is `buildChoiceOptionField`'s OWN nested Data-type option
   * expansion (a Choice option whose Data type itself extends a Choice) —
   * a doubly-nested case intentionally left as a follow-up.
   */
  choiceAncestor?: Choice;
}

/**
 * Collects `data`'s own attributes PLUS every ancestor Data's own
 * attributes, walking the `extends` chain (Data-to-Data), and reports the
 * Choice the chain terminates at, if any (round-5 finding #1 — see
 * `InheritedAttributesResult.choiceAncestor`'s doc comment).
 *
 * Without the attribute-chain walk, a subtype's FormPreviewSchema only
 * reflected its OWN `data.attributes` — omitting required fields declared
 * on a supertype, so an instance missing a required PARENT field could pass
 * structural validation.
 *
 * `attributes` is ordered root-ancestor-first, subtype's-own-attributes-last
 * (reads naturally as a form); a visited-set guards a malformed cyclic
 * chain. A name collision (which Rune's validator otherwise rejects) keeps
 * the root ancestor's declaration.
 */
function collectInheritedAttributes(data: Data): InheritedAttributesResult {
  const chain: Data[] = [];
  const visited = new Set<string>();
  let current: Data | undefined = data;
  let choiceAncestor: Choice | undefined;
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    chain.push(current);
    const parent: unknown = current.superType?.ref;
    if (parent && isChoice(parent)) {
      choiceAncestor = parent;
      break;
    }
    current = parent && isData(parent) ? parent : undefined;
  }
  const seen = new Set<string>();
  const attrs: Attribute[] = [];
  for (const node of [...chain].reverse()) {
    for (const attr of node.attributes) {
      if (seen.has(attr.name)) continue;
      seen.add(attr.name);
      attrs.push(attr);
    }
  }
  return { attributes: attrs, choiceAncestor };
}

function buildDataSchema(
  data: Data,
  sourceUri: string,
  namespace: NamespaceIndex,
  targetId: string,
  maxDepth: number
): FormPreviewSchema {
  const unsupportedFeatures = new Set<string>();
  const sourceMap: PreviewSourceMapEntry[] = [];
  const { attributes, choiceAncestor } = collectInheritedAttributes(data);
  const attributeFields = attributes.map((attr) =>
    buildField(attr, {
      namespace,
      unsupportedFeatures,
      sourceMap,
      sourceUri,
      maxDepth,
      depth: 0,
      path: attr.name,
      label: humanizeLabel(attr.name),
      seenTypes: new Set([data.name])
    })
  );

  // Data-extends-Choice (round-5 finding #1): when the `extends` chain
  // terminates at a Choice ancestor, the REAL generated schema for `data`
  // (see base-namespace-emitter.ts's buildAttributeTypesMap /
  // contributeChoiceOptionsAsAttributes) also accepts one key per Choice
  // option — e.g. `BasketConstituent extends Observable` accepts
  // `commodity`/`cash`/etc. alongside BasketConstituent's own attributes.
  // Reuse buildChoiceOptionField (the same function that already builds a
  // genuine, non-inherited Choice type's own fields) so an option's field
  // shape — and its lower-camel `path`, via choiceOptionFieldName — matches
  // the real emitted schema exactly. On a name collision, the Data type's
  // own attribute wins (mirrors buildAttributeTypesMap's `if
  // (!map.has(...))` precedence, where the more-derived Data's own
  // attributes are set before the Choice's options are ever contributed).
  const ownFieldPaths = new Set(attributeFields.map((field) => field.path));
  const choiceFields = choiceAncestor
    ? choiceAncestor.attributes
        .map((option) => buildChoiceOptionField(option, { namespace, unsupportedFeatures, sourceUri }))
        .filter((field) => !ownFieldPaths.has(field.path))
    : [];

  const fields = [...choiceFields, ...attributeFields];

  return {
    schemaVersion: SCHEMA_VERSION,
    targetId,
    title: data.name,
    status: unsupportedFeatures.size > 0 ? 'unsupported' : 'ready',
    fields,
    ...(sourceMap.length > 0 ? { sourceMap } : {}),
    ...(unsupportedFeatures.size > 0 ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() } : {})
  };
}

function buildDuplicateTargetSchema(data: Data, targetId: string): FormPreviewSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
    targetId,
    title: data.name,
    status: 'unsupported',
    fields: [],
    unsupportedFeatures: [`duplicate-target:${targetId}`]
  };
}

/**
 * Builds a FormPreviewSchema for a RosettaTypeAlias.
 *
 * - If the alias resolves directly to a primitive type (string, int, number,
 *   boolean, etc.), a single scalar field is emitted.
 * - If the alias resolves to another Data type, the object's fields are
 *   expanded inline (same as buildDataSchema).
 * - Otherwise the schema is marked unsupported.
 */
function buildTypeAliasSchema(
  alias: RosettaTypeAlias,
  sourceUri: string,
  namespace: NamespaceIndex,
  targetId: string
): FormPreviewSchema {
  const typeRef = alias.typeCall?.type?.ref;
  const refText = alias.typeCall?.type?.$refText;
  const unsupportedFeatures = new Set<string>();

  // Primitive alias (e.g. `typeAlias productType: string`)
  const builtinKind =
    (typeRef && isRosettaBasicType(typeRef) ? BUILTIN_KIND_MAP[typeRef.name] : undefined) ??
    (refText ? BUILTIN_KIND_MAP[refText] : undefined);

  if (builtinKind) {
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'typeAlias',
      targetId,
      title: alias.name,
      status: 'ready',
      fields: [{ path: 'value', label: humanizeLabel(alias.name), kind: builtinKind, required: true }]
    };
  }

  // Data-type alias — delegate field expansion to the underlying data type
  const resolvedData =
    (typeRef && isData(typeRef) ? typeRef : undefined) ??
    (refText ? namespace.dataByName.get(refText)?.node : undefined);

  if (resolvedData) {
    const sourceMap: PreviewSourceMapEntry[] = [];
    const { attributes, choiceAncestor } = collectInheritedAttributes(resolvedData);
    const attributeFields = attributes.map((attr) =>
      buildField(attr, {
        namespace,
        unsupportedFeatures,
        sourceMap,
        sourceUri,
        maxDepth: DEFAULT_MAX_DEPTH,
        depth: 0,
        path: attr.name,
        label: humanizeLabel(attr.name),
        seenTypes: new Set([resolvedData.name])
      })
    );

    // Data-extends-Choice (round-5 finding #1), applied to a data-type alias:
    // mirrors buildDataSchema's expansion of a Choice ancestor's options into
    // top-level pseudo-fields — see that call site's comment for the full
    // rationale. On a name collision, the Data type's own attribute wins.
    const ownFieldPaths = new Set(attributeFields.map((field) => field.path));
    const choiceFields = choiceAncestor
      ? choiceAncestor.attributes
          .map((option) => buildChoiceOptionField(option, { namespace, unsupportedFeatures, sourceUri }))
          .filter((field) => !ownFieldPaths.has(field.path))
      : [];

    const fields = [...choiceFields, ...attributeFields];
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'typeAlias',
      targetId,
      title: alias.name,
      status: unsupportedFeatures.size > 0 ? 'unsupported' : 'ready',
      fields,
      ...(sourceMap.length > 0 ? { sourceMap } : {}),
      ...(unsupportedFeatures.size > 0 ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() } : {})
    };
  }

  // Unresolvable alias reference
  unsupportedFeatures.add(`unresolved-reference:${refText ?? alias.name}`);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'typeAlias',
    targetId,
    title: alias.name,
    status: 'unsupported',
    fields: [
      {
        path: 'value',
        label: humanizeLabel(alias.name),
        kind: 'unknown',
        required: true,
        description: `Type reference ${refText ?? alias.name} could not be resolved for form preview.`
      }
    ],
    unsupportedFeatures: Array.from(unsupportedFeatures).sort()
  };
}

/**
 * Builds a FormPreviewSchema for a grammar-level Choice type.
 *
 * Each ChoiceOption becomes an 'object' or scalar field representing one
 * possible selection. The schema conveys that exactly one option must be
 * chosen (discriminated union).
 */
function buildChoiceSchema(
  choice: Choice,
  sourceUri: string,
  namespace: NamespaceIndex,
  targetId: string
): FormPreviewSchema {
  const unsupportedFeatures = new Set<string>();
  const fields: PreviewField[] = choice.attributes.map((option: ChoiceOption) =>
    buildChoiceOptionField(option, { namespace, unsupportedFeatures, sourceUri })
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'choice',
    targetId,
    title: choice.name,
    status: unsupportedFeatures.size > 0 ? 'unsupported' : 'ready',
    fields,
    ...(unsupportedFeatures.size > 0 ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() } : {})
  };
}

function buildChoiceOptionField(
  option: ChoiceOption,
  ctx: {
    namespace: NamespaceIndex;
    unsupportedFeatures: Set<string>;
    sourceUri: string;
    /**
     * Ambient field path to prefix this option's `path` (and its own
     * nested Data-type option `children`, via the recursive call below)
     * with, for a Choice ancestor expanded from a NESTED reference (e.g.
     * `objectField`, whose `children` live under `constituent.*`). Omitted
     * by every top-level call site (`buildChoiceSchema`, `buildDataSchema`,
     * `buildTypeAliasSchema`) and by this function's own internal
     * recursive call, all of which must keep producing a bare,
     * unprefixed `path`.
     */
    pathPrefix?: string;
  }
): PreviewField {
  const typeRef = option.typeCall?.type?.ref;
  const refText = option.typeCall?.type?.$refText;

  // Resolve the option's label from the referenced type name (original DSL
  // casing, for display) and its `path` from the REAL emitted object key
  // (lower-camel-cased, per `choiceOptionFieldName`) — the same rule
  // zod-emitter/json-schema-emitter/ts-emitter apply when generating the
  // actual schema for a Choice, so instance data keyed by `path` here
  // round-trips against the real generated schema instead of being
  // rejected for using the raw (capitalized) DSL type-reference text.
  const label = refText ?? 'unknown';
  const basePath = refText ? choiceOptionFieldName(refText) : label;
  const path = ctx.pathPrefix ? `${ctx.pathPrefix}.${basePath}` : basePath;

  // Primitive type option
  const builtinKind =
    (typeRef && isRosettaBasicType(typeRef) ? BUILTIN_KIND_MAP[typeRef.name] : undefined) ??
    (refText ? BUILTIN_KIND_MAP[refText] : undefined);

  if (builtinKind) {
    return { path, label, kind: builtinKind, required: false };
  }

  // Enumeration option
  if (typeRef && isRosettaEnumeration(typeRef)) {
    return {
      path,
      label,
      kind: 'enum',
      required: false,
      enumValues: typeRef.enumValues.map((v) => ({
        value: v.name,
        label: v.display ?? humanizeLabel(v.name)
      }))
    };
  }
  if (!typeRef && refText && ctx.namespace.enumByName.has(refText)) {
    const enumNode = ctx.namespace.enumByName.get(refText)!.node;
    return {
      path,
      label,
      kind: 'enum',
      required: false,
      enumValues: enumNode.enumValues.map((v) => ({
        value: v.name,
        label: v.display ?? humanizeLabel(v.name)
      }))
    };
  }

  // Data type option — emit as object with expanded children
  const resolvedData =
    (typeRef && isData(typeRef) ? typeRef : undefined) ??
    (refText ? ctx.namespace.dataByName.get(refText)?.node : undefined);
  const resolvedSourceUri =
    (typeRef && isData(typeRef)
      ? (typeRef.$container?.$document?.uri?.toString() ?? ctx.sourceUri)
      : ctx.namespace.dataByName.get(refText ?? '')?.sourceUri) ?? ctx.sourceUri;

  if (resolvedData) {
    const childCtx: FieldContext = {
      namespace: ctx.namespace,
      unsupportedFeatures: ctx.unsupportedFeatures,
      sourceMap: [],
      sourceUri: resolvedSourceUri,
      maxDepth: DEFAULT_MAX_DEPTH,
      depth: 0,
      path,
      label,
      seenTypes: new Set([resolvedData.name])
    };
    return {
      path,
      label,
      kind: 'object',
      required: false,
      children: collectInheritedAttributes(resolvedData).attributes.map((child) =>
        buildField(child, {
          ...childCtx,
          path: `${path}.${child.name}`,
          label: humanizeLabel(child.name)
        })
      )
    };
  }

  ctx.unsupportedFeatures.add(`unresolved-reference:${refText ?? label}`);
  return {
    path,
    label,
    kind: 'unknown',
    required: false,
    description: `Type reference ${refText ?? label} could not be resolved for form preview.`
  };
}

function buildFunctionSchema(
  func: RosettaFunction,
  sourceUri: string,
  namespace: NamespaceIndex,
  targetId: string
): FormPreviewSchema {
  const unsupportedFeatures = new Set<string>();
  const sourceMap: PreviewSourceMapEntry[] = [];

  const inputFields = (func.inputs ?? []).map((attr) =>
    buildField(attr, {
      namespace,
      unsupportedFeatures,
      sourceMap,
      sourceUri,
      maxDepth: DEFAULT_MAX_DEPTH,
      depth: 0,
      path: attr.name,
      label: humanizeLabel(attr.name),
      seenTypes: new Set()
    })
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    targetId,
    title: func.name,
    kind: 'function',
    status: unsupportedFeatures.size > 0 ? 'unsupported' : 'ready',
    fields: inputFields,
    ...(sourceMap.length > 0 ? { sourceMap } : {}),
    ...(unsupportedFeatures.size > 0 ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() } : {})
  };
}

function buildField(attr: Attribute, ctx: FieldContext): PreviewField {
  addSourceMapEntry(ctx.sourceMap, ctx.path, attr, ctx.sourceUri);
  const card = attr.card;
  const base = buildBaseField(attr, ctx);
  const cardinality = getCardinality(card);

  if (isArrayCardinality(card)) {
    return {
      path: ctx.path,
      label: ctx.label,
      kind: 'array',
      required: card.inf > 0,
      cardinality,
      children: [asArrayItem(base, ctx)]
    };
  }

  return {
    ...base,
    required: card.inf > 0,
    ...(cardinality ? { cardinality } : {})
  };
}

function buildBaseField(attr: Attribute, ctx: FieldContext): PreviewField {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (typeRef && isRosettaBasicType(typeRef)) {
    const builtinKind = BUILTIN_KIND_MAP[typeRef.name];
    return builtinKind ? scalarField(ctx, builtinKind) : unsupportedField(ctx, typeRef.name);
  }

  // recordType (date, dateTime, zonedDateTime) resolves to RosettaRecordType, not RosettaBasicType
  if (typeRef && isRosettaRecordType(typeRef)) {
    const builtinKind = BUILTIN_KIND_MAP[typeRef.name];
    return builtinKind ? scalarField(ctx, builtinKind) : unsupportedField(ctx, typeRef.name);
  }

  if (!typeRef && refText && BUILTIN_KIND_MAP[refText]) {
    return scalarField(ctx, BUILTIN_KIND_MAP[refText]);
  }

  if (typeRef && isRosettaEnumeration(typeRef)) {
    return enumField(ctx, typeRef);
  }

  if (!typeRef && refText && ctx.namespace.enumByName.has(refText)) {
    return enumField(ctx, ctx.namespace.enumByName.get(refText)!.node);
  }

  if (typeRef && isData(typeRef)) {
    return objectField(ctx, typeRef, typeRef.$container?.$document?.uri?.toString() ?? ctx.sourceUri);
  }

  if (!typeRef && refText && ctx.namespace.dataByName.has(refText)) {
    const resolved = ctx.namespace.dataByName.get(refText)!;
    return objectField(ctx, resolved.node, resolved.sourceUri);
  }

  ctx.unsupportedFeatures.add(`unresolved-reference:${refText ?? attr.name}`);
  return unsupportedField(
    ctx,
    refText ? `Type reference ${refText} could not be resolved for form preview.` : undefined
  );
}

function unsupportedField(ctx: FieldContext, description?: string): PreviewField {
  return {
    path: ctx.path,
    label: ctx.label,
    kind: 'unknown',
    required: true,
    description: description ?? 'Unresolved type reference is not supported in form preview.'
  };
}

function scalarField(
  ctx: FieldContext,
  kind: Extract<PreviewFieldKind, 'string' | 'number' | 'boolean'>
): PreviewField {
  return {
    path: ctx.path,
    label: ctx.label,
    kind,
    required: true
  };
}

function enumField(ctx: FieldContext, enumNode: RosettaEnumeration): PreviewField {
  return {
    path: ctx.path,
    label: ctx.label,
    kind: 'enum',
    required: true,
    enumValues: enumNode.enumValues.map((value) => ({
      value: value.name,
      label: value.display ?? humanizeLabel(value.name)
    }))
  };
}

function objectField(ctx: FieldContext, data: Data, sourceUri: string): PreviewField {
  if (ctx.seenTypes.has(data.name) || ctx.depth >= ctx.maxDepth) {
    ctx.unsupportedFeatures.add(`recursive-reference:${data.name}`);
    return {
      path: ctx.path,
      label: ctx.label,
      kind: 'unknown',
      required: true,
      description: `Recursive reference to ${data.name} is not expanded in form preview.`
    };
  }

  const nextSeen = new Set(ctx.seenTypes);
  nextSeen.add(data.name);
  const { attributes, choiceAncestor } = collectInheritedAttributes(data);
  const attributeChildren = attributes.map((child) =>
    buildField(child, {
      ...ctx,
      sourceUri,
      depth: ctx.depth + 1,
      path: `${ctx.path}.${child.name}`,
      label: humanizeLabel(child.name),
      seenTypes: nextSeen
    })
  );

  // Data-extends-Choice (round-5 finding #1), applied to a NESTED attribute
  // reference: mirrors buildDataSchema's/buildTypeAliasSchema's expansion of
  // a Choice ancestor's options — see collectInheritedAttributes'
  // `choiceAncestor` doc comment for the full rationale — but with each
  // option field's `path` prefixed with the ambient `ctx.path` (via
  // `pathPrefix`) so it comes out as e.g. `constituent.commodity` instead of
  // a bare, top-level-only `commodity`. On a name collision, the Data type's
  // own attribute wins (same precedence as the other two call sites).
  const ownChildPaths = new Set(attributeChildren.map((child) => child.path));
  const choiceFields = choiceAncestor
    ? choiceAncestor.attributes
        .map((option) =>
          buildChoiceOptionField(option, {
            namespace: ctx.namespace,
            unsupportedFeatures: ctx.unsupportedFeatures,
            sourceUri,
            pathPrefix: ctx.path
          })
        )
        .filter((field) => !ownChildPaths.has(field.path))
    : [];

  return {
    path: ctx.path,
    label: ctx.label,
    kind: 'object',
    required: true,
    children: [...choiceFields, ...attributeChildren]
  };
}

function asArrayItem(field: PreviewField, ctx: FieldContext): PreviewField {
  const itemPath = `${ctx.path}[]`;
  if (field.kind === 'object') {
    return {
      ...field,
      path: itemPath,
      label: `${ctx.label} item`,
      required: true,
      children: field.children?.map((child) => ({
        ...child,
        path: child.path.replace(`${ctx.path}.`, `${itemPath}.`)
      }))
    };
  }
  return {
    ...field,
    path: itemPath,
    label: `${ctx.label} item`,
    required: true
  };
}

function isArrayCardinality(card: RosettaCardinality): boolean {
  const upper = card.unbounded ? null : (card.sup ?? card.inf);
  return upper === null || upper > 1;
}

function getCardinality(card: RosettaCardinality): PreviewField['cardinality'] {
  const upper = card.unbounded ? null : (card.sup ?? card.inf);
  if (card.inf === 1 && upper === 1) return undefined;
  return {
    min: card.inf,
    max: upper === null ? 'unbounded' : upper
  };
}

function addSourceMapEntry(
  sourceMap: PreviewSourceMapEntry[],
  fieldPath: string,
  attr: Attribute,
  sourceUri: string
): void {
  const start = attr.$cstNode?.range?.start;
  if (!sourceUri || !start) {
    return;
  }
  sourceMap.push({
    fieldPath,
    sourceUri,
    sourceLine: start.line + 1,
    sourceChar: start.character + 1
  });
}
