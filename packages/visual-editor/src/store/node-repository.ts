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
 * STATUS — forward-looking keystone, NOT yet wired into editor reads. The
 * editor's `byId`-style lookups read `nodesById.get(...)` directly (the Map IS
 * the id index; wrapping it would be a parallel source of truth). This surface
 * exists for the typed `byType` projection, which has no consumer today; when
 * one arrives it calls `selectNodeRepository(get().nodesById)` (no rewiring of
 * the store needed). Built eyes-open as a complete generated substrate.
 */
export interface NodeRepository {
  byId(id: string): TypeGraphNode | undefined;
  byType<K extends AnyDomain['$type']>(type: K): readonly NodeOf<K>[];
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
  const repo = createRepository(nodesById.values(), {
    key: (n) => n.id,
    type: (n) => n.data.$type,
  }) as NodeRepository;
  cacheKey = nodesById;
  cacheValue = repo;
  return repo;
}
