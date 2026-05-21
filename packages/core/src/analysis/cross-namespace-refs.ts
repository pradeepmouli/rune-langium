// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cross-namespace reference walker — the per-namespace dependency graph that
 * powers the studio's Download config modal auto-select cascade (spec
 * 2026-05-14 §5.1 / §5.2).
 *
 * The module also hoists `getElementNamespace`, the small AST-helper that
 * was duplicated as a file-private function in `ts-emitter.ts:131` and
 * `zod-emitter.ts:148`. Both emitters delegate to this version; the helper
 * is the only piece they share with the modal walker.
 *
 * NOT exported here: a per-symbol cross-NS collector for emitter import
 * statements. The existing `collectCrossNamespaceImports` helpers in each
 * emitter have emitter-specific shape (TypeScript adds a `Shape` alias on
 * one of two paths; the rule-input walk only matters for TS) that resists
 * a clean shared abstraction. They keep their per-emitter form for now.
 */

import {
  isChoice,
  isData,
  isRosettaEnumeration,
  isRosettaFunction,
  isRosettaModel,
  isRosettaRule,
  isRosettaTypeAlias,
  type RosettaModel
} from '../generated/ast.js';
import type { LangiumDocument } from 'langium';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Return the dot-separated namespace string for an element whose direct
 * `$container` is a `RosettaModel`. Returns undefined when the element
 * isn't a top-level model child — which is what every typeRef target is
 * (Data, Choice, RosettaTypeAlias, RosettaEnumeration, RosettaFunction
 * all live as direct children of RosettaModel via `model.elements`).
 *
 * The model's namespace lives in `name: QualifiedName | string`. Behavior
 * mirrors the private helpers that were duplicated in `ts-emitter.ts:131`
 * and `zod-emitter.ts:148` — those will be deleted as a follow-up once
 * both emitters route through this module.
 */
export function getElementNamespace(element: { $container?: unknown }): string | undefined {
  const container = element.$container;
  if (!container || typeof container !== 'object') return undefined;
  const model = container as { name?: unknown; $type?: string };
  if (model.$type !== 'RosettaModel') return undefined;
  const name = model.name;
  if (typeof name === 'string') return name.replace(/^"|"$/g, '');
  if (name && typeof name === 'object' && 'segments' in name) {
    return (name as { segments: string[] }).segments.join('.');
  }
  return name == null ? undefined : String(name);
}

// ---------------------------------------------------------------------------
// Modal-facing: full §5.2 dep graph from all parsed documents
// ---------------------------------------------------------------------------

/**
 * Walk every parsed document and return a per-namespace dependency map:
 * `Map<sourceNamespace, Set<targetNamespace>>`. A key `S` lists every
 * namespace `T ≠ S` that some type in `S` directly references.
 *
 * The auto-select cascade in the Download modal computes the transitive
 * closure on top of this map — a fixed-point set-union that terminates
 * naturally when no new namespaces are added (cycles absorb cleanly).
 *
 * Walks the spec §5.2 reference set in full:
 *   1. Data `superType` (extends)
 *   2. Data `attributes[].typeCall.type` (attribute type refs)
 *   3. RosettaTypeAlias `typeCall.type` (alias target refs)
 *   4. Choice `attributes[].typeCall.type` (choice arm refs)
 *   5. RosettaFunction `inputs[].typeCall.type` + `output.typeCall.type` +
 *      `superFunction` (function I/O refs)
 *
 * NOT walked yet:
 *   - Function body operation type refs (the §5.2 "rule conditions" bullet).
 *     The Langium AST's `Operation` / `Condition` shapes have many possible
 *     type-bearing children, and the body refs are typically subset of the
 *     function's input/output anyway. If a real deselection test ever
 *     produces a broken emit because of a body-only reference, extend here.
 */
