// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Expression transpiler for Rune condition blocks.
 *
 * Phase 4 covers: one-of, choice, exists, is absent, only exists.
 * Phase 5 adds the full expression-language transpiler (T067–T075):
 *   literals, navigation, arithmetic, comparison, boolean, set-ops,
 *   aggregations, higher-order (filter/map), and conditional (if/then/else).
 *
 * T052–T054 (Phase 4), T067–T075 (Phase 5).
 * FR-010 (refine vs superRefine), FR-012 (all expression forms),
 * FR-013 (optional chaining for navigation), FR-014 (error messages),
 * FR-025 (unknown attr), SC-003 (≥99% Python parity).
 *
 * Operator-precedence table from:
 *   packages/visual-editor/src/adapters/expression-node-to-dsl.ts
 * Copied verbatim to avoid drift.
 */

import {
  isOneOfOperation,
  isChoiceOperation,
  isRosettaExistsExpression,
  isRosettaAbsentExpression,
  isRosettaOnlyExistsExpression,
  isRosettaSymbolReference,
  isArithmeticOperation,
  isComparisonOperation,
  isEqualityOperation,
  isLogicalOperation,
  isRosettaContainsExpression,
  isRosettaDisjointExpression,
  isRosettaCountOperation,
  isDistinctOperation,
  isFilterOperation,
  isFirstOperation,
  isFlattenOperation,
  isLastOperation,
  isMapOperation,
  isMaxOperation,
  isMinOperation,
  isReverseOperation,
  isSortOperation,
  isSumOperation,
  isRosettaFeatureCall,
  isRosettaDeepFeatureCall,
  isRosettaConditionalExpression,
  isRosettaBooleanLiteral,
  isRosettaIntLiteral,
  isRosettaNumberLiteral,
  isRosettaStringLiteral,
  isRosettaImplicitVariable,
  type Condition,
  type RosettaExpression
} from '@rune-langium/core';
import type { GeneratorDiagnostic } from '../types.js';

// ---------------------------------------------------------------------------
// Operator precedence table — copied from expression-node-to-dsl.ts (prior art).
// Lower number = lower precedence = binds less tightly.
// ---------------------------------------------------------------------------
const PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  '=': 3,
  '<>': 3,
  contains: 3,
  disjoint: 3,
  default: 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6
};

/**
 * Context passed to the expression transpiler for a single condition block.
 * Not exposed in the public API. Per data-model §7.
 */
export interface ExpressionTranspilerContext {
  /**
   * The name of the `this` value in the emitted predicate.
   * In superRefine mode: `data` (the `.superRefine((data, ctx) =>` parameter).
   * In refine mode: `data` (the `.refine((data) =>` parameter).
   * In ts-method mode: `this` (the class instance).
   */
  selfName: string;
  /**
   * How to emit errors.
   * 'zod-refine': predicate returns a boolean.
   * 'zod-superRefine': predicate calls ctx.addIssue({...}).
   * 'ts-method': predicate pushes to a local `errors` array (no Zod dependency).
   */
  emitMode: 'zod-refine' | 'zod-superRefine' | 'ts-method';
  /**
   * The name of the condition being transpiled (for error messages).
   */
  conditionName: string;
  /**
   * The type name the condition is attached to (for error messages).
   */
  typeName: string;
  /**
   * Map of attribute names to their type strings (for existence checks).
   * Derived from the parent Data node's attribute list.
   */
  attributeTypes: Map<string, string>;
  /**
   * Accumulated diagnostics (mutated by the transpiler).
   */
  diagnostics: GeneratorDiagnostic[];
  /**
   * Optional map of local variable bindings (e.g., alias name → emitted TS variable name).
   * When a RosettaSymbolReference or other name lookup finds a key in this map,
   * the emitted name is the mapped value rather than `${selfName}.${name}`.
   * Used by Phase 8b func body emission to resolve alias references correctly.
   */
  localBindings?: Map<string, string>;
}

/**
 * Extract the attribute name from a RosettaSymbolReference argument.
 * Returns undefined if the argument is not a symbol reference.
 */
function extractAttrName(argument: RosettaExpression | undefined): string | undefined {
  if (!argument) return undefined;
  if (isRosettaSymbolReference(argument)) {
    return argument.symbol?.$refText ?? argument.symbol?.ref?.name;
  }
  return undefined;
}

/**
 * Validate that an attribute name exists in the context.
 * If not, emit a diagnostic and return false.
 * FR-025.
 */
function validateAttr(attrName: string, ctx: ExpressionTranspilerContext): boolean {
  if (!ctx.attributeTypes.has(attrName)) {
    ctx.diagnostics.push({
      severity: 'error',
      code: 'unknown-attribute',
      message: `Condition '${ctx.conditionName}' on type '${ctx.typeName}' references unknown attribute '${attrName}'`
    });
    return false;
  }
  return true;
}

