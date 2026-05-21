// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Studio-local re-export of ExcelOptionsSchema for the ?z2f Vite plugin.
 *
 * The plugin intercepts `import ... from './excel-options.schema?z2f'` and
 * transforms this module into a generated React form component. The schema
 * must be the default export (or the only named export) so the plugin's
 * auto-detection finds it without an explicit `exportName`.
 *
 * Keep this as a thin re-export — no studio-local state or React imports.
 */

export { ExcelOptionsSchema as default, ExcelOptionsSchema } from '@rune-langium/codegen';
