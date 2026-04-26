// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isRosettaModel } from '@rune-langium/core';
import type { GeneratorOutput, GeneratorOptions } from './types.js';
import { GeneratorError } from './types.js';
import { createDiagnostic, hasFatalDiagnostics } from './diagnostics.js';
import { emitNamespace } from './emit/zod-emitter.js';

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
 * Groups documents by namespace, detects cycles, performs topo-sort,
 * dispatches to the selected emitter, and returns one GeneratorOutput
 * per namespace, sorted by relativePath.
 *
 * @param docs - One or more parsed Langium documents.
 * @param options - Generator options.
 * @returns Array of GeneratorOutput, one per namespace, sorted by relativePath.
 * @throws GeneratorError when strict mode is enabled and any error diagnostic is produced.
 */
export function runGenerate(docs: LangiumDocument[], options: GeneratorOptions): GeneratorOutput[] {
  if (docs.length === 0) {
    return [];
  }

  const target = options.target ?? 'zod';

  // Group by namespace
  const byNamespace = groupByNamespace(docs);
  if (byNamespace.size === 0) {
    return [];
  }

  const outputs: GeneratorOutput[] = [];

  for (const [namespace, namespaceDocs] of byNamespace) {
    let output: GeneratorOutput;

    if (target === 'zod') {
      output = emitNamespace(namespaceDocs, namespace, options);
    } else {
      // json-schema and typescript targets: not implemented in Phase 3
      output = {
        relativePath:
          namespace.replace(/\./g, '/') + (target === 'json-schema' ? '.schema.json' : '.ts'),
        content: '',
        sourceMap: [],
        diagnostics: [
          createDiagnostic(
            'error',
            'not-implemented',
            `Target '${target}' is not implemented in Phase 3. Only 'zod' is supported.`
          )
        ],
        funcs: []
      };
    }

    outputs.push(output);
  }

  // Sort by relativePath for deterministic output (SC-007)
  outputs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Strict mode: throw if any fatal diagnostics
  if (options.strict) {
    const allDiags = outputs.flatMap((o) => o.diagnostics);
    if (hasFatalDiagnostics(allDiags)) {
      throw new GeneratorError('Generation failed with errors', allDiags);
    }
  }

  return outputs;
}
