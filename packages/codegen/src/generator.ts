// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isRosettaModel } from '@rune-langium/core';
import type { GeneratorOutput, GeneratorOptions, Target } from './types.js';
import { GeneratorError } from './types.js';
import { createDiagnostic, hasFatalDiagnostics } from './diagnostics.js';
import {
  emitNamespaceWithContract,
  isWholeModelEmitter,
  type NamespaceEmitterConstructor,
  type WholeModelEmitterConstructor
} from './emit/namespace-emitter.js';
import { ZodNamespaceEmitter } from './emit/zod-emitter.js';
import { JsonSchemaNamespaceEmitter } from './emit/json-schema-emitter.js';
import { TsNamespaceEmitter } from './emit/ts-emitter.js';
import { buildNamespaceRegistry, type NamespaceRegistry } from './emit/namespace-registry.js';
import { walkNamespace, type NamespaceWalkResult } from './emit/namespace-walker.js';

// 018 Task 0.4: registry holds both NamespaceEmitter and WholeModelEmitter
// constructors. The discriminator `isWholeModelEmitter` picks the dispatch
// path at runtime. Targets without a registered emitter (sql, markdown,
// excel, graphql until Phases 1-3) return a single not-implemented
// diagnostic from runGenerate.
const EMITTER_CLASSES: Partial<Record<Target, NamespaceEmitterConstructor | WholeModelEmitterConstructor>> = {
  zod: ZodNamespaceEmitter,
  'json-schema': JsonSchemaNamespaceEmitter,
  typescript: TsNamespaceEmitter
};

/**
 * The targets `runGenerate` can actually produce output for in this build.
 *
 * Derived from {@link EMITTER_CLASSES} so it stays in sync as Phase 1/2/3
 * land their emitter implementations: add the entry to `EMITTER_CLASSES`
 * and this list updates automatically. UI surfaces such as the studio's
 * `CodegenTargetsTable` use it to hide rows whose emitter would otherwise
 * short-circuit to a `not-implemented` diagnostic.
 *
 * 018 Phase 0 Task 0.7 follow-up.
 */
export const IMPLEMENTED_TARGETS: readonly Target[] = Object.freeze(Object.keys(EMITTER_CLASSES) as Target[]);

/**
 * Group Langium documents by their namespace name.
 * Documents without a parseable RosettaModel or without a namespace
 * are silently skipped.
 */
function groupByNamespace(docs: LangiumDocument[]): Map<string, LangiumDocument[]> {
  const groups = new Map<string, LangiumDocument[]>();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    const ns = typeof model.name === 'string' ? model.name : String(model.name ?? 'unknown');
    if (!ns) continue;

    // Normalize quoted namespace: "cdm.base.math" → cdm.base.math
    const normalizedNs = ns.replace(/^"|"$/g, '');

    const existing = groups.get(normalizedNs);
    if (existing) {
      existing.push(doc);
    } else {
      groups.set(normalizedNs, [doc]);
    }
  }

  return groups;
}

/**
 * Top-level orchestrator for the code generator.
 *
 * 018 Task 0.4: async + contract-aware. Groups documents by namespace,
 * walks each namespace once, then dispatches by emitter contract:
 * - NamespaceEmitter targets (zod, typescript, json-schema, sql, markdown)
 *   loop per-namespace through `emitNamespaceWithContract`.
 * - WholeModelEmitter targets (excel, graphql) get the whole walks map
 *   in one async call.
 *
 * Async because WholeModelEmitter.emit() returns a Promise — binary
 * emitters (ExcelJS) use stream APIs internally.
 *
 * @param docs - One or more parsed Langium documents.
 * @param options - Generator options.
 * @returns Array of GeneratorOutput, sorted by relativePath.
 * @throws GeneratorError when strict mode is enabled and any error diagnostic is produced.
 */
export async function runGenerate(docs: LangiumDocument[], options: GeneratorOptions): Promise<GeneratorOutput[]> {
  if (docs.length === 0) {
    return [];
  }

  const target = options.target ?? 'zod';
  const emitterClass = EMITTER_CLASSES[target];

  let outputs: GeneratorOutput[];
  if (!emitterClass) {
    // Unknown / not-yet-implemented target. Return a single
    // not-implemented diagnostic rather than one per namespace —
    // simpler to surface in UI and matches the 018 dispatch test
    // contract. Falls through to the strict-mode check below so
    // `strict: true` callers still get the GeneratorError they
    // expect for any fatal diagnostic, including not-implemented
    // (Codex review on PR #165).
    outputs = [
      {
        relativePath: `${target}.unknown`,
        content: '',
        sourceMap: [],
        diagnostics: [createDiagnostic('error', 'not-implemented', `Target '${target}' is not implemented.`)],
        funcs: []
      }
    ];
  } else {
    // Group by namespace
    const byNamespace = groupByNamespace(docs);
    if (byNamespace.size === 0) {
      return [];
    }

    // Build cross-namespace registry before per-namespace emission
    const registry: NamespaceRegistry = buildNamespaceRegistry(byNamespace);

    // Walk every namespace once. The walks are reused across both contract
    // types — WholeModelEmitter consumes the whole map, NamespaceEmitter
    // loops over individual entries.
    const walks = new Map<string, NamespaceWalkResult>();
    for (const [namespace, namespaceDocs] of byNamespace) {
      walks.set(namespace, walkNamespace(namespaceDocs, namespace));
    }

    if (isWholeModelEmitter(emitterClass)) {
      outputs = await new emitterClass().emit(walks, registry, options);
    } else {
      outputs = [];
      for (const [, walked] of walks) {
        outputs.push(emitNamespaceWithContract(walked, options, registry, emitterClass));
      }
    }

    // Sort by relativePath for deterministic output (SC-007)
    outputs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  // Strict mode: throw if any fatal diagnostics. Applies uniformly to
  // both the not-implemented short-circuit above and the normal
  // emit path.
  if (options.strict) {
    const allDiags = outputs.flatMap((o) => o.diagnostics);
    if (hasFatalDiagnostics(allDiags)) {
      throw new GeneratorError('Generation failed with errors', allDiags);
    }
  }

  return outputs;
}
