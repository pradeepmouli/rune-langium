# Grammar Translation Patterns: Xtext to Langium

## Terminal Rules

Langium and Xtext terminal syntax is nearly identical. Common terminals translate directly:

```langium
// Langium terminals (equivalent to Xtext common.Terminals)
terminal ID: /[a-zA-Z_][a-zA-Z0-9_]*/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal INT: /[0-9]+/;
terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal WS: /\s+/;
```

Key differences:
- Langium uses regex syntax instead of ANTLR character classes
- `hidden` keyword replaces the `hidden()` grammar clause
- Terminal fragments use `terminal fragment` (same keyword)

## Qualified Names

Xtext:
```xtext
QualifiedName: ID ('.' ID)*;
```

Langium:
```langium
QualifiedName returns string:
    ID ('.' ID)*;
```

Note: In Langium, `returns string` makes this a data type rule (returns a string value, not an AST node).

## Cross-References

Xtext:
```xtext
superType=[Data|QualifiedName]
```

Langium:
```langium
superType=[Data:QualifiedName]
```

The only change: `|` becomes `:` inside cross-reference brackets.

## Actions (Type Inference)

Xtext:
```xtext
Expression:
    ComparisonExpression ({BinaryExpression.left=current} op='+' right=ComparisonExpression)*;
```

Langium:
```langium
Expression:
    ComparisonExpression ({infer BinaryExpression.left=current} op='+' right=ComparisonExpression)*;
```

Key: Add `infer` keyword before the action type name. This tells Langium to infer the type from the grammar rather than requiring a pre-defined interface.

## Precedence Chains

A 10-level expression precedence chain translates structurally:

```
Xtext (LL(*)):                    Langium (LL(k)):
ThenOperation                     ThenOperation
  -> OrOperation                    -> OrOperation
    -> AndOperation                   -> AndOperation
      -> EqualityOperation              -> EqualityOperation
        -> ComparisonOperation            -> ComparisonOperation
          -> BinaryOperation                -> BinaryOperation
            -> AdditiveOperation              -> AdditiveOperation
              -> MultiplicativeOp               -> MultiplicativeOp
                -> UnaryOperation                 -> UnaryOperation
                  -> PrimaryExpr                    -> PrimaryExpr
```

Each level follows the same pattern:

```langium
AdditiveOperation returns Expression:
    MultiplicativeOperation
    ({infer ArithmeticOperation.left=current} operator=('+' | '-') right=MultiplicativeOperation)*;
```

## Eliminating Syntactic Predicates

### `=>` Predicates (Syntactic Predicates)

Xtext `=>` forces the parser to commit after matching a prefix. In LL(k), restructure to make the choice unambiguous within k tokens.

**Before (Xtext)**:
```xtext
FeatureCall:
    (=> receiver=Expression '->') feature=[Feature|ID]
    | feature=[Feature|ID];
```

**After (Langium)**: Restructure so the parser sees the distinguishing token within `maxLookahead`:
```langium
FeatureCall returns Expression:
    PrimaryExpression
    ({infer RosettaFeatureCall.receiver=current} '->' feature=[RosettaFeature:ID])*;
```

The left-recursive iteration pattern (`*`) eliminates the predicate entirely.

### `->` Predicates (Backtracking)

Xtext `->` enables backtracking. Eliminate by factoring out the common prefix.

**Before (Xtext)**:
```xtext
Statement:
    -> Declaration | Expression;

Declaration:
    type=TypeRef name=ID '=' init=Expression;
```

**After (Langium)**: Factor common prefix:
```langium
Statement:
    TypeRef (
        {infer Declaration} name=ID '=' init=Expression
        | {infer TypeExpression}
    );
```

### Ambiguous `<` Token

When `<` serves dual purpose (e.g., documentation strings `<"...">` vs comparison operator), resolve by:

1. **Separate terminals**: Create a `DOC_STRING` terminal with higher priority
2. **Keyword gating**: Use a preceding keyword to disambiguate context
3. **Lookahead**: If the token after `<` is `"`, it's documentation

```langium
terminal DOC_REF: /<"[^"]*">/;
// Now `<` is unambiguous as comparison operator
```

## The "Without Left Parameter" Pattern

Some Xtext grammars duplicate rules for "with" and "without" a left-side implicit parameter (e.g., for functional operations where the input is implicit).

**Xtext approach**: 7+ duplicated rules like `FilterOperationWithoutLeftParameter`, `MapOperationWithoutLeftParameter`, etc.

**Langium redesign options**:

### Option A: Parser Actions (Post-Parse Rewrite)
Parse a single unified rule, then inject the implicit variable in a post-parse processing step:

