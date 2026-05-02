// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * T113 — Inventory: Prior-art dispatch map, operator-precedence table, and block taxonomy.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OPERATOR PRECEDENCE TABLE (from expression-node-to-dsl.ts, copied verbatim)
 * Lower number = lower precedence = binds less tightly.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   or:      1   — LogicalOperation
 *   and:     2   — LogicalOperation
 *   '=':     3   — EqualityOperation
 *   '<>':    3   — EqualityOperation
 *   contains:3   — RosettaContainsExpression
 *   disjoint:3   — RosettaDisjointExpression
 *   default: 3   — DefaultOperation
 *   '<':     4   — ComparisonOperation
 *   '<=':    4   — ComparisonOperation
 *   '>':     4   — ComparisonOperation
 *   '>=':    4   — ComparisonOperation
 *   '+':     5   — ArithmeticOperation
 *   '-':     5   — ArithmeticOperation
 *   '*':     6   — ArithmeticOperation
 *   '/':     6   — ArithmeticOperation
 *
 * ═══════════════════════════════════════════════════════════════════════
 * VISITOR-PATTERN $type DISPATCH MAP (from transpiler.ts Phase 5)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   RosettaBooleanLiteral    → transpileLiteral()  (true/false)
 *   RosettaIntLiteral        → transpileLiteral()  (BigInt → Number)
 *   RosettaNumberLiteral     → transpileLiteral()  (float)
 *   RosettaStringLiteral     → transpileLiteral()  ('escaped')
 *   RosettaSymbolReference   → `${selfName}.${name}` (attribute ref)
 *   RosettaImplicitVariable  → selfName (lambda param)
 *   RosettaFeatureCall       → transpileNavigation() → receiver?.feature
 *   RosettaDeepFeatureCall   → transpileNavigation() → receiver?.feature
 *   ArithmeticOperation      → transpileArithmetic() (+, -, *, /)
 *   ComparisonOperation      → transpileComparison() (<, <=, >, >=)
 *   EqualityOperation        → transpileComparison() (= → ===, <> → !==)
 *   LogicalOperation         → transpileBoolean() (and → &&, or → ||)
 *   RosettaContainsExpression → transpileSetOps() → (arr ?? []).includes(v)
 *   RosettaDisjointExpression → transpileSetOps() → !(arr).some(…)
 *   RosettaCountOperation    → transpileAggregation() → runeCount(arr)
 *   SumOperation             → transpileAggregation() → arr.reduce(…)
 *   MinOperation             → transpileAggregation() → Math.min(...arr)
 *   MaxOperation             → transpileAggregation() → Math.max(...arr)
 *   SortOperation            → transpileAggregation() → [...arr].sort()
 *   DistinctOperation        → transpileAggregation() → [...new Set(arr)]
 *   FirstOperation           → transpileAggregation() → arr[0]
 *   LastOperation            → transpileAggregation() → arr.at(-1)
 *   FlattenOperation         → transpileAggregation() → arr.flat()
 *   ReverseOperation         → transpileAggregation() → [...arr].reverse()
 *   FilterOperation          → transpileHigherOrder() → arr.filter((p) => body)
 *   MapOperation             → transpileHigherOrder() → arr.map((p) => body)
 *   RosettaExistsExpression  → runeAttrExists(…)
 *   RosettaAbsentExpression  → !runeAttrExists(…)
 *   RosettaConditionalExpression → transpileConditional() (ternary or if-block)
 *   OneOfOperation           → emitOneOf() → runeCheckOneOf([…])
 *   ChoiceOperation          → emitChoice() → runeCheckOneOf([…])
 *   RosettaOnlyExistsExpression → emitOnlyExists() *   RosettaConstructorExpression → transpileConstructor() → { k1: v1, k2: v2 }
 *   ListLiteral              → transpileListLiteral() → [e1, e2, ...] *
 * ═══════════════════════════════════════════════════════════════════════
 * BLOCK TAXONOMY (from expression-builder/blocks/)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   BinaryBlock        — arithmetic, comparison, equality, logical operators
 *   ComparisonBlock    — <, <=, >, >= (sub-class of BinaryBlock)
 *   ConditionalBlock   — if/then/else expression (RosettaConditionalExpression)
 *   ConstructorBlock   — type constructor invocation (not yet in transpiler)
 *   FeatureCallBlock   — navigation chain a -> b -> c (RosettaFeatureCall/Deep)
 *   LambdaBlock        — inline function body (FilterOperation/MapOperation fn)
 *   ListBlock          — list literal [a, b, c] (ListLiteral $type)
 *   LiteralBlock       — scalar literals (Bool/Int/Number/String)
 *   ReferenceBlock     — attribute or func reference (RosettaSymbolReference)
 *   SwitchBlock        — dispatch/choice switch (ChoiceOperation in conditions)
 *   UnaryBlock         — negation or unary minus (not yet in transpiler)
 *
 * Implementation notes for Phase 8b:
 * - Func inputs are referenced as `input.<name>` (not `this.<name>`) because
 *   funcs receive a single `input: { ... }` parameter (FR-028 signature shape).
 * - `selfName` in ExpressionTranspilerContext is set to `'input'` for funcs.
 * - For alias expressions, `selfName` remains `'input'` (aliases bind to the
 *   input object, not to other aliases — aliases are resolved separately via
 *   aliasBindings Map).
 * - For post-condition expressions, `selfName` is still `'input'` but the
 *   `result` local variable is also in scope.
 */

