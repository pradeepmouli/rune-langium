# Functions

## utils

### `isOptional`
Whether the cardinality allows zero occurrences (inf == 0).
```ts
isOptional(card: RosettaCardinality): boolean
```
**Parameters:**
- `card: RosettaCardinality`
**Returns:** `boolean`

### `isSingular`
Whether the cardinality forces exactly one (inf == 1 && sup == 1).
```ts
isSingular(card: RosettaCardinality): boolean
```
**Parameters:**
- `card: RosettaCardinality`
**Returns:** `boolean`

### `isPlural`
Whether the cardinality allows more than one instance (sup &gt; 1 or unbounded).
```ts
isPlural(card: RosettaCardinality): boolean
```
**Parameters:**
- `card: RosettaCardinality`
**Returns:** `boolean`

### `isRequired`
Whether the cardinality is required (inf &gt;= 1).
```ts
isRequired(card: RosettaCardinality): boolean
```
**Parameters:**
- `card: RosettaCardinality`
**Returns:** `boolean`

### `toConstraintString`
Produce a human-readable constraint string like "(1..1)", "(0..*)", etc.
```ts
toConstraintString(card: RosettaCardinality): string
```
**Parameters:**
- `card: RosettaCardinality`
**Returns:** `string`

### `getOptions`
Get the list of choice options from a Choice type.
```ts
getOptions(choice: Choice): ChoiceOption[]
```
**Parameters:**
- `choice: Choice`
**Returns:** `ChoiceOption[]`

### `getEffectiveConditions`
Get conditions that are defined on the Data types within a Choice's options.
Since Choice options reference type calls, we return the conditions
from the parent Choice's enclosing Data types (if any).
```ts
getEffectiveConditions(choice: Choice): Condition[]
```
**Parameters:**
- `choice: Choice`
**Returns:** `Condition[]`

### `getChoiceOptionPaths`
Declared option paths, including nested choices; data fields are not choice arms.
```ts
getChoiceOptionPaths(choice: Choice, seen: Set<Choice>): ChoiceOption[][]
```
**Parameters:**
- `choice: Choice`
- `seen: Set<Choice>` — default: `...`
**Returns:** `ChoiceOption[][]`

### `choiceOptionFieldName`
```ts
choiceOptionFieldName(optionTypeName: string): string
```
**Parameters:**
- `optionTypeName: string`
**Returns:** `string`

### `hasGeneratedInput`
Check if an expression node has a generated (synthetic) input marker.
This is used during code generation to track inputs that were
automatically inferred rather than explicitly declared.
```ts
hasGeneratedInput(node: RosettaExpression): boolean
```
**Parameters:**
- `node: RosettaExpression`
**Returns:** `boolean`

### `setGeneratedInputIfAbsent`
Set the generated input marker on an expression node if not already set.
Returns `true` if the marker was set, `false` if it was already present.
```ts
setGeneratedInputIfAbsent(node: RosettaExpression): boolean
```
**Parameters:**
- `node: RosettaExpression`
**Returns:** `boolean`

### `getFunctionSignature`
Resolve a dispatch overload to its namespace's base declaration.
```ts
getFunctionSignature(func: RosettaFunction, declarations?: Iterable<RosettaFunction, any, any>): RosettaFunction
```
**Parameters:**
- `func: RosettaFunction`
- `declarations: Iterable<RosettaFunction, any, any>` (optional)
**Returns:** `RosettaFunction`

### `getOperationArgument`
Resolve an explicit operation input or the input of its enclosing pipeline.
```ts
getOperationArgument(expr: RosettaExpression): RosettaExpression | undefined
```
**Parameters:**
- `expr: RosettaExpression`
**Returns:** `RosettaExpression | undefined`

### `resolveOperationType`
Shared operator result-type propagation; symbol lookup belongs to the caller.
```ts
resolveOperationType<T>(expr: RosettaExpression, resolve: (expression: RosettaExpression) => T | undefined, resolveType?: (type: RosettaType) => T | undefined, resolveIntrinsic?: (name: IntrinsicTypeName) => T | undefined): T | undefined
```
**Parameters:**
- `expr: RosettaExpression`
- `resolve: (expression: RosettaExpression) => T | undefined`
- `resolveType: (type: RosettaType) => T | undefined` (optional)
- `resolveIntrinsic: (name: IntrinsicTypeName) => T | undefined` (optional)
**Returns:** `T | undefined`

### `resolveTypeAliases`
Resolve a declared type without looping through recursive aliases.
```ts
resolveTypeAliases(type: RosettaType | undefined, seen: Set<RosettaType>): RosettaType | undefined
```
**Parameters:**
- `type: RosettaType | undefined`
- `seen: Set<RosettaType>` — default: `...`
**Returns:** `RosettaType | undefined`

### `getFunctionInputs`
Get all input attributes from a RosettaFunction.
```ts
getFunctionInputs(func: RosettaFunction): Attribute[]
```
**Parameters:**
- `func: RosettaFunction`
**Returns:** `Attribute[]`

### `getFunctionOutput`
Get the output attribute from a RosettaFunction.
```ts
getFunctionOutput(func: RosettaFunction): Attribute | undefined
```
**Parameters:**
- `func: RosettaFunction`
**Returns:** `Attribute | undefined`

### `getEnumValues`
Effective enum members, with child declarations overriding inherited names.
```ts
getEnumValues(enumeration: RosettaEnumeration): RosettaEnumValue[]
```
**Parameters:**
- `enumeration: RosettaEnumeration`
**Returns:** `RosettaEnumValue[]`
