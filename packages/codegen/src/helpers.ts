// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The exact source text of the three runtime helper functions that are
 * inlined at the top of every emitted file (Zod and TypeScript targets).
 *
 * Per contracts/runtime-helpers.md §Inlined source text.
 * FR-021 (inlined helpers), SC-003 (Python parity).
 */
export const RUNTIME_HELPER_SOURCE: string =
  `// --- rune-codegen runtime helpers (inlined) ---\n` +
  `const runeCheckOneOf = (values: (unknown | undefined | null)[]): boolean =>\n` +
  `  values.filter((v) => v !== undefined && v !== null).length === 1;\n` +
  `\n` +
  `const runeCount = (arr: unknown[] | undefined | null): number => arr?.length ?? 0;\n` +
  `\n` +
  `const runeAttrExists = (v: unknown): boolean =>\n` +
  `  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);\n` +
  `// --- end runtime helpers ---`;

/**
 * Plain JavaScript equivalent of `RUNTIME_HELPER_SOURCE` — no type annotations.
 *
 * Used by the Studio codegen worker when executing generated functions in a
 * sandboxed Function constructor. Since the worker strips TypeScript annotations
 * from the isolated function body (`GeneratedFunc.fileContents`), the helpers
 * also need to be annotation-free so no TypeScript constructs reach the JS engine.
 */
export const RUNTIME_HELPER_JS_SOURCE: string =
  `// --- rune-codegen runtime helpers (inlined) ---\n` +
  `const runeCheckOneOf = (values) =>\n` +
  `  values.filter((v) => v !== undefined && v !== null).length === 1;\n` +
  `\n` +
  `const runeCount = (arr) => arr?.length ?? 0;\n` +
  `\n` +
  `const runeAttrExists = (v) =>\n` +
  `  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);\n` +
  `// --- end runtime helpers ---`;

/**
 * Returns true iff exactly one value in the array is non-null and non-undefined.
 *
 * Parity: matches Python rune_check_one_of(values) semantics.
 * Used for: one-of, choice conditions.
 * FR-021, SC-003.
 */
export const runeCheckOneOf = (values: (unknown | undefined | null)[]): boolean =>
  values.filter((v) => v !== undefined && v !== null).length === 1;

/**
 * Returns the length of an array attribute, treating null/undefined as 0.
 *
 * Parity: matches Python rune_count(collection) semantics.
 * Used for: count expressions, (1..*) condition assertions.
 * FR-021, SC-003.
 */
export const runeCount = (arr: unknown[] | undefined | null): number => arr?.length ?? 0;

/**
 * Returns true iff the value is "present" in the Rune sense:
 * not undefined, not null, and not an empty array.
 *
 * Parity: matches Python rune_attr_exists(v) semantics.
 * Used for: exists, is absent conditions.
 * FR-021, SC-003.
 */
export const runeAttrExists = (v: unknown): boolean =>
  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);

// ---------------------------------------------------------------------------
// DRY codegen helpers shared across emitters
// ---------------------------------------------------------------------------

import type { RosettaCardinality, Data, Condition, RosettaRule } from '@rune-langium/core';
import { isData } from '@rune-langium/core';
import type { NamespaceRegistry } from './emit/namespace-registry.js';
import { resolveImportPath } from './emit/namespace-registry.js';

/**
 * Decode a RosettaCardinality into lower/upper bounds.
 * `upper === null` means unbounded (upper = *).
 */
export function decodeCardinality(card: RosettaCardinality): { lower: number; upper: number | null } {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);
  return { lower, upper };
}

/**
 * Build a map of attribute name → $refText type name for a Data node,
 * including one level of inherited attributes from its parent.
 * Own attributes take precedence over inherited ones.
 */
export function buildAttributeTypesMap(data: Data): Map<string, string> {
  const map = new Map<string, string>();
  // own attributes
  for (const attr of data.attributes) {
    const typeName = attr.typeCall?.type?.$refText ?? 'unknown';
    map.set(attr.name, typeName);
  }
  // inherited attributes (one level — parent is always a Data node)
  const parent = data.superType?.ref;
  if (parent && isData(parent)) {
    for (const attr of parent.attributes) {
      if (!map.has(attr.name)) {
        const typeName = attr.typeCall?.type?.$refText ?? 'unknown';
        map.set(attr.name, typeName);
      }
    }
  }
  return map;
}

/**
 * Return the conditions on a Data node that have a non-null expression.
 */
export function activeConditions(data: Data): Condition[] {
  return (data.conditions ?? []).filter((c) => c.expression != null);
}

/**
 * Merge the three sub-maps of a language profile into a single flat record.
 * Combines basicTypeMap ∪ recordTypeMap ∪ typeAliasMap.
 */
export function mergeProfileTypeMaps<T>(profile: {
  basicTypeMap: Record<string, T>;
  recordTypeMap: Record<string, T>;
  typeAliasMap: Record<string, T>;
}): Record<string, T> {
  return { ...profile.basicTypeMap, ...profile.recordTypeMap, ...profile.typeAliasMap };
}

/**
 * Build the sorted emit lines for a `runeReportRules` const object body.
 * Returns an empty array when there are no rules.
 *
 * Used by zod-emitter and ts-emitter to avoid the verbatim copy.
 */
export function buildReportRulesLines(rulesByName: ReadonlyMap<string, RosettaRule>): string[] {
  const ruleNames = Array.from(rulesByName.keys()).sort();
  if (ruleNames.length === 0) return [];

  const lines: string[] = [];
  lines.push('export const runeReportRules = {');
  for (const name of ruleNames) {
    const rule = rulesByName.get(name)!;
    const kind = rule.eligibility ? 'eligibility' : 'reporting';
    const inputRef = rule.input?.type?.ref;
    const inputName = inputRef ? inputRef.name : 'unknown';
    lines.push(`  '${name}': { kind: '${kind}' as const, inputType: '${inputName}' },`);
  }
  lines.push('} as const;');
  return lines;
}

/**
 * Build the sorted ES import lines for cross-namespace references.
 *
 * @param imports   - Map of target namespace → set of symbol names to import.
 * @param fromNs    - The emitting namespace (used to compute relative paths).
 * @param registry  - The namespace registry.
 * @param suffix    - File suffix appended after the resolved path (e.g. '.zod.js' or '.js').
 */
export function buildCrossNsImportLines(
  imports: Map<string, Set<string>>,
  fromNs: string,
  registry: NamespaceRegistry,
  suffix: string
): string[] {
  return [...imports.keys()].sort().flatMap((ns) => {
    const symbols = [...(imports.get(ns) ?? [])].sort();
    if (symbols.length === 0) return [];
    const path = resolveImportPath(fromNs, ns, registry);
    return [`import { ${symbols.join(', ')} } from '${path}${suffix}';`];
  });
}