/**
 * Emit a one-of predicate.
 * Handles: OneOfOperation with argument being a ListLiteral (multiple attrs)
 * or a single SymbolReference (single attr — treated as one-of with just that attr).
 *
 * T053.
 */
export function emitOneOf(attrNames: string[], ctx: ExpressionTranspilerContext): string {
  const dataRef = ctx.selfName;
  const attrList = attrNames.map((n) => `${dataRef}.${n}`).join(', ');
  const message = `${ctx.conditionName}: exactly one of [${attrNames.join(', ')}] must be present in ${ctx.typeName}`;

  if (ctx.emitMode === 'zod-refine') {
    return `runeCheckOneOf([${attrList}])`;
  }

  if (ctx.emitMode === 'ts-method') {
    return [`if (!runeCheckOneOf([${attrList}])) {`, `  errors.push('${message}');`, `}`].join(
      '\n'
    );
  }

  // superRefine mode
  return [
    `if (!runeCheckOneOf([${attrList}])) {`,
    `  ctx.addIssue({`,
    `    code: 'custom',`,
    `    message: '${message}',`,
    `    path: ['${ctx.conditionName}']`,
    `  });`,
    `}`
  ].join('\n');
}

/**
 * Emit a choice predicate (same semantics as one-of: exactly one present).
 * Uses runeCheckOneOf on the listed attribute refs.
 *
 * T053.
 */
export function emitChoice(attrNames: string[], ctx: ExpressionTranspilerContext): string {
  const dataRef = ctx.selfName;
  const attrList = attrNames.map((n) => `${dataRef}.${n}`).join(', ');
  const message = `${ctx.conditionName}: exactly one of [${attrNames.join(', ')}] must be present in ${ctx.typeName}`;

  if (ctx.emitMode === 'zod-refine') {
    return `runeCheckOneOf([${attrList}])`;
  }

  if (ctx.emitMode === 'ts-method') {
    return [`if (!runeCheckOneOf([${attrList}])) {`, `  errors.push('${message}');`, `}`].join(
      '\n'
    );
  }

  // superRefine mode
  return [
    `if (!runeCheckOneOf([${attrList}])) {`,
    `  ctx.addIssue({`,
    `    code: 'custom',`,
    `    message: '${message}',`,
    `    path: ['${ctx.conditionName}']`,
    `  });`,
    `}`
  ].join('\n');
}

/**
 * Emit an exists predicate.
 * T054.
 */
export function emitExists(attrName: string, ctx: ExpressionTranspilerContext): string {
  if (!validateAttr(attrName, ctx)) {
    return `/* DIAGNOSTIC: unknown attribute "${attrName}" */`;
  }

  const dataRef = ctx.selfName;
  const message = `${ctx.conditionName}: ${attrName} must be present in ${ctx.typeName}`;

  if (ctx.emitMode === 'zod-refine') {
    return `runeAttrExists(${dataRef}.${attrName})`;
  }

  if (ctx.emitMode === 'ts-method') {
    return [
      `if (!runeAttrExists(${dataRef}.${attrName})) {`,
      `  errors.push('${message}');`,
      `}`
    ].join('\n');
  }

  // superRefine mode
  return [
    `if (!runeAttrExists(${dataRef}.${attrName})) {`,
    `  ctx.addIssue({`,
    `    code: 'custom',`,
    `    message: '${message}',`,
    `    path: ['${ctx.conditionName}']`,
    `  });`,
    `}`
  ].join('\n');
}

/**
 * Emit an is-absent predicate.
 * T054.
 */
export function emitIsAbsent(attrName: string, ctx: ExpressionTranspilerContext): string {
  if (!validateAttr(attrName, ctx)) {
    return `/* DIAGNOSTIC: unknown attribute "${attrName}" */`;
  }

  const dataRef = ctx.selfName;
  const message = `${ctx.conditionName}: ${attrName} must be absent in ${ctx.typeName}`;

  if (ctx.emitMode === 'zod-refine') {
    return `!runeAttrExists(${dataRef}.${attrName})`;
  }

  if (ctx.emitMode === 'ts-method') {
    return [
      `if (runeAttrExists(${dataRef}.${attrName})) {`,
      `  errors.push('${message}');`,
      `}`
    ].join('\n');
  }

  // superRefine mode
  return [
    `if (runeAttrExists(${dataRef}.${attrName})) {`,
    `  ctx.addIssue({`,
    `    code: 'custom',`,
    `    message: '${message}',`,
    `    path: ['${ctx.conditionName}']`,
    `  });`,
    `}`
  ].join('\n');
}

/**
 * Emit an only-exists predicate.
 * Semantics: all attributes NOT in attrNames must be absent.
 * T054.
 */
