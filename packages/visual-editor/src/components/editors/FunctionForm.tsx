// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * FunctionForm — structured editor form for a Function node.
 *
 * Uses react-hook-form `FormProvider` so nested components
 * (MetadataSection) can access form state via `useFormContext`.
 * `useFieldArray` manages the input-parameters list.
 *
 * Sections:
 * 1. Header: editable name + "Function" purple badge
 * 2. Input parameters: rows with name + TypeSelector, "Add Input" button
 * 3. Output type: TypeSelector for the return type
 * 4. Expression editor: validated textarea (blur commit)
 * 5. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { FormProvider, Controller, useFieldArray } from 'react-hook-form';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import {
  formatCardinality,
  getTypeRefText,
  classExprSynonymsToStrings,
  type ConditionDisplayInfo
} from '../../adapters/model-helpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm } from '@zod-to-form/react';
import { ExternalDataSync } from '../forms/ExternalDataSync.js';
import { useExpressionAutocomplete } from '../../hooks/useExpressionAutocomplete.js';
import { validateExpression } from '../../validation/edit-validator.js';
import { functionFormSchema, type FunctionFormValues } from '../../schemas/form-schemas.js';
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

/**
 * Build the full function body text from AST shortcuts (aliases) and operations.
 * Each alias becomes `alias <name>: <expression>` and each operation becomes
 * `set <path>:\n    <expression>`, joined by newlines.
 */
function buildBodyText(data: any): string {
  const parts: string[] = [];

  // Aliases (shortcuts in the AST)
  for (const shortcut of data.shortcuts ?? []) {
    const text = getCstText(shortcut);
    if (text) {
      parts.push(text);
    } else {
      const name = shortcut.name ?? '';
      const expr = getCstText(shortcut.expression);
      if (name && expr) parts.push(`alias ${name}: ${expr}`);
    }
  }

  // Operations (set statements)
  for (const op of data.operations ?? []) {
    const text = getCstText(op);
    if (text) {
      parts.push(text);
    } else {
      const exprText = getCstText(op.expression);
      if (exprText) {
        const assignRoot = op.assignRoot ?? 'result';
        parts.push(`set ${assignRoot}:\n    ${exprText}`);
      }
    }
  }

  return parts.join('\n\n');
}

