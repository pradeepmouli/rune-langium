// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * FunctionForm — structured editor form for a Function node.
 *
 * Per R11 of `specs/013-z2f-editor-migration/research.md`, the form is
 * driven directly by the langium-generated `RosettaFunctionSchema` from
 * `src/generated/zod-schemas.ts`; no projection helper is required because
 * `RosettaFunctionSchema` is a `z.looseObject` and the graph node IS the
 * AST shape Langium emits (extra keys like `expressionText`, `definition`,
 * `comments`, `synonyms` are accepted as extras).
 *
 * The host wraps the form tree in `<EditorActionsProvider>` so the
 * declaratively-rendered section components (Annotation, Condition,
 * Metadata) derive their callbacks from `EditorFormActions` + `nodeId`
 * via `useEditorActionsContext()` (Phase 7 / US5 contract). The form
 * body itself no longer threads per-section callback props.
 *
 * Sections:
 * 1. Header: editable name + "Function" purple badge
 * 2. Input parameters: editable `<AttributeRow>` list via useFieldArray
 *    (mirrors DataTypeForm's attribute section — DRY / Task R-func-input),
 *    plus an inline "add input" row that uses `<TypeReferenceField>`.
 * 3. Output type: TypeReferenceField for the return type
 * 4. Function Body: aliases + operations rendered through the
 *    `renderExpressionEditor` slot, falling back to a plain `<Textarea>`
 *    when the slot is not provided. This is the bespoke editor UX that
 *    FR-010 mandates we preserve.
 * 5. Conditions / Annotations / Metadata: rendered via
 *    `<EditorActionsProvider>`-backed declarative invocations (no prop
 *    callbacks).
 *
 * @module
 */

import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { FormProvider, useFieldArray, Controller, type Control } from 'react-hook-form';
import { Field, FieldError, FieldGroup, FieldLegend, FieldSet } from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { Button } from '@rune-langium/design-system/ui/button';
import { TypeHeader, INSPECTOR_FORM_HEADER_CLASS } from '../TypeHeader.js';
import { Plus } from 'lucide-react';
import { TypeReferenceField } from './TypeReferenceField.js';
import { AttributeRow } from './AttributeRow.js';
import { MetadataSection } from './MetadataSection.js';
import { AnnotationSection } from './AnnotationSection.js';
import { ConditionSection } from './ConditionSection.js';
import { InheritedMembersSection } from './InheritedMembersSection.js';
import { EditorActionsProvider } from '../forms/sections/EditorActionsContext.js';
import { getTypeRefText, parseCardinality } from '../../adapters/model-helpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { functionFormRegistry } from '../forms/rows/index.js';
import { RosettaFunctionSchema } from '../../generated/zod-schemas.js';
import { useExpressionAutocomplete } from '../../hooks/useExpressionAutocomplete.js';
import { validateExpression } from '../../validation/edit-validator.js';
import { identityProjection } from './identity-projection.js';
import type {
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  ExpressionEditorSlotProps,
  NavigateToNodeCallback
} from '../../types.js';
import type { InheritedGroup } from '../../hooks/useInheritedMembers.js';

const EMPTY_GROUPS: InheritedGroup[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract preserved CST text from an AST node (tries $cstText then $cstNode.text). */
function getCstText(node: unknown): string {
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.$cstText === 'string') return obj.$cstText.trim();
    const cst = obj.$cstNode;
    if (cst && typeof cst === 'object') {
      const text = (cst as Record<string, unknown>).text;
      if (typeof text === 'string') return text.trim();
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FunctionFormProps {
  /** Node ID of the Function being edited. */
  nodeId: string;
  /** Data payload for the selected function node (AnyGraphNode with $type='RosettaFunction'). */
  data: AnyGraphNode;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Function-specific editor form action callbacks. */
  actions: EditorFormActions<'func'>;
  /** Inherited member groups from super-function (if any). */
  inheritedGroups?: InheritedGroup[];
  /**
   * Optional render-prop for a rich expression editor (e.g. CodeMirror).
   * When omitted, a plain `<Textarea>` is rendered as fallback.
   *
   * Per FR-010 / R10, this slot is preserved verbatim through the
   * z2f migration: the bespoke expression-builder UX is owned by the
   * studio app and remains a controlled override.
   */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
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
// FunctionForm
// ---------------------------------------------------------------------------

function FunctionForm({
  nodeId,
  data,
  availableTypes,
  actions,
  inheritedGroups = EMPTY_GROUPS,
  renderExpressionEditor,
  onNavigateToNode,
  allNodeIds,
  readOnly: readOnlyProp
}: FunctionFormProps) {
  const d = data as any;

  // ---- Form setup (useZodForm + useExternalSync per R11 / R4) -------------
  // Drive validation off the canonical AST schema; pass the graph node
  // straight into `defaultValues` (RosettaFunctionSchema is a z.looseObject,
  // so the graph node passes through unchanged — no projection layer).

  const { form } = useZodForm(RosettaFunctionSchema, {
    defaultValues: identityProjection<typeof RosettaFunctionSchema>(data),
    mode: 'onChange',
    formRegistry: functionFormRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different
  // node (object identity is the contract). `keepDirty: true` preserves
  // the pre-migration `keepDirtyValues: true` semantics so in-flight
  // user edits are not stomped by a graph push.
  useExternalSync(form, data, identityProjection<typeof RosettaFunctionSchema>, {
    keepDirty: true
  });

  // ---- useFieldArray for `inputs` (mirrors DataTypeForm's `attributes`) ----
  // `RosettaFunctionSchema` is a z.looseObject; the inferred output type does
  // not expose `inputs` as a typed array path RHF's overloaded `useFieldArray`
  // can latch onto. Widen the control type so the AST key is accepted —
  // runtime behaviour is unchanged.
  type AttributeFieldShape = {
    $type: 'Attribute';
    name: string;
    typeCall: { $type: 'TypeCall'; type: { $refText: string } };
    card: { inf: number; sup?: number; unbounded?: boolean };
    override?: boolean;
  };
  const { fields, append, remove, move } = useFieldArray({
    control: form.control as unknown as Control<{ inputs: AttributeFieldShape[] }>,
    name: 'inputs'
  });

  // Track the committed (graph-confirmed) data for diffing
  const committedRef = useRef(data);
  committedRef.current = data;

  // ---- Name auto-save (debounced — preserved per R8) ----------------------

  const commitName = useCallback(
    (newName: string) => {
      if (newName && newName.trim() && newName !== committedRef.current.name) {
        actions.renameType(nodeId, newName.trim());
      }
    },
    [nodeId, actions]
  );

  const debouncedName = useAutoSave(commitName, 500);

  // ---- Expression validation (on blur — preserves bespoke UX, FR-010) -----

  const [expressionError, setExpressionError] = useState<string | null>(null);

  const handleExpressionBlur = useCallback(() => {
    // Guard: a readOnly textarea cannot produce new content, so blur should
    // never trigger a mutation. Early-return to be explicit.
    if (Boolean(readOnlyProp || (data as any).isReadOnly)) return;
    const currentExpression = form.getValues('expressionText' as never) as unknown as string;
    const result = validateExpression(currentExpression);
    if (!result.valid) {
      setExpressionError(result.error ?? 'Invalid expression');
    } else {
      setExpressionError(null);
      if (currentExpression !== ((committedRef.current as any).expressionText ?? '')) {
        actions.updateExpression(nodeId, currentExpression);
      }
    }
  }, [nodeId, actions, form, readOnlyProp, data]);

  // ---- Output type ---------------------------------------------------------

  const handleOutputTypeSelect = useCallback(
    (value: string | null) => {
      if (value) {
        const opt = availableTypes.find((o) => o.value === value);
        actions.updateOutputType(nodeId, opt?.label ?? value);
      }
    },
    [nodeId, actions, availableTypes]
  );

  const outputType = getTypeRefText(d.output?.typeCall) ?? d.outputType ?? '';
  const outputValue = outputType ? (availableTypes.find((o) => o.label === outputType)?.value ?? '') : '';

  // ---- Input param helpers -------------------------------------------------

  // Derive the read-only display projection for useExpressionAutocomplete.
  // This keeps the autocomplete hook working correctly even though we now
  // drive visual rendering from `fields` (the RHF field array).
  const inputParams = (d.inputs ?? []).map((p: any) => ({
    name: p.name ?? '',
    typeName: getTypeRefText(p.typeCall)
  }));

  // Autocomplete hook (available for future autocompletion popup integration)
  const { getCompletions: _getCompletions } = useExpressionAutocomplete(availableTypes, inputParams);

  // Build an AST-shaped Attribute literal for `useFieldArray.append`. Same
  // shape as DataTypeForm.makeAttributeAstItem — function inputs and data
  // attributes share the `Attribute` AST schema.
  const makeInputAstItem = useCallback(
    (name: string, typeName: string, cardinality = '(1..1)', override = false) => ({
      $type: 'Attribute' as const,
      name,
      typeCall: { $type: 'TypeCall' as const, type: { $refText: typeName }, arguments: [] as never[] },
      card: parseCardinality(cardinality),
      override
    }),
    []
  );

  // ---- Input param callbacks -----------------------------------------------

  const handleUpdateInput = useCallback(
    (index: number, oldName: string, newName: string, typeName: string, cardinality: string) => {
      // `index` unused here — action uses name-based diffing (mirrors updateAttribute).
      void index;
      actions.updateInputParam(nodeId, oldName, newName, typeName, cardinality);
    },
    [nodeId, actions]
  );

  const handleRemoveInputByIndex = useCallback(
    (index: number) => {
      // Resolve the committed name so the store can find the entry by name.
      // Fall back to the field array item name if the committed data is ahead.
      const committedInputs = ((committedRef.current as any).inputs ?? []) as Array<any>;
      const committed = committedInputs[index];
      if (committed) {
        remove(index);
        actions.removeInputParam(nodeId, committed.name);
      }
    },
    [nodeId, actions, remove]
  );

  const handleReorderInput = useCallback(
    (fromIndex: number, toIndex: number) => {
      move(fromIndex, toIndex);
      actions.reorderInputParam(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions, move]
  );

  // ---- Inline add-input state + handler ------------------------------------

  const [addParamName, setAddParamName] = useState('');
  const [addParamType, setAddParamType] = useState('');

  const handleAddInput = useCallback(() => {
    const name = addParamName.trim();
    if (!name) return;
    const typeName = addParamType
      ? (availableTypes.find((o) => o.value === addParamType)?.label ?? addParamType)
      : 'string';
    // Update both form state (field array) and the graph store — mirrors
    // DataTypeForm.handleAddAttribute which calls both append() and
    // actions.addAttribute().
    append(makeInputAstItem(name, typeName));
    actions.addInputParam(nodeId, name, typeName);
    setAddParamName('');
    setAddParamType('');
  }, [nodeId, actions, availableTypes, addParamName, addParamType, append, makeInputAstItem]);

  // ---- Render --------------------------------------------------------------
  // Section components (Annotation, Condition, Metadata) are invoked
  // declaratively here — no callback props. They derive their actions
  // from <EditorActionsProvider> via `useEditorActionsContext()` per the
  // Phase 7 / US5 contract.

  const isReadOnly = Boolean(readOnlyProp || d.isReadOnly);

  return (
    <EditorActionsProvider nodeId={nodeId} actions={actions as EditorFormActions} readOnly={isReadOnly}>
      <FormProvider {...form}>
        <div data-slot="function-form" className="flex flex-col gap-4 p-4">
          {/* Header: Namespace + Name + Badge */}
          <TypeHeader
            kind="func"
            namespace={d.namespace}
            control={form.control}
            onNameChange={debouncedName}
            placeholder="Function name"
            nameAriaLabel="Function type name"
            className={INSPECTOR_FORM_HEADER_CLASS}
          />

          {/* Input Parameters — editable AttributeRow list via useFieldArray,
              mirrors the Members section in DataTypeForm (DRY / R-func-input). */}
          <FieldSet className="gap-1">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Inputs ({fields.length})
            </FieldLegend>

            <FieldGroup className="gap-0.5">
              {fields.map((field, index) => (
                <AttributeRow
                  key={field.id}
                  index={index}
                  fieldArrayName="inputs"
                  committedName={((committedRef.current as any).inputs ?? [])[index]?.name ?? ''}
                  availableTypes={availableTypes}
                  onUpdate={handleUpdateInput}
                  onRemove={handleRemoveInputByIndex}
                  onReorder={handleReorderInput}
                  onNavigateToNode={onNavigateToNode}
                  allNodeIds={allNodeIds}
                  disabled={isReadOnly}
                />
              ))}

              {fields.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">No input parameters defined.</p>
              )}
            </FieldGroup>

            {/* Inline add input — hidden in read-only mode */}
            {!isReadOnly && (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  data-slot="add-param-name"
                  type="text"
                  value={addParamName}
                  onChange={(e) => setAddParamName(e.target.value)}
                  placeholder="Name"
                  className="text-xs w-24 h-6 px-1.5"
                  aria-label="New input parameter name"
                />
                <div className="flex-1">
                  <TypeReferenceField
                    value={addParamType || null}
                    options={availableTypes}
                    onSelect={(v) => setAddParamType(v ?? '')}
                    placeholder="Type..."
                    emptyLabel="Type"
                    onNavigateToNode={onNavigateToNode}
                    allNodeIds={allNodeIds}
                  />
                </div>
                {/* Icon-only add button matches FormPreviewPanel; see
                  DataTypeForm for the rationale. */}
                <Button
                  data-slot="add-input-btn"
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleAddInput}
                  aria-label="Add input"
                  title="Add input"
                  className="shrink-0"
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            )}
          </FieldSet>

          {/* Output Type */}
          <FieldSet className="gap-1.5">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Output Type
            </FieldLegend>
            <TypeReferenceField
              value={outputValue}
              displayName={outputType}
              options={availableTypes}
              onSelect={handleOutputTypeSelect}
              placeholder="Select output type..."
              emptyLabel="No output type"
              onNavigateToNode={onNavigateToNode}
              allNodeIds={allNodeIds}
              disabled={isReadOnly}
            />
          </FieldSet>

          {/* Function Body — aliases + operations, each with its own
              expression editor (R10 / FR-010 — bespoke UX preserved). */}
          <FieldSet className="gap-2">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Function Body
            </FieldLegend>

            {/* Aliases (shortcuts) */}
            {(d.shortcuts ?? []).map((shortcut: any, i: number) => {
              const aliasText = getCstText(shortcut.expression);
              return (
                <div key={`alias-${shortcut.name ?? i}`} data-slot="alias-section" className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">alias {shortcut.name ?? `#${i}`}</span>
                  {renderExpressionEditor ? (
                    renderExpressionEditor({
                      value: aliasText,
                      onChange: () => {},
                      onBlur: () => {},
                      placeholder: 'Alias expression...',
                      expressionAst: shortcut.expression
                    })
                  ) : (
                    <Textarea
                      value={aliasText}
                      readOnly
                      rows={1}
                      className="text-sm font-mono resize-none bg-muted/30"
                    />
                  )}
                </div>
              );
            })}

            {/* Operations (set / add statements) */}
            {(d.operations ?? []).map((op: any, i: number) => {
              const opText = getCstText(op.expression);
              // assignRoot is a Langium Reference — resolve to $refText string
              const assignRoot = typeof op.assignRoot === 'string' ? op.assignRoot : (op.assignRoot?.$refText ?? '');
              // Fall back to extracting from CST text: "set <target>: <expr>"
              const assignTarget =
                assignRoot ||
                getCstText(op)
                  .split(':')[0]
                  ?.replace(/^(set|add)\s+/, '')
                  .trim() ||
                'result';
              const isAdd = op.add === true;
              return (
                <div key={`op-${assignTarget}-${i}`} data-slot="operation-section" className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {isAdd ? 'add' : 'set'} {assignTarget}
                  </span>
                  {renderExpressionEditor ? (
                    renderExpressionEditor({
                      value: opText,
                      onChange: (val: string) => {
                        const currentVals = form.getValues('expressionText' as never) as unknown as string;
                        if (val !== currentVals) {
                          form.setValue('expressionText' as never, val as never, {
                            shouldDirty: true
                          });
                        }
                      },
                      onBlur: handleExpressionBlur,
                      error: i === 0 ? expressionError : null,
                      placeholder: 'Enter expression...',
                      expressionAst: op.expression
                    })
                  ) : (
                    <Textarea
                      value={opText}
                      readOnly={isReadOnly}
                      onChange={(e) => {
                        if (isReadOnly) return;
                        form.setValue('expressionText' as never, e.target.value as never, {
                          shouldDirty: true
                        });
                      }}
                      onBlur={handleExpressionBlur}
                      rows={2}
                      className={`text-sm font-mono resize-y ${i === 0 && expressionError ? 'border-destructive' : ''}`}
                      placeholder="Enter expression..."
                    />
                  )}
                </div>
              );
            })}

            {/* Empty state — no operations yet */}
            {(d.operations ?? []).length === 0 && (d.shortcuts ?? []).length === 0 && (
              <Controller
                control={form.control}
                name={'expressionText' as never}
                render={({ field, fieldState }) => (
                  <Field>
                    {renderExpressionEditor ? (
                      renderExpressionEditor({
                        value: (field.value as string | undefined) ?? '',
                        onChange: (val: string) => {
                          field.onChange(val);
                          if (expressionError) setExpressionError(null);
                        },
                        onBlur: () => {
                          field.onBlur();
                          handleExpressionBlur();
                        },
                        error: expressionError,
                        placeholder: 'Enter function expression...'
                      })
                    ) : (
                      <Textarea
                        {...field}
                        value={(field.value as string | undefined) ?? ''}
                        data-slot="expression-editor"
                        aria-invalid={fieldState.invalid}
                        aria-label="Function expression"
                        disabled={isReadOnly}
                        onBlur={() => {
                          field.onBlur();
                          handleExpressionBlur();
                        }}
                        onChange={(e) => {
                          field.onChange(e);
                          if (expressionError) setExpressionError(null);
                        }}
                        rows={4}
                        className={`text-sm font-mono resize-y ${expressionError ? 'border-destructive' : ''}`}
                        placeholder="Enter function expression..."
                      />
                    )}
                    {expressionError && (
                      <p data-slot="expression-error" className="text-xs text-destructive mt-0.5">
                        {expressionError}
                      </p>
                    )}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}
          </FieldSet>

          {/* Conditions / Annotations / Metadata — declaratively invoked.
              Section components derive their callbacks from
              <EditorActionsProvider> via useEditorActionsContext() and
              read field values from the surrounding <FormProvider>.
              Per R10, bespoke editor UX features (expression-builder
              slot inside ConditionSection) continue to be threaded
              through the renderExpressionEditor prop — that slot is
              owned by the studio app and is not part of the migration. */}
          <ConditionSection
            label="Conditions"
            showPostConditionToggle={true}
            renderExpressionEditor={renderExpressionEditor}
          />

          <AnnotationSection />

          {/* Inherited members (from super-function, if applicable) */}
          <InheritedMembersSection groups={inheritedGroups} />

          <MetadataSection />
        </div>
      </FormProvider>
    </EditorActionsProvider>
  );
}

export { FunctionForm };
