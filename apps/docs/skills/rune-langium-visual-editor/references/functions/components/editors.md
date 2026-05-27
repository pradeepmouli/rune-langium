# Functions

## components/editors

### `TypeSelector`
Searchable type selector with kind-colored badges.

When `renderTrigger` and `renderPopover` are provided, uses composition
to inject host app UI primitives (e.g., shadcn Popover + Command).
Otherwise falls back to a shadcn Select.
```ts
TypeSelector(__namedParameters: TypeSelectorProps): ReactNode
```
**Parameters:**
- `__namedParameters: TypeSelectorProps`
**Returns:** `ReactNode`

### `getKindBadgeClasses`
Returns badge CSS classes for a given type kind. Wraps the design-system
`badgeVariants` so callers (e.g. `ChoiceOptionRow`, `TypeLink`) get
token-backed colors automatically.
```ts
getKindBadgeClasses(kind: TypeKind | "builtin"): string
```
**Parameters:**
- `kind: TypeKind | "builtin"`
**Returns:** `string`

### `getKindLabel`
Returns a human-readable label for a type kind.
```ts
getKindLabel(kind: TypeKind | "builtin"): string
```
**Parameters:**
- `kind: TypeKind | "builtin"`
**Returns:** `string`

### `CardinalityPicker`
Cardinality picker as a compact dropdown with 4 presets and a custom option.

Preset selection commits immediately. Choosing "Custom…" shows an inline
input that validates with `validateCardinality()` on blur or Enter.
```ts
CardinalityPicker(__namedParameters: CardinalityPickerProps): ReactNode
```
**Parameters:**
- `__namedParameters: CardinalityPickerProps`
**Returns:** `ReactNode`

### `MetadataSection`
Collapsible metadata section with description, comments, and synonym fields.

Reads field values from the parent `FormProvider` context. Auto-resize
textareas for description and comments, tag-list with inline add for synonyms.
```ts
MetadataSection(__namedParameters: MetadataSectionProps): ReactNode
```
**Parameters:**
- `__namedParameters: MetadataSectionProps`
**Returns:** `ReactNode`

### `AttributeRow`
```ts
AttributeRow(__namedParameters: AttributeRowProps): Element
```
**Parameters:**
- `__namedParameters: AttributeRowProps`
**Returns:** `Element`

### `DataTypeForm`
```ts
DataTypeForm(__namedParameters: DataTypeFormProps): Element
```
**Parameters:**
- `__namedParameters: DataTypeFormProps`
**Returns:** `Element`

### `EnumValueRow`
```ts
EnumValueRow(__namedParameters: EnumValueRowProps): Element
```
**Parameters:**
- `__namedParameters: EnumValueRowProps`
**Returns:** `Element`

### `EnumForm`
```ts
EnumForm(__namedParameters: EnumFormProps): Element
```
**Parameters:**
- `__namedParameters: EnumFormProps`
**Returns:** `Element`

### `ChoiceOptionRow`
```ts
ChoiceOptionRow(__namedParameters: ChoiceOptionRowProps): Element
```
**Parameters:**
- `__namedParameters: ChoiceOptionRowProps`
**Returns:** `Element`

### `ChoiceForm`
```ts
ChoiceForm(__namedParameters: ChoiceFormProps): Element
```
**Parameters:**
- `__namedParameters: ChoiceFormProps`
**Returns:** `Element`

### `FunctionForm`
```ts
FunctionForm(__namedParameters: FunctionFormProps): Element
```
**Parameters:**
- `__namedParameters: FunctionFormProps`
**Returns:** `Element`

### `ExpressionBuilder`
```ts
ExpressionBuilder(__namedParameters: ExpressionBuilderProps): Element
```
**Parameters:**
- `__namedParameters: ExpressionBuilderProps`
**Returns:** `Element`

### `NameCell`
```ts
NameCell(__namedParameters: NameCellProps): ReactElement
```
**Parameters:**
- `__namedParameters: NameCellProps`
**Returns:** `ReactElement`

### `CardinalityCell`
```ts
CardinalityCell(__namedParameters: CardinalityCellProps): ReactElement
```
**Parameters:**
- `__namedParameters: CardinalityCellProps`
**Returns:** `ReactElement`

### `TypePickerCell`
```ts
TypePickerCell(__namedParameters: TypePickerCellProps): ReactElement
```
**Parameters:**
- `__namedParameters: TypePickerCellProps`
**Returns:** `ReactElement`

### `InheritanceCell`
```ts
InheritanceCell(__namedParameters: InheritanceCellProps): ReactElement
```
**Parameters:**
- `__namedParameters: InheritanceCellProps`
**Returns:** `ReactElement`
