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
  isRosettaConstructorExpression,
  isListLiteral,
  isThenOperation,
  isAsKeyOperation,
  isWithMetaOperation,
  isDefaultOperation,
  isJoinOperation,
  isRosettaOnlyElement,
  isReduceOperation,
  isToStringOperation,
  isToNumberOperation,
  isToIntOperation,
  isToEnumOperation,
  isToDateOperation,
  isToTimeOperation,
  isToDateTimeOperation,
  isToZonedDateTimeOperation,
  isSwitchOperation,
  isRosettaSuperCall,
  type Condition,
  type RosettaExpression,
  type ThenOperation
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
    return [`if (!runeCheckOneOf([${attrList}])) {`, `  errors.push('${message}');`, `}`].join('\n');
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
    return [`if (!runeCheckOneOf([${attrList}])) {`, `  errors.push('${message}');`, `}`].join('\n');
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
    return [`if (!runeAttrExists(${dataRef}.${attrName})) {`, `  errors.push('${message}');`, `}`].join('\n');
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
    return [`if (runeAttrExists(${dataRef}.${attrName})) {`, `  errors.push('${message}');`, `}`].join('\n');
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
export function emitOnlyExists(allowedAttrNames: string[], ctx: ExpressionTranspilerContext): string {
  // Validate all allowed attrs exist on the type
  for (const name of allowedAttrNames) {
    validateAttr(name, ctx);
  }

  // Find all attributes on the type that are NOT in the allowed list
  const forbiddenAttrs = Array.from(ctx.attributeTypes.keys()).filter((name) => !allowedAttrNames.includes(name));

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
        names = listLiteral.elements.map((e) => extractAttrName(e)).filter((n): n is string => n !== undefined);
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
      names = arg.elements.map((e) => extractAttrName(e)).filter((n): n is string => n !== undefined);
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
      const names = listLiteral.elements.map((e) => extractAttrName(e)).filter((n): n is string => n !== undefined);
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

  // only exists: `[a, b] only exists` or `(a, b) only exists` → RosettaOnlyExistsExpression
  if (isRosettaOnlyExistsExpression(expr)) {
    // Paren-tuple form: `(a, b, c) only exists` — grammar populates `args`
    // (NOT `argument`) via the PrimaryExpression multi-arg escape hatch
    // (`'(' Expression (',' args+=Expression)+ ')' 'only' 'exists'`).
    if (expr.args.length > 0) {
      const names = expr.args.map((e) => extractAttrName(e)).filter((n): n is string => n !== undefined);
      return emitOnlyExists(names, ctx);
    }
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
      const names = listLiteral.elements.map((e) => extractAttrName(e)).filter((n): n is string => n !== undefined);
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
export function transpileLiteral(expr: RosettaExpression, _ctx: ExpressionTranspilerContext): string {
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
export function transpileNavigation(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
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
export function transpileArithmetic(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
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
export function transpileComparison(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (isEqualityOperation(expr)) {
    const jsOp = expr.operator === '=' ? '===' : '!==';
    const left = expr.left ? transpileWithPrecedence(expr.left, expr.operator, ctx, 'left') : ctx.selfName;
    const right = transpileWithPrecedence(expr.right, expr.operator, ctx, 'right');
    return `${left} ${jsOp} ${right}`;
  }
  if (isComparisonOperation(expr)) {
    const left = expr.left ? transpileWithPrecedence(expr.left, expr.operator, ctx, 'left') : ctx.selfName;
    const right = transpileWithPrecedence(expr.right, expr.operator, ctx, 'right');
    return `${left} ${expr.operator} ${right}`;
  }
  return 'undefined /* not a comparison */';
}

/**
 * T070: Transpile boolean logical operations (and → &&, or → ||).
 * Parenthesizes children when child precedence is lower than parent.
 */
export function transpileBoolean(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
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
export function transpileAggregation(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  // Helper: get the argument expression (or ctx.selfName if no argument)
  const getArg = (arg: RosettaExpression | undefined): string => (arg ? transpileExpression(arg, ctx) : ctx.selfName);

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
export function transpileHigherOrder(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
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
 * Transpile a ThenOperation (pipeline/pipe operator).
 *
 * Grammar: `argument then [ImplicitInlineFunction]`
 * Semantics: apply the inline function to the argument.
 *   No function → identity (return argument unchanged).
 *   With function → `((param) => body)(arg)`
 */
export function transpileThenOperation(expr: ThenOperation, ctx: ExpressionTranspilerContext): string {
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  if (!expr.function) {
    return arg;
  }
  // Pipe: evaluate body with the argument as the implicit self.
  // e.g. `items then flatten` → `(items ?? []).flat()`
  //      `items then field`   → `items?.field`
  const childCtx: ExpressionTranspilerContext = { ...ctx, selfName: arg };
  return transpileExpression(expr.function.body, childCtx);
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
export function transpileConditional(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
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
 * T076: Transpile a constructor expression to a plain JS object literal.
 *
 * RosettaConstructorExpression { typeRef, values, implicitEmpty } →
 *   { key1: val1, key2: val2 }  (or {} for implicit-empty / no values)
 *
 * Java reference: ExpressionGenerator.caseConstructorExpression emits
 *   TypeName.builder().setKey1(val1).setKey2(val2).build().
 * In TypeScript we emit plain objects because the generated Zod types
 * accept plain-object inputs rather than builder instances.
 */
export function transpileConstructor(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isRosettaConstructorExpression(expr)) {
    return 'undefined /* not RosettaConstructorExpression */';
  }
  if (expr.implicitEmpty || expr.values.length === 0) {
    return '{}';
  }
  const pairs = expr.values
    .map((kv) => {
      const key = kv.key.$refText ?? '?';
      const val = transpileExpression(kv.value, ctx);
      return `${key}: ${val}`;
    })
    .join(', ');
  return `{ ${pairs} }`;
}

/**
 * T077: Transpile a list literal to a JS array literal.
 *
 * ListLiteral { elements } → [ elem1, elem2, ... ]
 */
export function transpileListLiteral(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isListLiteral(expr)) {
    return 'undefined /* not ListLiteral */';
  }
  const elements = (expr.elements ?? []).map((e) => transpileExpression(e, ctx));
  return `[${elements.join(', ')}]`;
}

/**
 * W1 Tier 1 — passthrough operations.
 *
 * AsKeyOperation / WithMetaOperation: `as-key` and `with-meta` are metadata
 * annotations (key referencing, scheme/globalKey attachment) with no runtime
 * meaning in a validation predicate — the value itself is unchanged. Transpile
 * `argument` and return it as-is, matching the grammar's `argument` field.
 */
export function transpilePassthrough(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (isAsKeyOperation(expr) || isWithMetaOperation(expr)) {
    return transpileExpression(expr.argument, ctx);
  }
  return 'undefined /* not a passthrough operation */';
}

/**
 * W1 Tier 2 — simple mappings.
 *
 * DefaultOperation: `(L ?? R)` — matches the transpiler's existing
 * undefined-as-absent convention (no special empty-array/empty-string
 * handling; sibling cases like exists/absent only special-case undefined,
 * null, and empty arrays via runeAttrExists, not plain `??`).
 *
 * JoinOperation: `(L ?? []).join(R ?? '')` — right is optional per grammar.
 *
 * RosettaOnlyElement: mirrors first/last's `(arr ?? [])[0]`/`.at(-1)` guard
 * style — single-element extraction: value when exactly one element exists,
 * else undefined.
 *
 * ReduceOperation: `.reduce` using the two-parameter closure form (grammar:
 * `parameters` carries exactly 2 params for reduce, unlike filter/map's 1).
 */
export function transpileDefault(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isDefaultOperation(expr)) {
    return 'undefined /* not DefaultOperation */';
  }
  const left = expr.left ? transpileExpression(expr.left, ctx) : ctx.selfName;
  const right = transpileExpression(expr.right, ctx);
  return `(${left} ?? ${right})`;
}

export function transpileJoin(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isJoinOperation(expr)) {
    return 'undefined /* not JoinOperation */';
  }
  const left = expr.left ? transpileExpression(expr.left, ctx) : ctx.selfName;
  const right = expr.right ? transpileExpression(expr.right, ctx) : "''";
  return `(${left} ?? []).join(${right})`;
}

export function transpileOnlyElement(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isRosettaOnlyElement(expr)) {
    return 'undefined /* not RosettaOnlyElement */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `((__oe) => (__oe.length === 1 ? __oe[0] : undefined))(${arg} ?? [])`;
}

export function transpileReduce(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isReduceOperation(expr)) {
    return 'undefined /* not ReduceOperation */';
  }
  const arr = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  const fn = expr.function;
  if (!fn) {
    return `(${arr} ?? [])`;
  }
  const [accName = 'a', itemName = 'b'] = fn.parameters?.map((p) => p.name) ?? [];
  // Both closure params are plain locals (not `selfName`-qualified attribute
  // access) — bind both via localBindings rather than reusing selfName like
  // filter/map's single-param case does.
  const localBindings = new Map(ctx.localBindings);
  localBindings.set(accName, accName);
  localBindings.set(itemName, itemName);
  const childCtx: ExpressionTranspilerContext = { ...ctx, localBindings };
  const body = transpileExpression(fn.body, childCtx);
  return `(${arr} ?? []).reduce((${accName}, ${itemName}) => ${body})`;
}

/**
 * W1 Tier 3 — conversions. Temporal runtime representation is `string`
 * (see ts-emitter's `TS_BUILTIN_TYPE_MAP` / `typescriptProfile.recordTypeMap`:
 * date/dateTime/zonedDateTime/time all map to `Temporal.*` TS types but the
 * WIRE representation validated here is the ISO string prior to any
 * Temporal parsing — so these emit shape-validating passthroughs, not
 * Temporal object construction).
 *
 * ToStringOperation / ToNumberOperation / ToIntOperation are undefined-guarded
 * per sibling conventions (see transpileLiteral / transpileAggregation).
 *
 * ToIntOperation semantics: Rune's reference generator (TypeCoercionService,
 * BigDecimal→int coercion) fails when the value has a fractional part —
 * verified against `.resources/rune-dsl-src`; mirrored here via
 * `Number.isInteger`.
 *
 * ToEnumOperation resolves against the emitted enum shape. ts-emitter's
 * `emitEnumDeclaration` emits enums as a plain string-literal union
 * (`export type Foo = 'A' | 'B'`), i.e. the member NAME is its own runtime
 * value — so enum resolution is a membership check against the reference
 * enum's `enumValues` names, not a display-name lookup or const-object index.
 */
export function transpileToString(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToStringOperation(expr)) {
    return 'undefined /* not ToStringOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `(${arg} === undefined ? undefined : String(${arg}))`;
}

export function transpileToNumber(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToNumberOperation(expr)) {
    return 'undefined /* not ToNumberOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `((__n) => (__n === undefined ? undefined : Number.isNaN(Number(__n)) ? undefined : Number(__n)))(${arg})`;
}

export function transpileToInt(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToIntOperation(expr)) {
    return 'undefined /* not ToIntOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `((__i) => (__i === undefined ? undefined : Number.isInteger(Number(__i)) ? Number(__i) : undefined))(${arg})`;
}

export function transpileToEnum(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToEnumOperation(expr)) {
    return 'undefined /* not ToEnumOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  const enumRef = expr.enumeration?.ref;
  if (!enumRef) {
    ctx.diagnostics.push({
      severity: 'error',
      code: 'unresolved-enum-reference',
      message: `to-enum in '${ctx.conditionName}' references an unresolved enumeration '${expr.enumeration?.$refText ?? '?'}'`
    });
    return `undefined /* DIAGNOSTIC: unresolved enum reference "${expr.enumeration?.$refText ?? '?'}" */`;
  }
  const memberList = enumRef.enumValues.map((v) => `'${v.name}'`).join(', ');
  return `((__e) => ([${memberList}].includes(__e) ? __e : undefined))(${arg})`;
}

export function transpileToDate(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToDateOperation(expr)) {
    return 'undefined /* not ToDateOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `runeToDate(${arg})`;
}

export function transpileToTime(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToTimeOperation(expr)) {
    return 'undefined /* not ToTimeOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `runeToTime(${arg})`;
}

export function transpileToDateTime(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToDateTimeOperation(expr)) {
    return 'undefined /* not ToDateTimeOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `runeToDateTime(${arg})`;
}

export function transpileToZonedDateTime(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isToZonedDateTimeOperation(expr)) {
    return 'undefined /* not ToZonedDateTimeOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;
  return `runeToZonedDateTime(${arg})`;
}

/**
 * W1 Tier 4 — switch.
 *
 * Chained ternaries over an IIFE binding the switched value once (avoids
 * re-evaluating a non-trivial argument expression per case). Guards:
 * `referenceGuard` (an enum member or other SwitchCaseTarget) compares
 * against its resolved name — same resolution style as ToEnumOperation
 * (the emitted enum member IS its string value). `literalGuard` compares
 * against the transpiled literal. `default` (no guard) is the trailing
 * else; if no default case is present, the final else is `undefined`.
 */
export function transpileSwitch(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isSwitchOperation(expr)) {
    return 'undefined /* not SwitchOperation */';
  }
  const arg = expr.argument ? transpileExpression(expr.argument, ctx) : ctx.selfName;

  let elseExpr = 'undefined';
  const ternaryCases: { guardExpr: string; resultExpr: string }[] = [];

  for (const c of expr.cases) {
    const resultExpr = transpileExpression(c.expression, ctx);
    if (!c.guard) {
      // `default` case — becomes the trailing else, not a ternary arm.
      elseExpr = resultExpr;
      continue;
    }
    if (c.guard.literalGuard) {
      const guardExpr = transpileLiteral(c.guard.literalGuard, ctx);
      ternaryCases.push({ guardExpr, resultExpr });
      continue;
    }
    if (c.guard.referenceGuard) {
      const targetName = c.guard.referenceGuard.$refText ?? c.guard.referenceGuard.ref?.name;
      if (targetName === undefined) {
        ctx.diagnostics.push({
          severity: 'error',
          code: 'unresolved-switch-guard',
          message: `switch case in '${ctx.conditionName}' has an unresolved reference guard`
        });
        continue;
      }
      ternaryCases.push({ guardExpr: `'${targetName}'`, resultExpr });
      continue;
    }
  }

  const chain = ternaryCases.reduceRight(
    (acc, { guardExpr, resultExpr }) => `${guardExpr} === __sw ? ${resultExpr} : ${acc}`,
    elseExpr
  );
  return `((__sw) => (${chain}))(${arg})`;
}

/**
 * The one exception — RosettaSuperCall: `super(...)` has no referent in a
 * validation-predicate context (it's a func-body dispatch construct;
 * conditions have no enclosing function to call up from). Deliberate loud
 * diagnostic — its own case, own message — NOT silent fall-through, per
 * spec §"The one exception". If the corpus gate ever finds real `super`
 * usage in a condition expression, that is a design escalation, not a bug
 * to route around here.
 */
export function transpileSuperCall(expr: RosettaExpression, ctx: ExpressionTranspilerContext): string {
  if (!isRosettaSuperCall(expr)) {
    return 'undefined /* not RosettaSuperCall */';
  }
  ctx.diagnostics.push({
    severity: 'error',
    code: 'unsupported-super-call',
    message: `Condition '${ctx.conditionName}' on type '${ctx.typeName}' calls super(), which has no meaning in a transpiled validation predicate`
  });
  return 'true /* DIAGNOSTIC: super() is not supported in transpiled conditions */';
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

  // ThenOperation — pipeline/pipe: `arg then fn`
  if (isThenOperation(expr)) {
    return transpileThenOperation(expr, ctx);
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

  // only exists, in a NESTED (non-top-level-Condition) position — e.g. as
  // the consequent of an if/then. transpileCondition's dispatcher handles
  // the top-level Condition.expression case (with attribute-name validation
  // and mode-specific statement-block emission via emitOnlyExists); here we
  // need a pure boolean expression, so inline the same "every attr NOT
  // listed must be absent" semantics without the attributeTypes validation
  // (attribute existence was already checked when this expression's
  // attributeTypes were built at the top-level dispatch).
  if (isRosettaOnlyExistsExpression(expr)) {
    const listedExprs = expr.args.length > 0 ? expr.args : isListLiteral(expr.argument) ? expr.argument.elements : [];
    const names = (listedExprs ?? []).map((e) => extractAttrName(e)).filter((n): n is string => n !== undefined);
    const forbiddenAttrs = Array.from(ctx.attributeTypes.keys()).filter((name) => !names.includes(name));
    if (forbiddenAttrs.length === 0) {
      return 'true';
    }
    const checks = forbiddenAttrs.map((n) => `!runeAttrExists(${ctx.selfName}.${n})`);
    return checks.length === 1 ? checks[0]! : `(${checks.join(' && ')})`;
  }

  // Conditional if/then/else (T074)
  if (isRosettaConditionalExpression(expr)) {
    return transpileConditional(expr, ctx);
  }

  // Constructor expression (T076)
  if (isRosettaConstructorExpression(expr)) {
    return transpileConstructor(expr, ctx);
  }

  // List literal (T077)
  if (isListLiteral(expr)) {
    return transpileListLiteral(expr, ctx);
  }

  // W1 Tier 1 — passthrough (as-key / with-meta)
  if (isAsKeyOperation(expr) || isWithMetaOperation(expr)) {
    return transpilePassthrough(expr, ctx);
  }

  // W1 Tier 2 — simple mappings
  if (isDefaultOperation(expr)) {
    return transpileDefault(expr, ctx);
  }
  if (isJoinOperation(expr)) {
    return transpileJoin(expr, ctx);
  }
  if (isRosettaOnlyElement(expr)) {
    return transpileOnlyElement(expr, ctx);
  }
  if (isReduceOperation(expr)) {
    return transpileReduce(expr, ctx);
  }

  // W1 Tier 3 — conversions
  if (isToStringOperation(expr)) {
    return transpileToString(expr, ctx);
  }
  if (isToNumberOperation(expr)) {
    return transpileToNumber(expr, ctx);
  }
  if (isToIntOperation(expr)) {
    return transpileToInt(expr, ctx);
  }
  if (isToEnumOperation(expr)) {
    return transpileToEnum(expr, ctx);
  }
  if (isToDateOperation(expr)) {
    return transpileToDate(expr, ctx);
  }
  if (isToTimeOperation(expr)) {
    return transpileToTime(expr, ctx);
  }
  if (isToDateTimeOperation(expr)) {
    return transpileToDateTime(expr, ctx);
  }
  if (isToZonedDateTimeOperation(expr)) {
    return transpileToZonedDateTime(expr, ctx);
  }

  // W1 Tier 4 — switch
  if (isSwitchOperation(expr)) {
    return transpileSwitch(expr, ctx);
  }

  // The one exception — RosettaSuperCall (deliberate loud diagnostic)
  if (isRosettaSuperCall(expr)) {
    return transpileSuperCall(expr, ctx);
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
 * Operators whose JS equivalent is NOT left-associative in a way that
 * preserves Rune semantics when re-nested without parens — chaining these
 * at the same tier changes meaning (`a === b === c` is `(a===b)===c` in JS,
 * comparing a boolean to `c`, not the Rune-intended `a===(b===c)`).
 * Rune's own grammar only allows same-tier nesting on these via an explicit
 * parenthesized sub-expression (PrimaryExpression's `'(' Expression ')'`
 * escape hatch — EqualityOperation.right is otherwise AdditiveOperation,
 * not another EqualityOperation), so a same-tier RIGHT child of one of
 * these operators must always keep its parens. Arithmetic (+,-,*,/) and
 * logical (and/or → &&/||) chain left-associatively in both Rune and JS,
 * so dropping redundant right-side parens there is semantics-preserving.
 *
 * Note: `contains`/`disjoint`/`default` are grammatically same-tier too, but
 * never reach transpileWithPrecedence as parentOp — their transpile sites use
 * structural templates (`.includes()`/`.some()`/self-wrapped `??`) that are
 * immune by construction — so only the six eq/cmp operators are listed here.
 */
const NON_ASSOCIATIVE_OPERATORS = new Set(['=', '<>', '<', '<=', '>', '>=']);

/**
 * Transpile a sub-expression, wrapping in parentheses if needed for precedence.
 * Used by binary operators (T069, T070).
 *
 * @param expr      The sub-expression to transpile.
 * @param parentOp  The operator of the parent expression.
 * @param ctx       Transpiler context.
 * @param side      Whether this is the left or right operand. Same-tier
 *                  RIGHT children of a non-associative parentOp are always
 *                  parenthesized (see NON_ASSOCIATIVE_OPERATORS); same-tier
 *                  LEFT children never need parens (JS left-associativity
 *                  matches evaluation order either way).
 */
function transpileWithPrecedence(
  expr: RosettaExpression,
  parentOp: string,
  ctx: ExpressionTranspilerContext,
  side: 'left' | 'right'
): string {
  const result = transpileExpression(expr, ctx);
  const myPrec = getExprPrecedence(expr);
  const parentPrec = PRECEDENCE[parentOp];
  if (myPrec === undefined || parentPrec === undefined) {
    return result;
  }
  if (myPrec < parentPrec) {
    return `(${result})`;
  }
  if (side === 'right' && myPrec === parentPrec && NON_ASSOCIATIVE_OPERATORS.has(parentOp)) {
    return `(${result})`;
  }
  return result;
}
