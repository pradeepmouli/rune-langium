# Data Model: 017-codegen-complete-types

**Date**: 2026-05-01

## New Codegen Type Representations

### RuneTypeAlias (new — packages/codegen/src/types/)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Alias name |
| namespace | string | Fully-qualified namespace |
| targetType | string | Name of the aliased type |
| targetKind | 'primitive' \| 'enum' \| 'data' \| 'alias' | Kind of the target |
| conditions | Condition[] | Validation conditions |
| parameters | TypeParam[] | Type parameters (optional) |

### RuneRule (new — packages/codegen/src/types/)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Rule name |
| namespace | string | Fully-qualified namespace |
| isEligibility | boolean | true = eligibility, false = reporting |
| inputType | string \| undefined | Input type name (from clause) |
| expression | ExpressionNode | Rule body expression AST |
| identifier | string \| undefined | Optional 'as' identifier |
| definition | string \| undefined | Description text |

### RuneReport (new — packages/codegen/src/types/)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Derived from regulatory body + corpus |
| namespace | string | Fully-qualified namespace |
| inputTypeName | string | Input data type name |
| reportTypeName | string | Output data type name |
| eligibilityRuleNames | string[] | Names of eligibility rules |
| timing | string | 'real-time' \| 'T+1' \| ... |

### RuneAnnotationDecl (new — packages/codegen/src/types/)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Annotation name |
| namespace | string | Fully-qualified namespace |
| prefix | string \| undefined | Optional prefix |
| attributes | RuneFuncParam[] | Typed parameters (reuses existing param type) |
| definition | string \| undefined | Description text |

### RuneLibraryFunc (new — packages/codegen/src/types/)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Function name |
| namespace | string | Fully-qualified namespace |
| parameters | { name: string; typeName: string; isArray: boolean }[] | Parameters |
| returnTypeName | string | Return type name |
| definition | string \| undefined | Description text |

## Extended Entities

### EmissionContext (extended)

| New Field | Type | Description |
|-----------|------|-------------|
| typeAliasByName | Map\<string, RosettaTypeAlias\> | Type aliases in this namespace |
| rulesByName | Map\<string, RosettaRule\> | Rules in this namespace |
| reportsByName | Map\<string, RosettaReport\> | Reports in this namespace |
| annotationsByName | Map\<string, Annotation\> | Annotation declarations in this namespace |
| libraryFuncsByName | Map\<string, RosettaExternalFunction\> | Library functions in this namespace |
| registry | NamespaceRegistry | Cross-namespace lookup |

### NamespaceRegistry (new)

| Field | Type | Description |
|-------|------|-------------|
| namespaces | Map\<string, NamespaceManifest\> | Per-namespace export manifests |

### NamespaceManifest (new)

| Field | Type | Description |
|-------|------|-------------|
| namespace | string | Namespace string |
| exportedDataNames | Set\<string\> | Data type names |
| exportedEnumNames | Set\<string\> | Enum names |
| exportedFuncNames | Set\<string\> | Function names |
| exportedRuleNames | Set\<string\> | Rule names |
| exportedTypeAliasNames | Set\<string\> | Type alias names |
| exportedAnnotationNames | Set\<string\> | Annotation declaration names |
| relativePath | string | Output file relative path |

## Form Preview Extensions

### FormPreviewSchema (extended)

| New Field | Type | Description |
|-----------|------|-------------|
| kind | 'data' \| 'typeAlias' \| 'choice' \| 'function' | Discriminator for preview type |

### FunctionPreviewSchema (new — extends FormPreviewSchema)

| Field | Type | Description |
|-------|------|-------------|
| kind | 'function' | Always 'function' |
| inputFields | PreviewField[] | Function input parameter fields |
| outputType | string | Output type name |
| preConditions | string[] | Pre-condition descriptions |
| postConditions | string[] | Post-condition descriptions |

## Relationships

```
NamespaceRegistry
  └── NamespaceManifest (1 per namespace)
        ├── exported data/enum/func/rule/alias/annotation names
        └── relativePath for import resolution

EmissionContext
  ├── dataByName, enumByName (existing)
  ├── typeAliasByName, rulesByName, ... (new)
  └── registry → NamespaceRegistry (cross-namespace)

FormPreviewSchema
  ├── kind='data' → existing field-based form
  ├── kind='typeAlias' → scalar or object form
  ├── kind='choice' → one-of constraint form
  └── kind='function' → input form + run button + output display
```
