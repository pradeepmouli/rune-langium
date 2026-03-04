/**
 * expression-node-to-dsl — Serialize an ExpressionNode tree to Rune DSL text.
 *
 * Uses visitor-pattern dispatch over the $type discriminator.
 * Handles operator precedence via parenthesization.
 *
 * @module
 */

import type { ExpressionNode } from '../schemas/expression-node-schema.js';

const PLACEHOLDER_MARKER = '___';

/**
 * Serialize an ExpressionNode tree to Rune DSL text.
 * Throws if tree contains placeholder nodes.
 */
export function expressionNodeToDsl(tree: ExpressionNode): string {
  return serialize(tree, false);
}

/**
 * Serialize with placeholders replaced by a marker (for preview).
 * Returns text with `___` at placeholder positions.
 */
export function expressionNodeToDslPreview(tree: ExpressionNode): string {
  return serialize(tree, true);
}

function serialize(node: ExpressionNode, allowPlaceholders: boolean): string {
  const s = (n: ExpressionNode | undefined) => {
    if (n == null) return '';
    return serialize(n, allowPlaceholders);
  };

  switch (node.$type) {
    // UI-only
    case 'Placeholder':
      if (!allowPlaceholders)
        throw new Error('Cannot serialize expression containing placeholders');
      return PLACEHOLDER_MARKER;

    case 'Unsupported':
      return (node as any).rawText ?? '';

    // Literals
    case 'RosettaBooleanLiteral':
      return (node as any).value ? 'True' : 'False';

    case 'RosettaIntLiteral':
      return String((node as any).value);

    case 'RosettaNumberLiteral':
      return String((node as any).value);

    case 'RosettaStringLiteral':
      return `"${(node as any).value}"`;

    // References
    case 'RosettaSymbolReference': {
      const sym = (node as any).symbol as string;
      const rawArgs = (node as any).rawArgs as ExpressionNode[] | undefined;
      if (rawArgs && rawArgs.length > 0) {
        return `${sym}(${rawArgs.map(s).join(', ')})`;
      }
      return sym;
    }

    case 'RosettaImplicitVariable':
      return (node as any).name ?? 'item';

    // Binary
    case 'ArithmeticOperation':
    case 'LogicalOperation': {
      const left = s((node as any).left);
      const right = s((node as any).right);
      return `${left} ${(node as any).operator} ${right}`;
    }

    case 'ComparisonOperation':
    case 'EqualityOperation':
    case 'RosettaContainsExpression':
    case 'RosettaDisjointExpression':
    case 'DefaultOperation': {
      const left = (node as any).left ? s((node as any).left) : '';
      const right = s((node as any).right);
      const cardMod = (node as any).cardMod ? `${(node as any).cardMod} ` : '';
      return left
        ? `${left} ${cardMod}${(node as any).operator} ${right}`
        : `${cardMod}${(node as any).operator} ${right}`;
    }

    case 'JoinOperation': {
      const left = (node as any).left ? s((node as any).left) : '';
      const right = (node as any).right ? s((node as any).right) : '';
      const parts = [left, 'join'];
      if (right) parts.push(right);
      return parts.filter(Boolean).join(' ');
    }

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
    case 'ToZonedDateTimeOperation': {
      const arg = (node as any).argument ? s((node as any).argument) : '';
      const op = (node as any).operator;
      return arg ? `${arg} ${op}` : op;
    }

    case 'ToEnumOperation': {
      const arg = (node as any).argument ? s((node as any).argument) : '';
      const enumName = (node as any).enumeration ?? '';
      return arg ? `${arg} to-enum ${enumName}` : `to-enum ${enumName}`;
    }

    // Navigation
    case 'RosettaFeatureCall': {
      const receiver = s((node as any).receiver);
      const feature = (node as any).feature ?? '';
      return `${receiver} -> ${feature}`;
    }

    case 'RosettaDeepFeatureCall': {
      const receiver = s((node as any).receiver);
      const feature = (node as any).feature ?? '';
      return `${receiver} ->> ${feature}`;
    }

    // Lambda operations
    case 'FilterOperation':
    case 'MapOperation':
    case 'ReduceOperation':
    case 'SortOperation':
    case 'MinOperation':
    case 'MaxOperation': {
      const arg = (node as any).argument ? s((node as any).argument) : '';
      const op = (node as any).operator;
      const fn = (node as any).function;
      const fnStr = fn ? ` ${serializeInlineFunction(fn, allowPlaceholders)}` : '';
      return arg ? `${arg} ${op}${fnStr}` : `${op}${fnStr}`;
    }

    case 'ThenOperation': {
      const arg = s((node as any).argument);
      const fn = (node as any).function;
      const fnStr = fn ? ` ${serializeInlineFunction(fn, allowPlaceholders)}` : '';
      return `${arg} then${fnStr}`;
    }

    // Control flow
    case 'RosettaConditionalExpression': {
      const cond = (node as any).if ? s((node as any).if) : '';
      const then = (node as any).ifthen ? s((node as any).ifthen) : '';
      const els = (node as any).elsethen ? s((node as any).elsethen) : '';
      let result = `if ${cond} then ${then}`;
      if (els) result += ` else ${els}`;
      return result;
    }

    case 'SwitchOperation': {
      const arg = (node as any).argument ? s((node as any).argument) : '';
      const cases = ((node as any).cases ?? []) as Array<{
        $type: string;
        expression: ExpressionNode;
        guard?: { referenceGuard?: string; literalGuard?: unknown };
      }>;
      const casesStr = cases
        .map((c) => {
          const expr = serialize(c.expression, allowPlaceholders);
          if (c.guard?.referenceGuard) {
            return `${c.guard.referenceGuard} then ${expr}`;
          }
          if (c.guard?.literalGuard) {
            return `${serialize(c.guard.literalGuard as ExpressionNode, allowPlaceholders)} then ${expr}`;
          }
          return `default ${expr}`;
        })
        .join(',\n    ');
      return `${arg} switch\n    ${casesStr}`;
    }

    // Constructor
    case 'RosettaConstructorExpression': {
      const typeRef = (node as any).typeRef;
      const typeName = typeRef?.symbol ?? typeRef?.name ?? '';
      const values = ((node as any).values ?? []) as Array<{
        key: string;
        value: ExpressionNode;
      }>;
      if (values.length === 0) return `${typeName} {}`;
      const pairs = values
        .map((v) => `${v.key}: ${serialize(v.value, allowPlaceholders)}`)
        .join(', ');
      return `${typeName} { ${pairs} }`;
    }

    // Collection
    case 'ListLiteral': {
      const elements = ((node as any).elements ?? []) as ExpressionNode[];
      return `[${elements.map((e) => serialize(e, allowPlaceholders)).join(', ')}]`;
    }

    // Other
    case 'ChoiceOperation': {
      const arg = (node as any).argument ? s((node as any).argument) : '';
      const attrs = ((node as any).attributes ?? []) as string[];
      return arg ? `${arg} choice ${attrs.join(', ')}` : `choice ${attrs.join(', ')}`;
    }

    case 'AsKeyOperation':
      return `${s((node as any).argument)} as-key`;

    case 'WithMetaOperation':
      return `${s((node as any).argument)} with-meta`;

    case 'RosettaSuperCall': {
      const rawArgs = (node as any).rawArgs as ExpressionNode[] | undefined;
      if (rawArgs && rawArgs.length > 0) {
        return `super(${rawArgs.map(s).join(', ')})`;
      }
      return 'super';
    }

    default:
      return `/* unknown: ${(node as any).$type} */`;
  }
}

function serializeInlineFunction(
  fn: { body: ExpressionNode; parameters?: Array<{ name: string }> },
  allowPlaceholders: boolean
): string {
  const params = fn.parameters?.map((p) => p.name) ?? [];
  const body = serialize(fn.body, allowPlaceholders);
  if (params.length > 0) {
    return `[${params.join(', ')} ${body}]`;
  }
  return `[${body}]`;
}
