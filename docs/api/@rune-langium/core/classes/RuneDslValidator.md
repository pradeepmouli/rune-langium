[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RuneDslValidator

# Class: RuneDslValidator

Defined in: [packages/core/src/services/rune-dsl-validator.ts:66](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L66)

Custom validator for the Rune DSL.

Implements structural, naming, expression, and reporting validations
ported from the original Xtext implementation.

Rule categories:
- S-##: Structural constraints (duplicates, cycles, missing fields)
- N-##: Naming convention rules
- E-##: Expression validation rules
- R-##: Reporting validation rules

## Constructors

### Constructor

> **new RuneDslValidator**(): `RuneDslValidator`

#### Returns

`RuneDslValidator`

## Methods

### checkAttributeCardinality()

> **checkAttributeCardinality**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:152](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L152)

S-04: Attribute cardinality must have lower <= upper.

#### Parameters

##### node

[`Attribute`](../interfaces/Attribute.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkAttributeNaming()

> **checkAttributeNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:451](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L451)

N-02: Attribute names should start with lowercase.
Exempt: attributes inside Annotation blocks and ChoiceOptions (matching Xtext behavior).

#### Parameters

##### node

[`Attribute`](../interfaces/Attribute.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkAttributeTypeResolved()

> **checkAttributeTypeResolved**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:285](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L285)

S-17: Attribute type reference must resolve.

NOTE: Not registered. Langium's built-in linker already emits an error for
unresolved TypeCall.type references, so registering this check would produce
duplicate error messages.

#### Parameters

##### node

[`Attribute`](../interfaces/Attribute.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkChoiceMinOptions()

> **checkChoiceMinOptions**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:348](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L348)

S-21: Choice must have at least two options.

#### Parameters

##### node

[`Choice`](../interfaces/Choice.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkChoiceNaming()

> **checkChoiceNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:489](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L489)

N-05: Choice names should start with uppercase.

#### Parameters

##### node

[`Choice`](../interfaces/Choice.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkChoiceNoDuplicateOptions()

> **checkChoiceNoDuplicateOptions**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:215](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L215)

S-11: No duplicate choice option type references.

#### Parameters

##### node

[`Choice`](../interfaces/Choice.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkChoiceOptionTypeResolved()

> **checkChoiceOptionTypeResolved**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:364](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L364)

S-22: ChoiceOption type must resolve.

NOTE: Not registered. Langium's built-in linker already emits an error for
unresolved TypeCall.type references, so registering this check would produce
duplicate error messages.

#### Parameters

##### node

[`ChoiceOption`](../interfaces/ChoiceOption.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkConditionHasExpression()

> **checkConditionHasExpression**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:388](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L388)

S-24: Condition must have an expression body.

#### Parameters

##### node

[`Condition`](../interfaces/Condition.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkConditionNaming()

> **checkConditionNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:501](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L501)

N-06: Condition names should start with uppercase.

#### Parameters

##### node

[`Condition`](../interfaces/Condition.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkDataAttributeOverrideValid()

> **checkDataAttributeOverrideValid**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:253](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L253)

S-15: Override attribute must exist in the parent type.

#### Parameters

##### node

[`Data`](../interfaces/Data.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkDataExtendsCycle()

> **checkDataExtendsCycle**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:133](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L133)

S-02: Detect circular inheritance in Data extends chain.

#### Parameters

##### node

[`Data`](../interfaces/Data.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkDataMustHaveAttributesOrSuperType()

> **checkDataMustHaveAttributesOrSuperType**(`_node`, `_accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:273](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L273)

S-16: Data type should have at least one attribute or extend another type.

#### Parameters

##### \_node

[`Data`](../interfaces/Data.md)

##### \_accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkDataNaming()

> **checkDataNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:438](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L438)

N-01: Data type names should start with uppercase.

#### Parameters

##### node

[`Data`](../interfaces/Data.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkDataNoDuplicateAttributes()

> **checkDataNoDuplicateAttributes**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:117](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L117)

S-01: No duplicate attribute names within a Data type.

#### Parameters

##### node

[`Data`](../interfaces/Data.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkEnumExtendsCycle()

> **checkEnumExtendsCycle**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:329](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L329)

S-20: Detect circular inheritance in Enum extends chain.

#### Parameters

##### node

[`RosettaEnumeration`](../interfaces/RosettaEnumeration.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkEnumNaming()

> **checkEnumNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:477](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L477)

N-04: Enum names should start with uppercase.

#### Parameters

##### node

[`RosettaEnumeration`](../interfaces/RosettaEnumeration.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkEnumNoDuplicateValues()

> **checkEnumNoDuplicateValues**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:199](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L199)

S-09: No duplicate enum value names.

#### Parameters

##### node

[`RosettaEnumeration`](../interfaces/RosettaEnumeration.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkEnumValueNaming()

> **checkEnumValueNaming**(`_node`, `_accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:513](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L513)

N-07: Enum value names should start with an uppercase letter (convention: PascalCase or UPPER_CASE).

#### Parameters

##### \_node

[`RosettaEnumeration`](../interfaces/RosettaEnumeration.md)

##### \_accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkEnumValueNamingRule()

> **checkEnumValueNamingRule**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:521](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L521)

