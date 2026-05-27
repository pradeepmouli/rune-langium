# Functions

## adapters

### `astToModel`
Convert RosettaModel AST roots into ReactFlow nodes and edges.

Each graph node's `data` IS the AstNodeModel (AST fields spread)
plus GraphMetadata (namespace, position, errors, etc.).
```ts
astToModel(models: unknown, options?: AstToModelOptions): AstToModelResult
```
**Parameters:**
- `models: unknown`
- `options: AstToModelOptions` (optional)
**Returns:** `AstToModelResult`

### `modelsToAst`
Convert graph nodes and edges to serializer-compatible model objects.
Groups nodes by namespace and produces one model per namespace.
```ts
modelsToAst(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): ModelOutput[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
**Returns:** `ModelOutput[]`

### `formatCardinality`
Format a RosettaCardinality model as a display string, e.g. `(1..*)`.
```ts
formatCardinality(card: CardinalityShape | undefined): string
```
**Parameters:**
- `card: CardinalityShape | undefined`
**Returns:** `string`

### `parseCardinality`
Parse a cardinality display string back to structured form.
```ts
parseCardinality(card?: string): CardinalityShape
```
**Parameters:**
- `card: string` (optional)
**Returns:** `CardinalityShape`

### `getTypeRefText`
Get the display name of a type reference (e.g. from a TypeCall).
```ts
getTypeRefText(typeCall: TypeCallShape | undefined): string | undefined
```
**Parameters:**
- `typeCall: TypeCallShape | undefined`
**Returns:** `string | undefined`

### `getRefText`
Get display text from a Reference-like object.
```ts
getRefText(ref: ReferenceShape | undefined): string | undefined
```
**Parameters:**
- `ref: ReferenceShape | undefined`
**Returns:** `string | undefined`

### `annotationsToDisplay`
Convert AstNodeModel<AnnotationRef>[] to display-friendly objects.
```ts
annotationsToDisplay(annotations: AnnotationRefShape[] | undefined): AnnotationDisplayInfo[]
```
**Parameters:**
- `annotations: AnnotationRefShape[] | undefined`
**Returns:** `AnnotationDisplayInfo[]`

### `conditionsToDisplay`
Convert condition models to display-friendly objects.
```ts
conditionsToDisplay(conditions: ConditionShape[] | undefined, postConditions?: ConditionShape[]): ConditionDisplayInfo[]
```
**Parameters:**
- `conditions: ConditionShape[] | undefined`
- `postConditions: ConditionShape[]` (optional)
**Returns:** `ConditionDisplayInfo[]`

### `classExprSynonymsToStrings`
Extract display strings from Data/Choice class synonyms.
```ts
classExprSynonymsToStrings(synonyms: ClassSynonymShape[] | undefined): string[]
```
**Parameters:**
- `synonyms: ClassSynonymShape[] | undefined`
**Returns:** `string[]`

### `enumSynonymsToStrings`
Extract display strings from Enum synonyms.
```ts
enumSynonymsToStrings(synonyms: EnumSynonymShape[] | undefined): string[]
```
**Parameters:**
- `synonyms: EnumSynonymShape[] | undefined`
**Returns:** `string[]`

### `resolveNodeKind`
Resolve the React-Flow node-kind (`'data' | 'choice' | 'enum' | ...`) for
a node or its data payload, honoring the curated-fallback chain.

Curated AST nodes arrive without a populated `$type` because the
serialized hydration documents from `/api/parse` use `typeKind` (and the
React Flow `node.type` is also set during projection). The naive lookup
`AST_TYPE_TO_NODE_TYPE[d.$type] ?? 'data'` silently degraded all curated
enum / choice / func / record entries to `'data'`, so panels that asked
"what kind is this?" looked for `attributes` on nodes that don't have
them and rendered empty (Inspector / Graph node body / namespace tree
icon all hit this).

Accepts either a React-Flow node (`{ data, type }`) or the inner `data`
payload directly. Fallback order:
  1. `data.$type`  (Langium AST form, user-authored nodes)
  2. `data.typeKind` (curated hydration form)
  3. `node.type`  (React-Flow projection form)
  4. `'data'`  (last-resort default; matches the legacy `?? 'data'` behaviour)

Use this helper instead of indexing `AST_TYPE_TO_NODE_TYPE` directly.
The `rune/no-raw-node-kind-lookup` eslint rule enforces this.
```ts
resolveNodeKind(nodeOrData: unknown): string
```
**Parameters:**
- `nodeOrData: unknown`
**Returns:** `string`

### `buildStructureGraph`
```ts
buildStructureGraph(doc: AdapterDocument, opts: BuildOptions): StructureGraphInput
```
**Parameters:**
- `doc: AdapterDocument`
- `opts: BuildOptions`
**Returns:** `StructureGraphInput`

### `findByCanonicalId`
Find the first StructureNode whose canonical id matches.

Phase 14e: `StructureGraphInput.nodes` is keyed by INSTANCE id (per-instance
materialization). Callers that need to look up a node by its canonical id —
tests, AST navigation, cell editors — use this helper instead of `nodes.get`.

If multiple visible instances share the canonical id (e.g. `buyer.Party`
and `seller.Party`), the FIRST entry in iteration order is returned. Use
`findAllByCanonicalId` for the full list.
```ts
findByCanonicalId(nodes: ReadonlyMap<string, StructureNode>, canonicalId: string): StructureNode | undefined
```
**Parameters:**
- `nodes: ReadonlyMap<string, StructureNode>`
- `canonicalId: string`
**Returns:** `StructureNode | undefined`

### `findAllByCanonicalId`
Return all StructureNodes whose canonical id matches.
```ts
findAllByCanonicalId(nodes: ReadonlyMap<string, StructureNode>, canonicalId: string): StructureNode[]
```
**Parameters:**
- `nodes: ReadonlyMap<string, StructureNode>`
- `canonicalId: string`
**Returns:** `StructureNode[]`
