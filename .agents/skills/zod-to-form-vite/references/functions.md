# Functions

## Plugin

### `z2fVite`
Vite plugin factory for `@zod-to-form/vite`.

Registers Vite hooks for:
- **Query mode** (`resolveId` + `load`): intercepts `*.ts?z2f[=variant]` imports,
  evaluates the schema via `ssrLoadModule`, and returns a virtual module containing
  the generated React form component.
- **Generate mode** (`transform`): when `options.generate` is set, scans JSX source
  files for `<ZodForm schema={X}>` and rewrites resolvable call sites with generated
  components at build time.
- **Resolver tree-shake** (`transform`): removes `zodResolver` calls from `useZodForm`
  at build time when `validationLevel` is set, allowing bundlers to drop the
  `@hookform/resolvers` dependency.
- **HMR** (`handleHotUpdate`): invalidates cached compiled forms when their schema or
  the `z2f.config.ts` changes.
```ts
z2fVite(options: PluginOptions): Plugin
```
**Parameters:**
- `options: PluginOptions` — default: `{}` — Optional plugin configuration. All fields are optional; `z2fVite()`
  with no arguments produces a working plugin using auto-discovered config.
**Returns:** `Plugin` — A Vite `Plugin` object to include in `vite.config.ts`.
```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { z2fVite } from '@zod-to-form/vite';

export default defineConfig({
  plugins: [z2fVite()],
});
```

## Errors

### `formatZ2FViteError`
Format a `Z2FViteError` for inclusion in a Vite error overlay or terminal output.
The error's `message` already includes the code prefix (`[Z2F_VITE_...]`); this function
appends the source location line when `error.location.file` is set.
```ts
formatZ2FViteError(error: Z2FViteError): string
```
**Parameters:**
- `error: Z2FViteError` — The `Z2FViteError` to format.
**Returns:** `string` — A human-readable error string with optional file:line:column location appended.
**Throws:** Never — this function is purely a formatter.
```ts
try { ... } catch (e) {
  if (e instanceof Z2FViteError) console.error(formatZ2FViteError(e));
}
```
