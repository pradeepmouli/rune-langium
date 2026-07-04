// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OpenAPI emitter options (spec.md Phase 2b Implementation Addendum
 * decisions 3/5) — mirrors `excel-options.ts`'s Zod-schema-as-SSoT pattern
 * (the option block IS the schema; a studio config-modal form can be
 * generated from it via `@zod-to-form`, same as Excel's, though wiring that
 * up is a studio-side follow-up, not part of this effort).
 *
 * `format` selects JSON vs YAML output (decision 3: "YAML output required
 * ... emit YAML or JSON per the output file extension or an explicit format
 * option"). `crud` is the opt-in CRUD-generation option (decision 5): a
 * bare `true` generates the standard operation set for every `Data` type in
 * the namespace; `{ types: [...] }` scopes it to a named subset. NOT
 * default — a bare `{ target: 'openapi' }` request generates zero CRUD
 * paths (only the funcs → RPC-operations translation, decision 4, which is
 * not opt-in).
 */

import { z } from 'zod';

export const OpenApiOptionsSchema = z.object({
  format: z.enum(['json', 'yaml']).optional().describe('Output format (default: derived from the file extension)'),
  crud: z
    .union([z.boolean(), z.object({ types: z.array(z.string()).describe('Type names to generate CRUD paths for') })])
    .optional()
    .describe('Generate the standard CRUD operation set (opt-in; default: none)')
});

export type OpenApiOptions = z.infer<typeof OpenApiOptionsSchema>;

/** Resolves the effective set of Data type names CRUD generation applies to, or `undefined` when CRUD is off. */
export function resolveCrudTypeNames(
  crud: OpenApiOptions['crud'],
  allDataTypeNames: readonly string[]
): readonly string[] | undefined {
  if (crud === undefined || crud === false) return undefined;
  if (crud === true) return allDataTypeNames;
  return crud.types;
}
