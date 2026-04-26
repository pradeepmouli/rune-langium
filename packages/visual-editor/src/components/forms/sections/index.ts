// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Section components registered against z2f's `componentModule`.
 *
 * Phase 7 / User Story 5 of `013-z2f-editor-migration`: lifts the three
 * editor section components (Annotations, Conditions, Metadata) out of
 * imperative inclusion in each form file and into the typed config's
 * `section:` declarations. The section names exported here are the
 * lookup keys consumed by the typed config.
 *
 * @module
 */

export { AnnotationSection } from '../../editors/AnnotationSection.js';
export { ConditionSection } from '../../editors/ConditionSection.js';
export { MetadataSection } from '../../editors/MetadataSection.js';
export {
  EditorActionsProvider,
  useEditorActionsContext,
  type EditorActionsContextValue,
  type EditorActionsProviderProps
} from './EditorActionsContext.js';
