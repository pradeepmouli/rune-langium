// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/** Options for the XSD import reader (`readXsd`). */
export const XsdImportOptionsSchema = z.object({
  skipConditions: z
    .boolean()
    .optional()
    .default(false)
    .describe('Structural import only — never populate constraints arrays.'),
  importTopLevelElements: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Also import top-level xs:element declarations as standalone types. Off by default (current behavior): top-level elements are only used for ref= resolution and diagnostics.'
    )
});

export type XsdImportOptions = z.infer<typeof XsdImportOptionsSchema>;
