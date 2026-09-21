// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Target } from '@rune-langium/codegen/export';

export interface LayoutChoice {
  value: string;
  label: string;
  hint?: string;
}

export interface TargetPanelConfig {
  layouts: LayoutChoice[];
  defaultLayout?: string;
}

const PER_NAMESPACE: LayoutChoice = {
  value: 'per-namespace',
  label: 'Per-namespace',
  hint: 'One file per namespace + barrel'
};
const BARREL: LayoutChoice = { value: 'barrel', label: 'Barrel', hint: 'Barrel + per-namespace files' };
const SINGLE_FILE: LayoutChoice = { value: 'single-file', label: 'Single file', hint: 'All types in one file' };

/** Studio presentation metadata shared by modal and workbench settings. */
export const TARGET_PANELS: Partial<Record<Target, TargetPanelConfig>> = {
  zod: { layouts: [PER_NAMESPACE, BARREL, SINGLE_FILE], defaultLayout: 'barrel' },
  typescript: { layouts: [PER_NAMESPACE, BARREL, SINGLE_FILE], defaultLayout: 'barrel' },
  'json-schema': { layouts: [PER_NAMESPACE, SINGLE_FILE], defaultLayout: 'single-file' }
};
