// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Excel emitter options (019 spec §5.1) — the first whole-model option block
 * defined as a Zod schema rather than a bare TS interface.
 *
 * The schema is the single source of truth for two consumers:
 *   1. `ExcelWholeModelEmitter` reads the inferred `ExcelOptions` type to
 *      decide which sheets to emit.
 *   2. The studio's Download config modal renders this schema as a form via
 *      `@zod-to-form/vite` (`?z2f` import) — no hand-coded option controls.
 *
 * `sheets` toggles map 1:1 to the workbook's sheets. Defaults are all-true so
 * a bare `{ target: 'excel' }` request (CLI, direct curl) keeps producing the
 * full workbook — the modal is the only caller that narrows the set.
 */

import { z } from 'zod';

export const ExcelOptionsSchema = z.object({
  sheets: z
    .object({
      types: z.boolean().default(true).describe('Types'),
      enums: z.boolean().default(true).describe('Enums'),
      typeAliases: z.boolean().default(true).describe('Type aliases'),
      conditions: z.boolean().default(true).describe('Conditions')
    })
    .default({ types: true, enums: true, typeAliases: true, conditions: true })
    .describe('Sheets')
});

export type ExcelOptions = z.infer<typeof ExcelOptionsSchema>;

/** Which sheets to emit. Resolves the per-sheet defaults when absent. */
export type ExcelSheetToggles = ExcelOptions['sheets'];

/**
 * Resolve the effective sheet toggles from a partial/absent options block,
 * applying the schema defaults. Used by the emitter so a missing `excel`
 * option or a partial `sheets` object still produces a complete workbook.
 */
export function resolveExcelSheets(options: { sheets?: Partial<ExcelSheetToggles> } | undefined): ExcelSheetToggles {
  return ExcelOptionsSchema.parse(options ?? {}).sheets;
}
