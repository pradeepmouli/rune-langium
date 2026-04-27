# Functions

## `generate`
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
