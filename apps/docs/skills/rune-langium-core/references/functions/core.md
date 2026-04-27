# Functions

## Core

### `parse`
Parse a Rosetta DSL source string into a typed AST.

Services are lazily initialized on first call and reused across subsequent
calls. The services singleton is module-level — concurrent calls to `parse()`
in tests that re-import the module may share state unexpectedly. Use
`createRuneDslServices()` directly in long-running servers.
```ts
parse(input: string, uri?: string): Promise<ParseResult>
```
**Parameters:**
- `input: string` — The Rosetta DSL source text.
- `uri: string` (optional) — Optional URI for the document (defaults to `inmemory:///model.rosetta`).
**Returns:** `Promise<ParseResult>` — A ParseResult with the root `RosettaModel` node and any errors.
```ts
import { parse } from '@rune-langium/core';

const result = await parse(`
  namespace com.example
  version "1.0.0"

  type Trade:
    quantity number (1..1)
`);

if (result.hasErrors) {
  console.error(result.lexerErrors, result.parserErrors);
} else {
  console.log(result.value.elements.length, 'elements');
}
```

### `parseWorkspace`
Parse multiple Rosetta DSL source strings as a workspace.
Cross-references between documents will be resolved after all documents are built.

`DocumentBuilder.build()` indexes all provided documents together, so
cross-file `type` references (e.g., a `Data` type extending a type defined in
another file) will resolve correctly. Documents not included in `entries` will
produce unresolved references even if they exist on disk.
```ts
parseWorkspace(entries: { uri: string; content: string }[]): Promise<ParseResult[]>
```
**Parameters:**
- `entries: { uri: string; content: string }[]` — Array of `{ uri, content }` objects to parse together.
  Each `uri` must be unique; duplicate URIs cause the later entry to overwrite
  the earlier one silently.
**Returns:** `Promise<ParseResult[]>` — An array of ParseResult objects in the same order as `entries`.
```ts
import { parseWorkspace } from '@rune-langium/core';

const results = await parseWorkspace([
  { uri: 'file:///models/base.rosetta',  content: baseSource },
  { uri: 'file:///models/trade.rosetta', content: tradeSource },
]);

const tradeModel = results[1].value;
// Type references in tradeModel now resolve into baseModel's types
```

### `createRuneDslServices`
Create the full set of services required for the Rune DSL language.

This is the primary entry point for any non-LSP usage (scripts, tests, build tools).
It wires together:
- The generated Langium modules (`RuneDslGeneratedModule`, `RuneDslGeneratedSharedModule`)
- The hand-written overrides in `RuneDslModule`
- `RuneDslValidator` checks registered into the `ValidationRegistry`

Services are initialized synchronously. The `ConfigurationProvider.initialized({})`
call stubs out LSP configuration so that non-LSP code paths do not hang waiting
for a client `workspace/configuration` response.
```ts
createRuneDslServices(context: DefaultSharedCoreModuleContext): { shared: LangiumSharedCoreServices; RuneDsl: LangiumCoreServices }
```
**Parameters:**
- `context: DefaultSharedCoreModuleContext` — default: `EmptyFileSystem` — Optional Langium file-system context. Defaults to `EmptyFileSystem`
  (in-memory only). Pass a `NodeFileSystem` context when resolving imports from disk.
**Returns:** `{ shared: LangiumSharedCoreServices; RuneDsl: LangiumCoreServices }` — An object with `shared` (shared core services) and `RuneDsl` (language-specific services).
```ts
import { createRuneDslServices } from '@rune-langium/core';
import { NodeFileSystem } from 'langium/node';

// In-memory (for tests / scripts):
const { RuneDsl } = createRuneDslServices();

// Disk-backed (for resolving imports from the file system):
const { RuneDsl: diskServices } = createRuneDslServices(NodeFileSystem);
```

### `createRuneDslParser`
Factory function that creates and fully initializes a RuneDslParser.

This is a drop-in replacement for `createLangiumParser`. It constructs the
parser, registers all grammar rules, and calls `finalize()` so the Chevrotain
parser is ready to use. Called automatically by `RuneDslModule`.
```ts
createRuneDslParser(services: LangiumCoreServices): RuneDslParser
```
**Parameters:**
- `services: LangiumCoreServices` — Langium core services providing the grammar and lexer.
**Returns:** `RuneDslParser` — An initialized `RuneDslParser` ready to parse Rune DSL source text.

### `insertImplicitBrackets`
Scans Rune DSL source text and inserts `[` and `]` around bare expressions
that follow `extract`, `filter`, or `reduce` operators.

This is a pure text transformation applied before Chevrotain tokenization.
It normalizes both forms — `extract [body]` (explicit) and `extract expr`
(bare) — into the `extract [body]` form that the Langium grammar expects.

Algorithm:
1. Scan character-by-character, skipping strings and comments
2. When a functional operator keyword is found:
   a. Check if followed by `[` — if so, skip (already `InlineFunction`)
   b. Check if followed by `ID [` or `ID ,` — if so, skip (closure param form)
   c. Otherwise, insert `[` before the bare expression and `]` at its end
3. Expression end is determined by tracking nesting depth and looking
   for terminators (comma, closing bracket, newline + statement keyword)

Multi-line support: when the keyword is at end of line (followed by
newline + whitespace), we look at the next line. If it starts with an
expression token (ID, `(`, `-`, `+`, etc.) and NOT a statement keyword,
we treat the next line as the start of a bare expression.
```ts
insertImplicitBrackets(text: string): string
```
**Parameters:**
- `text: string` — Raw Rune DSL (`.rosetta`) source text.
**Returns:** `string` — Transformed text with implicit brackets inserted where needed.

### `serializeModel`
Serialize a single `RosettaModel` AST node back to `.rosetta` source text.

This serializer performs a **lossy** round-trip — it re-formats output with
consistent indentation and does not preserve the original whitespace, comments,
or annotation ordering. It is intended for code-generation and export workflows,
not for preserving user-authored formatting.

Supported top-level element types:
- `Data` (type definitions)
- `Choice` (choice types)
- `RosettaEnumeration` (enum types)

Unsupported elements (functions, rules, reporting rules, annotations) are
silently skipped. Condition expression bodies are emitted as `True` placeholders.
```ts
serializeModel(model: unknown): string
```
**Parameters:**
- `model: unknown` — A `RosettaModel` AST node (or duck-typed equivalent).
**Returns:** `string` — Formatted `.rosetta` source text ending with a trailing newline.
```ts
import { parse, serializeModel } from '@rune-langium/core';

const { value } = await parse(source);
const text = serializeModel(value);
// text is valid .rosetta source (minus functions/rules/comments)
```

### `serializeElement`
Serialize a single AST element (`Data`, `Choice`, or `RosettaEnumeration`) to text.

Returns an empty string for unsupported element types (`RosettaFunction`,
`RosettaRule`, etc.) — callers should check the returned string length if
element type membership is uncertain.
```ts
serializeElement(element: unknown): string
```
**Parameters:**
- `element: unknown` — A duck-typed AST element with a `$type` discriminant.
**Returns:** `string` — `.rosetta` text for the element, or `""` for unsupported element types.

### `serializeModels`
Serialize multiple `RosettaModel` nodes, returning a `Map` of namespace → source text.

If two models share the same namespace string, the later entry overwrites
the earlier one in the result `Map` without warning.
```ts
serializeModels(models: unknown[]): Map<string, string>
```
**Parameters:**
- `models: unknown[]` — Array of duck-typed `RosettaModel` AST nodes.
**Returns:** `Map<string, string>` — `Map<namespace, rosettaSource>` with one entry per unique namespace.
