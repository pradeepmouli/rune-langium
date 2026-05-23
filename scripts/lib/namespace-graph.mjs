// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

// Keep in sync with apps/curated-mirror-worker/src/namespace-graph.ts (worker/seed copy).
// (nsArtifactSlug below is build-only and has no worker counterpart.)

import { createHash } from 'node:crypto';

/**
 * Pure, Langium-free computation of the per-namespace dependency graph from a
 * set of already-serialized RosettaModel JSON strings. Plain-ESM copy of the
 * worker/seed TypeScript in:
 *   apps/curated-mirror-worker/src/namespace-graph.ts
 *
 * No TypeScript types — identical algorithm.
 */

// ── Internal helpers (ported verbatim from namespace-graph.ts) ───────────────

/**
 * Convert a cross-document Langium `$ref` URI to the curated-doc key form
 * `${bundleId}/${doc.path}`. Returns null for local refs or unknown schemes.
 *
 * Langium serializes cross-doc refs as:
 *   `file:///%5Bcdm%5D/<doc.path>#/elements@0`
 * (URL-encoded form of `file:///[cdm]/<doc.path>#/elements@0`)
 */
function refUriToCuratedKey(ref) {
  // Only process cross-document refs (local refs start with '#')
  if (ref.startsWith('#')) return null;

  // URL-decode (guard against malformed percent-encoding)
  let decoded;
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
function nameToNamespace(name) {
  if (typeof name === 'string') return name;
  if (name !== null && typeof name === 'object' && 'segments' in name) {
    const segs = name.segments;
    if (Array.isArray(segs)) return segs.join('.');
  }
  return undefined;
}

/**
 * Extract namespace + import strings from a serialized RosettaModel JSON
 * string (JSON-only, no Langium). Returns null if the JSON is unparseable or
 * has no resolvable namespace.
 */
function readModelMeta(modelJson) {
  let parsed;
  try {
    parsed = JSON.parse(modelJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const namespace = nameToNamespace(parsed.name);
  if (!namespace) return null;
  const imports = [];
  if (Array.isArray(parsed.imports)) {
    for (const imp of parsed.imports) {
      const ns = imp?.importedNamespace;
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
function extractCrossDocRefNamespaces(modelJson, ownNamespace, uriToNamespace) {
  const result = new Set();

  // Fast-path: bail early if no $ref present
  if (!modelJson.includes('"$ref"')) return result;

  let parsed;
  try {
    parsed = JSON.parse(modelJson);
  } catch {
    return result;
  }

  function walk(obj) {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (typeof obj['$ref'] === 'string') {
      const key = refUriToCuratedKey(obj['$ref']);
      if (key !== null) {
        const targetNs = uriToNamespace.get(key);
        if (targetNs && targetNs !== ownNamespace) {
          result.add(targetNs);
        }
      }
    }
    for (const value of Object.values(obj)) {
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
 * Returns Record<ns, { deps: string[], exports: Array<{type,name}>, docs: Array<{path,modelJson,exports}> }>
 *
 * `deps` per namespace = union of:
 *   - import strings (kept as-is, including wildcards like `cdm.base.*`)
 *   - cross-doc $ref target namespaces (resolved via modelId + path)
 * …excluding the namespace itself. Sorted + deduped.
 *
 * `exports` per namespace = union of each doc's exports mapped to {type,name}
 * (path dropped), deduped by `type+' '+name`.
 *
 * `docs` per namespace = the matching docs as {path, modelJson, exports} with
 * exports having path dropped (type+name only).
 *
 * @param {Array<{path: string, modelJson: string, exports: Array<{type: string, name: string, path?: string}>}>} docs
 * @param {string} modelId  Bundle ID used when Langium URIs were created (e.g. 'cdm')
 * @returns {Record<string, {deps: string[], exports: Array<{type: string, name: string}>, docs: Array<{path: string, modelJson: string, exports: Array<{type: string, name: string}>}>}>}
 */
export function computeNamespaceGraph(docs, modelId) {
  // ── Pass 1: cheap meta read + uri→namespace map ───────────────────────────
  // Key: `${modelId}/${doc.path}`, same as what Langium assigns via
  //   URI.parse(`[${modelId}]/${file.path}`) and what refUriToCuratedKey emits.
  const uriToNamespace = new Map();
  const nsMeta = new Map();
  const nsDocs = new Map();

  for (const doc of docs) {
    const meta = readModelMeta(doc.modelJson);
    if (!meta) continue;
    const { namespace, imports } = meta;

    uriToNamespace.set(`${modelId}/${doc.path}`, namespace);

    if (!nsMeta.has(namespace)) {
      nsMeta.set(namespace, { imports: [] });
    }
    // Accumulate imports across all docs in this namespace
    const existing = nsMeta.get(namespace);
    for (const imp of imports) {
      if (!existing.imports.includes(imp)) {
        existing.imports.push(imp);
      }
    }

    if (!nsDocs.has(namespace)) {
      nsDocs.set(namespace, []);
    }
    nsDocs.get(namespace).push(doc);
  }

  // ── Pass 2: per-namespace deps via imports ∪ $ref targets ─────────────────
  const result = {};

  for (const [namespace, { imports }] of nsMeta) {
    const rawDepsSet = new Set();

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
    const exportsMap = new Map();
    for (const doc of docsInNs) {
      for (const exp of doc.exports) {
        const key = `${exp.type} ${exp.name}`;
        if (!exportsMap.has(key)) {
          exportsMap.set(key, { type: exp.type, name: exp.name });
        }
      }
    }

    // Build docs list: path + modelJson + exports (type+name only)
    const serializedDocs = docsInNs.map((doc) => ({
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

/**
 * Map a namespace to an R2-safe artifact-key slug. R2/wrangler reject keys
 * containing `..` (path-traversal guard), and leading/trailing dots are unsafe
 * as path segments. Rosetta namespaces are dot-separated identifiers, but the
 * upstream corpus isn't always clean — e.g. rune-fpml declares
 * `namespace fpml.consolidated.` (trailing dot), which would otherwise produce
 * `fpml.consolidated..json.gz`. Collapse repeated dots and strip edge dots.
 *
 * To stay INJECTIVE (rune-fpml declares BOTH `fpml.consolidated` AND
 * `fpml.consolidated.` as distinct namespaces, which would otherwise collide
 * onto one blob), when cleaning actually changes the string we append a short
 * stable hash of the ORIGINAL namespace. Clean namespaces — the overwhelming
 * majority — keep a readable, unchanged slug; only malformed ones get a suffix.
 *
 * This affects the artifact FILENAME/KEY only — the namespace identity (the
 * manifest's `namespaces` map key, used for closure + display) is preserved
 * verbatim by callers. Callers should still assert no two namespaces produce
 * the same slug and fail rather than silently overwrite.
 */
export function nsArtifactSlug(ns) {
  const cleaned = ns.replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '');
  if (cleaned === ns) return cleaned;
  const hash = createHash('sha256').update(ns).digest('hex').slice(0, 8);
  // If the namespace cleaned down to nothing (e.g. ns is "." / ".."), prefixing
  // with `${cleaned}.` would yield a leading dot — use the bare hash instead.
  return cleaned ? `${cleaned}.${hash}` : hash;
}
