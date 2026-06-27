// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { closeNamespaceDependencies } from '@rune-langium/core';

/**
 * Expand a possibly-wildcarded namespace token against a known namespace set.
 * `a.b.*` → every ns equal to `a.b` or starting with `a.b.`; a bare name →
 * `[name]` iff present, else `[]`. Shared by closeNamespacesFromManifest and
 * buildDependencyGraph so both agree on wildcard semantics.
 */
export function expandWildcard(raw: string, allNs: ReadonlySet<string>): string[] {
  if (raw.endsWith('.*')) {
    const prefix = raw.slice(0, -2);
    return [...allNs].filter((ns) => ns === prefix || ns.startsWith(prefix + '.'));
  }
  return allNs.has(raw) ? [raw] : [];
}

/**
 * Transitive closure of `seedNamespaces` over a PRECOMPUTED manifest
 * dependency graph (the v2 manifest `namespaces` map), without fetching or
 * parsing any document. This is the fast path: the publish pipeline already
 * walked the fully-linked corpus (imports ∪ resolved `$ref` targets) and
 * recorded the direct `deps` per namespace, so `/api/parse` only walks the
 * graph instead of fetching+parsing the whole serialized corpus.
 *
 * Wildcard + cycle semantics:
 * - Wildcard forms (`a.b.*`) — in seeds OR in a namespace's `deps` — expand to
 *   every manifest namespace equal to `a.b` or starting with `a.b.`.
 * - Exact names that aren't manifest namespaces contribute nothing.
 * - Cycle-safe (visited set). Returns ONLY namespaces present in the manifest.
 */
export function closeNamespacesFromManifest(
  seedNamespaces: Iterable<string>,
  namespaces: Readonly<Record<string, { deps: readonly string[] }>>
): Set<string> {
  const allNs = new Set(Object.keys(namespaces));
  const visited = new Set<string>();
  const queue: string[] = [...seedNamespaces].flatMap((raw) => expandWildcard(raw, allNs));
  while (queue.length > 0) {
    const ns = queue.shift()!;
    if (!allNs.has(ns) || visited.has(ns)) continue;
    visited.add(ns);
    for (const raw of namespaces[ns]!.deps) {
      for (const target of expandWildcard(raw, allNs)) {
        if (!visited.has(target)) queue.push(target);
      }
    }
  }
  return visited;
}

/**
 * Build the /api/parse cross-namespace dependency graph WITHOUT deserializing or
 * linking any curated document. Returns every namespace in `allNamespaces`
 * mapped to its transitive dependency closure (including itself), sorted for
 * stable bytes. Edges come from three no-link sources:
 *   - curated→curated: the precomputed manifest `deps` (`curatedDeps`)
 *   - user→curated:    user models' import declarations (`userModels`), expanded
 *     to curated namespaces ONLY (user→user import edges are skipped — they are
 *     covered precisely by `userResolvedDeps`, so import edges would over-pull)
 *   - user→user:       resolved cross-references from the already-built user
 *     docs (`userResolvedDeps`) — captures qualified references (e.g.
 *     `cdm.Quantity`) that the DSL resolves via global scope WITHOUT an import,
 *     which import declarations alone would miss (would under-pull → broken
 *     codegen filter). User docs are linked among themselves cheaply; the
 *     curated corpus is never linked, so the 128 MB OOM stays fixed.
 *
 * @param userModels       user docs' {namespace, imports} (from readSerializedModelMeta)
 * @param curatedDeps      direct curated edges: ns → its direct dep namespaces
 * @param allNamespaces    every namespace that must be a key (user ∪ curated closure)
 * @param userResolvedDeps resolved user→* edges from collectNamespaceDependencies
 *                         over the user docs (optional; omitted → curated-only request)
 */
export function buildDependencyGraph(
  userModels: ReadonlyArray<{ namespace: string; imports: readonly string[] }>,
  curatedDeps: ReadonlyMap<string, ReadonlySet<string>>,
  allNamespaces: ReadonlySet<string>,
  userResolvedDeps?: ReadonlyMap<string, ReadonlySet<string>>
): Record<string, string[]> {
  const directDeps = new Map<string, Set<string>>();
  const ensure = (ns: string): Set<string> => {
    let s = directDeps.get(ns);
    if (!s) {
      s = new Set<string>();
      directDeps.set(ns, s);
    }
    return s;
  };

  // Every namespace is a key even with no deps: consumers read Object.keys as
  // the namespace list, and a selected ns with no closure entry emits itself.
  for (const ns of allNamespaces) ensure(ns);

  // Curated → curated (precomputed manifest edges). Filter to known namespaces.
  for (const [ns, targets] of curatedDeps) {
    const bucket = ensure(ns);
    for (const t of targets) if (allNamespaces.has(t)) bucket.add(t);
  }

  // User → curated from import declarations, wildcard-expanded. Import edges
  // target ONLY curated namespaces: user→user deps are captured precisely by
  // userResolvedDeps below (resolved refs), so adding import-based user→user
  // edges here would over-pull an imported-but-unused user namespace into the
  // read-only Download-modal cascade (Codex P2).
  const userNamespaces = new Set(userModels.map((m) => m.namespace));
  for (const { namespace, imports } of userModels) {
    const bucket = ensure(namespace);
    for (const raw of imports) {
      for (const t of expandWildcard(raw, allNamespaces)) {
        if (t !== namespace && !userNamespaces.has(t)) bucket.add(t);
      }
    }
  }

  // User → user resolved edges (qualified refs the DSL resolves via global
  // scope without an import). Filter to known namespaces; drop self-edges.
  if (userResolvedDeps) {
    for (const [ns, targets] of userResolvedDeps) {
      const bucket = ensure(ns);
      for (const t of targets) if (t !== ns && allNamespaces.has(t)) bucket.add(t);
    }
  }

  const graph: Record<string, string[]> = {};
  for (const ns of allNamespaces) {
    graph[ns] = [...closeNamespaceDependencies(ns, directDeps)].sort();
  }
  return graph;
}
