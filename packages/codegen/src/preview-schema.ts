// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import {
  isData,
  isRosettaBasicType,
  isRosettaEnumeration,
  isRosettaModel,
  type Attribute,
  type Data,
  type RosettaCardinality,
  type RosettaEnumeration,
  type RosettaModel
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
    const names = Array.from(namespace.dataByName.keys()).sort();
    for (const name of names) {
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
  }

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
