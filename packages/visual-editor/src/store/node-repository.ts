// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRepository } from '@rune-langium/core';
import type { Node } from '@xyflow/react';
import type { AnyDomain } from '@rune-langium/core';
import type { GraphNodeMeta, TypeGraphNode } from '../types.js';

/** A graph node whose domain payload is narrowed to the `$type` named by `K`. */
export type NodeOf<K extends AnyDomain['$type']> = Node<Extract<AnyDomain, { $type: K }>> & {
  meta: GraphNodeMeta;
};

/**
 * Typed, read-only lookup surface over the editor's nodes. Built as a PURE
 * derived snapshot from the `nodesById` Map-as-SoT — never a second source of
 * truth. `byId` keys on `node.id` (= `makeNodeId(ns, name)` = qualified name).
 *
 * Declared standalone (not `extends Repository<TypeGraphNode>`): `byType`
 * narrows its `K` constraint to `AnyDomain['$type']`, which is a contravariant
 * narrowing the generic `byType<K extends string>` cannot be widened to — the
 * generated `DomainRepository` is standalone for the same reason.
 *
 * STATUS — byNamespace drives the NamespaceExplorer tree; byType drives the
 * kind-pill counts; byId backs the read-path lookups (see Phase 4 consumer
 * cutover).
 */
export interface NodeRepository {
  byId(id: string): TypeGraphNode | undefined;
  byType<K extends AnyDomain['$type']>(type: K): readonly NodeOf<K>[];
  /** Nodes grouped by `meta.namespace` (the editor's namespace axis). Empty for an unknown ns. */
  byNamespace(ns: string): readonly TypeGraphNode[];
  /** Each distinct namespace once, in first-seen order. */
  namespaces(): readonly string[];
  all(): readonly TypeGraphNode[];
}

let cacheKey: ReadonlyMap<string, TypeGraphNode> | null = null;
let cacheValue: NodeRepository | null = null;

/**
 * Returns a node repository derived from `nodesById`, memoized on the Map's
 * identity. The store swaps the Map reference on every `mutateGraph`, so a new
 * reference (post-reconciliation) yields a fresh repository; an unchanged
 * reference returns the cached instance.
 */
export function selectNodeRepository(nodesById: ReadonlyMap<string, TypeGraphNode>): NodeRepository {
  if (nodesById === cacheKey && cacheValue !== null) return cacheValue;
  const base = createRepository(nodesById.values(), {
    key: (n) => n.id,
    type: (n) => n.data.$type
  });
  // Namespace index — a second pass over the same values; createRepository
  // encapsulates its own loop, so byNamespace is composed here rather than
  // generated. Keyed on meta.namespace (the panel's grouping axis).
  const byNs = new Map<string, TypeGraphNode[]>();
  for (const n of nodesById.values()) {
    let bucket = byNs.get(n.meta.namespace);
    if (bucket === undefined) {
      bucket = [];
      byNs.set(n.meta.namespace, bucket);
    }
    bucket.push(n);
  }
  const repo: NodeRepository = {
    byId: (id) => base.byId(id),
    byType: ((type: string) => base.byType(type)) as NodeRepository['byType'],
    byNamespace: (ns) => byNs.get(ns) ?? [],
    namespaces: () => [...byNs.keys()],
    all: () => base.all()
  };
  cacheKey = nodesById;
  cacheValue = repo;
  return repo;
}
