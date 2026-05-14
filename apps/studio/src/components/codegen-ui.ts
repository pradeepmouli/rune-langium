// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';

export const CODE_PREVIEW_PANEL_ID = 'code-preview-panel';
export const FORM_PREVIEW_PANEL_ID = 'form-preview-panel';

// 018 Phase 0 Task 0.7 — these constants used to be a hand-maintained
// 3-target list that drifted from the Target union the moment Phase 0
// added sql/markdown/excel/graphql. Source them from the codegen
// package's TARGET_DESCRIPTORS registry instead so the studio stays in
// sync automatically. The `as const` on Object.keys() preserves the
// declared order from the registry.
const TARGET_KEYS = Object.keys(TARGET_DESCRIPTORS) as readonly Target[];

export const TARGET_OPTIONS = TARGET_KEYS.map((value) => ({
  value,
  label: TARGET_DESCRIPTORS[value].label
})) as readonly { value: Target; label: string }[];

export const TARGET_LABELS: Record<Target, string> = Object.fromEntries(
  TARGET_KEYS.map((target) => [target, TARGET_DESCRIPTORS[target].label])
) as Record<Target, string>;
