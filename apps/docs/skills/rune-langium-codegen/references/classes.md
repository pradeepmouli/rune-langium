# Classes

## types

### `GeneratorError`
Thrown when strict mode is enabled and any error diagnostic is produced.
FR-022.
*extends `Error`*
```ts
constructor(message: string, diagnostics: GeneratorDiagnostic[]): GeneratorError
```
**Properties:**
- `diagnostics: GeneratorDiagnostic[]` — The diagnostics that caused this error.
- `name: string`
- `message: string`
- `stack: string` (optional)
- `cause: unknown` (optional)
