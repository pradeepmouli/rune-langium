# Data Model -- rune-langium

## Overview

The `rune-langium` package produces two categories of types: (1) **generated AST types** from `langium-cli` (source of truth), and (2) **hand-written utility types** for computed properties and public API surface.

## Package Exports

```typescript
// Main entry point: @rune-langium/core
export {
  // Generated AST types (from langium-cli)
  type RosettaModel, type Data, type Choice, type Attribute,
  type Enumeration, type Function, type Expression, /* ... ~95 types */

  // Type guards
  isData, isChoice, isFunction, isEnumeration, /* ... */

  // Parser services
  parse, parseWorkspace, createRuneServices,

  // Validation
  validate, type Diagnostic,

  // Utilities
  CardinailtyUtils, ChoiceUtils, ExpressionUtils,
} from '@rune-langium/core';
```

## Generated AST Types (from Langium grammar)

Auto-generated into `src/generated/ast.ts` by `langium-cli`. The grammar defines ~95 rules producing ~95 interfaces.

### Core Model

### RosettaModel
- **Fields**: `name`, `version?`, `scope?`, `imports[]`, `elements[]`
- **Validation**: `name` must be a valid qualified name

### Import
- **Fields**: `importedNamespace`, `alias?`
- **Validation**: must resolve to an existing namespace

### Top-Level Elements (union type `RosettaRootElement`)

### Data
- **Fields**: `name`, `definition?`, `superType?: Reference<Data>`, `annotations[]`, `synonyms[]`, `attributes[]`, `conditions[]`
- **Validation**: no cyclic inheritance, unique attribute names

### Choice
- **Fields**: `name`, `definition?`, `annotations[]`, `options: ChoiceOption[]`
- **Validation**: at least 2 options, no cyclic inheritance
- **Derived**: auto-generated `one-of` condition (utility function)

### Attribute
- **Fields**: `name`, `override?`, `typeCall: TypeCall`, `card: RosettaCardinality`, `definition?`, `synonyms[]`, `labels[]`, `ruleReferences[]`
- **Validation**: cardinality must be valid, type must resolve

### Enumeration
- **Fields**: `name`, `definition?`, `superType?: Reference<Enumeration>`, `synonyms[]`, `values: RosettaEnumValue[]`
- **Validation**: unique value names, no cycles

### RosettaEnumValue
- **Fields**: `name`, `displayName?`, `definition?`, `enumSynonyms[]`

### Function
- **Fields**: `name`, `definition?`, `superFunction?: Reference<Function>`, `annotations[]`, `inputs: Attribute[]`, `output: Attribute`, `shortcuts: ShortcutDeclaration[]`, `conditions: Condition[]`, `operations: Operation[]`, `postConditions: Condition[]`
- **Validation**: output type required, operation paths must be valid

### Condition
- **Fields**: `name?`, `definition?`, `postCondition?`, `expression: Expression`

### ShortcutDeclaration
- **Fields**: `name`, `definition?`, `expression: Expression`

### Operation
- **Fields**: `assignRoot: Reference<AssignPathRoot>`, `path: Segment[]`, `expression: Expression`, `add?`

### Expression Hierarchy (discriminated union `Expression`)

### Binary Operations
- `ArithmeticOperation` -- `left`, `operator: '+'|'-'|'*'|'/'`, `right`
- `LogicalOperation` -- `left`, `operator: 'and'|'or'`, `right`
- `EqualityOperation` -- `left`, `operator: '='|'<>'`, `right`, `cardMod?`
- `ComparisonOperation` -- `left`, `operator: '<'|'>'|'<='|'>='`, `right`, `cardMod?`
- `RosettaContainsExpression` -- `left`, `right`
- `RosettaDisjointExpression` -- `left`, `right`
- `DefaultOperation` -- `left`, `right`
- `JoinOperation` -- `left`, `right`

### Unary Operations
- `RosettaExistsExpression` -- `argument`, `modifier?: ExistsModifier`
- `RosettaAbsentExpression` -- `argument`
- `RosettaOnlyElement`, `RosettaCountOperation`, `FlattenOperation`, `DistinctOperation`, `ReverseOperation`, `FirstOperation`, `LastOperation`, `SumOperation` -- `argument`
- `OneOfOperation`, `ChoiceOperation` -- `argument`, `necessity`
- `ToStringOperation`, `ToNumberOperation`, `ToIntOperation`, `ToTimeOperation`, `ToDateOperation`, `ToDateTimeOperation`, `ToZonedDateTimeOperation` -- `argument`
- `ToEnumOperation` -- `argument`, `enumeration: Reference<Enumeration>`
- `AsKeyOperation` -- `argument`

### Functional Operations
- `FilterOperation` -- `argument`, `function: InlineFunction`
- `MapOperation` -- `argument`, `function: InlineFunction`
- `ReduceOperation` -- `argument`, `function: InlineFunction`
- `SortOperation` -- `argument`, `function?: InlineFunction`
- `MinOperation` -- `argument`, `function?: InlineFunction`
- `MaxOperation` -- `argument`, `function?: InlineFunction`
- `ThenOperation` -- `argument`, `function: InlineFunction`

### Control Flow
- `RosettaConditionalExpression` -- `if`, `ifthen`, `full?`, `elsethen?`
- `SwitchOperation` -- `argument`, `cases: SwitchCaseOrDefault[]`
- `WithMetaOperation` -- `argument`, `entries: WithMetaEntry[]`

