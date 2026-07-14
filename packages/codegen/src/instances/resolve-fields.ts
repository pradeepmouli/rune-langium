// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isData, type Attribute, type Data } from '@rune-langium/core';
import { buildField, buildNamespaceIndexes, type NamespaceIndex } from '../preview-schema.js';
import type { PreviewField } from '../types.js';

function findDataByFqn(
  namespaces: NamespaceIndex[],
  typeFqn: string
): { data: Data; sourceUri: string; namespace: NamespaceIndex } | undefined {
  const lastDot = typeFqn.lastIndexOf('.');
  if (lastDot < 0) return undefined;
  const ns = typeFqn.slice(0, lastDot);
  const name = typeFqn.slice(lastDot + 1);
  const namespace = namespaces.find((n) => n.namespace === ns);
  if (!namespace) return undefined;
  const entry = namespace.dataByName.get(name);
  if (!entry) return undefined;
  return { data: entry.node, sourceUri: entry.sourceUri, namespace };
}

// Mirrors the typeRef → refText fallback chain buildBaseField uses in preview-schema.ts,
// narrowed to the Data-only resolution navigateToPath needs.
function resolveAttributeData(
  attr: Attribute,
  namespace: NamespaceIndex,
  fallbackSourceUri: string
): { data: Data; sourceUri: string } | undefined {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (typeRef && isData(typeRef)) {
    return { data: typeRef, sourceUri: typeRef.$container?.$document?.uri?.toString() ?? fallbackSourceUri };
  }
  if (!typeRef && refText && namespace.dataByName.has(refText)) {
    const resolved = namespace.dataByName.get(refText)!;
    return { data: resolved.node, sourceUri: resolved.sourceUri };
  }
  return undefined;
}

function navigateToPath(
  root: Data,
  namespace: NamespaceIndex,
  rootSourceUri: string,
  path: string[]
): { data: Data; sourceUri: string; seenTypes: Set<string> } {
  let current = root;
  let sourceUri = rootSourceUri;
  const seenTypes = new Set<string>([root.name]);
  for (const segment of path) {
    const attr = current.attributes.find((a) => a.name === segment);
    if (!attr) {
      throw new Error(
        `resolveFields: no attribute '${segment}' on type '${current.name}' while walking path [${path.join('.')}]`
      );
    }
    const resolved = resolveAttributeData(attr, namespace, sourceUri);
    if (!resolved) {
      throw new Error(
        `resolveFields: attribute '${segment}' on type '${current.name}' does not resolve to a Data type`
      );
    }
    current = resolved.data;
    sourceUri = resolved.sourceUri;
    seenTypes.add(current.name);
  }
  return { data: current, sourceUri, seenTypes };
}

/**
 * Resolve exactly one more level of fields below `path` on `typeFqn`.
 * Unlike generatePreviewSchemas()'s bounded eager tree, this never recurses
 * past the requested level — nested object fields come back as `{ kind:
 * 'object', expandable: true }` stubs; the caller (InstanceFormPanel) calls
 * this again with the deeper path when the user expands that field.
 * Memoization is the caller's responsibility (per-typeFqn/path, since this
 * function is pure given the same documents).
 */
export function resolveFields(typeFqn: string, path: string[], documents: LangiumDocument[]): PreviewField[] {
  const namespaces = buildNamespaceIndexes(documents);
  const found = findDataByFqn(namespaces, typeFqn);
  if (!found) {
    throw new Error(`resolveFields: unknown type '${typeFqn}'`);
  }

  const { data: rootData, sourceUri: rootSourceUri, namespace } = found;
  const { data: targetData, sourceUri, seenTypes } = navigateToPath(rootData, namespace, rootSourceUri, path);
  const depth = path.length;

  return targetData.attributes.map((attr) =>
    buildField(attr, {
      namespace,
      unsupportedFeatures: new Set(),
      sourceMap: [],
      sourceUri,
      maxDepth: depth,
      depth,
      path: [...path, attr.name].join('.'),
      label: attr.name,
      seenTypes,
      lazy: true
    })
  );
}
