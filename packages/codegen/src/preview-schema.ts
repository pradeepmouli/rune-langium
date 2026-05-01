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

const SCHEMA_VERSION = 1;
const DEFAULT_MAX_DEPTH = 3;

interface NamespaceIndex {
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

const BUILTIN_KIND_MAP: Record<
  string,
  Extract<PreviewFieldKind, 'string' | 'number' | 'boolean'>
> = {
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
        buildDataSchema(
          data.node,
          data.sourceUri,
          namespace,
          targetId,
          options.maxDepth ?? DEFAULT_MAX_DEPTH
        )
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

  // TODO(T039-T040): The Studio FormPreviewPanel needs updating to render
  // 'typeAlias' and 'choice' kind schemas. Currently only 'data' schemas
  // are rendered in the panel UI.

  return schemas;
}

function buildNamespaceIndexes(docs: LangiumDocument[]): NamespaceIndex[] {
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

function buildDataSchema(
  data: Data,
  sourceUri: string,
  namespace: NamespaceIndex,
  targetId: string,
  maxDepth: number
): FormPreviewSchema {
  const unsupportedFeatures = new Set<string>();
  const sourceMap: PreviewSourceMapEntry[] = [];
  const fields = data.attributes.map((attr) =>
    buildField(attr, {
      namespace,
      unsupportedFeatures,
      sourceMap,
      sourceUri,
      maxDepth,
      depth: 0,
      path: attr.name,
      label: attr.name,
      seenTypes: new Set([data.name])
    })
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    targetId,
    title: data.name,
    status: unsupportedFeatures.size > 0 ? 'unsupported' : 'ready',
    fields,
    ...(sourceMap.length > 0 ? { sourceMap } : {}),
    ...(unsupportedFeatures.size > 0
      ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() }
      : {})
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
      fields: [{ path: 'value', label: alias.name, kind: builtinKind, required: true }]
    };
  }

  // Data-type alias — delegate field expansion to the underlying data type
  const resolvedData =
    (typeRef && isData(typeRef) ? typeRef : undefined) ??
    (refText ? namespace.dataByName.get(refText)?.node : undefined);

  if (resolvedData) {
    const sourceMap: PreviewSourceMapEntry[] = [];
    const fields = resolvedData.attributes.map((attr) =>
      buildField(attr, {
        namespace,
        unsupportedFeatures,
        sourceMap,
        sourceUri,
        maxDepth: DEFAULT_MAX_DEPTH,
        depth: 0,
        path: attr.name,
        label: attr.name,
        seenTypes: new Set([resolvedData.name])
      })
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'typeAlias',
      targetId,
      title: alias.name,
      status: unsupportedFeatures.size > 0 ? 'unsupported' : 'ready',
      fields,
      ...(sourceMap.length > 0 ? { sourceMap } : {}),
      ...(unsupportedFeatures.size > 0
        ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() }
        : {})
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
        label: alias.name,
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
    ...(unsupportedFeatures.size > 0
      ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() }
      : {})
  };
}

function buildChoiceOptionField(
  option: ChoiceOption,
  ctx: {
    namespace: NamespaceIndex;
    unsupportedFeatures: Set<string>;
    sourceUri: string;
  }
): PreviewField {
  const typeRef = option.typeCall?.type?.ref;
  const refText = option.typeCall?.type?.$refText;

  // Resolve the option's label from the referenced type name
  const label = refText ?? 'unknown';
  const path = label;

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
      enumValues: typeRef.enumValues.map((v) => ({ value: v.name, label: v.display ?? v.name }))
    };
  }
  if (!typeRef && refText && ctx.namespace.enumByName.has(refText)) {
    const enumNode = ctx.namespace.enumByName.get(refText)!.node;
    return {
      path,
      label,
      kind: 'enum',
      required: false,
      enumValues: enumNode.enumValues.map((v) => ({ value: v.name, label: v.display ?? v.name }))
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
      children: resolvedData.attributes.map((child) =>
        buildField(child, {
          ...childCtx,
          path: `${path}.${child.name}`,
          label: child.name
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
      label: attr.name,
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
    ...(unsupportedFeatures.size > 0
      ? { unsupportedFeatures: Array.from(unsupportedFeatures).sort() }
      : {})
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
    return objectField(
      ctx,
      typeRef,
      typeRef.$container?.$document?.uri?.toString() ?? ctx.sourceUri
    );
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
      label: value.display ?? value.name
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
  return {
    path: ctx.path,
    label: ctx.label,
    kind: 'object',
    required: true,
    children: data.attributes.map((child) =>
      buildField(child, {
        ...ctx,
        sourceUri,
        depth: ctx.depth + 1,
        path: `${ctx.path}.${child.name}`,
        label: child.name,
        seenTypes: nextSeen
      })
    )
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
