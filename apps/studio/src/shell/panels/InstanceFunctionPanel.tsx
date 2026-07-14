// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { FormPreviewPanel } from './FormPreviewPanel.js';

/**
 * Reuses the Preview perspective's existing FormPreviewPanel wrapper
 * (usePreviewStore-driven) as-is for function execution inside the
 * Prototype perspective. No instance-binding in Phase 1 — that's the
 * Phase 2 upgrade to US5. See design doc §5.
 */
export function InstanceFunctionPanel() {
  return <FormPreviewPanel />;
}
