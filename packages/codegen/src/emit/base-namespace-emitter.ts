// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { RosettaCardinality, Data, Choice, Condition, RosettaRule } from '@rune-langium/core';
import { isData, isChoice } from '@rune-langium/core';
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

/**
 * Build a map of attribute name → type name for a Data node, including
 * attributes from the FULL `extends` chain (not just the direct parent) —
 * an attribute declared 2+ levels up (e.g. `QuantitySchedule extends
 * MeasureSchedule extends MeasureBase`, with `unit` declared on
 * `MeasureBase`) must still resolve for `exists`/`is absent` conditions
 * declared on the descendant type. A visited-set guards against a
 * malformed cyclic `extends` chain looping forever.
 *
 * Data-extends-Choice (real corpus case: `BasketConstituent extends
 * Observable`): a Data's `superType` reference is typed `DataOrChoice` —
 * when the walk reaches a `Choice` ancestor (a Choice cannot itself
 * `extends`, so the chain necessarily terminates there), the Choice's
 * option names are contributed as pseudo-attributes (per the design's
 * Semantics: "the child carries the choice's options ... PLUS its own
 * attributes"), keyed by the option's Data-type name (the same name a
 * condition like `Basket is absent` references) — mapped to that same
 * name as its "type" (an option has no attribute name of its own, only a
 * typeCall; the option's type name IS the pseudo-attribute name here,
 * mirroring how transpileCondition's `extractAttrName` resolves a bare
 * `RosettaSymbolReference` to `expr.symbol.$refText`).
 */
export function buildAttributeTypesMap(data: Data): Map<string, string> {
  const map = new Map<string, string>();
  const visited = new Set<string>();
  let current: Data | undefined = data;
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    for (const attr of current.attributes) {
      if (!map.has(attr.name)) map.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
    }
    const parent: unknown = current.superType?.ref;
    if (parent && isChoice(parent)) {
      contributeChoiceOptionsAsAttributes(parent as Choice, map, visited);
      current = undefined;
      break;
    }
    current = parent && isData(parent) ? parent : undefined;
  }
  return map;
}

/**
 * Contribute a Choice's option names as pseudo-attributes into `map`.
 * A Choice cannot `extends` anything (it has no `superType`), so this is
 * a leaf contribution — no further chain walk from here. `visited` is
 * threaded through for symmetry with the Data walk's cycle guard, though
 * a Choice can't itself be revisited via `extends` (only via nested option
 * types, which are NOT walked here — pseudo-attributes are the option
 * NAMES themselves, not their own attribute sets).
 */
function contributeChoiceOptionsAsAttributes(choice: Choice, map: Map<string, string>, visited: Set<string>): void {
  if (visited.has(choice.name)) return;
  visited.add(choice.name);
  for (const option of choice.attributes) {
    const optionTypeName = option.typeCall?.type?.ref?.name ?? option.typeCall?.type?.$refText;
    if (!optionTypeName) continue;
    if (!map.has(optionTypeName)) map.set(optionTypeName, optionTypeName);
  }
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
