// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/**
 * Options for the JSON Schema import reader (`readJsonSchema`). Also the
 * base schema `OpenApiImportOptionsSchema` extends — OpenAPI's schema
 * conversion delegates to `readJsonSchema` internally.
 */
export const JsonSchemaImportOptionsSchema = z.object({
  skipConditions: z
    .boolean()
    .optional()
    .default(false)
    .describe('Structural import only — never populate constraints arrays.'),
  includeUnreferencedDefs: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Import every $defs/definitions entry (current behavior). Turn off to only import defs transitively referenced from the root schema.'
    )
});

export type JsonSchemaImportOptions = z.infer<typeof JsonSchemaImportOptionsSchema>;
