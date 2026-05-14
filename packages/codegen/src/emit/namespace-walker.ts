// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import {
  isAnnotation,
  isData,
  isRosettaEnumeration,
  isRosettaExternalFunction,
  isRosettaModel,
  isRosettaReport,
  isRosettaRule,
  isRosettaTypeAlias,
  type Annotation,
  type Data,
  type RosettaEnumeration,
  type RosettaExternalFunction,
  type RosettaReport,
  type RosettaRule,
  type RosettaTypeAlias
} from '@rune-langium/core';
import { buildTypeReferenceGraph, findCyclicTypes, type TypeReferenceGraph } from '../cycle-detector.js';
import { topoSort } from '../topo-sort.js';
import { TARGET_DESCRIPTORS, type Target } from '../types.js';

export interface NamespaceWalkResult {
  readonly docs: readonly LangiumDocument[];
  readonly namespace: string;
  readonly dataByName: ReadonlyMap<string, Data>;
  readonly enumByName: ReadonlyMap<string, RosettaEnumeration>;
  readonly typeAliasByName: ReadonlyMap<string, RosettaTypeAlias>;
  readonly rulesByName: ReadonlyMap<string, RosettaRule>;
  readonly reportsByName: ReadonlyMap<string, RosettaReport>;
  readonly annotationsByName: ReadonlyMap<string, Annotation>;
  readonly libraryFuncsByName: ReadonlyMap<string, RosettaExternalFunction>;
  readonly emitOrder: readonly string[];
  readonly cyclicTypes: ReadonlySet<string>;
  readonly graph: TypeReferenceGraph;
}

/**
 * Walk a single namespace worth of Langium documents and extract the shared
 * model/graph state that all language emitters need.
 */
export function walkNamespace(docs: LangiumDocument[], namespace: string): NamespaceWalkResult {
  const dataByName = new Map<string, Data>();
  const enumByName = new Map<string, RosettaEnumeration>();
  const typeAliasByName = new Map<string, RosettaTypeAlias>();
  const rulesByName = new Map<string, RosettaRule>();
  const reportsByName = new Map<string, RosettaReport>();
  const annotationsByName = new Map<string, Annotation>();
  const libraryFuncsByName = new Map<string, RosettaExternalFunction>();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    for (const element of model.elements) {
      if (isData(element)) {
        dataByName.set(element.name, element);
      } else if (isRosettaEnumeration(element)) {
        enumByName.set(element.name, element);
      } else if (isRosettaTypeAlias(element)) {
        typeAliasByName.set(element.name, element);
      } else if (isRosettaRule(element)) {
        rulesByName.set(element.name, element);
      } else if (isRosettaReport(element)) {
        // Reports are still skipped for named emission contexts.
      } else if (isAnnotation(element)) {
        annotationsByName.set(element.name, element);
      } else if (isRosettaExternalFunction(element)) {
        libraryFuncsByName.set(element.name, element);
      }
    }
  }

  const graph = buildTypeReferenceGraph(docs);
  const cyclicTypes = findCyclicTypes(graph);
  const emitOrder = topoSort(graph, cyclicTypes);

  return {
    docs,
    namespace,
    dataByName,
    enumByName,
    typeAliasByName,
    rulesByName,
    reportsByName,
    annotationsByName,
    libraryFuncsByName,
    emitOrder,
    cyclicTypes,
    graph
  };
}

/**
 * Convert a dot-separated Rune namespace to the emitted relative file path for a target.
 *
 * Extensions are sourced from {@link TARGET_DESCRIPTORS} so the registry stays
 * the single source of truth (018 Phase 0 Task 0.5).
 *
 * Whole-model targets (excel, graphql) emit a single bundled file rather than
 * one-per-namespace, so the path is `model<ext>` and the `namespace` argument
 * is ignored. Namespace-contract targets (zod, typescript, json-schema, sql,
 * markdown) map `cdm.base.math` → `cdm/base/math<ext>`.
 */
export function getTargetRelativePath(namespace: string, target: Target): string {
  const descriptor = TARGET_DESCRIPTORS[target];
  if (descriptor.contract === 'whole-model') {
    return `model${descriptor.extension}`;
  }
  const basePath = namespace.replace(/\./g, '/');
  return `${basePath}${descriptor.extension}`;
}
