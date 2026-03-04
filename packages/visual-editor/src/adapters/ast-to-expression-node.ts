/**
 * ast-to-expression-node — Convert a RosettaExpression AST node
 * to an ExpressionNode for the expression builder.
 *
 * Responsibilities:
 *   1. Assigns `id` (crypto.randomUUID) to each node
 *   2. Resolves Reference<T> cross-refs to plain strings ($refText)
 *   3. Wraps unrecognized sub-trees as { $type: 'Unsupported', rawText }
 *   4. Preserves $type discriminator unchanged
 *
 * @module
 */

import type { ExpressionNode } from '../schemas/expression-node-schema.js';

/** Generate a unique node id. */
function uid(): string {
  return crypto.randomUUID();
}

/** Resolve a Langium Reference<T> to its $refText string, or undefined. */
function resolveRef(ref: unknown): string | undefined {
  if (ref && typeof ref === 'object' && '$refText' in ref) {
    return String((ref as { $refText: string }).$refText);
  }
  if (typeof ref === 'string') return ref;
  return undefined;
}

/**
 * Known expression $type values that we can handle.
 * Any $type not in this set gets wrapped as Unsupported.
 */
const KNOWN_TYPES = new Set([
  'ArithmeticOperation',
  'ComparisonOperation',
  'EqualityOperation',
  'LogicalOperation',
  'RosettaContainsExpression',
  'RosettaDisjointExpression',
  'DefaultOperation',
  'JoinOperation',
  'RosettaExistsExpression',
  'RosettaAbsentExpression',
  'RosettaOnlyElement',
  'RosettaOnlyExistsExpression',
  'RosettaCountOperation',
  'FlattenOperation',
  'DistinctOperation',
  'ReverseOperation',
  'FirstOperation',
  'LastOperation',
  'SumOperation',
  'OneOfOperation',
  'ToStringOperation',
  'ToNumberOperation',
  'ToIntOperation',
  'ToTimeOperation',
  'ToEnumOperation',
  'ToDateOperation',
  'ToDateTimeOperation',
  'ToZonedDateTimeOperation',
  'RosettaFeatureCall',
  'RosettaDeepFeatureCall',
  'FilterOperation',
  'MapOperation',
  'ReduceOperation',
  'SortOperation',
  'MinOperation',
  'MaxOperation',
  'ThenOperation',
  'RosettaConditionalExpression',
  'SwitchOperation',
  'RosettaConstructorExpression',
  'RosettaBooleanLiteral',
  'RosettaIntLiteral',
  'RosettaNumberLiteral',
  'RosettaStringLiteral',
  'RosettaSymbolReference',
  'RosettaImplicitVariable',
  'ListLiteral',
  'ChoiceOperation',
  'AsKeyOperation',
  'WithMetaOperation',
  'RosettaSuperCall'
]);

/** Convert an optional child expression. */
function convertChild(ast: unknown, sourceText: string): ExpressionNode | undefined {
  if (ast == null) return undefined;
  return convertNode(ast as Record<string, unknown>, sourceText);
}

/** Convert a required child expression. */
function convertChildRequired(ast: unknown, sourceText: string): ExpressionNode {
  if (ast == null) {
    return { $type: 'Placeholder', id: uid() } as unknown as ExpressionNode;
  }
  return convertNode(ast as Record<string, unknown>, sourceText);
}

/** Convert an inline function (lambda). */
function convertInlineFunction(ast: Record<string, unknown> | undefined, sourceText: string) {
  if (!ast) return undefined;
  return {
    $type: 'InlineFunction' as const,
    body: convertChildRequired(ast.body, sourceText),
    parameters: ast.parameters as Array<{ $type: 'ClosureParameter'; name: string }> | undefined
  };
}

/** Convert a switch case. */
function convertSwitchCase(ast: Record<string, unknown>, sourceText: string) {
  const guard = ast.guard as Record<string, unknown> | undefined;
  return {
    $type: 'SwitchCaseOrDefault' as const,
    expression: convertChildRequired(ast.expression, sourceText),
    guard: guard
      ? {
          $type: 'SwitchCaseGuard' as const,
          literalGuard: guard.literalGuard,
          referenceGuard: resolveRef(guard.referenceGuard)
        }
      : undefined
  };
}

/** Convert a constructor key-value pair. */
function convertKVP(ast: Record<string, unknown>, sourceText: string) {
  return {
    $type: 'ConstructorKeyValuePair' as const,
    key: resolveRef(ast.key) ?? '',
    value: convertChildRequired(ast.value, sourceText)
  };
}