/** Convert AnyGraphNode to form-managed values. */
function toFormValues(data: AnyGraphNode): FunctionFormValues {
  const d = data as any;
  // Derive expressionText: prefer explicit expressionText, then build from AST body
  let expressionText = d.expressionText ?? '';
  if (!expressionText) {
    expressionText = buildBodyText(d);
  }
  return {
    name: d.name ?? '',
    outputType: getTypeRefText(d.output?.typeCall) ?? d.outputType ?? '',
    expressionText,
    members: (d.inputs ?? []).map((p: any) => ({
      name: p.name ?? '',
      typeName: getTypeRefText(p.typeCall) ?? 'string',
      cardinality: formatCardinality(p.card) || '',
      isOverride: false,
      displayName: p.name ?? ''
    })),
    definition: d.definition ?? '',
    comments: d.comments ?? '',
    synonyms: classExprSynonymsToStrings(d.synonyms)
  };
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
   */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// InputParamRow (internal)
// ---------------------------------------------------------------------------

interface InputParamRowProps {
  member: { name: string; typeName?: string };
  nodeId: string;
  availableTypes: TypeOption[];
  onRemove: (nodeId: string, paramName: string) => void;
  disabled?: boolean;
  onNavigateToNode?: NavigateToNodeCallback;
  allNodeIds?: string[];
}

function InputParamRow({
  member,
  nodeId,
  availableTypes: _availableTypes,
  onRemove,
  disabled = false,
  onNavigateToNode,
  allNodeIds
}: InputParamRowProps) {
  return (
    <div
      data-slot="input-param-row"
      className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50"
      role="listitem"
    >
      <span className="text-xs text-muted-foreground w-3">⠇</span>

      <span data-slot="param-name" className="text-sm font-medium min-w-20">
        {member.name || '(unnamed)'}
      </span>

      <TypeLink
        typeName={member.typeName ?? 'string'}
        onNavigateToNode={onNavigateToNode}
        allNodeIds={allNodeIds}
        className="text-xs text-muted-foreground"
      />

      <button
        data-slot="remove-param-btn"
        type="button"
        onClick={() => onRemove(nodeId, member.name)}
        disabled={disabled}
        className="ml-auto text-xs text-destructive hover:text-destructive/80
          disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`Remove input ${member.name}`}
      >
        ✕
      </button>
    </div>
  );
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

  // ---- Form setup (useZodForm + ExternalDataSync for external data sync) ---

  const { form } = useZodForm(functionFormSchema, {
    defaultValues: toFormValues(data),
    mode: 'onChange'
  });

  const { fields: _fields } = useFieldArray({
    control: form.control,
    name: 'members'
  });

  // Track the committed data for diffing
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

  // ---- Expression validation (on blur) -------------------------------------

  const [expressionError, setExpressionError] = useState<string | null>(null);

  const handleExpressionBlur = useCallback(() => {
    const currentExpression = form.getValues('expressionText');
    const result = validateExpression(currentExpression);
    if (!result.valid) {
      setExpressionError(result.error ?? 'Invalid expression');
    } else {
      setExpressionError(null);
      if (currentExpression !== (committedRef.current.expressionText ?? '')) {
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

  // ---- Annotation callbacks ------------------------------------------------

  const handleAddAnnotation = useCallback(
    (annotationName: string) => {
      actions.addAnnotation(nodeId, annotationName);
    },
    [nodeId, actions]
  );

  const handleRemoveAnnotation = useCallback(
    (index: number) => {
      actions.removeAnnotation(nodeId, index);
    },
    [nodeId, actions]
  );

  // ---- Condition callbacks -------------------------------------------------

  const handleAddCondition = useCallback(
    (condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }) => {
      actions.addCondition(nodeId, condition);
    },
    [nodeId, actions]
  );

  const handleRemoveCondition = useCallback(
    (index: number) => {
      actions.removeCondition(nodeId, index);
    },
    [nodeId, actions]
  );

  const handleUpdateCondition = useCallback(
    (index: number, updates: Partial<ConditionDisplayInfo>) => {
      actions.updateCondition(nodeId, index, updates);
    },
    [nodeId, actions]
  );

  const handleReorderCondition = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderCondition(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions]
  );

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <ExternalDataSync data={data} toValues={() => toFormValues(data)} />
      <div data-slot="function-form" className="flex flex-col gap-4 p-4">
        {/* Header: Name + Badge */}
        <div data-slot="form-header" className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="name"
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
              <InputParamRow
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

        {/* Function Body — aliases + operations, each with its own expression builder */}
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
                      // Update the expressionText form field for backward compat
                      const currentVals = form.getValues('expressionText');
                      if (val !== currentVals) {
                        form.setValue('expressionText', val, { shouldDirty: true });
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
                      form.setValue('expressionText', e.target.value, { shouldDirty: true });
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
              name="expressionText"
              render={({ field, fieldState }) => (
                <Field>
                  {renderExpressionEditor ? (
                    renderExpressionEditor({
                      value: field.value,
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

        {/* Conditions (pre + post handled internally by ConditionSection) */}
        <ConditionSection
          label="Conditions"
          conditions={d.conditions}
          postConditions={d.postConditions}
          readOnly={d.isReadOnly}
          showPostConditionToggle={true}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
          onUpdate={handleUpdateCondition}
          onReorder={handleReorderCondition}
          renderExpressionEditor={renderExpressionEditor}
        />

        {/* Annotations */}
        <AnnotationSection
          annotations={d.annotations}
          onAdd={handleAddAnnotation}
          onRemove={handleRemoveAnnotation}
        />

        {/* Inherited members (from super-function, if applicable) */}
        <InheritedMembersSection groups={inheritedGroups} />

        {/* Metadata */}
        <MetadataSection
          onDefinitionCommit={commitDefinition}
          onCommentsCommit={commitComments}
          onSynonymAdd={handleAddSynonym}
          onSynonymRemove={handleRemoveSynonym}
        />
      </div>
    </FormProvider>
  );
}

export { FunctionForm };
