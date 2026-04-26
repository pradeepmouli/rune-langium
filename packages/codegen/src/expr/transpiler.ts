// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Expression transpiler for Rune condition blocks.
 *
 * Phase 4 covers: one-of, choice, exists, is absent, only exists.
 * Phase 5 will add the full expression-language transpiler.
 *
 * T052–T054.
 * FR-010 (refine vs superRefine), FR-014 (error messages), FR-025 (unknown attr).
 */

import {
  isOneOfOperation,
  isChoiceOperation,
  isRosettaExistsExpression,
  isRosettaAbsentExpression,
  isRosettaOnlyExistsExpression,
  isRosettaSymbolReference,
  type Condition,
  type RosettaExpression
} from '@rune-langium/core';
import type { GeneratorDiagnostic } from '../types.js';

/**
 * Context passed to the expression transpiler for a single condition block.
 * Not exposed in the public API. Per data-model §7.
 */
export interface ExpressionTranspilerContext {
  /**
   * The name of the `this` value in the emitted predicate.
   * In superRefine mode: `data` (the `.superRefine((data, ctx) =>` parameter).
   * In refine mode: `data` (the `.refine((data) =>` parameter).
   */
  selfName: string;
  /**
   * How to emit errors.
   * 'zod-refine': predicate returns a boolean.
   * 'zod-superRefine': predicate calls ctx.addIssue({...}).
   */
  emitMode: 'zod-refine' | 'zod-superRefine';
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
    const name = extractAttrName(expr.argument) ?? '?';
    return `${ctx.conditionName}: ${name} must be present in ${ctx.typeName}`;
  }

  if (isRosettaAbsentExpression(expr)) {
    const name = extractAttrName(expr.argument) ?? '?';
    return `${ctx.conditionName}: ${name} must be absent in ${ctx.typeName}`;
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

  return `${ctx.conditionName} failed`;
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
    if (!name) {
      ctx.diagnostics.push({
        severity: 'warning',
        code: 'unsupported-condition',
        message: `exists condition in '${ctx.conditionName}' has no attribute reference`
      });
      return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported exists';
    }
    return emitExists(name, ctx);
  }

  // is absent: `a is absent` → RosettaAbsentExpression
  if (isRosettaAbsentExpression(expr)) {
    const name = extractAttrName(expr.argument);
    if (!name) {
      ctx.diagnostics.push({
        severity: 'warning',
        code: 'unsupported-condition',
        message: `is-absent condition in '${ctx.conditionName}' has no attribute reference`
      });
      return ctx.emitMode === 'zod-refine' ? 'true' : '// unsupported is-absent';
    }
    return emitIsAbsent(name, ctx);
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

  // Unrecognized expression type — Phase 5 will cover these
  ctx.diagnostics.push({
    severity: 'warning',
    code: 'unsupported-condition',
    message: `Condition '${ctx.conditionName}' uses expression type '${expr.$type}' which is not supported in Phase 4; skipping`
  });
  return ctx.emitMode === 'zod-refine' ? 'true' : `// unsupported: ${expr.$type}`;
}
