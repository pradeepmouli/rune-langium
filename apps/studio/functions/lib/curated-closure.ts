// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readSerializedModelMeta } from './serialized-model-meta.js';
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

export interface ClosureDoc {
  /**
   * The URI assigned to this document when it is passed to
   * `URI.parse(entry.uri)` inside `parse.ts` / `populateDependencyGraph`.
   * For curated documents this is `${bundleId}/${doc.path}` (the same
   * value `curated-fetch.ts::toDocuments` emits).  The field is used to
   * build the `uriToNamespace` lookup so that cross-document `$ref` URIs
   * can be resolved to their target namespace without a Langium link pass.
   */
  uri: string;
  serializedModel: string;
}

/**
 * Convert a cross-document Langium `$ref` URI to the curated-doc `uri`
 * key form (`${bundleId}/${doc.path}`).
 *
 * Langium serialises cross-document refs as:
 *   `file:///%5Bcdm%5D/<doc.path>#/elements@0`
 * which URL-decodes to:
 *   `file:///[cdm]/<doc.path>#/elements@0`
 *
 * The curated-fetch.ts `toDocuments` function assigns each doc the URI:
 *   `${bundleId}/${doc.path}` (e.g. `cdm/common-domain-model-master/...`)
 *
 * Transformation:
 *  1. URL-decode the `$ref` value (handles `%5B`→`[`, `%5D`→`]`, etc.)
 *  2. Strip the `#fragment`
 *  3. If the result starts with `file:///[`, extract bundleId and path:
 *       `file:///[<bundleId>]/<path>` → `<bundleId>/<path>`
 *  4. Otherwise return null (local ref or unknown scheme — safe to skip)
 *
 * Verified against the real CDM artifact (141 docs, 2026-05-22):
 * every cross-document `$ref` follows this exact encoding.
 */
function refUriToCuratedKey(ref: string): string | null {
  // Only process cross-document refs (local refs start with '#')
  if (ref.startsWith('#')) return null;

  // URL-decode
  let decoded: string;
  try {
    decoded = decodeURIComponent(ref);
  } catch {
    return null;
  }

  // Strip the fragment
  const hashIdx = decoded.indexOf('#');
  const withoutFragment = hashIdx >= 0 ? decoded.slice(0, hashIdx) : decoded;

  // Must be a file:///[bundleId]/path URI
  const prefix = 'file:///[';
  if (!withoutFragment.startsWith(prefix)) return null;

  const rest = withoutFragment.slice(prefix.length);
  const bracketEnd = rest.indexOf(']/');
  if (bracketEnd < 0) return null;

  const bundleId = rest.slice(0, bracketEnd);
  const docPath = rest.slice(bracketEnd + 2); // skip ']/'

  return `${bundleId}/${docPath}`;
}

/**
 * Walk a serialized Langium RosettaModel JSON string and collect the set
 * of target namespaces for every cross-document `$ref`, EXCLUDING the doc's
 * own namespace.
 *
 * Pure function; no Langium dependency. Uses `uriToNamespace` (built once
 * over the full curated corpus) to map resolved URI keys to namespace names.
 */
function extractCrossDocRefNamespaces(
  serializedModel: string,
  ownNamespace: string,
  uriToNamespace: ReadonlyMap<string, string>
): Set<string> {
  const result = new Set<string>();

  // Fast-path: if there are no $ref strings at all, bail early
  if (!serializedModel.includes('"$ref"')) return result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedModel);
  } catch {
    return result;
  }

  function walk(obj: unknown): void {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    const record = obj as Record<string, unknown>;
    if (typeof record['$ref'] === 'string') {
      const key = refUriToCuratedKey(record['$ref']);
      if (key !== null) {
        const targetNs = uriToNamespace.get(key);
        if (targetNs && targetNs !== ownNamespace) {
          result.add(targetNs);
        }
      }
    }
    for (const value of Object.values(record)) {
      walk(value);
    }
  }

  walk(parsed);
  return result;
}

/**
 * Transitive closure of `seedNamespaces` over the curated docs' dependency
 * graph, derived from BOTH import declarations AND cross-document `$ref`
 * targets. Read entirely from serialized JSON (no Langium link).
 *
 * Why both sources?
 * - Rosetta imports gate name resolution in user-facing scope rules.
 * - Cross-namespace references in the serialized AST resolve via Langium's
 *   GLOBAL index (`super.getGlobalScope`), not import-scoped lookup.
 *   A doc can legitimately `$ref` a type in another namespace without an
 *   explicit `import` for it — 46 out of 141 CDM docs exhibit this pattern.
 *   An import-only closure would miss those namespaces, leaving their `$ref`
 *   targets unresolved after the lazy-link pass.
 *
 * Wildcard forms (`a.b.*`) expand to every curated namespace whose name
 * equals `a.b` or starts with `a.b.` — for BOTH curated imports AND user
 * seeds. Cycle-safe. Returns ONLY curated namespaces (seeds absent from
 * `curatedDocs` are excluded).
 */