import type { ExpressionTranspilerContext } from '../expr/transpiler.js';
import type { GeneratorDiagnostic } from '../types.js';

// ---------------------------------------------------------------------------
// T118 — RuneFunc type definitions
// ---------------------------------------------------------------------------

/**
 * A single input or output parameter of a Rune func declaration.
 * Extracted from the Langium Attribute AST node (RosettaFunction.inputs / output).
 */
export interface RuneFuncParam {
  /** The parameter name as declared in the Rune model. */
  name: string;
  /** Resolved Rune type name (e.g., 'int', 'string', a data type name). */
  typeName: string;
  /**
   * Resolved cardinality.
   * lower: minimum cardinality (0 or 1).
   * upper: null = unbounded (*), otherwise the numeric upper bound.
   */
  cardinality: { lower: number; upper: number | null };
}

/**
 * A single `alias <name>: <expr>` declaration in a Rune func body.
 * Corresponds to ShortcutDeclaration in the Langium AST.
 */
export interface RuneFuncAlias {
  /** The alias identifier as declared. */
  name: string;
  /** The Langium AST expression node on the RHS (passed verbatim to transpileExpression). */
  exprNode: unknown;
}

/**
 * A single `set <out>: <expr>` or `add <out>: <expr>` assignment in a func body.
 * Corresponds to Operation in the Langium AST.
 * - 'set' → scalar output assignment (`result = <expr>`)
 * - 'add' → array accumulation (`result.push(<expr>)`)
 */
export interface RuneFuncAssignment {
  kind: 'set' | 'add';
  exprNode: unknown;
}

/**
 * A Rune `func` declaration ready for the TypeScript emitter.
 * Produced by extractFuncs() from RosettaFunction AST nodes.
 */
export interface RuneFunc {
  /** The func name as declared in the Rune model. */
  name: string;
  /** Qualified namespace string (e.g., 'cdm.base.math'). */
  namespace: string;
  /** Input parameters in declaration order. */
  inputs: RuneFuncParam[];
  /** The single output parameter. */
  output: RuneFuncParam;
  /** Name of the parent func if `extends` was used (superFunction). */
  superFunc?: string;
  /** Alias (shortcut) declarations in declaration order. */
  aliases: RuneFuncAlias[];
  /** Body assignments (set/add) in declaration order. */
  assignments: RuneFuncAssignment[];
  /** Pre-condition AST nodes (Condition[] from RosettaFunction.conditions). */
  preConditions: unknown[];
  /** Post-condition AST nodes (Condition[] from RosettaFunction.postConditions). */
  postConditions: unknown[];
  /** True when no set/add assignments exist (abstract func — FR-032). */
  isAbstract: boolean;
}

/**
 * Extended transpiler context for a single func body emission pass.
 * Extends ExpressionTranspilerContext with function-specific state.
 * §13 per data-model.md.
 */
