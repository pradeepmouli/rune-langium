// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Expression node schemas — derived from generated zod-schemas via deriveUiSchema().
 *
 * The ExpressionNode type is inferred from these schemas. Every variant gains
 * an `id: string` field for React key/selection tracking. Child expression
 * fields are relaxed to accept Placeholder/Unsupported variants.
 *
 * Two UI-only variants (Placeholder, Unsupported) are added that don't exist
 * in the grammar AST.
 *
 * @module
 */

import { z } from 'zod';
import { deriveUiSchema } from './derive-ui-schema.js';
import {
  ArithmeticOperationSchema,
  ComparisonOperationSchema,
  EqualityOperationSchema,
  LogicalOperationSchema,
  RosettaContainsExpressionSchema,
  RosettaDisjointExpressionSchema,
  DefaultOperationSchema,
  JoinOperationSchema,
  RosettaFeatureCallSchema,
  RosettaDeepFeatureCallSchema,
  RosettaExistsExpressionSchema,
  RosettaAbsentExpressionSchema,
  RosettaOnlyElementSchema,
  RosettaOnlyExistsExpressionSchema,
  RosettaCountOperationSchema,
  FlattenOperationSchema,
  DistinctOperationSchema,
  ReverseOperationSchema,
  FirstOperationSchema,
  LastOperationSchema,
  SumOperationSchema,
  OneOfOperationSchema,
  ToStringOperationSchema,
  ToNumberOperationSchema,
  ToIntOperationSchema,
  ToTimeOperationSchema,
  ToEnumOperationSchema,
  ToDateOperationSchema,
  ToDateTimeOperationSchema,
  ToZonedDateTimeOperationSchema,
  SortOperationSchema,
  MinOperationSchema,
  MaxOperationSchema,
  ReduceOperationSchema,
  FilterOperationSchema,
  MapOperationSchema,
  ThenOperationSchema,
  RosettaConditionalExpressionSchema,
  SwitchOperationSchema,
  SwitchCaseOrDefaultSchema,
  SwitchCaseGuardSchema,
  RosettaConstructorExpressionSchema,
  ConstructorKeyValuePairSchema,
  RosettaBooleanLiteralSchema,
  RosettaIntLiteralSchema,
  RosettaNumberLiteralSchema,
  RosettaStringLiteralSchema,
  RosettaSymbolReferenceSchema,
  RosettaImplicitVariableSchema,
  ListLiteralSchema,
  ChoiceOperationSchema,
  AsKeyOperationSchema,
  WithMetaOperationSchema,
  RosettaSuperCallSchema,
  InlineFunctionSchema,
  ClosureParameterSchema
} from '../generated/zod-schemas.js';

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

/** UI-only fields added to every expression node variant. */
const uiFields = { id: z.string().min(1) };

/** Lazy self-reference to the full ExpressionNode union. */
const exprChild: z.ZodLazy<z.ZodTypeAny> = z.lazy(() => ExpressionNodeSchema);

/** Optional child expression. */
const optExprChild: z.ZodOptional<z.ZodLazy<z.ZodTypeAny>> = z
  .lazy(() => ExpressionNodeSchema)
  .optional();

/** Resolved Reference → plain string (e.g., symbol.$refText). */
const resolvedRef = z.string();

// ---------------------------------------------------------------------------
// Helper: derive unary and lambda variants (many identical shapes)
// ---------------------------------------------------------------------------

function deriveUnary(schema: Parameters<typeof deriveUiSchema>[0]) {
  return deriveUiSchema(schema, {
    extend: uiFields,
    overrides: { argument: optExprChild }
  });
}

function deriveBinary(
  schema: Parameters<typeof deriveUiSchema>[0]
): z.ZodObject<z.ZodRawShape, any> {
  return deriveUiSchema(schema, {
    extend: uiFields,
    overrides: { left: optExprChild, right: exprChild }
  });
}

