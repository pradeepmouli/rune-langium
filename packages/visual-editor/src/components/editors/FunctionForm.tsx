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
 * 2. Input parameters: rows with name + TypeSelector, "Add Input" button
 * 3. Output type: TypeSelector for the return type
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
import { FormProvider, Controller } from 'react-hook-form';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet
} from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { AnnotationSection } from './AnnotationSection.js';
import { ConditionSection } from './ConditionSection.js';
import { InheritedMembersSection } from './InheritedMembersSection.js';
import { EditorActionsProvider } from '../forms/sections/EditorActionsContext.js';
import { getTypeRefText } from '../../adapters/model-helpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { FunctionInputRow } from './FunctionInputRow.js';
import { functionFormRegistry } from '../forms/rows/index.js';
import { z } from 'zod';
import { RosettaFunctionSchema } from '../../generated/zod-schemas.js';
import { useExpressionAutocomplete } from '../../hooks/useExpressionAutocomplete.js';
import { validateExpression } from '../../validation/edit-validator.js';
import { TypeLink } from './TypeLink.js';
import type {
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  ExpressionEditorSlotProps,
  NavigateToNodeCallback
} from '../../types.js';
import type { InheritedGroup } from '../../hooks/useInheritedMembers.js';

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
}

// Phase 8 (US6) extracted the inline `InputParamRow` to
// `./FunctionInputRow.tsx` so it can be registered as a `FormMeta.render`
// override against `AttributeSchema` (function inputs share that schema).
// `<FunctionInputRow>` below is byte-equivalent to the prior inline
// component.

// ---------------------------------------------------------------------------
// Default-values projection (R11)
// ---------------------------------------------------------------------------

/**
 * Identity projection for `useExternalSync`. Per R11, the editor consumes
 * the AST node directly — `RosettaFunctionSchema` is `z.looseObject` so
 * extra graph-only keys (`expressionText`, `definition`, `comments`,
 * `synonyms`, etc.) are accepted without runtime cost. The form's
 * `defaultValues` and the source passed into `useExternalSync` are the
 * same node reference; no transformation layer is needed.
 *
 * The double-cast (`unknown` → target) covers the typed gap between
 * `AnyGraphNode` (a union over every $type) and the narrow
 * `RosettaFunction` shape. The Function editor is only ever instantiated
 * with a `$type === 'RosettaFunction'` payload (per `EditorFormPanel`'s
 * dispatch), so the cast is safe at every call site.
 */
function identityProjection(node: AnyGraphNode): Partial<z.output<typeof RosettaFunctionSchema>> {
  return node as unknown as Partial<z.output<typeof RosettaFunctionSchema>>;
}

// ---------------------------------------------------------------------------
// FunctionForm
// ---------------------------------------------------------------------------

