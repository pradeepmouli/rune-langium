// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * JSON Schema LanguageProfile — 019 Phase 0.5.4.
 *
 * JSON Schema's idiomatic bundling is a single document with all types
 * collected under `$defs` keyed by `<namespace>.<TypeName>`. There's no
 * "barrel" concept (JSON has no module system) and no runtime helpers
 * to extract, so this profile is the simplest of the three:
 *
 *   - `makeBarrel` returns `undefined` (no barrel for JSON Schema).
 *   - `makeSharedArtifacts` returns `[]` (no shared runtime).
 *   - `concatenate` parses each per-namespace document, merges every
 *     `$defs` entry into a single namespaced map, rewrites all
 *     `$ref`s (local `#/$defs/X` and cross-namespace
 *     `other.schema.json#/$defs/Y`) to point at the new `<ns>.<Type>`
 *     keys, and emits one canonical `model.schema.json`.
 *
 * No `singleFileLimits` — single-file is JSON Schema's canonical shape,
 * so the guardrail doesn't apply.
 */

import type { GeneratorOutput } from '../types.js';
import type { LanguageProfile } from './language-profile.js';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Extract the namespace name from a per-namespace output's content
 * (the `title` field of the document, which the JSON Schema emitter
 * sets to `model.namespace`). Falls back to deriving from the
 * relativePath when parsing fails.
 */
function namespaceOf(output: GeneratorOutput): string {
  try {
    const parsed = JSON.parse(output.content) as { title?: unknown };
    if (typeof parsed.title === 'string' && parsed.title.length > 0) return parsed.title;
  } catch {
    // fall through to path-based derivation
  }
  return output.relativePath.replace(/\.schema\.json$/, '').replace(/\//g, '.');
}

/**
 * Walk `value` and rewrite every `$ref` string so refs that pointed at
 * local `#/$defs/X` or cross-namespace `other.schema.json#/$defs/Y`
 * now point at the merged `#/$defs/<ns>.<Type>` keys.
 *
 * External refs that don't match any namespace in `knownNamespaces`
 * are left unchanged.
 */
function rewriteRefs(value: unknown, currentNs: string, knownNamespaces: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => rewriteRefs(v, currentNs, knownNamespaces));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const rewritten: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === '$ref' && typeof child === 'string') {
      rewritten[key] = rewriteRef(child, currentNs, knownNamespaces);
    } else {
      rewritten[key] = rewriteRefs(child, currentNs, knownNamespaces);
    }
  }
  return rewritten;
}

function rewriteRef(ref: string, currentNs: string, knownNamespaces: ReadonlySet<string>): string {
  // Local ref within the same per-namespace document.
  if (ref.startsWith('#/$defs/')) {
    const typeName = ref.slice('#/$defs/'.length);
    return `#/$defs/${currentNs}.${typeName}`;
  }
  // Cross-namespace ref. The per-namespace emitter writes these as
  // `<dotted/namespace>.schema.json#/$defs/<Type>` — slashes in the
  // path encode dots in the namespace.
  const crossMatch = /^([^#]+)\.schema\.json#\/\$defs\/(.+)$/.exec(ref);
  if (crossMatch) {
    const otherNs = crossMatch[1]!.replace(/\//g, '.');
    const typeName = crossMatch[2]!;
    if (knownNamespaces.has(otherNs)) {
      return `#/$defs/${otherNs}.${typeName}`;
    }
  }
  return ref;
}

function makeBundledContent(perNs: ReadonlyArray<GeneratorOutput>): string {
  const knownNamespaces = new Set(perNs.map((o) => namespaceOf(o)));
  const mergedDefs: Record<string, unknown> = {};
  const rulesMetadata: Record<string, unknown> = {};
  const namespaces: string[] = [];

  for (const out of perNs) {
    const ns = namespaceOf(out);
    namespaces.push(ns);
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(out.content) as Record<string, unknown>;
    } catch {
      // Defensive: skip any malformed per-namespace output.
      continue;
    }
    const defs = doc.$defs;
    if (defs && typeof defs === 'object' && !Array.isArray(defs)) {
      for (const [typeName, def] of Object.entries(defs as Record<string, unknown>)) {
        mergedDefs[`${ns}.${typeName}`] = rewriteRefs(def, ns, knownNamespaces);
      }
    }
    // Preserve x-rune-rules metadata, also namespaced.
    const rules = doc['x-rune-rules'];
    if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
      for (const [ruleName, meta] of Object.entries(rules as Record<string, unknown>)) {
        rulesMetadata[`${ns}.${ruleName}`] = meta;
      }
    }
  }

  const bundled: Record<string, unknown> = {
    $schema: DRAFT_2020_12,
    $id: 'model.schema.json',
    title: `Bundle: ${namespaces.join(', ')}`,
    $defs: mergedDefs
  };
  if (Object.keys(rulesMetadata).length > 0) {
    bundled['x-rune-rules'] = rulesMetadata;
  }
  return JSON.stringify(bundled, null, 2) + '\n';
}

export const jsonSchemaProfile: LanguageProfile<'json-schema'> = {
  target: 'json-schema',
  extension: '.schema.json',
  makeBarrel() {
    // JSON Schema has no module system. `single-file` is canonical bundling.
    return undefined;
  },
  concatenate(perNs) {
    return {
      relativePath: 'model.schema.json',
      content: makeBundledContent(perNs),
      sourceMap: [],
      diagnostics: [],
      funcs: []
    };
  },
  makeSharedArtifacts() {
    return [];
  }
  // No singleFileLimits — bundling is the canonical shape.
};
