// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

// design-sync: the @rune-langium/visual-editor presentational surface merged onto
// window.DaikonicDS (cfg.extraEntries). Re-exports only — no reimplementation.
// Model-bound editors/forms (Langium AST + zustand store) are intentionally absent.
export { KindBadge } from '../packages/visual-editor/src/components/KindBadge';
export { NodeKindBadge } from '../packages/visual-editor/src/components/nodes/NodeKindBadge';
export { GraphLegend } from '../packages/visual-editor/src/components/GraphLegend';
export { CardinalityPicker } from '../packages/visual-editor/src/components/editors/CardinalityPicker';
export { TypeSelector } from '../packages/visual-editor/src/components/editors/TypeSelector';
