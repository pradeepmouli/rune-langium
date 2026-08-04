// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isData, isChoice, isRosettaEnumeration } from '@rune-langium/core';
import type { Data, Choice, RosettaEnumeration, RosettaTypeAlias } from '@rune-langium/core';
import type { NamespaceIndex } from '../preview-schema.js';
import { resolveTypeCallTarget, nodeSourceUri } from './type-ref-resolver.js';
import type { TypeIndexLookup, TypeIndexEntry, TypeResolutionVisitor } from './type-ref-resolver.js';

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

export interface StandaloneClosure {
  dataByName: Map<string, Data>;
  choiceByName: Map<string, Choice>;
  enumByName: Map<string, RosettaEnumeration>;
  typeAliasByName: Map<string, RosettaTypeAlias>;
  docs: LangiumDocument[];
}

type FrontierNode = Data | Choice | RosettaTypeAlias;

/**
 * Walk the transitive type-dependency closure of `target` — every Data,
 * Choice, Enum, and (only-if-the-target-itself) TypeAlias reachable via
 * attribute/option type calls and Data superType chains. `resolveTypeCallTarget`
 * already collapses RosettaTypeAlias chains down to their terminal kind, so
 * an alias reached via an attribute/option reference is never enqueued —
 * only the initial seed can ever land in typeAliasByName.
 */
export function computeStandaloneClosure(target: ResolvedTarget, globalIndex: TypeIndexLookup): StandaloneClosure {
  const dataByName = new Map<string, Data>();
  const choiceByName = new Map<string, Choice>();
  const enumByName = new Map<string, RosettaEnumeration>();
  const typeAliasByName = new Map<string, RosettaTypeAlias>();
  const docs = new Set<LangiumDocument>();
  const visited = new Set<Data | Choice | RosettaEnumeration | RosettaTypeAlias>();
  const frontier: FrontierNode[] = [];

  const trackDoc = (node: { $container?: unknown }): void => {
    const withDoc = node as { $container?: { $document?: LangiumDocument } };
    const doc = withDoc.$container?.$document;
    if (doc) docs.add(doc);
  };

  const enqueue = (node: Data | Choice | RosettaEnumeration | RosettaTypeAlias): void => {
    if (visited.has(node)) return;
    visited.add(node);
    trackDoc(node);
    if (isData(node)) {
      dataByName.set(node.name, node);
      frontier.push(node);
    } else if (isChoice(node)) {
      choiceByName.set(node.name, node);
      frontier.push(node);
    } else if (isRosettaEnumeration(node)) {
      enumByName.set(node.name, node);
    } else {
      typeAliasByName.set(node.name, node);
      frontier.push(node);
    }
  };

  const dependencyVisitor: TypeResolutionVisitor<void> = {
    onPrimitive: () => undefined,
    onEnum: (node) => enqueue(node),
    onData: (node) => enqueue(node),
    onChoice: (node) => enqueue(node),
    onUnresolved: () => undefined
  };

  enqueue(target.node);

  while (frontier.length > 0) {
    const node = frontier.shift()!;
    if (isData(node)) {
      const superRef = node.superType?.ref;
      if (superRef) enqueue(superRef);
      for (const attr of node.attributes) {
        resolveTypeCallTarget(attr.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
      }
    } else if (isChoice(node)) {
      for (const option of node.attributes) {
        resolveTypeCallTarget(option.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
      }
    } else {
      resolveTypeCallTarget(node.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
    }
  }

  return { dataByName, choiceByName, enumByName, typeAliasByName, docs: Array.from(docs) };
}