export interface FuncBodyContext extends ExpressionTranspilerContext {
  /** The RuneFunc being transpiled. */
  currentFunc: RuneFunc;
  /**
   * 'scalar' when output upper bound is 1 → `let result: T`
   * 'array'  when output is unbounded   → `const result: T[] = []`
   */
  outputAccumulator: 'scalar' | 'array';
  /**
   * Maps alias declared name → emitted local variable name.
   * Populated before body emission; suffixed with `_alias` when the alias
   * name shadows an input parameter.
   */
  aliasBindings: Map<string, string>;
  /**
   * Full call graph for the namespace: funcName → Set<funcName>.
   * Shared across all FuncBodyContext instances for the same namespace.
   */
  callGraph: Map<string, Set<string>>;
}

// ---------------------------------------------------------------------------
// T119 — Call-graph construction
// ---------------------------------------------------------------------------

/**
 * Walk a Rune expression AST node recursively, looking for symbol references
 * that resolve to RosettaFunction nodes (function calls in the body).
 * Populates the callees set with any callee func names found.
 *
 * The Langium AST encodes a function call as a RosettaSymbolReference whose
 * symbol.ref.$type === 'RosettaFunction', or as a RosettaFeatureCall whose
 * feature.ref is a RosettaFunction. We walk all recursive sub-expressions
 * to find them.
 *
 * The `visited` WeakSet breaks cycles that occur when cross-reference `.ref`
 * objects point back into the broader AST graph (e.g. via `$container` chains
 * in large CDM namespaces). Without this guard the generic walker can produce
 * a stack overflow on deeply interconnected models.
 *
 * T119.
 */
function collectCallees(
  expr: unknown,
  callees: Set<string>,
  visited: WeakSet<object> = new WeakSet()
): void {
  if (!expr || typeof expr !== 'object') return;
  if (visited.has(expr as object)) return;
  visited.add(expr as object);

  const node = expr as Record<string, unknown>;

  // Direct symbol reference to a function
  if (node['$type'] === 'RosettaSymbolReference') {
    const sym = node['symbol'] as Record<string, unknown> | undefined;
    if (sym) {
      const ref = sym['ref'] as Record<string, unknown> | undefined;
      if (ref && ref['$type'] === 'RosettaFunction') {
        const name = ref['name'] as string | undefined;
        if (name) callees.add(name);
      }
    }
    return;
  }

  // Feature call that might be a function call
  if (node['$type'] === 'RosettaFeatureCall' || node['$type'] === 'RosettaDeepFeatureCall') {
    const feature = node['feature'] as Record<string, unknown> | undefined;
    if (feature) {
      const ref = feature['ref'] as Record<string, unknown> | undefined;
      if (ref && ref['$type'] === 'RosettaFunction') {
        const name = ref['name'] as string | undefined;
        if (name) callees.add(name);
      }
    }
    // Also recurse into receiver
    collectCallees(node['receiver'], callees, visited);
    return;
  }

  // Constructor expression: only walk value expressions, not typeRef/key cross-references.
  // Walking typeRef or ConstructorKeyValuePair.key causes infinite recursion into the type AST.
  if (node['$type'] === 'RosettaConstructorExpression') {
    const values = node['values'];
    if (Array.isArray(values)) {
      for (const kv of values) {
        const kvNode = kv as Record<string, unknown>;
        collectCallees(kvNode['value'], callees, visited);
      }
    }
    return;
  }

  // Recursively walk all child properties that might contain expressions
  for (const key of Object.keys(node)) {
    if (key.startsWith('$') || key === 'symbol' || key === 'assignRoot') continue;
    const child = node[key];
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          collectCallees(item, callees, visited);
        }
      } else {
        collectCallees(child, callees, visited);
      }
    }
  }
}

/**
 * Build a call-graph adjacency map for a set of RuneFunc declarations.
 * Returns: funcName → Set<funcName> of callees.
 * Direct self-calls (recursion) are included.
 *
 * T119.
 */