### References & Calls
- `RosettaSymbolReference` -- `symbol: Reference<RosettaSymbol>`, `args?`
- `RosettaFeatureCall` -- `receiver`, `feature: Reference<RosettaFeature>`
- `RosettaDeepFeatureCall` -- `receiver`, `feature: Reference<RosettaFeature>`
- `RosettaImplicitVariable` -- (implicit `item` variable)
- `RosettaSuperCall` -- (super function reference)
- `RosettaConstructorExpression` -- `typeCall`, `values: ConstructorKeyValuePair[]`

### Literals
- `RosettaBooleanLiteral` -- `value: boolean`
- `RosettaStringLiteral` -- `value: string`
- `RosettaNumberLiteral` -- `value: string` (BigDecimal)
- `RosettaIntLiteral` -- `value: string` (BigInteger)
- `ListLiteral` -- `elements: Expression[]`

### Enums (generated)
- `ExistsModifier` -- `NONE | SINGLE | MULTIPLE`
- `CardinalityModifier` -- `NONE | ALL | ANY`
- `Necessity` -- `optional | required`

### Type System
- `TypeCall` -- `type: Reference<RosettaType>`, `arguments?`
- `TypeCallArgument` -- `parameter: Reference<TypeParameter>`, `expression`
- `RosettaCardinality` -- `inf: number`, `sup: number | '*'`, `unbounded?`

### Synonym System
- `RosettaSynonym` -- `body`, `source: Reference<RosettaSynonymSource>`
- `RosettaSynonymBody` -- `values[]`, `hints[]`, `mappings[]`, `merge?`
- `RosettaSynonymValue` -- `name`, `path?`, `maps?`, `pattern?`
- `RosettaClassSynonym`, `RosettaEnumSynonym`, `RosettaMergeSynonymValue`
- `RosettaMapping` -- `instances[]`

### Reporting & Regulatory
- `RosettaReport` -- `body: Reference<RosettaBody>`, `corpuses[]`, `rules[]`
- `RosettaRule` -- `name`, `input?: Reference<Data>`, `expression`
- `RosettaBody`, `RosettaCorpus`, `RosettaSegment`, `RosettaDocReference`

### Annotation System
- `Annotation` -- `name`, `prefix?`, `attributes[]`
- `AnnotationRef` -- `annotation: Reference<Annotation>`, `attribute?`, `qualifiers[]`
- `LabelAnnotation`, `RuleReferenceAnnotation`

## Hand-Written Utility Types

Exported alongside generated types for computed properties from the Xcore metamodels:

### CardinalityUtils
- `isOptional(card: RosettaCardinality): boolean`
- `isSingular(card: RosettaCardinality): boolean`
- `isPlural(card: RosettaCardinality): boolean`
- `isEmpty(card: RosettaCardinality): boolean`
- `addCardinality(a, b): RosettaCardinality`
- `multiplyCardinality(a, b): RosettaCardinality`
- `isSubconstraint(a, b): boolean`
- `toConstraintString(card): string`

### ChoiceUtils
- `getEffectiveConditions(choice: Choice): Condition[]`
- `getOptions(choice: Choice): ChoiceOption[]`

### FunctionUtils
- `getNumberOfParameters(func: Function): number`

### ExpressionUtils
- `hasGeneratedInput(expr: Expression): boolean`
- `setGeneratedInputIfAbsent(expr: Expression): void`

## Public API Types

### ParseResult
- **Fields**: `document: LangiumDocument`, `ast: RosettaModel`, `diagnostics: Diagnostic[]`

### WorkspaceResult
- **Fields**: `documents: Map<string, LangiumDocument>`, `diagnostics: Map<string, Diagnostic[]>`

### Diagnostic
- **Fields**: `severity: 'error' | 'warning' | 'info'`, `message: string`, `range: { start: Position, end: Position }`

## Relationships

```
RosettaModel
  └─ elements: RosettaRootElement[]
       ├─ Data
       │    ├─ superType ──> Data (inheritance)
       │    ├─ attributes: Attribute[]
       │    │    ├─ typeCall ──> RosettaType (type reference)
       │    │    ├─ card: RosettaCardinality
       │    │    └─ synonyms: RosettaSynonym[]
       │    └─ conditions: Condition[]
       │         └─ expression: Expression (union of ~40 types)
       ├─ Choice
       │    └─ options: ChoiceOption[]
       ├─ Enumeration
       │    ├─ superType ──> Enumeration
       │    └─ values: RosettaEnumValue[]
       ├─ Function
       │    ├─ superFunction ──> Function
       │    ├─ inputs/output: Attribute[]
       │    ├─ conditions: Condition[]
       │    ├─ operations: Operation[]
       │    └─ shortcuts: ShortcutDeclaration[]
       ├─ RosettaReport ──> RosettaBody, RosettaCorpus
       ├─ RosettaRule ──> Data (input type)
       └─ Annotation
```

## State Transitions

- **Parse**: `.rosetta` source text -> Langium CST -> Langium AST (generated types)
- **Link**: Cross-references resolved via scope provider
- **Validate**: AST -> Validation services -> Diagnostic[]
- **Serialize**: AST -> Formatter -> `.rosetta` text (round-trip)
