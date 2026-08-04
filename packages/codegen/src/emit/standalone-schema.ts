// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isData, isChoice, isRosettaEnumeration } from '@rune-langium/core';
import type { Data, Choice, RosettaEnumeration, RosettaTypeAlias } from '@rune-langium/core';
import { buildNamespaceIndexes, type NamespaceIndex } from '../preview-schema.js';
import { resolveTypeCallTarget, nodeSourceUri } from './type-ref-resolver.js';
import type { TypeIndexLookup, TypeIndexEntry, TypeResolutionVisitor } from './type-ref-resolver.js';
import { emitNamespace } from './zod-emitter.js';
import type { NamespaceWalkResult } from './namespace-walker.js';
import type { NamespaceEmitterOptions } from './namespace-emitter.js';
import { findCyclicTypes } from '../cycle-detector.js';
import type { TypeReferenceGraph } from '../cycle-detector.js';
import { topoSort } from '../topo-sort.js';
import type { GeneratorDiagnostic } from '../types.js';

export interface ResolvedTarget {
  kind: 'data' | 'choice' | 'enum' | 'typeAlias';
  node: Data | Choice | RosettaEnumeration | RosettaTypeAlias;
  sourceUri: string;
}

function mergeIndexEntries<N>(
  target: Map<string, TypeIndexEntry<N>>,
  namespaceIndexes: readonly NamespaceIndex[],
  pick: (ns: NamespaceIndex) => ReadonlyMap<string, TypeIndexEntry<N>>
): void {
  for (const ns of namespaceIndexes) {
    for (const [name, entry] of pick(ns)) {
      if (!target.has(name)) target.set(name, entry);
    }
  }
}

/**
 * Merge every namespace's own index into one flat, bare-name-keyed
 * TypeIndexLookup spanning the whole loaded document set — Langium already
 * resolves cross-namespace `.ref`s at link time, so this index only backs
 * resolveTypeCallTarget's refText-fallback path, not primary resolution.
 */
export function buildGlobalTypeIndex(namespaceIndexes: readonly NamespaceIndex[]): TypeIndexLookup {
  const dataByName = new Map<string, TypeIndexEntry<Data>>();
  const enumByName = new Map<string, TypeIndexEntry<RosettaEnumeration>>();
  const choiceByName = new Map<string, TypeIndexEntry<Choice>>();
  const typeAliasByName = new Map<string, TypeIndexEntry<RosettaTypeAlias>>();
  mergeIndexEntries(dataByName, namespaceIndexes, (ns) => ns.dataByName);
  mergeIndexEntries(enumByName, namespaceIndexes, (ns) => ns.enumByName);
  mergeIndexEntries(choiceByName, namespaceIndexes, (ns) => ns.choiceByName);
  mergeIndexEntries(typeAliasByName, namespaceIndexes, (ns) => ns.typeAliasByName);
  return { dataByName, enumByName, choiceByName, typeAliasByName };
}

/**
 * Resolve a `${namespace}.${name}` targetId to its real AST node — mirrors
 * preview-schema.ts's own generatePreviewSchemas targetId matching (compute
 * each candidate's own qualified id and compare, rather than parsing the
 * targetId string apart, since namespaces are themselves dot-separated).
 */
