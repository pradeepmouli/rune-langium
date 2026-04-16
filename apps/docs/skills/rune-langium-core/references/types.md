# Types & Enums

## ast

### `RuneDslTerminalNames`
```ts
keyof typeof RuneDslTerminals
```

### `RuneDslKeywordNames`
```ts
"(" | ")" | "*" | "+" | "," | "-" | "->" | "->>" | "." | ".." | "..." | "/" | ":" | ";" | "<" | "<=" | "<>" | "=" | ">" | ">=" | "ASATP" | "E" | "False" | "T+1" | "T+2" | "T+3" | "T+4" | "T+5" | "True" | "[" | "]" | "absent" | "add" | "alias" | "all" | "and" | "annotation" | "any" | "as" | "as-key" | "basicType" | "body" | "choice" | "componentID" | "condition" | "condition-func" | "condition-path" | "contains" | "corpus" | "count" | "dateFormat" | "default" | "definition" | "disjoint" | "displayName" | "distinct" | "docReference" | "e" | "eligibility" | "else" | "empty" | "enum" | "enums" | "exists" | "extends" | "extract" | "filter" | "first" | "flatten" | "for" | "from" | "func" | "function" | "hint" | "if" | "import" | "in" | "inputs" | "is" | "isEvent" | "isProduct" | "item" | "join" | "label" | "last" | "library" | "mapper" | "maps" | "max" | "merge" | "meta" | "metaType" | "min" | "multiple" | "namespace" | "one-of" | "only" | "only-element" | "optional" | "or" | "output" | "override" | "path" | "pattern" | "post-condition" | "prefix" | "provision" | "rationale" | "rationale_author" | "real-time" | "recordType" | "reduce" | "regulatoryReference" | "removeHtml" | "report" | "reportedField" | "reporting" | "required" | "reverse" | "root" | "rosettaPath" | "rule" | "ruleReference" | "scope" | "segment" | "set" | "single" | "sort" | "source" | "standard" | "structured_provision" | "sum" | "super" | "switch" | "synonym" | "tag" | "then" | "to" | "to-date" | "to-date-time" | "to-enum" | "to-int" | "to-number" | "to-string" | "to-time" | "to-zoned-date-time" | "type" | "typeAlias" | "using" | "value" | "version" | "when" | "with" | "with-meta" | "{" | "}"
```

### `RuneDslTokenNames`
```ts
RuneDslTerminalNames | RuneDslKeywordNames
```

### `Annotation`
**Properties:**
- `$container: RosettaModel` — The container node in the AST; every node except the root node has a container.
- `$type: "Annotation"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `attributes: Attribute[]`
- `definition: string` (optional)
- `name: string`
- `prefix: string` (optional)
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AnnotationDeepPath`
**Properties:**
- `$container: AnnotationDeepPath | AnnotationPath | LabelAnnotation | RosettaDocReference | RuleReferenceAnnotation` — The container node in the AST; every node except the root node has a container.
- `$type: "AnnotationDeepPath"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `attribute: Reference<AttributeOrChoiceOption>`
- `operator: "->>"`
- `receiver: AnnotationPathExpression`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AnnotationPath`
**Properties:**
- `$container: AnnotationDeepPath | AnnotationPath | LabelAnnotation | RosettaDocReference | RuleReferenceAnnotation` — The container node in the AST; every node except the root node has a container.
- `$type: "AnnotationPath"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `attribute: Reference<AttributeOrChoiceOption>`
- `operator: "->"`
- `receiver: AnnotationPathExpression`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AnnotationPathAttributeReference`
**Properties:**
- `$container: AnnotationDeepPath | AnnotationPath | LabelAnnotation | RosettaDocReference | RuleReferenceAnnotation` — The container node in the AST; every node except the root node has a container.
- `$type: "AnnotationPathAttributeReference"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `attribute: Reference<AttributeOrChoiceOption>`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AnnotationPathExpression`
```ts
AnnotationDeepPath | AnnotationPath | AnnotationPathAttributeReference | RosettaImplicitVariable
```

