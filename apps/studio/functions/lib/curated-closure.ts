// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readSerializedModelMeta } from './serialized-model-meta.js';

export interface ClosureDoc {
  namespace?: string;
  serializedModel: string;
}

/**
 * Transitive closure of `seedNamespaces` over the curated docs' import graph,
 * read from serialized JSON (no Langium link). Wildcard forms (`a.b.*`) expand
 * to every curated namespace `== a.b` or starting `a.b.` — for BOTH curated
 * imports AND user seeds (a user `import cdm.base.*` must pull the matching
 * curated namespaces). Cycle-safe. Returns ONLY curated namespaces (seeds
 * absent from `curatedDocs` are excluded).
 */
export function computeCuratedClosure(
  seedNamespaces: Iterable<string>,
  curatedDocs: ReadonlyArray<ClosureDoc>
): Set<string> {
  const nsImports = new Map<string, string[]>();
  const allNs = new Set<string>();
  for (const d of curatedDocs) {
    const meta = readSerializedModelMeta(d.serializedModel);
    if (!meta) continue;
    allNs.add(meta.namespace);
    nsImports.set(meta.namespace, meta.imports);
  }

  const expand = (raw: string): string[] => {
    if (raw.endsWith('.*')) {
      const prefix = raw.slice(0, -2);
      return [...allNs].filter((ns) => ns === prefix || ns.startsWith(prefix + '.'));
    }
    return allNs.has(raw) ? [raw] : [];
  };

  const visited = new Set<string>();
  // Expand seeds through the same wildcard/membership filter as imports, so a
  // user `import cdm.base.*` (or an exact `import cdm.trade`) resolves to the
  // matching curated namespaces. A seed that matches no curated namespace
  // contributes nothing.
  const queue: string[] = [...seedNamespaces].flatMap(expand);
  while (queue.length > 0) {
    const ns = queue.shift()!;
    if (!allNs.has(ns) || visited.has(ns)) continue;
    visited.add(ns);
    for (const raw of nsImports.get(ns) ?? []) {
      for (const target of expand(raw)) {
        if (!visited.has(target)) queue.push(target);
      }
    }
  }
  return visited;
}