export function emitOnlyExists(
  allowedAttrNames: string[],
  ctx: ExpressionTranspilerContext
): string {
  // Validate all allowed attrs exist on the type
  for (const name of allowedAttrNames) {
    validateAttr(name, ctx);
  }

  // Find all attributes on the type that are NOT in the allowed list
  const forbiddenAttrs = Array.from(ctx.attributeTypes.keys()).filter(
    (name) => !allowedAttrNames.includes(name)
  );

  const dataRef = ctx.selfName;
  const message = `${ctx.conditionName}: only [${allowedAttrNames.join(', ')}] may exist in ${ctx.typeName}`;

  if (ctx.emitMode === 'zod-refine') {
    if (forbiddenAttrs.length === 0) {
      return 'true';
    }
    if (forbiddenAttrs.length === 1) {
      return `!runeAttrExists(${dataRef}.${forbiddenAttrs[0]})`;
    }
    return forbiddenAttrs.map((n) => `!runeAttrExists(${dataRef}.${n})`).join(' && ');
  }

  if (ctx.emitMode === 'ts-method') {
    if (forbiddenAttrs.length === 0) {
      return '// only-exists: no forbidden attributes';
    }
    const checks = forbiddenAttrs.map((n) =>
      [`if (runeAttrExists(${dataRef}.${n})) {`, `  errors.push('${message}');`, `}`].join('\n')
    );
    return checks.join('\n');
  }

  // superRefine mode — emit one addIssue block per forbidden attr
  if (forbiddenAttrs.length === 0) {
    return '// only-exists: no forbidden attributes';
  }
  const checks = forbiddenAttrs.map((n) =>
    [
      `if (runeAttrExists(${dataRef}.${n})) {`,
      `  ctx.addIssue({`,
      `    code: 'custom',`,
      `    message: '${message}',`,
      `    path: ['${ctx.conditionName}']`,
      `  });`,
      `}`
    ].join('\n')
  );
  return checks.join('\n');
}

/**
 * Build the descriptive error message for a condition.
 * Used by emitConditionBlock for the `.refine()` message argument.
 */
export function buildConditionMessage(cond: Condition, ctx: ExpressionTranspilerContext): string {
  const expr = cond.expression;
  if (!expr) return `${ctx.conditionName} failed`;

  if (isOneOfOperation(expr)) {
    const arg = expr.argument;
    let names: string[];
    if (!arg) {
      names = Array.from(ctx.attributeTypes.keys());
    } else {
      const listLiteral = arg as {
        $type?: string;
        elements?: Array<RosettaExpression>;
      };
      if (listLiteral.$type === 'ListLiteral' && Array.isArray(listLiteral.elements)) {
        names = listLiteral.elements
          .map((e) => extractAttrName(e))
          .filter((n): n is string => n !== undefined);
      } else {
        const name = extractAttrName(arg);
        names = name ? [name] : [];
      }
    }
    return `${ctx.conditionName}: exactly one of [${names.join(', ')}] must be present in ${ctx.typeName}`;
  }

  if (isChoiceOperation(expr)) {
    const attrNames = (expr.attributes ?? [])
      .map((ref) => ref.$refText ?? ref.ref?.name)
      .filter((n): n is string => n !== undefined);
    return `${ctx.conditionName}: exactly one of [${attrNames.join(', ')}] must be present in ${ctx.typeName}`;
  }

  if (isRosettaExistsExpression(expr)) {
    const name = extractAttrName(expr.argument);
    if (name !== undefined) {
      return `${ctx.conditionName}: ${name} must be present in ${ctx.typeName}`;
    }
    // Complex argument (navigation, filter, etc.) — fall through to default
  }

  if (isRosettaAbsentExpression(expr)) {
    const name = extractAttrName(expr.argument);
    if (name !== undefined) {
      return `${ctx.conditionName}: ${name} must be absent in ${ctx.typeName}`;
    }
    // Complex argument — fall through to default
  }

  if (isRosettaOnlyExistsExpression(expr)) {
    const arg = expr.argument as
      | {
          $type?: string;
          elements?: Array<RosettaExpression>;
        }
      | undefined;
    let names: string[] = [];
    if (arg && arg.$type === 'ListLiteral' && Array.isArray(arg.elements)) {
      names = arg.elements
        .map((e) => extractAttrName(e))
        .filter((n): n is string => n !== undefined);
    }
    return `${ctx.conditionName}: only [${names.join(', ')}] may exist in ${ctx.typeName}`;
  }

  return `${ctx.conditionName}: condition failed in ${ctx.typeName}`;
}

/**
 * Dispatcher: transpile a single Condition AST node into a JS predicate string.
 * Routes to the appropriate emitter based on the expression type.
 *
 * T052.
 */