export function collectNamespaceDependencies(documents: readonly LangiumDocument[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();

  function addEdge(sourceNs: string, targetNs: string): void {
    if (sourceNs === targetNs) return;
    let targets = deps.get(sourceNs);
    if (!targets) {
      targets = new Set<string>();
      deps.set(sourceNs, targets);
    }
    targets.add(targetNs);
  }

  function trackRef(typeRef: unknown, sourceNs: string): void {
    if (!typeRef || typeof typeRef !== 'object') return;
    const targetNs = getElementNamespace(typeRef as { $container?: unknown });
    if (!targetNs) return;
    addEdge(sourceNs, targetNs);
  }

  // Re-use the same name → namespace projection as getElementNamespace so
  // the source-namespace key matches what trackRef writes for targets.
  function modelNamespace(model: RosettaModel): string | undefined {
    const name = (model as unknown as { name?: unknown }).name;
    if (typeof name === 'string') return name.replace(/^"|"$/g, '');
    if (name && typeof name === 'object' && 'segments' in name) {
      return (name as { segments: string[] }).segments.join('.');
    }
    return name == null ? undefined : String(name);
  }

  for (const doc of documents) {
    const model = doc.parseResult?.value as RosettaModel | undefined;
    if (!model || !isRosettaModel(model)) continue;
    const sourceNs = modelNamespace(model);
    if (!sourceNs) continue;
    // Ensure the source namespace has an entry even if it has no
    // cross-namespace refs — callers can rely on `deps.has(ns)` to mean
    // "we've seen this namespace, no deps" rather than "we haven't loaded it".
    if (!deps.has(sourceNs)) deps.set(sourceNs, new Set<string>());

    // Element arrays are `?? []` so partial/skeletal models (e.g. minimal
    // curated stubs without populated child arrays) don't throw inside the
    // walker. Production Langium-serialized models always have these fields
    // — this is defense in depth, not a load-bearing fallback.
    for (const element of model.elements ?? []) {
      if (isData(element)) {
        // 1. superType
        const parentRef = element.superType?.ref;
        if (parentRef) trackRef(parentRef, sourceNs);
        // 2. attribute type refs
        for (const attr of element.attributes ?? []) {
          const r = attr.typeCall?.type?.ref;
          if (r && (isData(r) || isRosettaEnumeration(r) || isRosettaTypeAlias(r))) {
            trackRef(r, sourceNs);
          }
        }
      } else if (isRosettaTypeAlias(element)) {
        // 3. TypeAlias targets
        const r = element.typeCall?.type?.ref;
        if (r && (isData(r) || isRosettaEnumeration(r) || isRosettaTypeAlias(r))) {
          trackRef(r, sourceNs);
        }
      } else if (isChoice(element)) {
        // 4. Choice arm refs (`element.attributes[]` are ChoiceOptions)
        for (const arm of element.attributes ?? []) {
          const r = arm.typeCall?.type?.ref;
          if (r && (isData(r) || isRosettaEnumeration(r) || isRosettaTypeAlias(r))) {
            trackRef(r, sourceNs);
          }
        }
      } else if (isRosettaFunction(element)) {
        // 5. Function I/O
        for (const input of element.inputs ?? []) {
          const r = input.typeCall?.type?.ref;
          if (r && (isData(r) || isRosettaEnumeration(r) || isRosettaTypeAlias(r))) {
            trackRef(r, sourceNs);
          }
        }
        const outputRef = element.output?.typeCall?.type?.ref;
        if (outputRef && (isData(outputRef) || isRosettaEnumeration(outputRef) || isRosettaTypeAlias(outputRef))) {
          trackRef(outputRef, sourceNs);
        }
        const superRef = element.superFunction?.ref;
        if (superRef) trackRef(superRef, sourceNs);
      } else if (isRosettaRule(element)) {
        // 6. Rule input type (spec §5.2 #4 — "type reference inside a
        //    function or rule body"). We walk the declared `input` TypeCall
        //    at the same granularity as function I/O (signature types, not
        //    a full expression-body walk). A rule whose input is a type in
        //    another namespace creates a cross-namespace dependency.
        const ruleInputRef = element.input?.type?.ref;
        if (ruleInputRef && (isData(ruleInputRef) || isRosettaEnumeration(ruleInputRef) || isRosettaTypeAlias(ruleInputRef))) {
          trackRef(ruleInputRef, sourceNs);
        }
      }
    }
  }

  return deps;
}

/**
 * Compute the transitive closure of a single source namespace through the
 * dep map produced by `collectNamespaceDependencies`. Returns the set of
 * namespaces that must be included if `source` is selected (includes
 * `source` itself).
 *
 * Used by the modal's auto-select cascade on each toggle. O(N) per call
 * where N is the number of reachable namespaces — cheap enough to recompute
 * synchronously on every toggle.
 *
 * Cycles between namespaces are absorbed naturally by the visited-set
 * check; no explicit cycle detection needed.
 */
export function closeNamespaceDependencies(
  source: string,
  deps: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const visited = new Set<string>([source]);
  // Index-based queue cursor instead of Array.shift() (which is O(N) per
  // call → O(N²) overall). The cascade recomputes this per toggle, so keep
  // it linear.
  const queue: string[] = [source];
  for (let head = 0; head < queue.length; head++) {
    const targets = deps.get(queue[head]!);
    if (!targets) continue;
    for (const t of targets) {
      if (!visited.has(t)) {
        visited.add(t);
        queue.push(t);
      }
    }
  }
  return visited;
}
