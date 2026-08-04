// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Data, Choice, RosettaEnumeration, RosettaTypeAlias } from '@rune-langium/core';
import type { NamespaceIndex } from '../preview-schema.js';
import type { TypeIndexLookup, TypeIndexEntry } from './type-ref-resolver.js';

export interface ResolvedTarget {
  kind: 'data' | 'choice' | 'enum' | 'typeAlias';
  node: Data | Choice | RosettaEnumeration | RosettaTypeAlias;
  sourceUri: string;
}

function mergeIndexEntries<N>(
  target: Map<string, TypeIndexEntry<N>>,
  namespaceIndexes: readonly NamespaceIndex[],
  pick: (ns: NamespaceIndex) => ReadonlyMap<string, TypeIndexEntry<N>>
): void {
  for (const ns of namespaceIndexes) {
    for (const [name, entry] of pick(ns)) {
      if (!target.has(name)) target.set(name, entry);
    }
  }
}

/**
 * Merge every namespace's own index into one flat, bare-name-keyed
 * TypeIndexLookup spanning the whole loaded document set — Langium already
 * resolves cross-namespace `.ref`s at link time, so this index only backs
 * resolveTypeCallTarget's refText-fallback path, not primary resolution.
 */
export function buildGlobalTypeIndex(namespaceIndexes: readonly NamespaceIndex[]): TypeIndexLookup {
  const dataByName = new Map<string, TypeIndexEntry<Data>>();
  const enumByName = new Map<string, TypeIndexEntry<RosettaEnumeration>>();
  const choiceByName = new Map<string, TypeIndexEntry<Choice>>();
  const typeAliasByName = new Map<string, TypeIndexEntry<RosettaTypeAlias>>();
  mergeIndexEntries(dataByName, namespaceIndexes, (ns) => ns.dataByName);
  mergeIndexEntries(enumByName, namespaceIndexes, (ns) => ns.enumByName);
  mergeIndexEntries(choiceByName, namespaceIndexes, (ns) => ns.choiceByName);
  mergeIndexEntries(typeAliasByName, namespaceIndexes, (ns) => ns.typeAliasByName);
  return { dataByName, enumByName, choiceByName, typeAliasByName };
}

/**
 * Resolve a `${namespace}.${name}` targetId to its real AST node — mirrors
 * preview-schema.ts's own generatePreviewSchemas targetId matching (compute
 * each candidate's own qualified id and compare, rather than parsing the
 * targetId string apart, since namespaces are themselves dot-separated).
 */
export function findTargetNode(
  namespaceIndexes: readonly NamespaceIndex[],
  targetId: string
): ResolvedTarget | undefined {
  for (const ns of namespaceIndexes) {
    for (const [name, entry] of ns.dataByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'data', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.choiceByName) {
      if (`${ns.namespace}.${name}` === targetId)
        return { kind: 'choice', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.enumByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'enum', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.typeAliasByName) {
      if (`${ns.namespace}.${name}` === targetId)
        return { kind: 'typeAlias', node: entry.node, sourceUri: entry.sourceUri };
    }
  }
  return undefined;
}