export function transpileCondition(cond: Condition, ctx: ExpressionTranspilerContext): string {
  const expr = cond.expression;

  if (!expr) {
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'empty-condition',
      message: `Condition '${ctx.conditionName}' on type '${ctx.typeName}' has no expression`
    });
    return ctx.emitMode === 'zod-refine' ? 'true' : '// empty condition';
  }

  // one-of: `[a, b, c] one-of` → OneOfOperation with argument = ListLiteral
  if (isOneOfOperation(expr)) {
    const arg = expr.argument;
    if (!arg) {
      // Type-level one-of (no explicit argument): apply to all attrs
      const allAttrs = Array.from(ctx.attributeTypes.keys());
      return emitOneOf(allAttrs, ctx);
    }
    // arg is a ListLiteral
    const listLiteral = arg as {
      $type?: string;
      elements?: Array<RosettaExpression>;
    };
    if (listLiteral.$type === 'ListLiteral' && Array.isArray(listLiteral.elements)) {
      const names = listLiteral.elements
        .map((e) => extractAttrName(e))
        .filter((n): n is string => n !== undefined);
      // Validate each attr name
      for (const name of names) {
        validateAttr(name, ctx);
      }
      return emitOneOf(names, ctx);
    }
    // Single symbol reference
    const name = extractAttrName(arg);
    if (name) {
      validateAttr(name, ctx);
      return emitOneOf([name], ctx);
    }
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unsupported-condition',
      message: `one-of argument type '${arg.$type}' is not supported`
    });
    return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported one-of';
  }

  // choice: `required choice a, b, c` → ChoiceOperation with attributes list
  if (isChoiceOperation(expr)) {
    const attrNames = (expr.attributes ?? [])
      .map((ref) => ref.$refText ?? ref.ref?.name)
      .filter((n): n is string => n !== undefined);
    for (const name of attrNames) {
      validateAttr(name, ctx);
    }
    return emitChoice(attrNames, ctx);
  }

  // exists: `a exists` → RosettaExistsExpression
  if (isRosettaExistsExpression(expr)) {
    const name = extractAttrName(expr.argument);
    if (name) {
      // Simple direct attribute reference — use Phase 4 handler
      return emitExists(name, ctx);
    }
    // Phase 5: argument is a navigation chain or other expression
    // → transpile to boolean expression and wrap for mode
    if (expr.argument) {
      const boolExpr = `runeAttrExists(${transpileExpression(expr.argument, ctx)})`;
      return wrapBoolExprForMode(boolExpr, ctx);
    }
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unsupported-condition',
      message: `exists condition in '${ctx.conditionName}' has no attribute reference`
    });
    return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported exists';
  }

  // is absent: `a is absent` → RosettaAbsentExpression
  if (isRosettaAbsentExpression(expr)) {
    const name = extractAttrName(expr.argument);
    if (name) {
      // Simple direct attribute reference — use Phase 4 handler
      return emitIsAbsent(name, ctx);
    }
    // Phase 5: argument is a navigation chain or other expression
    if (expr.argument) {
      const boolExpr = `!runeAttrExists(${transpileExpression(expr.argument, ctx)})`;
      return wrapBoolExprForMode(boolExpr, ctx);
    }
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unsupported-condition',
      message: `is-absent condition in '${ctx.conditionName}' has no attribute reference`
    });
    return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported is-absent';
  }

  // only exists: `[a, b] only exists` → RosettaOnlyExistsExpression
  if (isRosettaOnlyExistsExpression(expr)) {
    const arg = expr.argument;
    if (!arg) {
      ctx.diagnostics.push({
        severity: 'warning',
        code: 'unsupported-condition',
        message: `only-exists condition in '${ctx.conditionName}' has no list argument`
      });
      return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported only-exists';
    }
    const listLiteral = arg as {
      $type?: string;
      elements?: Array<RosettaExpression>;
    };
    if (listLiteral.$type === 'ListLiteral' && Array.isArray(listLiteral.elements)) {
      const names = listLiteral.elements
        .map((e) => extractAttrName(e))
        .filter((n): n is string => n !== undefined);
      return emitOnlyExists(names, ctx);
    }
    // Single attr
    const name = extractAttrName(arg);
    if (name) {
      return emitOnlyExists([name], ctx);
    }
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unsupported-condition',
      message: `only-exists list in '${ctx.conditionName}' is not a list literal`
    });
    return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported only-exists';
  }

  // Phase 5: delegate to full expression transpiler for all other expression types.
  // transpileExpression returns a boolean JS expression string.
  const boolExpr = transpileExpression(expr, ctx);
  return wrapBoolExprForMode(boolExpr, ctx);
}

