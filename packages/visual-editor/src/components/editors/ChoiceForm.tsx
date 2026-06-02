// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ChoiceForm — structured editor form for a Choice node.
 *
 * Phase 5a (User Story 3) of `013-z2f-editor-migration`. Mirrors the
 * Phase 3 (DataTypeForm) z2f migration template:
 *
 * - Validation drives off the canonical `ChoiceSchema` from the
 *   langium-generated AST (R1 / R11).
 * - The graph node is passed straight into `defaultValues` (R11). The
 *   AST schema is a `z.looseObject`, so any graph-only keys flow through
 *   without a projection layer.
 * - External-data sync uses the upstream `useExternalSync` hook with an
 *   identity projection (R11) — the graph node IS the AST shape, so no
 *   transformation is required at the sync boundary.
 * - The host wraps the form tree with `<EditorActionsProvider>` so the
 *   declaratively-resolved section components (Phase 7 / US5) can derive
 *   their per-action callbacks from `EditorFormActions` + `nodeId`. The
 *   imperative `<MetadataSection ...>` JSX retains its callback-prop
 *   wiring; props take precedence over context per the section contract.
 *
 * Sections:
 * 1. Header: editable name + "Choice" amber badge
 * 2. Options: ChoiceOptionRow list + inline TypeSelector for "Add Option"
 * 3. Metadata: description, comments, synonyms (MetadataSection)
 *
 * Note: Choices have NO parent/inheritance and no Conditions/Annotations
 * sections (matches the pre-migration baseline).
 *
 * @module
 */

