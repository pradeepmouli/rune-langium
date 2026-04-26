// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import type { GeneratorOutput, GeneratorOptions } from './types.js';
import { GeneratorError } from './types.js';
import { buildTypeReferenceGraph, findCyclicTypes } from './cycle-detector.js';
import { topoSort } from './topo-sort.js';
import { createDiagnostic } from './diagnostics.js';

/**
 * Internal context used during a generation run.
 * @internal
 */
export interface GenerateContext {
  /** The type reference graph for the current document set. */
  graph: ReturnType<typeof buildTypeReferenceGraph>;
  /** The set of cyclic type names. */
  cyclicTypes: Set<string>;
  /** The topological order of type names. */
  order: string[];
}

/**
 * Top-level orchestrator for the code generator.
 *
 * Phase 2 skeleton: wires cycle-detector + topo-sort but does not yet
 * implement any emitters. Phase 3 will replace the stub throw with
 * real emitter dispatch.
 *
 * @param docs - One or more parsed Langium documents.
 * @param options - Generator options.
 * @returns Array of GeneratorOutput, one per namespace.
 * @throws GeneratorError when the requested emitter target is not yet implemented.
 */
export function runGenerate(docs: LangiumDocument[], options: GeneratorOptions): GeneratorOutput[] {
  // Wire the graph infrastructure
  const graph = buildTypeReferenceGraph(docs);
  const cyclic = findCyclicTypes(graph);
  const order = topoSort(graph, cyclic);

  // Suppress unused variable warnings — used in Phase 3
  void order;

  // Stub: Phase 3 will replace this throw with real emitter dispatch.
  const target = options.target ?? 'zod';
  throw new GeneratorError('emitter_not_implemented', [
    createDiagnostic(
      'error',
      'X000',
      `Phase 2 scaffold; emitter for target=${target} lands in Phase 3.`
    )
  ]);
}