### `AnnotationQualifier`
**Properties:**
- `$container: AnnotationRef` — The container node in the AST; every node except the root node has a container.
- `$type: "AnnotationQualifier"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `qualName: string`
- `qualPath: RosettaAttributeReference` (optional)
- `qualValue: string` (optional)
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AnnotationRef`
**Properties:**
- `$container: Attribute | ChoiceOption | Choice | Condition | Data | RosettaFunction | RosettaEnumeration | RosettaEnumValue` — The container node in the AST; every node except the root node has a container.
- `$type: "AnnotationRef"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `annotation: Reference<Annotation>`
- `attribute: Reference<Attribute>` (optional)
- `qualifiers: AnnotationQualifier[]`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `ArithmeticOperation`
**Properties:**
- `$container: ArithmeticOperation | AsKeyOperation | ShortcutDeclaration | ChoiceOperation | ComparisonOperation | Condition | ConstructorKeyValuePair | DefaultOperation | DistinctOperation | EqualityOperation | FilterOperation | FirstOperation | FlattenOperation | InlineFunction | JoinOperation | LastOperation | ListLiteral | LogicalOperation | MapOperation | MaxOperation | MinOperation | OneOfOperation | Operation | ReduceOperation | ReverseOperation | RosettaAbsentExpression | RosettaRule | RosettaConditionalExpression | RosettaContainsExpression | RosettaCountOperation | RosettaDeepFeatureCall | RosettaDisjointExpression | RosettaExistsExpression | RosettaFeatureCall | RosettaOnlyElement | RosettaOnlyExistsExpression | RosettaSuperCall | RosettaSymbolReference | SortOperation | SumOperation | SwitchOperation | ThenOperation | ToDateOperation | ToDateTimeOperation | ToEnumOperation | ToIntOperation | ToNumberOperation | ToStringOperation | ToTimeOperation | ToZonedDateTimeOperation | WithMetaOperation | SwitchCaseOrDefault | TypeCallArgument | WithMetaEntry` — The container node in the AST; every node except the root node has a container.
- `$type: "ArithmeticOperation"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `left: RosettaExpression`
- `operator: "+" | "-" | "*" | "/"`
- `right: RosettaExpression`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AsKeyOperation`
**Properties:**
- `$container: ArithmeticOperation | AsKeyOperation | ShortcutDeclaration | ChoiceOperation | ComparisonOperation | Condition | ConstructorKeyValuePair | DefaultOperation | DistinctOperation | EqualityOperation | FilterOperation | FirstOperation | FlattenOperation | InlineFunction | JoinOperation | LastOperation | ListLiteral | LogicalOperation | MapOperation | MaxOperation | MinOperation | OneOfOperation | Operation | ReduceOperation | ReverseOperation | RosettaAbsentExpression | RosettaRule | RosettaConditionalExpression | RosettaContainsExpression | RosettaCountOperation | RosettaDeepFeatureCall | RosettaDisjointExpression | RosettaExistsExpression | RosettaFeatureCall | RosettaOnlyElement | RosettaOnlyExistsExpression | RosettaSuperCall | RosettaSymbolReference | SortOperation | SumOperation | SwitchOperation | ThenOperation | ToDateOperation | ToDateTimeOperation | ToEnumOperation | ToIntOperation | ToNumberOperation | ToStringOperation | ToTimeOperation | ToZonedDateTimeOperation | WithMetaOperation | SwitchCaseOrDefault | TypeCallArgument | WithMetaEntry` — The container node in the AST; every node except the root node has a container.
- `$type: "AsKeyOperation"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `argument: RosettaExpression`
- `operator: "as-key"`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AssignPathRoot`
```ts
Attribute | ShortcutDeclaration
```

### `Attribute`
**Properties:**
- `$container: Annotation | Data | RosettaFunction` — The container node in the AST; every node except the root node has a container.
- `$type: "Attribute"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `annotations: AnnotationRef[]`
- `card: RosettaCardinality`
- `definition: string` (optional)
- `labels: LabelAnnotation[]`
- `name: string`
- `override: boolean`
- `references: RosettaDocReference[]`
- `ruleReferences: RuleReferenceAnnotation[]`
- `synonyms: RosettaSynonym[]`
- `typeCall: TypeCall`
- `typeCallArgs: TypeCallArgument[]`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `AttributeOrChoiceOption`
```ts
Attribute | ChoiceOption
```

### `BigDecimal`
```ts
string
```

### `CardinalityModifier`
```ts
"all" | "any"
```

### `Choice`
**Properties:**
- `$container: RosettaModel` — The container node in the AST; every node except the root node has a container.
- `$type: "Choice"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `annotations: AnnotationRef[]`
- `attributes: ChoiceOption[]`
- `definition: string` (optional)
- `name: string`
- `synonyms: RosettaClassSynonym[]`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.
- `$document: LangiumDocument<AstNode>` (optional) — The document containing the AST; only the root node has a direct reference to the document.

### `ChoiceOperation`
**Properties:**
- `$container: ArithmeticOperation | AsKeyOperation | ShortcutDeclaration | ChoiceOperation | ComparisonOperation | Condition | ConstructorKeyValuePair | DefaultOperation | DistinctOperation | EqualityOperation | FilterOperation | FirstOperation | FlattenOperation | InlineFunction | JoinOperation | LastOperation | ListLiteral | LogicalOperation | MapOperation | MaxOperation | MinOperation | OneOfOperation | Operation | ReduceOperation | ReverseOperation | RosettaAbsentExpression | RosettaRule | RosettaConditionalExpression | RosettaContainsExpression | RosettaCountOperation | RosettaDeepFeatureCall | RosettaDisjointExpression | RosettaExistsExpression | RosettaFeatureCall | RosettaOnlyElement | RosettaOnlyExistsExpression | RosettaSuperCall | RosettaSymbolReference | SortOperation | SumOperation | SwitchOperation | ThenOperation | ToDateOperation | ToDateTimeOperation | ToEnumOperation | ToIntOperation | ToNumberOperation | ToStringOperation | ToTimeOperation | ToZonedDateTimeOperation | WithMetaOperation | SwitchCaseOrDefault | TypeCallArgument | WithMetaEntry` — The container node in the AST; every node except the root node has a container.
- `$type: "ChoiceOperation"` — Every AST node has a type corresponding to what was specified in the grammar declaration.
- `argument: RosettaExpression` (optional)
- `attributes: Reference<Attribute>[]`
- `necessity: Necessity`
- `operator: "choice"`
- `$containerProperty: string` (optional) — The property of the `$container` node that contains this node. This is either a direct reference or an array.
- `$containerIndex: number` (optional) — In case `$containerProperty` is an array, the array index is stored here.
- `$cstNode: CstNode` (optional) — The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.

<!-- truncated -->