import { useCallback, useRef } from 'react';
import { FormProvider } from 'react-hook-form';
import { FieldGroup, FieldLegend, FieldSet } from '@rune-langium/design-system/ui/field';
import { TypeHeader, INSPECTOR_FORM_HEADER_CLASS } from '../TypeHeader.js';
import { ChoiceOptionRow } from './ChoiceOptionRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { EditorActionsProvider } from '../forms/sections/EditorActionsContext.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { ChoiceSchema } from '../../generated/zod-schemas.js';
import { formRegistry } from '../forms/rows/index.js';
import { identityProjection } from './identity-projection.js';
import { getTypeRefText } from '../../adapters/model-helpers.js';
import type { AnyGraphNode, TypeOption, EditorFormActions, NavigateToNodeCallback } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChoiceFormProps {
  /** Node ID of the Choice being edited. */
  nodeId: string;
  /** Data payload for the selected choice node (AnyGraphNode with $type='Choice'). */
  data: AnyGraphNode;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Choice-specific editor form action callbacks. */
  actions: EditorFormActions<'choice'>;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
  /**
   * Panel-level read-only override. ORed with `data.isReadOnly`.
   */
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChoiceForm({ nodeId, data, availableTypes, actions, onNavigateToNode, allNodeIds, readOnly: readOnlyProp }: ChoiceFormProps) {
  const d = data as any;

  // ---- Form setup (useZodForm + useExternalSync per R11 / R4) -------------
  // Drive validation off the canonical AST schema; pass the graph node
  // straight into `defaultValues` (ChoiceSchema is z.looseObject, so the
  // graph node passes through unchanged). Phase 8 (US6) wires the bespoke
  // <ChoiceOptionRow> as a custom row renderer via formRegistry.

  const { form } = useZodForm(ChoiceSchema, {
    defaultValues: identityProjection<typeof ChoiceSchema>(data),
    mode: 'onChange',
    formRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different node.
  // `keepDirty: true` preserves the prior local-component semantics so
  // in-flight user edits are not stomped by a graph push.
  useExternalSync(form, data, identityProjection<typeof ChoiceSchema>, { keepDirty: true });

  // Track committed data for diffing
  const committedRef = useRef(data);
  committedRef.current = data;

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      if (newName && newName.trim() && newName !== committedRef.current.name) {
        actions.renameType(nodeId, newName.trim());
      }
    },
    [nodeId, actions]
  );

  const debouncedName = useAutoSave(commitName, 500);

  // ---- Option callbacks ----------------------------------------------------

  const handleRemoveOption = useCallback(
    (nId: string, typeName: string) => {
      actions.removeChoiceOption(nId, typeName);
    },
    [actions]
  );

  const handleAddOption = useCallback(
    (value: string | null) => {
      if (value) {
        const label = availableTypes.find((opt) => opt.value === value)?.label;
        if (label) {
          actions.addChoiceOption(nodeId, label);
        }
      }
    },
    [nodeId, actions, availableTypes]
  );

  // ---- Metadata callbacks --------------------------------------------------

  const commitDefinition = useCallback(
    (def: string) => {
      actions.updateDefinition(nodeId, def);
    },
    [nodeId, actions]
  );

  const commitComments = useCallback(
    (comments: string) => {
      actions.updateComments(nodeId, comments);
    },
    [nodeId, actions]
  );

  const handleAddSynonym = useCallback(
    (synonym: string) => {
      actions.addSynonym(nodeId, synonym);
    },
    [nodeId, actions]
  );

  const handleRemoveSynonym = useCallback(
    (index: number) => {
      actions.removeSynonym(nodeId, index);
    },
    [nodeId, actions]
  );

  // ---- Derived members from AST attributes ---------------------------------

  const members = (d.attributes ?? []).map((o: any) => ({
    name: getTypeRefText(o.typeCall) ?? '',
    typeName: getTypeRefText(o.typeCall) ?? ''
  }));

  // ---- Filter out types already used as options ----------------------------

  const usedTypeNames = new Set(members.map((m: { typeName: string }) => m.typeName));
  const addableTypes = availableTypes.filter(
    (opt) => (opt.kind === 'data' || opt.kind === 'choice') && opt.label !== d.name && !usedTypeNames.has(opt.label)
  );

  // ---- Render --------------------------------------------------------------

  const isReadOnly = Boolean(readOnlyProp || d.isReadOnly);

  return (
    <FormProvider {...form}>
      <EditorActionsProvider nodeId={nodeId} actions={actions as unknown as EditorFormActions} readOnly={isReadOnly}>
        <div data-slot="choice-form" className="flex flex-col gap-4 p-4">
          {/* Header: Namespace + Name + Badge */}
          <TypeHeader kind="choice" namespace={d.namespace} control={form.control} onNameChange={debouncedName} placeholder="Choice name" nameAriaLabel="Choice type name" className={INSPECTOR_FORM_HEADER_CLASS} />

          {/* Options */}
          <FieldSet className="gap-1">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Options ({members.length})
            </FieldLegend>

            <FieldGroup className="gap-0.5">
              {members.map((member: { name: string; typeName: string }) => (
                <ChoiceOptionRow
                  key={member.typeName ?? member.name}
                  typeName={member.typeName ?? member.name}
                  nodeId={nodeId}
                  availableTypes={availableTypes}
                  onRemove={handleRemoveOption}
                  onNavigateToNode={onNavigateToNode}
                  allNodeIds={allNodeIds}
                />
              ))}

              {members.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No options defined. Use the selector below to add one.
                </p>
              )}
            </FieldGroup>

            {/* Add Option via TypeSelector — hidden in read-only mode */}
            {!isReadOnly && (
            <div data-slot="add-option" className="mt-1">
              <TypeSelector value="" options={addableTypes} onSelect={handleAddOption} placeholder="Add option..." />
            </div>
            )}
          </FieldSet>

          {/* Metadata */}
          <MetadataSection
            onDefinitionCommit={commitDefinition}
            onCommentsCommit={commitComments}
            onSynonymAdd={handleAddSynonym}
            onSynonymRemove={handleRemoveSynonym}
          />
        </div>
      </EditorActionsProvider>
    </FormProvider>
  );
}

export { ChoiceForm };