/** Main conversion function. */
function convertNode(ast: Record<string, unknown>, sourceText: string): ExpressionNode {
  const $type = ast.$type as string;

  if (!KNOWN_TYPES.has($type)) {
    return { $type: 'Unsupported', id: uid(), rawText: sourceText } as unknown as ExpressionNode;
  }

  const id = uid();

  switch ($type) {
    // Binary operations
    case 'ArithmeticOperation':
    case 'LogicalOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        left: convertChildRequired(ast.left, sourceText),
        right: convertChildRequired(ast.right, sourceText)
      } as unknown as ExpressionNode;

    case 'ComparisonOperation':
    case 'EqualityOperation':
    case 'RosettaContainsExpression':
    case 'RosettaDisjointExpression':
    case 'DefaultOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        cardMod: ast.cardMod,
        left: convertChild(ast.left, sourceText),
        right: convertChildRequired(ast.right, sourceText)
      } as unknown as ExpressionNode;

    case 'JoinOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        left: convertChild(ast.left, sourceText),
        right: convertChild(ast.right, sourceText)
      } as unknown as ExpressionNode;

    // Unary postfix
    case 'RosettaExistsExpression':
    case 'RosettaAbsentExpression':
    case 'RosettaOnlyElement':
    case 'RosettaOnlyExistsExpression':
    case 'RosettaCountOperation':
    case 'FlattenOperation':
    case 'DistinctOperation':
    case 'ReverseOperation':
    case 'FirstOperation':
    case 'LastOperation':
    case 'SumOperation':
    case 'OneOfOperation':
    case 'ToStringOperation':
    case 'ToNumberOperation':
    case 'ToIntOperation':
    case 'ToTimeOperation':
    case 'ToDateOperation':
    case 'ToDateTimeOperation':
    case 'ToZonedDateTimeOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChild(ast.argument, sourceText)
      } as unknown as ExpressionNode;

    case 'ToEnumOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChild(ast.argument, sourceText),
        enumeration: resolveRef(ast.enumeration) ?? ''
      } as unknown as ExpressionNode;

    // Navigation
    case 'RosettaFeatureCall':
      return {
        $type,
        id,
        receiver: convertChildRequired(ast.receiver, sourceText),
        feature: resolveRef(ast.feature)
      } as unknown as ExpressionNode;

    case 'RosettaDeepFeatureCall':
      return {
        $type,
        id,
        receiver: convertChildRequired(ast.receiver, sourceText),
        feature: resolveRef(ast.feature)
      } as unknown as ExpressionNode;

    // Lambda operations
    case 'FilterOperation':
    case 'MapOperation':
    case 'ReduceOperation':
    case 'SortOperation':
    case 'MinOperation':
    case 'MaxOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChild(ast.argument, sourceText),
        function: convertInlineFunction(
          ast.function as Record<string, unknown> | undefined,
          sourceText
        )
      } as unknown as ExpressionNode;

    case 'ThenOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChildRequired(ast.argument, sourceText),
        function: convertInlineFunction(
          ast.function as Record<string, unknown> | undefined,
          sourceText
        )
      } as unknown as ExpressionNode;

    // Control flow
    case 'RosettaConditionalExpression':
      return {
        $type,
        id,
        if: convertChild(ast.if, sourceText),
        ifthen: convertChild(ast.ifthen, sourceText),
        full: ast.full,
        elsethen: convertChild(ast.elsethen, sourceText)
      } as unknown as ExpressionNode;

    case 'SwitchOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChild(ast.argument, sourceText),
        cases: ((ast.cases as Record<string, unknown>[]) ?? []).map((c) =>
          convertSwitchCase(c, sourceText)
        )
      } as unknown as ExpressionNode;

    // Constructor
    case 'RosettaConstructorExpression': {
      const typeRef = ast.typeRef as Record<string, unknown>;
      return {
        $type,
        id,
        typeRef: typeRef
          ? {
              $type: typeRef.$type,
              symbol: resolveRef(typeRef.symbol),
              name: typeRef.name,
              explicitArguments: typeRef.explicitArguments,
              rawArgs: typeRef.rawArgs
                ? (typeRef.rawArgs as unknown[]).map((a) => convertChildRequired(a, sourceText))
                : undefined
            }
          : undefined,
        implicitEmpty: ast.implicitEmpty,
        values: ((ast.values as Record<string, unknown>[]) ?? []).map((v) =>
          convertKVP(v, sourceText)
        )
      } as unknown as ExpressionNode;
    }

    // Literals
    case 'RosettaBooleanLiteral':
    case 'RosettaIntLiteral':
    case 'RosettaNumberLiteral':
    case 'RosettaStringLiteral':
      return { $type, id, value: ast.value } as unknown as ExpressionNode;

    // References
    case 'RosettaSymbolReference':
      return {
        $type,
        id,
        symbol: resolveRef(ast.symbol) ?? '',
        explicitArguments: ast.explicitArguments,
        rawArgs: ast.rawArgs
          ? (ast.rawArgs as unknown[]).map((a) => convertChildRequired(a, sourceText))
          : undefined
      } as unknown as ExpressionNode;

    case 'RosettaImplicitVariable':
      return { $type, id, name: ast.name } as unknown as ExpressionNode;

    // Collection
    case 'ListLiteral':
      return {
        $type,
        id,
        elements: ((ast.elements as unknown[]) ?? []).map((e) =>
          convertChildRequired(e, sourceText)
        )
      } as unknown as ExpressionNode;

    // Other
    case 'ChoiceOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChild(ast.argument, sourceText),
        attributes: ((ast.attributes as unknown[]) ?? []).map((a) => resolveRef(a) ?? '')
      } as unknown as ExpressionNode;

    case 'AsKeyOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChildRequired(ast.argument, sourceText)
      } as unknown as ExpressionNode;

    case 'WithMetaOperation':
      return {
        $type,
        id,
        operator: ast.operator,
        argument: convertChildRequired(ast.argument, sourceText)
      } as unknown as ExpressionNode;

    case 'RosettaSuperCall':
      return {
        $type,
        id,
        name: ast.name,
        explicitArguments: ast.explicitArguments,
        rawArgs: ast.rawArgs
          ? (ast.rawArgs as unknown[]).map((a) => convertChildRequired(a, sourceText))
          : undefined
      } as unknown as ExpressionNode;

    default:
      return { $type: 'Unsupported', id: uid(), rawText: sourceText } as unknown as ExpressionNode;
  }
}

/**
 * Convert a RosettaExpression AST node to an ExpressionNode.
 */
export function astToExpressionNode(ast: unknown, sourceText: string): ExpressionNode {
  if (!ast || typeof ast !== 'object') {
    return { $type: 'Unsupported', id: uid(), rawText: sourceText } as unknown as ExpressionNode;
  }
  return convertNode(ast as Record<string, unknown>, sourceText);
}
