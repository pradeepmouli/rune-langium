// Example: 10-level expression precedence chain ported from Xtext to Langium
// This demonstrates the core pattern for translating an LL(*) expression grammar
// to Chevrotain LL(k) using left-recursive action patterns.

// Entry rule: lowest precedence
ThenOperation returns Expression:
    OrOperation
    ({infer ThenOperation.argument=current} 'then' function=InlineFunction)*;

OrOperation returns Expression:
    AndOperation
    ({infer LogicalOperation.left=current} operator='or' right=AndOperation)*;

AndOperation returns Expression:
    EqualityOperation
    ({infer LogicalOperation.left=current} operator='and' right=EqualityOperation)*;

EqualityOperation returns Expression:
    ComparisonOperation
    ({infer EqualityOperation.left=current}
        cardMod=CardinalityModifier?
        operator=('=' | '<>')
        right=ComparisonOperation
    )*;

ComparisonOperation returns Expression:
    BinaryOperation
    ({infer ComparisonOperation.left=current}
        cardMod=CardinalityModifier?
        operator=('<' | '>' | '<=' | '>=')
        right=BinaryOperation
    )*;

// 'contains', 'disjoint', 'default', 'join' are keyword-based binary ops
BinaryOperation returns Expression:
    AdditiveOperation
    (
        {infer RosettaContainsExpression.left=current} 'contains' right=AdditiveOperation
      | {infer RosettaDisjointExpression.left=current} 'disjoint' right=AdditiveOperation
      | {infer DefaultOperation.left=current} 'default' right=AdditiveOperation
      | {infer JoinOperation.left=current} 'join' right=AdditiveOperation
    )*;

AdditiveOperation returns Expression:
    MultiplicativeOperation
    ({infer ArithmeticOperation.left=current} operator=('+' | '-') right=MultiplicativeOperation)*;

MultiplicativeOperation returns Expression:
    UnaryOperation
    ({infer ArithmeticOperation.left=current} operator=('*' | '/') right=UnaryOperation)*;

// Postfix unary operators grouped by argument pattern
UnaryOperation returns Expression:
    PostfixOperation
    (
        // Simple postfix (no arguments)
        {infer RosettaExistsExpression.argument=current} 'exists'
      | {infer RosettaAbsentExpression.argument=current} 'is' 'absent'
      | {infer RosettaCountOperation.argument=current} 'count'
      | {infer FlattenOperation.argument=current} 'flatten'
      | {infer DistinctOperation.argument=current} 'distinct'
      | {infer ReverseOperation.argument=current} 'reverse'
      | {infer FirstOperation.argument=current} 'first'
      | {infer LastOperation.argument=current} 'last'
      | {infer SumOperation.argument=current} 'sum'
      | {infer ToStringOperation.argument=current} 'to-string'
      | {infer ToNumberOperation.argument=current} 'to-number'
      | {infer ToIntOperation.argument=current} 'to-int'
        // With optional inline function
      | {infer SortOperation.argument=current} 'sort' function=InlineFunction?
      | {infer MinOperation.argument=current} 'min' function=InlineFunction?
      | {infer MaxOperation.argument=current} 'max' function=InlineFunction?
        // With required inline function
      | {infer FilterOperation.argument=current} 'filter' function=InlineFunction
      | {infer MapOperation.argument=current} 'extract' function=InlineFunction
      | {infer ReduceOperation.argument=current} 'reduce' function=InlineFunction
        // Type coercion with argument
      | {infer ToEnumOperation.argument=current} 'to-enum' enumeration=[Enumeration:QualifiedName]
    )*;

// Feature call navigation
PostfixOperation returns Expression:
    PrimaryExpression
    (
        {infer RosettaFeatureCall.receiver=current} '->' feature=[RosettaFeature:ID]
      | {infer RosettaDeepFeatureCall.receiver=current} '->>' feature=[RosettaFeature:ID]
    )*;

// Lowest level: literals, references, parenthesized expressions
PrimaryExpression returns Expression:
    RosettaBooleanLiteral
  | RosettaStringLiteral
  | RosettaNumberLiteral
  | RosettaIntLiteral
  | ListLiteral
  | RosettaSymbolReference
  | RosettaImplicitVariable
  | '(' Expression ')'
  | RosettaConditionalExpression
  | SwitchOperation
  | ConstructorExpression
  | 'empty';

// Conditional (if/then/else)
RosettaConditionalExpression returns Expression:
    'if' if=Expression 'then' ifthen=Expression (full?='else' elsethen=Expression)?;

// Inline function for functional operations
InlineFunction:
    '[' (parameter=ClosureParameter '|')? body=Expression ']';

ClosureParameter:
    name=ID;

// Cardinality modifier for comparison/equality
CardinalityModifier returns string:
    'all' | 'any';

// List literal
ListLiteral returns Expression:
    '[' elements+=Expression (',' elements+=Expression)* ']';

// Constructor expression
ConstructorExpression returns Expression:
    typeCall=TypeCall '{' (values+=ConstructorKeyValuePair (',' values+=ConstructorKeyValuePair)*)? '}';

ConstructorKeyValuePair:
    key=[RosettaFeature:ID] ':' value=Expression;

// Symbol reference
RosettaSymbolReference returns Expression:
    symbol=[RosettaSymbol:QualifiedName];

// Implicit variable (used inside functional operations without explicit parameter)
RosettaImplicitVariable returns Expression:
    {infer RosettaImplicitVariable} 'item';

// Literals
RosettaBooleanLiteral returns Expression:
    {infer RosettaBooleanLiteral} value?='True' | 'False';

RosettaStringLiteral returns Expression:
    {infer RosettaStringLiteral} value=STRING;

RosettaNumberLiteral returns Expression:
    {infer RosettaNumberLiteral} value=NUMBER;

RosettaIntLiteral returns Expression:
    {infer RosettaIntLiteral} value=INT;

// Switch operation
SwitchOperation returns Expression:
    'switch' argument=Expression
    cases+=SwitchCaseOrDefault+;

SwitchCaseOrDefault:
    'case' guard=SwitchCaseGuard 'then' expression=Expression
  | 'default' expression=Expression;

SwitchCaseGuard:
    name=ID;
