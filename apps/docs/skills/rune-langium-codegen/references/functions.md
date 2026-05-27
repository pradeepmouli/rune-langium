# Functions

## codegen/src

### `generate`
Generate code from one or more parsed Langium documents.

This is the primary entry point for the code generator. It accepts
a single document or an array of documents and normalizes them before
passing to the internal generator pipeline.
```ts
generate(documents: LangiumDocument<AstNode> | LangiumDocument<AstNode>[], options?: GeneratorOptions): Promise<GeneratorOutput[]>
```
**Parameters:**
- `documents: LangiumDocument<AstNode> | LangiumDocument<AstNode>[]` — One or more parsed Langium documents with resolved ASTs.
- `options: GeneratorOptions` (optional) — Optional generator options (target, strict, headerComment).
**Returns:** `Promise<GeneratorOutput[]>` — Array of GeneratorOutput sorted by relativePath ascending.
**Throws:** GeneratorError when strict mode is enabled and any error diagnostic is produced.
```ts
import { generate } from '@rune-langium/codegen';
const outputs = await generate(doc, { target: 'zod' });
```

### `generatePreviewSchemas`
Generate structured form-preview schemas from one or more parsed Langium documents.

The returned schemas preserve field metadata and source-map information so
Studio can render an inspector/form preview and navigate back to source.
```ts
generatePreviewSchemas(documents: LangiumDocument<AstNode> | LangiumDocument<AstNode>[], options?: GeneratePreviewSchemaOptions): FormPreviewSchema[]
```
**Parameters:**
- `documents: LangiumDocument<AstNode> | LangiumDocument<AstNode>[]` — One or more parsed Langium documents with resolved ASTs.
- `options: GeneratePreviewSchemaOptions` (optional) — Optional preview generation options such as `targetId` and `maxDepth`.
**Returns:** `FormPreviewSchema[]` — Array of `FormPreviewSchema` objects sorted by target id.

## emit

### `isWholeModelEmitter`
Runtime discriminator between the two emitter contracts. Distinguishes
by prototype shape: `NamespaceEmitter` exposes a `finalize()` method
(plus the per-element `emitData` / `emitEnumeration` / etc. hooks);
`WholeModelEmitter` exposes only a single async `emit()` method.

Used by `generator.ts:runGenerate` (Task 0.4) to dispatch each
target through the appropriate pipeline.
```ts
isWholeModelEmitter(c: WholeModelEmitterConstructor | NamespaceEmitterConstructor): c is WholeModelEmitterConstructor
```
**Parameters:**
- `c: WholeModelEmitterConstructor | NamespaceEmitterConstructor`
**Returns:** `c is WholeModelEmitterConstructor`

## options

### `resolveExcelSheets`
Resolve the effective sheet toggles from a partial/absent options block,
applying the schema defaults. Used by the emitter so a missing `excel`
option or a partial `sheets` object still produces a complete workbook.
```ts
resolveExcelSheets(options: { sheets?: Partial<{ types: boolean; enums: boolean; typeAliases: boolean; conditions: boolean }> } | undefined): { types: boolean; enums: boolean; typeAliases: boolean; conditions: boolean }
```
**Parameters:**
- `options: { sheets?: Partial<{ types: boolean; enums: boolean; typeAliases: boolean; conditions: boolean }> } | undefined`
**Returns:** `{ types: boolean; enums: boolean; typeAliases: boolean; conditions: boolean }`