/**
 * Return true if `expr` is a bare function call with no top-level binary operators.
 * Used to decide whether `!expr` is safe (no redundant parens) vs `!(expr)` required.
 *
 * Examples:
 *   "runeAttrExists(x)"                 → true  → !runeAttrExists(x)
 *   "runeAttrExists(x) || something"    → false → !(runeAttrExists(x) || something)
 *   "runeCount(x) > 0"                  → false → !(runeCount(x) > 0)
 */
function isSimpleFuncCall(expr: string): boolean {
  // Walk the string, track paren/bracket depth.
  // If we find a top-level binary operator, it's not a simple call.
  let depth = 0;
  let inCall = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(' || ch === '[') {
      if (depth === 0 && i > 0) inCall = true;
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (depth === 0) {
      // Top-level character — any space indicates a binary operator follows
      if (ch === ' ') return false;
    }
  }
  // Must start with an identifier and end with ) to be a function call
  return inCall && depth === 0 && /^\w/.test(expr) && expr.endsWith(')');
}

/**
 * Wrap a boolean JS expression string for the current emit mode.
 *
 * In zod-refine mode: return the expression as-is (used as predicate).
 * In zod-superRefine mode: wrap in an if(!expr) { ctx.addIssue({...}) } block.
 *
 * T074.
 */
function wrapBoolExprForMode(boolExpr: string, ctx: ExpressionTranspilerContext): string {
  if (ctx.emitMode === 'zod-refine') {
    return boolExpr;
  }

  const message = `${ctx.conditionName}: condition failed in ${ctx.typeName}`;
  const negation = isSimpleFuncCall(boolExpr) ? `!${boolExpr}` : `!(${boolExpr})`;

  if (ctx.emitMode === 'ts-method') {
    return [`if (${negation}) {`, `  errors.push('${message}');`, `}`].join('\n');
  }

  // superRefine mode
  // Omit redundant parens when the expression is a single function call with
  // no top-level binary operators — matching oxfmt's no-redundant-parens style.
  // Use !(expr) for binary/comparison/logical expressions to preserve semantics.
  return [
    `if (${negation}) {`,
    `  ctx.addIssue({`,
    `    code: 'custom',`,
    `    message: '${message}',`,
    `    path: ['${ctx.conditionName}']`,
    `  });`,
    `}`
  ].join('\n');
}

// ============================================================================
// Phase 5 — Full expression transpiler (T067–T075)
// ============================================================================

/**
 * T067: Transpile literal expressions to JS literal equivalents.
 *
 * RosettaBooleanLiteral → true / false
 * RosettaIntLiteral     → <number> (BigInt → Number conversion)
 * RosettaNumberLiteral  → <number>
 * RosettaStringLiteral  → '<escaped-string>'
 */
export function transpileLiteral(
  expr: RosettaExpression,
  _ctx: ExpressionTranspilerContext
): string {
  if (isRosettaBooleanLiteral(expr)) {
    return expr.value ? 'true' : 'false';
  }
  if (isRosettaIntLiteral(expr)) {
    // BigInt → number (generator uses number literals in JS output)
    return String(Number(expr.value));
  }
  if (isRosettaNumberLiteral(expr)) {
    return String(expr.value);
  }
  if (isRosettaStringLiteral(expr)) {
    // JSON-escape and use single quotes
    const escaped = expr.value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `'${escaped}'`;
  }
  return 'undefined /* unknown literal */';
}

/**
 * T068: Transpile navigation chains (a -> b -> c) to optional-chain JS.
 *
 * RosettaFeatureCall { receiver, feature } → receiver?.feature
 * RosettaDeepFeatureCall { receiver, feature } → receiver?.feature  (deep is flat here)
 *
 * Uses ctx.selfName as the root binding (default 'data').
 * FR-013: optional chaining for path navigation.
 */
export function transpileNavigation(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  if (isRosettaFeatureCall(expr)) {
    const receiver = transpileExpression(expr.receiver, ctx);
    // RosettaFeature includes ChoiceOption which may not have a name field;
    // use $refText (the cross-reference text) as the feature name.
    const feature = expr.feature?.$refText ?? (expr.feature?.ref as { name?: string })?.name ?? '?';
    return `${receiver}?.${feature}`;
  }
  if (isRosettaDeepFeatureCall(expr)) {
    const receiver = transpileExpression(expr.receiver, ctx);
    const feature = expr.feature?.$refText ?? (expr.feature?.ref as { name?: string })?.name ?? '?';
    return `${receiver}?.${feature}`;
  }
  // Fallback
  return transpileExpression(expr, ctx);
}

/**
 * T069: Transpile arithmetic operations (+, -, *, /).
 * Returns a JS infix expression string.
 *
 * Operator mapping: + → +, - → -, * → *, / → /
 */
export function transpileArithmetic(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  if (!isArithmeticOperation(expr)) {
    return 'undefined /* not ArithmeticOperation */';
  }
  const left = transpileWithPrecedence(expr.left, expr.operator, ctx, 'left');
  const right = transpileWithPrecedence(expr.right, expr.operator, ctx, 'right');
  return `${left} ${expr.operator} ${right}`;
}

/**
 * T069: Transpile comparison operations (<, <=, >, >=) and equality (=, <>).
 * Returns a JS boolean expression string.
 *
 * Operator mapping: = → ===, <> → !==, <, <=, >, >= → direct.
 */
export function transpileComparison(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  if (isEqualityOperation(expr)) {
    const jsOp = expr.operator === '=' ? '===' : '!==';
    const left = expr.left
      ? transpileWithPrecedence(expr.left, expr.operator, ctx, 'left')
      : ctx.selfName;
    const right = transpileWithPrecedence(expr.right, expr.operator, ctx, 'right');
    return `${left} ${jsOp} ${right}`;
  }
  if (isComparisonOperation(expr)) {
    const left = expr.left
      ? transpileWithPrecedence(expr.left, expr.operator, ctx, 'left')
      : ctx.selfName;
    const right = transpileWithPrecedence(expr.right, expr.operator, ctx, 'right');
    return `${left} ${expr.operator} ${right}`;
  }
  return 'undefined /* not a comparison */';
}

/**
 * T070: Transpile boolean logical operations (and → &&, or → ||).
 * Parenthesizes children when child precedence is lower than parent.
 */
export function transpileBoolean(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  if (!isLogicalOperation(expr)) {
    return 'undefined /* not LogicalOperation */';
  }
  const jsOp = expr.operator === 'and' ? '&&' : '||';
  const left = transpileWithPrecedence(expr.left, expr.operator, ctx, 'left');
  const right = transpileWithPrecedence(expr.right, expr.operator, ctx, 'right');
  return `${left} ${jsOp} ${right}`;
}

/**
 * T071: Transpile set operations.
 *
 * contains: (left ?? []).includes(right)
 * disjoint: !(left ?? []).some(v => (right ?? []).includes(v))
 */
export function transpileSetOps(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (isRosettaContainsExpression(expr)) {
    const right = transpileExpression(expr.right, ctx);
    const left = expr.left ? transpileExpression(expr.left, ctx) : `(${ctx.selfName} ?? [])`;
    return `(${left} ?? []).includes(${right})`;
  }
  if (isRosettaDisjointExpression(expr)) {
    const right = transpileExpression(expr.right, ctx);
    const left = expr.left ? transpileExpression(expr.left, ctx) : `(${ctx.selfName} ?? [])`;
    return `!(${left} ?? []).some((v) => (${right} ?? []).includes(v))`;
  }
  return 'undefined /* not a set-op */';
}

/**
 * T072: Transpile aggregation operations.
 * Each operation handles null/undefined gracefully.
 *
 * count    → runeCount(arr)
 * sum      → (arr ?? []).reduce((a, b) => a + b, 0)
 * min      → Math.min(...(arr ?? []))
 * max      → Math.max(...(arr ?? []))
 * sort     → [...(arr ?? [])].sort()
 * distinct → [...new Set(arr ?? [])]
 * first    → (arr ?? [])[0]
 * last     → (arr ?? []).at(-1)
 * flatten  → (arr ?? []).flat()
 * reverse  → [...(arr ?? [])].reverse()
 */
export function transpileAggregation(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  // Helper: get the argument expression (or ctx.selfName if no argument)
  const getArg = (arg: RosettaExpression | undefined): string =>
    arg ? transpileExpression(arg, ctx) : ctx.selfName;

  if (isRosettaCountOperation(expr)) {
    return `runeCount(${getArg(expr.argument)})`;
  }
  if (isSumOperation(expr)) {
    const arr = getArg(expr.argument);
    return `(${arr} ?? []).reduce((a, b) => a + b, 0)`;
  }
  if (isMinOperation(expr)) {
    // MinOperation can have a comparison function — simple case: Math.min
    const arr = getArg(expr.argument);
    return `Math.min(...(${arr} ?? []))`;
  }
  if (isMaxOperation(expr)) {
    const arr = getArg(expr.argument);
    return `Math.max(...(${arr} ?? []))`;
  }
  if (isSortOperation(expr)) {
    const arr = getArg(expr.argument);
    return `[...(${arr} ?? [])].sort()`;
  }
  if (isDistinctOperation(expr)) {
    const arr = getArg(expr.argument);
    return `[...new Set(${arr} ?? [])]`;
  }
  if (isFirstOperation(expr)) {
    const arr = getArg(expr.argument);
    return `(${arr} ?? [])[0]`;
  }
  if (isLastOperation(expr)) {
    const arr = getArg(expr.argument);
    return `(${arr} ?? []).at(-1)`;
  }
  if (isFlattenOperation(expr)) {
    const arr = getArg(expr.argument);
    return `(${arr} ?? []).flat()`;
  }
  if (isReverseOperation(expr)) {
    const arr = getArg(expr.argument);
    return `[...(${arr} ?? [])].reverse()`;
  }
  return 'undefined /* unknown aggregation */';
}

/**
 * T073: Transpile higher-order operations (filter, map/extract).
 *
 * filter: (arr ?? []).filter((item) => <body>)
 * map:    (arr ?? []).map((item) => <body>)
 *
 * The lambda body is transpiled with a child context where selfName = lambda param name.
 */
export function transpileHigherOrder(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  if (isFilterOperation(expr)) {
    const arr = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
    const fn = expr.function;
    if (!fn) {
      return `(${arr} ?? []).filter((item) => item)`;
    }
    const paramName = fn.parameters?.[0]?.name ?? 'item';
    const childCtx: ExpressionTranspilerContext = { ...ctx, selfName: paramName };
    const body = transpileExpression(fn.body, childCtx);
    return `(${arr} ?? []).filter((${paramName}) => ${body})`;
  }
  if (isMapOperation(expr)) {
    const arr = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
    const fn = expr.function;
    if (!fn) {
      return `(${arr} ?? []).map((item) => item)`;
    }
    const paramName = fn.parameters?.[0]?.name ?? 'item';
    const childCtx: ExpressionTranspilerContext = { ...ctx, selfName: paramName };
    const body = transpileExpression(fn.body, childCtx);
    return `(${arr} ?? []).map((${paramName}) => ${body})`;
  }
  return 'undefined /* not a higher-order op */';
}

/**
 * T074: Transpile conditional expressions (if antecedent then consequent [else alternative]).
 *
 * In zod-refine mode (returns boolean expression):
 *   (<antecedent> ? <consequent> : true)
 *   or with else: (<antecedent> ? <consequent> : <alternative>)
 *
 * In zod-superRefine mode (used as a condition guard block):
 *   if (<antecedent>) { <consequent> }
 *   (returns the guarded block directly — not wrapped by wrapBoolExprForMode)
 *
 * The antecedent and consequent are transpiled recursively.
 */
export function transpileConditional(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext
): string {
  if (!isRosettaConditionalExpression(expr)) {
    return 'undefined /* not RosettaConditionalExpression */';
  }

  const antecedent = expr.if ? transpileExpression(expr.if, ctx) : 'true';
  const consequentExpr = expr.ifthen;
  const alternativeExpr = expr.elsethen;

  if (ctx.emitMode === 'zod-superRefine') {
    // Guard block: the consequent is an existence/boolean check
    if (consequentExpr) {
      const consequentStr = transpileExpression(consequentExpr, ctx);
      const message = `${ctx.conditionName}: condition failed in ${ctx.typeName}`;
      return [
        `if (${antecedent}) {`,
        `  if (!(${consequentStr})) {`,
        `    ctx.addIssue({`,
        `      code: 'custom',`,
        `      message: '${message}',`,
        `      path: ['${ctx.conditionName}']`,
        `    });`,
        `  }`,
        `}`
      ].join('\n');
    }
    return `// if-then: no consequent`;
  }

  if (ctx.emitMode === 'ts-method') {
    if (consequentExpr) {
      const consequentStr = transpileExpression(consequentExpr, ctx);
      const message = `${ctx.conditionName}: condition failed in ${ctx.typeName}`;
      return [
        `if (${antecedent}) {`,
        `  if (!(${consequentStr})) {`,
        `    errors.push('${message}');`,
        `  }`,
        `}`
      ].join('\n');
    }
    return `// if-then: no consequent`;
  }

  // zod-refine mode: emit as ternary
  const consequent = consequentExpr ? transpileExpression(consequentExpr, ctx) : 'true';
  const alternative = alternativeExpr ? transpileExpression(alternativeExpr, ctx) : 'true';
  return `(${antecedent} ? ${consequent} : ${alternative})`;
}

/**
 * T075: Top-level expression dispatcher.
 *
 * Routes based on expr.$type to the appropriate transpiler function.
 * Returns a JS expression string (not a statement).
 *
 * Uses the visitor-pattern dispatch shape from expression-node-to-dsl.ts.
 * FR-012: all Rune expression node types are handled.
 */
export function transpileExpression(
  expr: RosettaExpression | undefined | null,
  ctx: ExpressionTranspilerContext
): string {
  if (!expr) {
    return 'undefined /* null expression */';
  }

  // Literals (T067)
  if (
    isRosettaBooleanLiteral(expr) ||
    isRosettaIntLiteral(expr) ||
    isRosettaNumberLiteral(expr) ||
    isRosettaStringLiteral(expr)
  ) {
    return transpileLiteral(expr, ctx);
  }

  // Symbol reference — attribute or lambda parameter (T068 / T075)
  if (isRosettaSymbolReference(expr)) {
    const name = expr.symbol?.$refText ?? expr.symbol?.ref?.name ?? '?';
    // Check localBindings first (alias refs in func bodies — Phase 8b)
    if (ctx.localBindings?.has(name)) {
      return ctx.localBindings.get(name)!;
    }
    return `${ctx.selfName}.${name}`;
  }

  // Implicit variable (lambda parameter 'item')
  if (isRosettaImplicitVariable(expr)) {
    return ctx.selfName;
  }

  // Navigation (T068)
  if (isRosettaFeatureCall(expr) || isRosettaDeepFeatureCall(expr)) {
    return transpileNavigation(expr, ctx);
  }

  // Arithmetic (T069)
  if (isArithmeticOperation(expr)) {
    return transpileArithmetic(expr, ctx);
  }

  // Comparison and equality (T069)
  if (isComparisonOperation(expr) || isEqualityOperation(expr)) {
    return transpileComparison(expr, ctx);
  }

  // Boolean logical (T070)
  if (isLogicalOperation(expr)) {
    return transpileBoolean(expr, ctx);
  }

  // Set operations (T071)
  if (isRosettaContainsExpression(expr) || isRosettaDisjointExpression(expr)) {
    return transpileSetOps(expr, ctx);
  }

  // Aggregations (T072)
  if (
    isRosettaCountOperation(expr) ||
    isSumOperation(expr) ||
    isMinOperation(expr) ||
    isMaxOperation(expr) ||
    isSortOperation(expr) ||
    isDistinctOperation(expr) ||
    isFirstOperation(expr) ||
    isLastOperation(expr) ||
    isFlattenOperation(expr) ||
    isReverseOperation(expr)
  ) {
    return transpileAggregation(expr, ctx);
  }

  // Higher-order (T073)
  if (isFilterOperation(expr) || isMapOperation(expr)) {
    return transpileHigherOrder(expr, ctx);
  }

  // Exists / absent (delegates to Phase 4 logic but as boolean expressions)
  if (isRosettaExistsExpression(expr)) {
    const arg = expr.argument;
    if (arg) {
      const argStr = transpileExpression(arg, ctx);
      return `runeAttrExists(${argStr})`;
    }
    return `runeAttrExists(${ctx.selfName})`;
  }

  if (isRosettaAbsentExpression(expr)) {
    const arg = expr.argument;
    if (arg) {
      const argStr = transpileExpression(arg, ctx);
      return `!runeAttrExists(${argStr})`;
    }
    return `!runeAttrExists(${ctx.selfName})`;
  }

  // Conditional if/then/else (T074)
  if (isRosettaConditionalExpression(expr)) {
    return transpileConditional(expr, ctx);
  }

  // Unknown expression type — emit diagnostic and placeholder
  ctx.diagnostics.push({
    severity: 'error',
    code: 'unknown-expression-type',
    message: `Unknown expression type: ${(expr as { $type?: string }).$type}`
  });
  return `true /* DIAGNOSTIC: unknown expression type "${(expr as { $type?: string }).$type}" */`;
}

// ---------------------------------------------------------------------------
// Precedence helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Get the precedence of an expression node for parenthesization decisions.
 */
function getExprPrecedence(expr: RosettaExpression): number | undefined {
  if (isArithmeticOperation(expr)) return PRECEDENCE[expr.operator];
  if (isLogicalOperation(expr)) return PRECEDENCE[expr.operator];
  if (isEqualityOperation(expr)) return PRECEDENCE[expr.operator];
  if (isComparisonOperation(expr)) return PRECEDENCE[expr.operator];
  if (isRosettaContainsExpression(expr)) return PRECEDENCE['contains'];
  if (isRosettaDisjointExpression(expr)) return PRECEDENCE['disjoint'];
  return undefined;
}

/**
 * Transpile a sub-expression, wrapping in parentheses if needed for precedence.
 * Used by binary operators (T069, T070).
 *
 * @param expr      The sub-expression to transpile.
 * @param parentOp  The operator of the parent expression.
 * @param ctx       Transpiler context.
 * @param side      Whether this is the left or right operand (for future associativity).
 */
function transpileWithPrecedence(
  expr: RosettaExpression,
  parentOp: string,
  ctx: ExpressionTranspilerContext,
  _side: 'left' | 'right'
): string {
  const result = transpileExpression(expr, ctx);
  const myPrec = getExprPrecedence(expr);
  const parentPrec = PRECEDENCE[parentOp];
  if (myPrec !== undefined && parentPrec !== undefined && myPrec < parentPrec) {
    return `(${result})`;
  }
  return result;
}