/** Inline function schema for lambda operations. */
const ExprInlineFunctionSchema = deriveUiSchema(InlineFunctionSchema, {
  overrides: {
    body: exprChild,
    parameters: z.array(ClosureParameterSchema).optional()
  }
});

function deriveLambda(schema: Parameters<typeof deriveUiSchema>[0]) {
  return deriveUiSchema(schema, {
    extend: uiFields,
    overrides: {
      argument: optExprChild,
      function: ExprInlineFunctionSchema.optional()
    }
  });
}

// ---------------------------------------------------------------------------
// Binary operations
// ---------------------------------------------------------------------------

const ArithmeticNodeSchema = deriveUiSchema(ArithmeticOperationSchema, {
  extend: uiFields,
  overrides: { left: exprChild, right: exprChild }
});

const ComparisonNodeSchema = deriveBinary(ComparisonOperationSchema);
const EqualityNodeSchema = deriveBinary(EqualityOperationSchema);

const LogicalNodeSchema = deriveUiSchema(LogicalOperationSchema, {
  extend: uiFields,
  overrides: { left: exprChild, right: exprChild }
});

const ContainsNodeSchema = deriveBinary(RosettaContainsExpressionSchema);
const DisjointNodeSchema = deriveBinary(RosettaDisjointExpressionSchema);
const DefaultNodeSchema = deriveBinary(DefaultOperationSchema);
const JoinNodeSchema = deriveUiSchema(JoinOperationSchema, {
  extend: uiFields,
  overrides: { left: optExprChild, right: optExprChild }
});

// ---------------------------------------------------------------------------
// Unary postfix operations
// ---------------------------------------------------------------------------

const ExistsNodeSchema = deriveUiSchema(RosettaExistsExpressionSchema, {
  extend: uiFields,
  overrides: { argument: optExprChild }
});

const AbsentNodeSchema = deriveUnary(RosettaAbsentExpressionSchema);
const OnlyElementNodeSchema = deriveUnary(RosettaOnlyElementSchema);
const OnlyExistsNodeSchema = deriveUiSchema(RosettaOnlyExistsExpressionSchema, {
  extend: uiFields,
  overrides: { argument: optExprChild }
});
const CountNodeSchema = deriveUnary(RosettaCountOperationSchema);
const FlattenNodeSchema = deriveUnary(FlattenOperationSchema);
const DistinctNodeSchema = deriveUnary(DistinctOperationSchema);
const ReverseNodeSchema = deriveUnary(ReverseOperationSchema);
const FirstNodeSchema = deriveUnary(FirstOperationSchema);
const LastNodeSchema = deriveUnary(LastOperationSchema);
const SumNodeSchema = deriveUnary(SumOperationSchema);
const OneOfNodeSchema = deriveUnary(OneOfOperationSchema);

// Type conversion operations
const ToStringNodeSchema = deriveUnary(ToStringOperationSchema);
const ToNumberNodeSchema = deriveUnary(ToNumberOperationSchema);
const ToIntNodeSchema = deriveUnary(ToIntOperationSchema);
const ToTimeNodeSchema = deriveUnary(ToTimeOperationSchema);
const ToEnumNodeSchema = deriveUiSchema(ToEnumOperationSchema, {
  extend: uiFields,
  overrides: { argument: optExprChild, enumeration: resolvedRef }
});
const ToDateNodeSchema = deriveUnary(ToDateOperationSchema);
const ToDateTimeNodeSchema = deriveUnary(ToDateTimeOperationSchema);
const ToZonedDateTimeNodeSchema = deriveUnary(ToZonedDateTimeOperationSchema);

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const FeatureCallNodeSchema = deriveUiSchema(RosettaFeatureCallSchema, {
  extend: uiFields,
  overrides: { receiver: exprChild, feature: resolvedRef.optional() }
});

const DeepFeatureCallNodeSchema = deriveUiSchema(RosettaDeepFeatureCallSchema, {
  extend: uiFields,
  overrides: { receiver: exprChild, feature: resolvedRef.optional() }
});

