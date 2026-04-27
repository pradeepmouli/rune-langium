// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { Target } from '@rune-langium/codegen';

export const CODE_PREVIEW_PANEL_ID = 'code-preview-panel';

export const TARGET_OPTIONS = [
  { value: 'zod', label: 'Zod' },
  { value: 'json-schema', label: 'JSON Schema' },
  { value: 'typescript', label: 'TypeScript' }
] as const satisfies readonly { value: Target; label: string }[];

export const TARGET_LABELS: Record<Target, string> = {
  zod: 'Zod',
  'json-schema': 'JSON Schema',
  typescript: 'TypeScript'
};
