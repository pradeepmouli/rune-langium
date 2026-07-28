// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Reader-options Zod schemas only — `@rune-langium/codegen/import/options`.
 *
 * Deliberately separate from `./index.js` (`@rune-langium/codegen/import`):
 * that barrel also statically pulls in `runImport` (`cli.js`, which imports
 * `node:fs/promises`/`node:path`/`node:process`) and, transitively, the
 * `web-tree-sitter` WASM grammar loader — fine for Node consumers (the CLI,
 * `importModel`'s own tests) but fatal for the studio `?z2f` Vite plugin,
 * which loads a schema module by fully evaluating it outside a Node
 * environment to introspect its shape. This module re-exports only the
 * schemas so studio's `{format}-import-options.schema.ts` files can import
 * them without dragging in any Node-only code.
 */
export { JsonSchemaImportOptionsSchema } from '../options/json-schema-import-options.js';
export { OpenApiImportOptionsSchema } from '../options/openapi-import-options.js';
export { SqlImportOptionsSchema } from '../options/sql-import-options.js';
export { XsdImportOptionsSchema } from '../options/xsd-import-options.js';