// ---------------------------------------------------------------------------
// Lambda operations (collection + then)
// ---------------------------------------------------------------------------

const FilterNodeSchema = deriveLambda(FilterOperationSchema);
const MapNodeSchema = deriveLambda(MapOperationSchema);
const ReduceNodeSchema = deriveLambda(ReduceOperationSchema);
const SortNodeSchema = deriveLambda(SortOperationSchema);
const MinNodeSchema = deriveLambda(MinOperationSchema);
const MaxNodeSchema = deriveLambda(MaxOperationSchema);
const ThenNodeSchema = deriveUiSchema(ThenOperationSchema, {
  extend: uiFields,
  overrides: {
    argument: exprChild,
    function: ExprInlineFunctionSchema.optional()
  }
});

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

const ConditionalNodeSchema = deriveUiSchema(RosettaConditionalExpressionSchema, {
  extend: uiFields,
  overrides: {
    if: optExprChild,
    ifthen: optExprChild,
    elsethen: optExprChild
  }
});

/** Switch case guard with resolved reference. */
const ExprSwitchCaseGuardSchema = deriveUiSchema(SwitchCaseGuardSchema, {
  overrides: { referenceGuard: resolvedRef.optional() }
});

/** Switch case with expression child. */
const ExprSwitchCaseOrDefaultSchema = deriveUiSchema(SwitchCaseOrDefaultSchema, {
  overrides: {
    expression: exprChild,
    guard: ExprSwitchCaseGuardSchema.optional()
  }
});