export function findTargetNode(
  namespaceIndexes: readonly NamespaceIndex[],
  targetId: string
): ResolvedTarget | undefined {
  for (const ns of namespaceIndexes) {
    for (const [name, entry] of ns.dataByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'data', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.choiceByName) {
      if (`${ns.namespace}.${name}` === targetId)
        return { kind: 'choice', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.enumByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'enum', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.typeAliasByName) {
      if (`${ns.namespace}.${name}` === targetId)
        return { kind: 'typeAlias', node: entry.node, sourceUri: entry.sourceUri };
    }
  }
  return undefined;
}

export interface StandaloneClosure {
  dataByName: Map<string, Data>;
  choiceByName: Map<string, Choice>;
  enumByName: Map<string, RosettaEnumeration>;
  typeAliasByName: Map<string, RosettaTypeAlias>;
  docs: LangiumDocument[];
}

type FrontierNode = Data | Choice | RosettaTypeAlias;

/**
 * Walk the transitive type-dependency closure of `target` — every Data,
 * Choice, Enum, and (only-if-the-target-itself) TypeAlias reachable via
 * attribute/option type calls and Data superType chains. `resolveTypeCallTarget`
 * already collapses RosettaTypeAlias chains down to their terminal kind, so
 * an alias reached via an attribute/option reference is never enqueued —
 * only the initial seed can ever land in typeAliasByName.
 */
export function computeStandaloneClosure(target: ResolvedTarget, globalIndex: TypeIndexLookup): StandaloneClosure {
  const dataByName = new Map<string, Data>();
  const choiceByName = new Map<string, Choice>();
  const enumByName = new Map<string, RosettaEnumeration>();
  const typeAliasByName = new Map<string, RosettaTypeAlias>();
  const docs = new Set<LangiumDocument>();
  const visited = new Set<Data | Choice | RosettaEnumeration | RosettaTypeAlias>();
  const frontier: FrontierNode[] = [];

  const trackDoc = (node: { $container?: unknown }): void => {
    const withDoc = node as { $container?: { $document?: LangiumDocument } };
    const doc = withDoc.$container?.$document;
    if (doc) docs.add(doc);
  };

  const enqueue = (node: Data | Choice | RosettaEnumeration | RosettaTypeAlias): void => {
    if (visited.has(node)) return;
    visited.add(node);
    trackDoc(node);
    if (isData(node)) {
      dataByName.set(node.name, node);
      frontier.push(node);
    } else if (isChoice(node)) {
      choiceByName.set(node.name, node);
      frontier.push(node);
    } else if (isRosettaEnumeration(node)) {
      enumByName.set(node.name, node);
    } else {
      typeAliasByName.set(node.name, node);
      frontier.push(node);
    }
  };

  const dependencyVisitor: TypeResolutionVisitor<void> = {
    onPrimitive: () => undefined,
    onEnum: (node) => enqueue(node),
    onData: (node) => enqueue(node),
    onChoice: (node) => enqueue(node),
    onUnresolved: () => undefined
  };

  enqueue(target.node);

  while (frontier.length > 0) {
    const node = frontier.shift()!;
    if (isData(node)) {
      const superRef = node.superType?.ref;
      if (superRef) enqueue(superRef);
      for (const attr of node.attributes) {
        resolveTypeCallTarget(attr.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
      }
    } else if (isChoice(node)) {
      for (const option of node.attributes) {
        resolveTypeCallTarget(option.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
      }
    } else {
      resolveTypeCallTarget(node.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
    }
  }

  return { dataByName, choiceByName, enumByName, typeAliasByName, docs: Array.from(docs) };
}

/**
 * Build the `Data`/`Choice` dependency graph for emit-order purposes, scoped
 * to exactly the closure's own members. `cycle-detector.ts`'s own
 * `buildTypeReferenceGraph` is NOT reused here: it reads `attr.typeCall?.type?.ref`
 * directly, so an attribute typed via a `RosettaTypeAlias` (the alias node
 * itself is neither `Data` nor `Choice`) produces no edge at all — silently
 * dropping exactly the dependency that determines correct `const` declaration
 * order in the synthesized script. Chasing every attribute/option/superType
 * through `resolveTypeCallTarget` (already used for closure discovery above)
 * fixes this without touching the shared `cycle-detector.ts`, which other
 * (non-alias-blind-sensitive) callers still rely on unchanged.
 */
function buildClosureReferenceGraph(closure: StandaloneClosure, globalIndex: TypeIndexLookup): TypeReferenceGraph {
  const nodes: string[] = [];
  const edges = new Map<string, string[]>();

  const ensureNode = (name: string): void => {
    if (!edges.has(name)) {
      nodes.push(name);
      edges.set(name, []);
    }
  };

  const addEdge = (from: string, to: string): void => {
    ensureNode(from);
    ensureNode(to);
    edges.get(from)!.push(to);
  };

  const dependencyVisitor = (from: string): TypeResolutionVisitor<void> => ({
    onPrimitive: () => undefined,
    onEnum: () => undefined,
    onData: (node) => addEdge(from, node.name),
    onChoice: (node) => addEdge(from, node.name),
    onUnresolved: () => undefined
  });

  for (const data of closure.dataByName.values()) {
    ensureNode(data.name);
    const superRef = data.superType?.ref;
    if (superRef) addEdge(data.name, superRef.name);
    for (const attr of data.attributes) {
      resolveTypeCallTarget(attr.typeCall, globalIndex, dependencyVisitor(data.name), nodeSourceUri(data, ''));
    }
  }

  for (const choice of closure.choiceByName.values()) {
    ensureNode(choice.name);
    for (const option of choice.attributes) {
      resolveTypeCallTarget(option.typeCall, globalIndex, dependencyVisitor(choice.name), nodeSourceUri(choice, ''));
    }
  }

  return { nodes, edges };
}

/**
 * Matches exactly the cross-namespace import lines `collectCrossNamespaceImports`
 * (zod-emitter.ts) emits — always a single line of the form
 * `import { Sym1, Sym2 } from '<path>.zod.js';`. It compares the REAL
 * namespace each referenced AST node's `$container` lives in against the
 * synthetic model's single `namespace` label, which can never match for a
 * closure spanning more than one real namespace — every such line is
 * necessarily wrong here (its target is, by construction of the closure,
 * ALREADY declared locally in this same script) and is stripped rather than
 * worked around by threading a "local" concept through zod-emitter.ts,
 * which this plan leaves unmodified.
 */
const CROSS_NAMESPACE_IMPORT_LINE = /^import \{[^}]*\} from '[^']*\.zod\.js';(\r?\n){0,2}/gm;

/**
 * Emit one target type's real Zod schema as a self-contained script — the
 * target's transitive closure (Task 2) assembled into a single synthetic
 * `NamespaceWalkResult` and rendered through the real, unmodified
 * `emitNamespace()` (zod target), never a hand-rolled approximation of it
 * (per the repo's DRY precept).
 *
 * The returned `code` is real TypeScript (types, `export`, and — for cyclic
 * types — an `interface` predeclaration all survive, unmodified), with one
 * exception: the spurious cross-namespace `import` lines described above are
 * stripped, since every symbol they'd reference is already declared locally
 * in this same script. The genuine `import { z } from 'zod';` header line is
 * NOT stripped — turning this into directly `new Function`-evaluable
 * JavaScript (erasing types/`export`/the cyclic-type `interface` block, and
 * binding `z`) is left to the caller, exactly as `RUNTIME_HELPER_JS_SOURCE`
 * is already caller-prepended rather than bundled into this return value.
 *
 * Caveat inherited from `namespace-emitter.ts` (pre-existing there, not
 * introduced by this function): if `targetId` itself resolves to a
 * `RosettaTypeAlias` whose RHS is a `Data`/`Choice` (not a primitive or
 * `Enum`), the emitted alias `const` can reference its RHS `const` before
 * that RHS is declared — type aliases are always emitted before the
 * topo-sorted `Data`/`Choice` block, so evaluating the result throws a TDZ
 * `ReferenceError`. See `test/fixtures/type-aliases/data-ref/expected.zod.ts`
 * for the same defect in ordinary per-namespace output.
 *
 * A second caveat, also inherited from shared infrastructure (`topo-sort.ts`
 * and `zod-emitter.ts`'s reference-emission, both entirely unmodified here)
 * and confirmed to reproduce in the REAL per-namespace `.zod.ts` output too
 * — not specific to standalone extraction: `topoSort` always appends cyclic
 * types LAST, after every non-cyclic type, regardless of whether a
 * non-cyclic type depends on one of them; and `zod-emitter.ts` only wraps a
 * cyclic type's own schema declaration in `z.lazy()`, never a reference TO
 * it from elsewhere. So a non-cyclic `Data`/`Choice` that references a
 * cyclic one (e.g. `Root { n: Node }` where `Node` is self-referencing)
 * emits `RootSchema`'s eager `const` initializer BEFORE `NodeSchema` is
 * declared, throwing a TDZ `ReferenceError` at evaluation time. The real
 * fix spans `topo-sort.ts`'s ordering algorithm and/or `zod-emitter.ts`'s
 * reference-emission (deciding whether to wrap a REFERENCE, not just a
 * declaration, in `z.lazy()`), well beyond this module's own scope — this
 * function inherits it unmodified.
 */
export function emitStandaloneZodSchema(
  documents: LangiumDocument[],
  targetId: string
): { code: string; diagnostics: GeneratorDiagnostic[] } {
  const namespaceIndexes = buildNamespaceIndexes(documents);
  const target = findTargetNode(namespaceIndexes, targetId);
  if (!target) {
    return {
      code: '',
      diagnostics: [
        {
          severity: 'error',
          code: 'unknown-target',
          message: `Target '${targetId}' was not found in the loaded documents.`
        }
      ]
    };
  }

  const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
  const closure = computeStandaloneClosure(target, globalIndex);

  const graph = buildClosureReferenceGraph(closure, globalIndex);
  const cyclicTypes = findCyclicTypes(graph);
  const emitOrder = topoSort(graph, cyclicTypes);

  const syntheticModel: NamespaceWalkResult = {
    docs: closure.docs,
    namespace: '__standalone__',
    dataByName: closure.dataByName,
    enumByName: closure.enumByName,
    typeAliasByName: closure.typeAliasByName,
    choiceByName: closure.choiceByName,
    rulesByName: new Map(),
    reportsByName: new Map(),
    annotationsByName: new Map(),
    libraryFuncsByName: new Map(),
    emitOrder,
    cyclicTypes,
    graph
  };

  // `suppressBoilerplate: true` (the same knob `GenericModelEmitter` uses for
  // a shared whole-model bundle) makes `emitNamespace` emit an `import {
  // ... } from './runtime.zod.js'` line instead of INLINING the TypeScript
  // `RUNTIME_HELPER_SOURCE` block. That import line matches
  // CROSS_NAMESPACE_IMPORT_LINE's own `.zod.js'` shape, so it gets stripped
  // by the same regex below — leaving NEITHER an inlined helper block NOR a
  // broken import, exactly matching this function's documented contract
  // (the caller prepends `RUNTIME_HELPER_JS_SOURCE` separately). Without
  // this flag, the default (`{}`) inlines `RUNTIME_HELPER_SOURCE` into
  // `result.content`, which then collides with a caller's own prepended
  // `RUNTIME_HELPER_JS_SOURCE` — after type-erasure both declare the same
  // `const` helper names, and `new Function()` throws "Identifier has
  // already been declared".
  const emitOptions: NamespaceEmitterOptions = { suppressBoilerplate: true };
  const result = emitNamespace(syntheticModel, emitOptions, { namespaces: new Map() });
  const code = result.content.replace(CROSS_NAMESPACE_IMPORT_LINE, '');
  return { code, diagnostics: result.diagnostics };
}
