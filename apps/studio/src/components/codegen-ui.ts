// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';

export const CODE_PREVIEW_PANEL_ID = 'code-preview-panel';
export const FORM_PREVIEW_PANEL_ID = 'form-preview-panel';

// 018 Phase 0 Task 0.7 — derived from TARGET_DESCRIPTORS so this stays
// in sync with the codegen registry as new targets are added. The old
// TARGET_OPTIONS export was deleted in Task 0.9 alongside TargetSwitcher,
// which was its only consumer.
export const TARGET_LABELS: Record<Target, string> = Object.fromEntries(
  (Object.keys(TARGET_DESCRIPTORS) as Target[]).map((target) => [target, TARGET_DESCRIPTORS[target].label])
) as Record<Target, string>;