```langium
FilterOperation returns Expression:
    receiver=Expression 'filter' function=InlineFunction;
```

After parsing, if `function` has no explicit parameter, inject an implicit variable reference.

### Option B: Optional Receiver
Make the receiver optional in the grammar:

```langium
FilterOperation returns Expression:
    (receiver=Expression)? 'filter' function=InlineFunction;
```

When `receiver` is absent, the consuming code treats it as an implicit variable binding.

### Option C: Unified Rule with Implicit Variable Detection
Use a single rule and detect implicit variables during scoping:

```langium
InlineFunction:
    '[' (parameter=ClosureParameter '|')? body=Expression ']';

// If no parameter declared, `item` is implicitly available via scope provider
```

**Recommendation**: Option C is the most Langium-idiomatic. Handle implicit variables in the scope provider, not the grammar.

## Postfix Operator Chains

Xtext grammars often have long chains of postfix unary operators. Group them by argument pattern:

```langium
UnaryOperation returns Expression:
    PostfixOperation
    // Simple postfix (no arguments)
    ({infer RosettaExistsExpression.argument=current} 'exists'
     | {infer RosettaAbsentExpression.argument=current} 'is' 'absent'
     | {infer RosettaCountOperation.argument=current} 'count'
     | {infer FlattenOperation.argument=current} 'flatten'
     | {infer DistinctOperation.argument=current} 'distinct'
     | {infer ReverseOperation.argument=current} 'reverse'
     | {infer FirstOperation.argument=current} 'first'
     | {infer LastOperation.argument=current} 'last'
     | {infer SumOperation.argument=current} 'sum'
    // With optional inline function
     | {infer SortOperation.argument=current} 'sort' function=InlineFunction?
     | {infer MinOperation.argument=current} 'min' function=InlineFunction?
     | {infer MaxOperation.argument=current} 'max' function=InlineFunction?
    // With required inline function
     | {infer FilterOperation.argument=current} 'filter' function=InlineFunction
     | {infer MapOperation.argument=current} 'extract' function=InlineFunction
     | {infer ReduceOperation.argument=current} 'reduce' function=InlineFunction
    // Type coercion
     | {infer ToStringOperation.argument=current} 'to-string'
     | {infer ToNumberOperation.argument=current} 'to-number'
     | {infer ToEnumOperation.argument=current} 'to-enum' enumeration=[Enumeration:QualifiedName]
    )*;
```

## Xcore Operations to TypeScript Utilities

Xcore metamodels define Java operations on model classes. These become TypeScript utility modules:

### Cardinality Algebra (from `RosettaCardinality` Xcore operations)
```typescript
// cardinality-utils.ts
export function isOptional(card: RosettaCardinality): boolean {
    return card.inf === 0;
}
export function isSingular(card: RosettaCardinality): boolean {
    return card.sup === 1;
}
export function isPlural(card: RosettaCardinality): boolean {
    return card.sup === '*' || (typeof card.sup === 'number' && card.sup > 1);
}
export function addCardinality(a: RosettaCardinality, b: RosettaCardinality): RosettaCardinality {
    const inf = a.inf + b.inf;
    if (a.sup === '*' || b.sup === '*') return { inf, sup: '*', unbounded: true };
    return { inf, sup: (a.sup as number) + (b.sup as number), unbounded: false };
}
```

### Choice Derived Conditions (from `Choice` Xcore operations)
```typescript
// choice-utils.ts
export function getEffectiveConditions(choice: Choice): Condition[] {
    // Auto-generates "one-of" condition from choice options
    // Mirrors the Xcore derived `conditions` operation
}
```

### Expression Utilities (from `Expression` Xcore operations)
```typescript
// expression-utils.ts
export function hasGeneratedInput(expr: Expression): boolean {
    // Check if expression has a compiler-generated implicit input
}
```

## Fragment Rules

Xtext fragment rules translate directly:

```xtext
fragment DefinableElement:
    name=ValidID definition=DEFINITION_BODY?;
```

```langium
fragment DefinableElement:
    name=ValidID definition=DEFINITION_BODY?;
```

Use fragments for shared field patterns across multiple rules (e.g., `name` + `definition` appearing on Data, Choice, Enumeration, Function).

## Enum Rules

Xtext:
```xtext
enum Necessity: optional | required;
```

Langium (no `enum` keyword; use string alternatives):
```langium
Necessity returns string: 'optional' | 'required';
```

Or define as a TypeScript enum and reference it:
```langium
// In grammar
necessity=('optional' | 'required')

// In TypeScript
export type Necessity = 'optional' | 'required';
```
