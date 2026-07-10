// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';
import { JsonSchemaImportOptionsSchema } from './json-schema-import-options.js';

/**
 * Options for the OpenAPI import reader (`readOpenApi`). Extends the JSON
 * Schema options — `readOpenApi` normalizes `components.schemas` into a
 * JSON-Schema-shaped document and delegates conversion to `readJsonSchema`.
 */
export const OpenApiImportOptionsSchema = JsonSchemaImportOptionsSchema.extend({
  includeOperations: z
    .boolean()
    .optional()
    .default(true)
    .describe('Convert OpenAPI paths into Rune functions (current behavior). Turn off to import types/enums only.')
});

export type OpenApiImportOptions = z.infer<typeof OpenApiImportOptionsSchema>;