N-08: Standalone enum value naming (used from ChoiceOption context).

#### Parameters

##### node

[`RosettaEnumValue`](../interfaces/RosettaEnumValue.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkExpressionValid()

> **checkExpressionValid**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:565](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L565)

Expression validator dispatcher.
Routes to specific checks based on expression $type.

#### Parameters

##### node

[`RosettaExpression`](../type-aliases/RosettaExpression.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkFunctionNaming()

> **checkFunctionNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:465](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L465)

N-03: Function names should start with uppercase.

#### Parameters

##### node

[`RosettaFunction`](../interfaces/RosettaFunction.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkFunctionNoDuplicateConditions()

> **checkFunctionNoDuplicateConditions**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:313](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L313)

S-19: No duplicate condition names in a function.

#### Parameters

##### node

[`RosettaFunction`](../interfaces/RosettaFunction.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkFunctionNoDuplicateInputs()

> **checkFunctionNoDuplicateInputs**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:170](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L170)

S-06: No duplicate function input names.

#### Parameters

##### node

[`RosettaFunction`](../interfaces/RosettaFunction.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkFunctionNoDuplicateShortcuts()

> **checkFunctionNoDuplicateShortcuts**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:297](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L297)

S-18: No duplicate shortcut names in a function.

#### Parameters

##### node

[`RosettaFunction`](../interfaces/RosettaFunction.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkFunctionOutputRequired()

> **checkFunctionOutputRequired**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:187](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L187)

S-07: Functions should have an output.
Dispatch functions (with dispatchAttribute) are exempt — they inherit output from the parent.

#### Parameters

##### node

[`RosettaFunction`](../interfaces/RosettaFunction.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkImportNotEmpty()

> **checkImportNotEmpty**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:424](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L424)

S-27: Import path must not be empty.

#### Parameters

##### node

[`Import`](../interfaces/Import.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkModelNamespaceValid()

> **checkModelNamespaceValid**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:376](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L376)

S-23: Namespace must be a valid qualified name.

#### Parameters

##### node

[`RosettaModel`](../interfaces/RosettaModel.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkModelNoDuplicateElements()

> **checkModelNoDuplicateElements**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:233](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L233)

S-13: No duplicate top-level element names in the same model.
Dispatch function overloads share the same name intentionally — skip them.

#### Parameters

##### node

[`RosettaModel`](../interfaces/RosettaModel.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkOperationHasExpression()

> **checkOperationHasExpression**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:412](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L412)

S-26: Operation must have an expression body.

#### Parameters

##### node

[`Operation`](../interfaces/Operation.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkRuleHasExpression()

> **checkRuleHasExpression**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:550](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L550)

R-01: Rule must have an expression body.

#### Parameters

##### node

[`RosettaRule`](../interfaces/RosettaRule.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkRuleNaming()

> **checkRuleNaming**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:536](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L536)

N-10: Rule names should start with uppercase.

#### Parameters

##### node

[`RosettaRule`](../interfaces/RosettaRule.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkShortcutHasExpression()

> **checkShortcutHasExpression**(`node`, `accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:400](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L400)

S-25: ShortcutDeclaration must have an expression body.

#### Parameters

##### node

[`ShortcutDeclaration`](../interfaces/ShortcutDeclaration.md)

##### accept

`ValidationAcceptor`

#### Returns

`void`

***

### checkShortcutNaming()

> **checkShortcutNaming**(`_node`, `_accept`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:528](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L528)

N-09: Shortcut names should start with lowercase.

#### Parameters

##### \_node

[`ShortcutDeclaration`](../interfaces/ShortcutDeclaration.md)

##### \_accept

`ValidationAcceptor`

#### Returns

`void`

***

### registerChecks()

> **registerChecks**(`services`): `void`

Defined in: [packages/core/src/services/rune-dsl-validator.ts:70](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/services/rune-dsl-validator.ts#L70)

Register validation checks with the Langium validation registry.

#### Parameters

##### services

`LangiumCoreServices`

#### Returns

`void`