export function computeCuratedClosure(
  seedNamespaces: Iterable<string>,
  curatedDocs: ReadonlyArray<ClosureDoc>
): Set<string> {
  // ── A. One cheap full pass: readSerializedModelMeta once per doc ───────────
  // Populates allNs, nsImports, uriToNamespace, and nsToDocs.
  // No deep $ref walk here — just the cheap meta read.
  const uriToNamespace = new Map<string, string>();
  const nsImports = new Map<string, string[]>();
  const allNs = new Set<string>();
  // Maps namespace → serializedModel strings for all docs in that namespace.
  // Multiple docs can share the same namespace (e.g. cdm.base.datetime spans
  // -type/-enum/-func files); their $ref targets will be unioned lazily in BFS.
  const nsToDocs = new Map<string, string[]>();

  for (const d of curatedDocs) {
    const meta = readSerializedModelMeta(d.serializedModel);
    if (!meta) continue;
    allNs.add(meta.namespace);
    nsImports.set(meta.namespace, meta.imports);
    uriToNamespace.set(d.uri, meta.namespace);
    let docList = nsToDocs.get(meta.namespace);
    if (!docList) {
      docList = [];
      nsToDocs.set(meta.namespace, docList);
    }
    docList.push(d.serializedModel);
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

    // Import-based edges
    for (const raw of nsImports.get(ns) ?? []) {
      for (const target of expand(raw)) {
        if (!visited.has(target)) queue.push(target);
      }
    }

    // ── B. Lazy cross-doc $ref walk — only for namespaces entering closure ───
    // extractCrossDocRefNamespaces is invoked here, bounded to closure docs
    // only. Docs whose namespace never enters the BFS are never deep-walked.
    for (const serializedModel of nsToDocs.get(ns) ?? []) {
      for (const target of extractCrossDocRefNamespaces(serializedModel, ns, uriToNamespace)) {
        if (allNs.has(target) && !visited.has(target)) queue.push(target);
      }
    }
  }
  return visited;
}

/**
 * Exported for testing: convert a raw `$ref` URI to the curated-doc URI key.
 * Returns null for local refs (`#...`) or unrecognised URI schemes.
 */
export { refUriToCuratedKey };

/**
 * Transitive closure of `seedNamespaces` over a PRECOMPUTED manifest
 * dependency graph (the v2 manifest `namespaces` map), without fetching or
 * parsing any document. This is the fast path: the publish pipeline already
 * walked the fully-linked corpus (imports ∪ resolved `$ref` targets) and
 * recorded the direct `deps` per namespace, so `/api/parse` only walks the
 * graph instead of fetching+parsing the whole serialized corpus.
 *
 * Mirrors `computeCuratedClosure`'s wildcard + cycle semantics exactly, so the
 * manifest path and the v1 serialized-import fallback agree:
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
 * linking any curated document. Curated→curated edges come from the precomputed
 * manifest `deps` (`curatedDeps`); user→* edges come from each user model's
 * import declarations. Returns every namespace in `allNamespaces` mapped to its
 * transitive dependency closure (including itself), sorted for stable bytes.
 *
 * @param userModels   user docs' {namespace, imports} (from readSerializedModelMeta)
 * @param curatedDeps  direct curated edges: ns → its direct dep namespaces
 * @param allNamespaces every namespace that must be a key (user ∪ curated closure)
 */
export function buildDependencyGraph(
  userModels: ReadonlyArray<{ namespace: string; imports: readonly string[] }>,
  curatedDeps: ReadonlyMap<string, ReadonlySet<string>>,
  allNamespaces: ReadonlySet<string>
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

  // User → (user | curated) from import declarations, wildcard-expanded.
  for (const { namespace, imports } of userModels) {
    const bucket = ensure(namespace);
    for (const raw of imports) {
      for (const t of expandWildcard(raw, allNamespaces)) {
        if (t !== namespace) bucket.add(t);
      }
    }
  }

  const graph: Record<string, string[]> = {};
  for (const ns of allNamespaces) {
    graph[ns] = [...closeNamespaceDependencies(ns, directDeps)].sort();
  }
  return graph;
}