const SwitchNodeSchema = deriveUiSchema(SwitchOperationSchema, {
  extend: uiFields,
  overrides: {
    argument: optExprChild,
    cases: z.array(ExprSwitchCaseOrDefaultSchema)
  }
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

/** Constructor key-value pair with resolved key reference. */
const ExprConstructorKeyValuePairSchema = deriveUiSchema(ConstructorKeyValuePairSchema, {
  overrides: { key: resolvedRef, value: exprChild }
});

const ConstructorNodeSchema = deriveUiSchema(RosettaConstructorExpressionSchema, {
  extend: uiFields,
  overrides: {
    typeRef: z.union([
      deriveUiSchema(RosettaSuperCallSchema, {
        overrides: { rawArgs: z.array(exprChild).optional() }
      }),
      deriveUiSchema(RosettaSymbolReferenceSchema, {
        overrides: { symbol: resolvedRef, rawArgs: z.array(exprChild).optional() }
      })
    ]),
    values: z.array(ExprConstructorKeyValuePairSchema).optional()
  }
});

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

const BooleanLiteralNodeSchema = deriveUiSchema(RosettaBooleanLiteralSchema, {
  extend: uiFields
});

const IntLiteralNodeSchema = deriveUiSchema(RosettaIntLiteralSchema, {
  extend: uiFields
});

const NumberLiteralNodeSchema = deriveUiSchema(RosettaNumberLiteralSchema, {
  extend: uiFields
});

const StringLiteralNodeSchema = deriveUiSchema(RosettaStringLiteralSchema, {
  extend: uiFields
});

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const SymbolReferenceNodeSchema = deriveUiSchema(RosettaSymbolReferenceSchema, {
  extend: uiFields,
  overrides: { symbol: resolvedRef, rawArgs: z.array(exprChild).optional() }
});

const ImplicitVariableNodeSchema = deriveUiSchema(RosettaImplicitVariableSchema, {
  extend: uiFields
});

// ---------------------------------------------------------------------------
// Collection literal
// ---------------------------------------------------------------------------

const ListLiteralNodeSchema = deriveUiSchema(ListLiteralSchema, {
  extend: uiFields,
  overrides: { elements: z.array(exprChild).optional() }
});

// ---------------------------------------------------------------------------
// Other expression types
// ---------------------------------------------------------------------------

const ChoiceOperationNodeSchema = deriveUiSchema(ChoiceOperationSchema, {
  extend: uiFields,
  overrides: {
    argument: optExprChild,
    attributes: z.array(resolvedRef)
  }
});

const AsKeyNodeSchema = deriveUiSchema(AsKeyOperationSchema, {
  extend: uiFields,
  overrides: { argument: exprChild }
});

const WithMetaNodeSchema = deriveUiSchema(WithMetaOperationSchema, {
  extend: uiFields,
  overrides: { argument: exprChild }
});

const SuperCallNodeSchema = deriveUiSchema(RosettaSuperCallSchema, {
  extend: uiFields,
  overrides: { rawArgs: z.array(exprChild).optional() }
});

// ---------------------------------------------------------------------------
// UI-only variants (no generated source)
// ---------------------------------------------------------------------------

const PlaceholderNodeSchema = z.looseObject({
  $type: z.literal('Placeholder'),
  id: z.string().min(1),
  expectedType: z.enum(['any', 'boolean', 'numeric', 'collection']).optional()
});

const UnsupportedNodeSchema = z.looseObject({
  $type: z.literal('Unsupported'),
  id: z.string().min(1),
  rawText: z.string()
});

// ---------------------------------------------------------------------------
// Composed discriminated union
// ---------------------------------------------------------------------------

export const ExpressionNodeSchema = z.discriminatedUnion('$type', [
  // Binary
  ArithmeticNodeSchema,
  ComparisonNodeSchema,
  EqualityNodeSchema,
  LogicalNodeSchema,
  ContainsNodeSchema,
  DisjointNodeSchema,
  DefaultNodeSchema,
  JoinNodeSchema,
  // Unary postfix
  ExistsNodeSchema,
  AbsentNodeSchema,
  OnlyElementNodeSchema,
  OnlyExistsNodeSchema,
  CountNodeSchema,
  FlattenNodeSchema,
  DistinctNodeSchema,
  ReverseNodeSchema,
  FirstNodeSchema,
  LastNodeSchema,
  SumNodeSchema,
  OneOfNodeSchema,
  // Type conversions
  ToStringNodeSchema,
  ToNumberNodeSchema,
  ToIntNodeSchema,
  ToTimeNodeSchema,
  ToEnumNodeSchema,
  ToDateNodeSchema,
  ToDateTimeNodeSchema,
  ToZonedDateTimeNodeSchema,
  // Navigation
  FeatureCallNodeSchema,
  DeepFeatureCallNodeSchema,
  // Lambda
  FilterNodeSchema,
  MapNodeSchema,
  ReduceNodeSchema,
  SortNodeSchema,
  MinNodeSchema,
  MaxNodeSchema,
  ThenNodeSchema,
  // Control flow
  ConditionalNodeSchema,
  SwitchNodeSchema,
  // Constructor
  ConstructorNodeSchema,
  // Literals
  BooleanLiteralNodeSchema,
  IntLiteralNodeSchema,
  NumberLiteralNodeSchema,
  StringLiteralNodeSchema,
  // References
  SymbolReferenceNodeSchema,
  ImplicitVariableNodeSchema,
  // Collection
  ListLiteralNodeSchema,
  // Other
  ChoiceOperationNodeSchema,
  AsKeyNodeSchema,
  WithMetaNodeSchema,
  SuperCallNodeSchema,
  // UI-only
  PlaceholderNodeSchema,
  UnsupportedNodeSchema
]);

/** The builder's expression node type — inferred from transformed schemas. */
export type ExpressionNode = z.infer<typeof ExpressionNodeSchema>;

/** All possible $type values for ExpressionNode. */
export type ExpressionNodeType = ExpressionNode['$type'];

// Re-export sub-schemas for use in adapters
export {
  ExprSwitchCaseOrDefaultSchema,
  ExprSwitchCaseGuardSchema,
  ExprConstructorKeyValuePairSchema,
  ExprInlineFunctionSchema,
  PlaceholderNodeSchema,
  UnsupportedNodeSchema
};
