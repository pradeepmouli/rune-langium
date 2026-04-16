# Functions

## Codegen

### `isKnownGenerator`
Check whether a language ID corresponds to a known generator.
```ts
isKnownGenerator(language: string): boolean
```
**Parameters:**
- `language: string` — The generator ID to check (e.g., `"scala"`, `"typescript"`).
**Returns:** `boolean` — `true` if the ID matches a generator in KNOWN_GENERATORS.

### `getGenerator`
Get generator metadata by ID.
```ts
getGenerator(language: string): GeneratorInfo | undefined
```
**Parameters:**
- `language: string` — The generator ID to look up.
**Returns:** `GeneratorInfo | undefined` — The matching GeneratorInfo, or `undefined` if not found.
