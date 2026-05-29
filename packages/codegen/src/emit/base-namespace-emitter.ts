// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { RosettaCardinality, Data, Condition, RosettaRule } from '@rune-langium/core';
import { isData } from '@rune-langium/core';
import type { NamespaceRegistry } from './namespace-registry.js';
import { resolveImportPath } from './namespace-registry.js';
import type { NamespaceEmitterOptions } from './namespace-emitter.js';
import type { NamespaceWalkResult } from './namespace-walker.js';
import type { GeneratorOutput } from '../types.js';

export abstract class BaseNamespaceEmitter {
  protected readonly model: NamespaceWalkResult;
  protected readonly registry: NamespaceRegistry;
  protected readonly suppressBoilerplate: boolean;

  constructor(model: NamespaceWalkResult, options: NamespaceEmitterOptions, registry: NamespaceRegistry) {
    this.model = model;
    this.registry = registry;
    this.suppressBoilerplate = options.suppressBoilerplate ?? false;
  }

  abstract finalize(): GeneratorOutput;
}

// ---------------------------------------------------------------------------
// Shared emitter helpers — co-located with the base class; imported by subclasses.
// ---------------------------------------------------------------------------

/** Decode a RosettaCardinality into lower/upper bounds (`upper === null` = unbounded). */
export function decodeCardinality(card: RosettaCardinality): { lower: number; upper: number | null } {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);
  return { lower, upper };
}

/** Build a map of attribute name → type name for a Data node, including one parent level. */
export function buildAttributeTypesMap(data: Data): Map<string, string> {
  const map = new Map<string, string>();
  for (const attr of data.attributes) {
    map.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
  }
  const parent = data.superType?.ref;
  if (parent && isData(parent)) {
    for (const attr of parent.attributes) {
      if (!map.has(attr.name)) map.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
    }
  }
  return map;
}

/** Return the conditions on a Data node that have a non-null expression. */
export function activeConditions(data: Data): Condition[] {
  return (data.conditions ?? []).filter((c) => c.expression != null);
}

/** Merge basicTypeMap ∪ recordTypeMap ∪ typeAliasMap from a language profile. */
export function mergeProfileTypeMaps<T>(profile: {
  basicTypeMap: Record<string, T>;
  recordTypeMap: Record<string, T>;
  typeAliasMap: Record<string, T>;
}): Record<string, T> {
  return { ...profile.basicTypeMap, ...profile.recordTypeMap, ...profile.typeAliasMap };
}

/** Build sorted emit lines for a `runeReportRules` const object body. */
export function buildReportRulesLines(rulesByName: ReadonlyMap<string, RosettaRule>): string[] {
  const ruleNames = Array.from(rulesByName.keys()).sort();
  if (ruleNames.length === 0) return [];
  const lines = ['export const runeReportRules = {'];
  for (const name of ruleNames) {
    const rule = rulesByName.get(name)!;
    const kind = rule.eligibility ? 'eligibility' : 'reporting';
    const inputName = rule.input?.type?.ref?.name ?? 'unknown';
    lines.push(`  '${name}': { kind: '${kind}' as const, inputType: '${inputName}' },`);
  }
  lines.push('} as const;');
  return lines;
}

/** Build sorted ES import lines for cross-namespace references. */
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
