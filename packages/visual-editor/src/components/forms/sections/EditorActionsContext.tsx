// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * EditorActionsContext — bridges declarative section components to
 * the host editor's `EditorFormActions` + `nodeId`.
 *
 * Section components rendered through z2f's `componentModule` lookup
 * (Phase 7 / US5) only receive a `fields: string[]` prop. They cannot
 * accept the per-action callbacks that the imperative call sites still
 * supply directly. The host editor therefore wraps `<ZodForm>` with
 * this provider; the section components consume it via
 * `useEditorActionsContext()` to commit edits to the graph.
 *
 * The imperative call sites (today's `<MetadataSection onCommitDef ...>`
 * inside each editor) are unaffected — they pass callbacks as props,
 * which take precedence over the context. Phase 3+/Phase 5 will switch
 * each editor to the declarative path per its own cutover commit.
 *
 * @module
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { EditorFormActions } from '../../../types.js';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

/**
 * Minimal contract a host editor must surface for declaratively-rendered
 * sections to commit graph edits.
 *
 * - `nodeId`: the graph node currently being edited.
 * - `actions`: the kind-aware action set (intersection-typed for sections
 *   so they can call any method without narrowing per editor kind — the
 *   host always provides at least the `CommonFormActions` surface).
 * - `readOnly`: optional global read-only flag the host can flip when
 *   the node is not user-editable (e.g. external types).
 * - `availableAnnotations`: optional list passed to `AnnotationSection`'s
 *   picker. When omitted the section falls back to its built-in defaults.
 */
export interface EditorActionsContextValue {
  nodeId: string;
  actions: EditorFormActions;
  readOnly?: boolean;
  availableAnnotations?: string[];
}

const EditorActionsContext = createContext<EditorActionsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider + hook
// ---------------------------------------------------------------------------

export interface EditorActionsProviderProps extends EditorActionsContextValue {
  children: ReactNode;
}

/**
 * Wraps a `<ZodForm>` (or any tree containing declaratively-rendered
 * section components) with the `nodeId` + `actions` the sections need
 * to commit edits.
 */
export function EditorActionsProvider({
  children,
  ...value
}: EditorActionsProviderProps): ReactNode {
  return <EditorActionsContext.Provider value={value}>{children}</EditorActionsContext.Provider>;
}

/**
 * Read the editor actions context.
 *
 * Returns `null` when the section component is rendered outside an
 * `<EditorActionsProvider>`. Section components must tolerate `null`
 * (the imperative call sites pass callbacks via props instead) and
 * MUST NOT throw — see `section-component.md` §6.
 */
export function useEditorActionsContext(): EditorActionsContextValue | null {
  return useContext(EditorActionsContext);
}
