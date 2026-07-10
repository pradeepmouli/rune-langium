// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/**
 * Options for the SQL DDL import reader (`readSql`). No node-kind filter —
 * SQL DDL is already flat (one declaration per CREATE TABLE), there is no
 * other top-level construct kind to filter today. `wasmSource` (browser
 * WASM-loading override) deliberately stays out of this schema/form — it
 * is an internal detail, not a user-facing setting.
 */
export const SqlImportOptionsSchema = z.object({
  dialect: z
    .enum(['postgres', 'sqlserver'])
    .optional()
    .default('postgres')
    .describe(
      'Matches the outbound SQL emitter default; currently informational (the tree-sitter grammar is dialect-tolerant).'
    ),
  skipConditions: z
    .boolean()
    .optional()
    .default(false)
    .describe('Structural import only — never populate constraints arrays.')
});

export type SqlImportOptions = z.infer<typeof SqlImportOptionsSchema>;