export function buildFuncCallGraph(funcs: RuneFunc[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const funcNames = new Set(funcs.map((f) => f.name));

  for (const func of funcs) {
    const callees = new Set<string>();

    // Walk assignments
    for (const assignment of func.assignments) {
      collectCallees(assignment.exprNode, callees);
    }
    // Walk aliases
    for (const alias of func.aliases) {
      collectCallees(alias.exprNode, callees);
    }

    // Only track calls to known funcs in the same namespace
    const filteredCallees = new Set<string>();
    for (const callee of callees) {
      if (funcNames.has(callee)) {
        filteredCallees.add(callee);
      }
    }

    graph.set(func.name, filteredCallees);
  }

  return graph;
}

/**
 * Determine which funcs are in a cyclic SCC (strongly-connected component).
 * A func is cyclic if it is reachable from itself in the call graph.
 * Uses a simple reachability approach (DFS).
 *
 * T119, FR-030.
 */
export function findCyclicFuncs(callGraph: Map<string, Set<string>>): Set<string> {
  const cyclic = new Set<string>();

  function isReachable(from: string, target: string, visited: Set<string>): boolean {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    for (const callee of callGraph.get(from) ?? []) {
      if (isReachable(callee, target, visited)) return true;
    }
    return false;
  }

  for (const [func] of callGraph) {
    const callees = callGraph.get(func) ?? new Set();
    for (const callee of callees) {
      // If callee can reach func, they're in a cycle
      if (isReachable(callee, func, new Set())) {
        cyclic.add(func);
        cyclic.add(callee);
      }
    }
  }

  return cyclic;
}

/**
 * Topologically sort funcs using Kahn's algorithm, mirroring topoSort() for types.
 * Cyclic funcs (mutual recursion / self-recursion) are appended at the end
 * in stable (source-declaration) order so they can be emitted as hoisted
 * `function` declarations (FR-030).
 *
 * T118.
 */
export function topoSortFuncs(funcs: RuneFunc[], callGraph: Map<string, Set<string>>): RuneFunc[] {
  const cyclicNames = findCyclicFuncs(callGraph);

  const dacFuncs = funcs.filter((f) => !cyclicNames.has(f.name));
  const cyclicFuncs = funcs.filter((f) => cyclicNames.has(f.name));

  // Build in-degree and reversed adjacency for non-cyclic funcs
  const inDegree = new Map<string, number>();
  const reversedAdj = new Map<string, string[]>();

  for (const func of dacFuncs) {
    inDegree.set(func.name, 0);
    reversedAdj.set(func.name, []);
  }

  const dacNames = new Set(dacFuncs.map((f) => f.name));

  for (const func of dacFuncs) {
    const callees = callGraph.get(func.name) ?? new Set();
    for (const callee of callees) {
      if (!dacNames.has(callee)) continue;
      // func depends on callee → func must come after callee
      inDegree.set(func.name, (inDegree.get(func.name) ?? 0) + 1);
      reversedAdj.get(callee)!.push(func.name);
    }
  }

  // Seed queue with in-degree 0 in original declaration order
  const queue: string[] = [];
  for (const func of dacFuncs) {
    if ((inDegree.get(func.name) ?? 0) === 0) {
      queue.push(func.name);
    }
  }

  const sortedNames: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    sortedNames.push(name);
    for (const dependent of reversedAdj.get(name) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) {
        queue.push(dependent);
      }
    }
  }

  // Defensive: any DAC funcs not covered (shouldn't happen)
  for (const func of dacFuncs) {
    if (!sortedNames.includes(func.name)) {
      sortedNames.push(func.name);
    }
  }

  // Reconstruct in sorted order
  const nameToFunc = new Map(funcs.map((f) => [f.name, f]));
  const result: RuneFunc[] = [];
  for (const name of sortedNames) {
    const func = nameToFunc.get(name);
    if (func) result.push(func);
  }
  // Append cyclic funcs in original declaration order
  for (const func of cyclicFuncs) {
    result.push(func);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extraction helpers (used by ts-emitter.ts)
// ---------------------------------------------------------------------------

/**
 * Maps a Rune built-in type name to a TypeScript type name.
 */
const TS_FUNC_TYPE_MAP: Record<string, string> = {
  string: 'string',
  int: 'number',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  dateTime: 'string',
  zonedDateTime: 'string',
  time: 'string',
  productType: 'string',
  eventType: 'string'
};

/**
 * Resolve a Rune type name to a TypeScript type name.
 */
export function resolveFuncTypeTs(typeName: string): string {
  return TS_FUNC_TYPE_MAP[typeName] ?? typeName;
}

/**
 * Build a RuneFuncParam from a Langium Attribute node.
 */
function extractParam(attr: {
  name: string;
  typeCall?: { type?: { $refText?: string; ref?: { name?: string } } };
  card?: { inf?: number; sup?: number; unbounded?: boolean };
}): RuneFuncParam {
  const typeName = attr.typeCall?.type?.$refText ?? attr.typeCall?.type?.ref?.name ?? 'unknown';
  const card = attr.card;
  const lower = card?.inf ?? 1;
  const upper: number | null = card?.unbounded ? null : (card?.sup ?? lower);
  return { name: attr.name, typeName, cardinality: { lower, upper } };
}

/**
 * Extract all RosettaFunction elements from Langium documents as RuneFunc records.
 * Called by the TS emitter before func emission.
 *
 * @param docs - Langium documents for a namespace.
 * @param namespace - The namespace string.
 * @param diagnostics - Diagnostics accumulator.
 */
export function extractFuncs(
  docs: { parseResult?: { value?: unknown } }[],
  namespace: string,
  diagnostics: GeneratorDiagnostic[]
): RuneFunc[] {
  const funcs: RuneFunc[] = [];

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || typeof model !== 'object') continue;
    const modelNode = model as Record<string, unknown>;
    const elements = modelNode['elements'];
    if (!Array.isArray(elements)) continue;

    for (const el of elements) {
      if (!el || typeof el !== 'object') continue;
      const node = el as Record<string, unknown>;
      if (node['$type'] !== 'RosettaFunction') continue;

      const name = node['name'] as string;
      if (!name) continue;

      // Extract inputs
      const inputs: RuneFuncParam[] = [];
      const inputNodes = node['inputs'] as unknown[] | undefined;
      if (Array.isArray(inputNodes)) {
        for (const inp of inputNodes) {
          inputs.push(extractParam(inp as Parameters<typeof extractParam>[0]));
        }
      }

      // Extract output
      const outputNode = node['output'] as Parameters<typeof extractParam>[0] | undefined;
      let output: RuneFuncParam;
      if (outputNode) {
        output = extractParam(outputNode);
      } else {
        // No explicit output — emit diagnostic and use a placeholder
        diagnostics.push({
          severity: 'warning',
          code: 'func-no-output',
          message: `Func '${name}' in namespace '${namespace}' has no output declaration`
        });
        output = { name: 'result', typeName: 'unknown', cardinality: { lower: 1, upper: 1 } };
      }

      // Extract superFunc
      const superFunctionRef = node['superFunction'] as
        | { $refText?: string; ref?: { name?: string } }
        | undefined;
      const superFunc = superFunctionRef?.$refText ?? superFunctionRef?.ref?.name ?? undefined;

      // Extract shortcuts (aliases)
      const aliases: RuneFuncAlias[] = [];
      const shortcutNodes = node['shortcuts'] as unknown[] | undefined;
      if (Array.isArray(shortcutNodes)) {
        for (const sc of shortcutNodes) {
          const scNode = sc as Record<string, unknown>;
          aliases.push({
            name: scNode['name'] as string,
            exprNode: scNode['expression']
          });
        }
      }

      // Extract operations (set/add assignments)
      const assignments: RuneFuncAssignment[] = [];
      const operationNodes = node['operations'] as unknown[] | undefined;
      if (Array.isArray(operationNodes)) {
        for (const op of operationNodes) {
          const opNode = op as Record<string, unknown>;
          assignments.push({
            kind: opNode['add'] === true ? 'add' : 'set',
            exprNode: opNode['expression']
          });
        }
      }

      // Extract pre/post conditions
      const preCondNodes = node['conditions'] as unknown[] | undefined;
      const postCondNodes = node['postConditions'] as unknown[] | undefined;

      const preConditions: unknown[] = Array.isArray(preCondNodes) ? preCondNodes : [];
      const postConditions: unknown[] = Array.isArray(postCondNodes) ? postCondNodes : [];

      const isAbstract = assignments.length === 0;

      funcs.push({
        name,
        namespace,
        inputs,
        output,
        superFunc,
        aliases,
        assignments,
        preConditions,
        postConditions,
        isAbstract
      });
    }
  }

  return funcs;
}
