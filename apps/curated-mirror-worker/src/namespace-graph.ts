// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pure, Langium-free computation of the per-namespace dependency graph from a
 * set of already-serialized RosettaModel JSON strings. Ported from the
 * proven studio logic in:
 *   apps/studio/functions/lib/curated-closure.ts
 *   apps/studio/functions/lib/serialized-model-meta.ts
 *
 * Cross-app import is deliberately avoided; this copy is the publish-pipeline
 * source of truth.
 *
 * Keep in sync with scripts/lib/namespace-graph.mjs (plain-ESM copy for CI build scripts).
 */

export interface SerializedDoc {
  path: string;
  modelJson: string;
  exports: Array<{ type: string; name: string }>;
}

export interface NamespaceGraphEntry {
  /** DIRECT cross-namespace deps (imports ∪ resolved $ref target namespaces), excluding self, sorted, deduped. */
  deps: string[];
  /** Union of the namespace's docs' exports (type+name only, no path), deduped. */
  exports: Array<{ type: string; name: string }>;
  /** The docs belonging to this namespace. */
  docs: SerializedDoc[];
}

// ── Internal helpers (ported verbatim from curated-closure.ts) ───────────────

/**
 * Convert a cross-document Langium `$ref` URI to the curated-doc key form
 * `${bundleId}/${doc.path}`. Returns null for local refs or unknown schemes.
 *
 * Langium serializes cross-doc refs as:
 *   `file:///%5Bcdm%5D/<doc.path>#/elements@0`
 * (URL-encoded form of `file:///[cdm]/<doc.path>#/elements@0`)
 */
function refUriToCuratedKey(ref: string): string | null {
  // Only process cross-document refs (local refs start with '#')
  if (ref.startsWith('#')) return null;

  // URL-decode (guard against malformed percent-encoding)
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
 * Parse `name` field (string OR `{segments: string[]}`) → namespace string.
 */
function nameToNamespace(name: unknown): string | undefined {
  if (typeof name === 'string') return name;
  if (name !== null && typeof name === 'object' && 'segments' in (name as object)) {
    const segs = (name as { segments?: unknown }).segments;
    if (Array.isArray(segs)) return (segs as unknown[]).join('.');
  }
  return undefined;
}

/**
 * Extract namespace + import strings from a serialized RosettaModel JSON
 * string (JSON-only, no Langium). Returns null if the JSON is unparseable or
 * has no resolvable namespace.
 */
function readModelMeta(modelJson: string): { namespace: string; imports: string[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const m = parsed as { name?: unknown; imports?: unknown };
  const namespace = nameToNamespace(m.name);
  if (!namespace) return null;
  const imports: string[] = [];
  if (Array.isArray(m.imports)) {
    for (const imp of m.imports as unknown[]) {
      const ns = (imp as { importedNamespace?: unknown })?.importedNamespace;
      if (typeof ns === 'string' && ns.length > 0) imports.push(ns);
    }
  }
  return { namespace, imports };
}

/**
 * Walk a parsed JSON value and collect all cross-doc $ref target namespaces,
 * excluding `ownNamespace`. Fast-path: skips the walk entirely when the raw
 * modelJson string contains no `"$ref"` substring.
 */
function extractCrossDocRefNamespaces(
  modelJson: string,
  ownNamespace: string,
  uriToNamespace: ReadonlyMap<string, string>
): Set<string> {
  const result = new Set<string>();

  // Fast-path: bail early if no $ref present
  if (!modelJson.includes('"$ref"')) return result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(modelJson);
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the per-namespace dependency graph from a flat array of
 * serialized-artifact docs.
 *
 * `deps` per namespace = union of:
 *   - import strings (kept as-is, including wildcards like `cdm.base.*`)
 *   - cross-doc $ref target namespaces (resolved via modelId + path)
 * …excluding the namespace itself. Sorted + deduped.
 *
 * `exports` per namespace = union of each doc's exports mapped to {type,name}
 * (path dropped), deduped by `type+' '+name`.
 *
 * `docs` per namespace = the matching docs as {path, modelJson, exports}.
 *
 * @param docs    Per-doc data from the serialized artifact build
 * @param modelId Bundle ID used when Langium URIs were created
 *                (e.g. `'cdm'` for `URI.parse('[cdm]/...')`)
 */
export function computeNamespaceGraph(
  docs: ReadonlyArray<{
    path: string;
    modelJson: string;
    exports: ReadonlyArray<{ type: string; name: string; path?: string }>;
  }>,
  modelId: string
): Record<string, NamespaceGraphEntry> {
  // ── Pass 1: cheap meta read + uri→namespace map ───────────────────────────
  // Key: `${modelId}/${doc.path}`, same as what Langium assigns via
  //   URI.parse(`[${modelId}]/${file.path}`) and what refUriToCuratedKey emits.
  const uriToNamespace = new Map<string, string>();
  const nsMeta = new Map<string, { imports: string[] }>();
  const nsDocs = new Map<string, Array<(typeof docs)[0]>>();

  for (const doc of docs) {
    const meta = readModelMeta(doc.modelJson);
    if (!meta) continue;
    const { namespace, imports } = meta;

    uriToNamespace.set(`${modelId}/${doc.path}`, namespace);

    if (!nsMeta.has(namespace)) {
      nsMeta.set(namespace, { imports: [] });
    }
    // Accumulate imports across all docs in this namespace
    const existing = nsMeta.get(namespace)!;
    for (const imp of imports) {
      if (!existing.imports.includes(imp)) {
        existing.imports.push(imp);
      }
    }

    if (!nsDocs.has(namespace)) {
      nsDocs.set(namespace, []);
    }
    nsDocs.get(namespace)!.push(doc);
  }

  // ── Pass 2: per-namespace deps via imports ∪ $ref targets ─────────────────
  const result: Record<string, NamespaceGraphEntry> = {};

  for (const [namespace, { imports }] of nsMeta) {
    const rawDepsSet = new Set<string>();

    // Import strings: kept as-is (wildcards included), self excluded (exact only)
    for (const imp of imports) {
      if (imp !== namespace) {
        rawDepsSet.add(imp);
      }
    }

    // Cross-doc $ref target namespaces for all docs in this namespace
    const docsInNs = nsDocs.get(namespace) ?? [];
    for (const doc of docsInNs) {
      for (const target of extractCrossDocRefNamespaces(doc.modelJson, namespace, uriToNamespace)) {
        rawDepsSet.add(target);
      }
    }

    // Build exports: union of all docs' exports, drop path, dedup by type+name
    const exportsMap = new Map<string, { type: string; name: string }>();
    for (const doc of docsInNs) {
      for (const exp of doc.exports) {
        const key = `${exp.type} ${exp.name}`;
        if (!exportsMap.has(key)) {
          exportsMap.set(key, { type: exp.type, name: exp.name });
        }
      }
    }

    // Build docs list: path + modelJson + exports (type+name only)
    const serializedDocs: SerializedDoc[] = docsInNs.map((doc) => ({
      path: doc.path,
      modelJson: doc.modelJson,
      exports: doc.exports.map(({ type, name }) => ({ type, name }))
    }));

    result[namespace] = {
      deps: [...rawDepsSet].sort(),
      exports: [...exportsMap.values()],
      docs: serializedDocs
    };
  }

  return result;
}