function FunctionForm({
  nodeId,
  data,
  availableTypes,
  actions,
  inheritedGroups = [],
  renderExpressionEditor,
  onNavigateToNode,
  allNodeIds
}: FunctionFormProps) {
  const d = data as any;

  // ---- Form setup (useZodForm + useExternalSync per R11 / R4) -------------
  // Drive validation off the canonical AST schema; pass the graph node
  // straight into `defaultValues` (RosettaFunctionSchema is a z.looseObject
  // so the extra projection keys — `expressionText`, `definition`,
  // `comments`, `synonyms` — are accepted as extras).

  const { form } = useZodForm(RosettaFunctionSchema, {
    defaultValues: identityProjection(data),
    mode: 'onChange',
    formRegistry: functionFormRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different
  // node (object identity is the contract). `keepDirty: true` preserves
  // the pre-migration `keepDirtyValues: true` semantics so in-flight
  // user edits are not stomped by a graph push.
  useExternalSync(
    form,
    data,
    identityProjection as (n: typeof data) => z.output<typeof RosettaFunctionSchema>,
    { keepDirty: true }
  );

  // The `inputs` array remains a graph-side collection rendered from the
  // data prop; bespoke add/remove affordances dispatch graph actions
  // directly (no `useFieldArray` needed for inputs because the row
  // identity is owned by the graph node, not by the form's internal
  // field-array state).

  // Track the committed data for diffing
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
  }, [nodeId, actions, form]);

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
  const outputValue = outputType
    ? (availableTypes.find((o) => o.label === outputType)?.value ?? '')
    : '';

  // ---- Input param callbacks -----------------------------------------------

  const inputParams = (d.inputs ?? []).map((p: any) => ({
    name: p.name ?? '',
    typeName: getTypeRefText(p.typeCall)
  }));

  // Autocomplete hook (available for future autocompletion popup integration)
  const { getCompletions: _getCompletions } = useExpressionAutocomplete(
    availableTypes,
    inputParams
  );

  // Inline add-input state
  const [addParamName, setAddParamName] = useState('');
  const [addParamType, setAddParamType] = useState('');

  const handleAddInput = useCallback(() => {
    const name = addParamName.trim();
    if (!name) return;
    const typeName = addParamType
      ? (availableTypes.find((o) => o.value === addParamType)?.label ?? addParamType)
      : 'string';
    actions.addInputParam(nodeId, name, typeName);
    setAddParamName('');
    setAddParamType('');
  }, [nodeId, actions, availableTypes, addParamName, addParamType]);

  const handleRemoveInput = useCallback(
    (nId: string, paramName: string) => {
      actions.removeInputParam(nId, paramName);
    },
    [actions]
  );

  // ---- Render --------------------------------------------------------------
  // Section components (Annotation, Condition, Metadata) are invoked
  // declaratively here — no callback props. They derive their actions
  // from <EditorActionsProvider> via `useEditorActionsContext()` per the
  // Phase 7 / US5 contract.

  return (
    <EditorActionsProvider
      nodeId={nodeId}
      actions={actions as EditorFormActions}
      readOnly={d.isReadOnly}
    >
      <FormProvider {...form}>
        <div data-slot="function-form" className="flex flex-col gap-4 p-4">
          {/* Header: Name + Badge */}
          <div data-slot="form-header" className="flex items-center gap-2">
            <Controller
              control={form.control}
              name={'name' as never}
              render={({ field, fieldState }) => (
                <Field className="flex-1">
                  <Input
                    {...field}
                    id={field.name}
                    data-slot="type-name-input"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      debouncedName(e.target.value);
                    }}
                    className="text-lg font-semibold bg-transparent border-b border-transparent
                      focus-visible:border-input focus-visible:ring-0 shadow-none
                      px-1 py-0.5 h-auto rounded-none"
                    placeholder="Function name"
                    aria-label="Function type name"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Badge variant="func">Function</Badge>
          </div>

          {/* Input Parameters */}
          <FieldSet className="gap-1">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Inputs ({inputParams.length})
            </FieldLegend>

            <FieldGroup className="gap-0.5">
              {inputParams.map((member: { name: string; typeName?: string }, i: number) => (
                <FunctionInputRow
                  key={`${nodeId}-param-${member.name}-${i}`}
                  member={member}
                  nodeId={nodeId}
                  availableTypes={availableTypes}
                  onRemove={handleRemoveInput}
                  onNavigateToNode={onNavigateToNode}
                  allNodeIds={allNodeIds}
                />
              ))}

              {inputParams.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No input parameters defined.
                </p>
              )}
            </FieldGroup>

            {/* Inline add input */}
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
                <TypeSelector
                  value={addParamType}
                  options={availableTypes}
                  onSelect={(v) => setAddParamType(v ?? '')}
                  placeholder="Type..."
                />
              </div>
              <button
                data-slot="add-input-btn"
                type="button"
                onClick={handleAddInput}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary
                  border border-border rounded px-2 py-0.5
                  hover:bg-card hover:border-input transition-colors whitespace-nowrap"
              >
                + Add Input
              </button>
            </div>
          </FieldSet>

          {/* Output Type */}
          <FieldSet className="gap-1.5">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Output Type
            </FieldLegend>
            {outputType && (
              <TypeLink
                typeName={outputType}
                onNavigateToNode={onNavigateToNode}
                allNodeIds={allNodeIds}
                className="text-sm font-mono mb-1"
              />
            )}
            <TypeSelector
              value={outputValue}
              options={availableTypes}
              onSelect={handleOutputTypeSelect}
              placeholder="Select output type..."
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
                <div
                  key={`alias-${shortcut.name ?? i}`}
                  data-slot="alias-section"
                  className="flex flex-col gap-1"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    alias {shortcut.name ?? `#${i}`}
                  </span>
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
              const assignRoot =
                typeof op.assignRoot === 'string' ? op.assignRoot : (op.assignRoot?.$refText ?? '');
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
                <div key={`op-${i}`} data-slot="operation-section" className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {isAdd ? 'add' : 'set'} {assignTarget}
                  </span>
                  {renderExpressionEditor ? (
                    renderExpressionEditor({
                      value: opText,
                      onChange: (val: string) => {
                        const currentVals = form.getValues(
                          'expressionText' as never
                        ) as unknown as string;
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
                      onChange={(e) => {
                        form.setValue('expressionText' as never, e.target.value as never, {
                          shouldDirty: true
                        });
                      }}
                      onBlur={handleExpressionBlur}
                      rows={2}
                      className={`text-sm font-mono resize-y ${i === 0 && expressionError ? 'border-red-500' : ''}`}
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
                        onBlur={() => {
                          field.onBlur();
                          handleExpressionBlur();
                        }}
                        onChange={(e) => {
                          field.onChange(e);
                          if (expressionError) setExpressionError(null);
                        }}
                        rows={4}
                        className={`text-sm font-mono resize-y ${expressionError ? 'border-red-500' : ''}`}
                        placeholder="Enter function expression..."
                      />
                    )}
                    {expressionError && (
                      <p data-slot="expression-error" className="text-xs text-red-500 mt-0.5">
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
