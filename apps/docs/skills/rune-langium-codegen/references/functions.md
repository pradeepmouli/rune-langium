# Functions

## codegen/src

### `generate`
Generate code from one or more parsed Langium documents.

This is the primary entry point for the code generator. It accepts
a single document or an array of documents and normalizes them before
passing to the internal generator pipeline.
```ts
generate(documents: LangiumDocument<AstNode> | LangiumDocument<AstNode>[], options?: GeneratorOptions): GeneratorOutput[]
```
**Parameters:**
- `documents: LangiumDocument<AstNode> | LangiumDocument<AstNode>[]` — One or more parsed Langium documents with resolved ASTs.
- `options: GeneratorOptions` (optional) — Optional generator options (target, strict, headerComment).
**Returns:** `GeneratorOutput[]` — Array of GeneratorOutput sorted by relativePath ascending.
**Throws:** GeneratorError when strict mode is enabled and any error diagnostic is produced.
```ts
import { generate } from '@rune-langium/codegen';
const outputs = generate(doc, { target: 'zod' });
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
