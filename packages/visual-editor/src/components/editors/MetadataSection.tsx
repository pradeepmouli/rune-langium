// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * MetadataSection — collapsible metadata editor for all form types.
 *
 * Reads/writes definition, comments, and synonyms via `useFormContext`
 * (provided by the parent FormProvider). No prop-drilling needed.
 *
 * Definition and comments commit to graph actions via debounced callbacks.
 * Synonyms are managed as a form-state array with add/remove callbacks.
 *
 * Two call paths are supported:
 *
 * 1. **Imperative** (today's editors): the host passes the per-action
 *    callbacks (`onDefinitionCommit`, …) directly as props.
 * 2. **Declarative** (Phase 7 / US5): the section is resolved by name
 *    from z2f's `componentModule` and only receives `fields: string[]`.
 *    The component falls back to `useEditorActionsContext()` to derive
 *    the callbacks from `EditorFormActions` + `nodeId`.
 *
 * Both paths share the same render. Per `section-component.md` §3 the
 * `fields` prop is informational — this section knows it owns
 * `definition`, `comments`, and `synonyms` and renders them directly.
 *
 * Synonym input uses a `SourceRefField` picker instead of free text.
 * The host provides `synonymSourceOptions` with the available sources.
 * For `RosettaEnumeration` hosts a value `Input` also appears (the
 * host kind is derived from `getValues('$type')` in the form context).
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { useFormContext, Controller, useFieldArray } from 'react-hook-form';
import { Field, FieldLabel, FieldGroup } from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useEditorActionsContext } from '../forms/sections/EditorActionsContext.js';
import { SourceRefField } from './SourceRefField.js';
import { resolveSynonymRefText } from './synonym-ref.js';
import type { SourceRefOption } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MetadataSectionProps {
  /** Whether the metadata section is read-only. */
  readOnly?: boolean;
  /** Called when definition changes (debounced commit to graph). */
  onDefinitionCommit?: (definition: string) => void;
  /** Called when comments change (debounced commit to graph). */
  onCommentsCommit?: (comments: string) => void;
  /**
   * Called when a synonym is added (immediate commit to graph).
   * `source` is the bare source name (i.e. the option label / `$refText`).
   * `value` is the optional synonym value name, present for enum hosts.
   */
  onSynonymAdd?: (source: string, value?: string) => void;
  /** Called when a synonym is removed by index (immediate commit to graph). */
  onSynonymRemove?: (index: number) => void;
  /**
   * Available synonym sources — passed in from the host form which derives
   * them from the graph store (Task 3). Defaults to empty (no picker options).
   */
  synonymSourceOptions?: SourceRefOption[];
  /**
   * z2f-host-supplied list of field paths this section groups (declarative
   * path). Optional and intentionally unused at render time per
   * `section-component.md` §3 — the section knows its field set.
   */
  fields?: string[];
}

// ---------------------------------------------------------------------------
// Synonym AST shape (read from form state)
// ---------------------------------------------------------------------------

type SynonymEntry = {
  $type?: string;
  sources?: { $refText?: string }[];
  value?: { name?: string };
  /** RosettaSynonym (enum host) stores value text under body.values, not value.name. */
  body?: { values?: { name?: string }[] };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Collapsible metadata section with description, comments, and synonym fields.
 *
 * Reads field values from the parent `FormProvider` context. Auto-resize
 * textareas for description and comments; SourceRefField picker for synonyms.
 */
export function MetadataSection({
  readOnly,
  onDefinitionCommit,
  onCommentsCommit,
  onSynonymAdd,
  onSynonymRemove,
  synonymSourceOptions = []
}: MetadataSectionProps): React.ReactNode {
  const { control, getValues } = useFormContext();
  const [expanded, setExpanded] = useState(true);

  // Pending add state: canonical id from SourceRefField + bare value text
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState('');

  // ------ Declarative-path fallback (Phase 7 / US5) -----------------------
  //
  // When a callback prop is missing the host must have wrapped this tree
  // with <EditorActionsProvider>; we derive the action via the context.
  // If neither is present we no-op (read-only-style behaviour, contract §6).
  const ctx = useEditorActionsContext();
  const effectiveReadOnly = readOnly ?? ctx?.readOnly ?? false;

  // Derive host kind from form state ($type is spread into form values by
  // formValuesProjection so it is always present for any form using that helper).
  const isEnumHost = getValues('$type') === 'RosettaEnumeration';

  const effectiveOnDefinitionCommit = useCallback(
    (value: string) => {
      if (onDefinitionCommit) return onDefinitionCommit(value);
      if (ctx) ctx.actions.updateDefinition(ctx.nodeId, value);
    },
    [onDefinitionCommit, ctx]
  );
  const effectiveOnCommentsCommit = useCallback(
    (value: string) => {
      if (onCommentsCommit) return onCommentsCommit(value);
      if (ctx) ctx.actions.updateComments(ctx.nodeId, value);
    },
    [onCommentsCommit, ctx]
  );
  const effectiveOnSynonymAdd = useCallback(
    (source: string, value?: string) => {
      if (onSynonymAdd) return onSynonymAdd(source, value);
      if (ctx) ctx.actions.addSynonym(ctx.nodeId, source, value);
    },
    [onSynonymAdd, ctx]
  );
  const effectiveOnSynonymRemove = useCallback(
    (index: number) => {
      if (onSynonymRemove) return onSynonymRemove(index);
      if (ctx) ctx.actions.removeSynonym(ctx.nodeId, index);
    },
    [onSynonymRemove, ctx]
  );

  // Synonyms field-array from the parent form
  const { append: appendSynonym, remove: removeSynonymField } = useFieldArray({
    control,
    name: 'synonyms' as any
  });

  // Debounced auto-save for definition
  const debouncedDefinition = useAutoSave(effectiveOnDefinitionCommit, 500);

  // Debounced auto-save for comments
  const debouncedComments = useAutoSave(effectiveOnCommentsCommit, 500);

  const handleAddSynonym = useCallback(() => {
    if (!pendingSource) return;
    const opt = synonymSourceOptions.find((o) => o.value === pendingSource);
    const refText = resolveSynonymRefText(opt, ctx?.nodeId, pendingSource);
    const value = isEnumHost ? pendingValue || undefined : undefined;

    // Optimistic form-state update for immediate chip display.
    // Shape must match what the store's addSynonym writes so form state stays
    // in sync with the model: Data/Choice → RosettaClassSynonym shape;
    // RosettaEnumeration → RosettaSynonym shape (body.values, not value.name).
    const entry: SynonymEntry = isEnumHost
      ? { $type: 'RosettaSynonym', sources: [{ $refText: refText }], body: { values: [{ name: value! }] } }
      : { $type: 'RosettaClassSynonym', sources: [{ $refText: refText }], ...(value ? { value: { name: value } } : {}) };
    appendSynonym(entry as any);

    // Commit to graph
    effectiveOnSynonymAdd(refText, value);

    // Reset picker
    setPendingSource(null);
    setPendingValue('');
  }, [pendingSource, pendingValue, isEnumHost, synonymSourceOptions, ctx, appendSynonym, effectiveOnSynonymAdd]);

  const handleRemoveSynonym = useCallback(
    (index: number) => {
      removeSynonymField(index);
      effectiveOnSynonymRemove(index);
    },
    [removeSynonymField, effectiveOnSynonymRemove]
  );

  // Read synonym values from form state as AST objects (not plain strings)
  const synonymValues: SynonymEntry[] = (getValues('synonyms') ?? []) as SynonymEntry[];

  return (
    <div data-slot="metadata-section" className="border-t border-border mt-3 pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-foreground"
        aria-expanded={expanded}
      >
        <span>Metadata</span>
        <span className="text-xs text-muted-foreground">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <FieldGroup className="mt-2 gap-3">
          {/* Description */}
          <Controller
            control={control}
            name="definition"
            render={({ field }) => (
              <Field>
                <FieldLabel className="text-xs text-muted-foreground">Description</FieldLabel>
                <textarea
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e);
                    debouncedDefinition(e.target.value);
                  }}
                  onBlur={field.onBlur}
                  disabled={effectiveReadOnly}
                  placeholder="Add a description..."
                  rows={2}
                  data-slot="metadata-description"
                  className="w-full rounded border border-input bg-background
                    px-2 py-1.5 text-sm text-foreground
                    placeholder:text-muted-foreground
                    focus:ring-1 focus:ring-ring focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed
                    resize-y"
                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                />
              </Field>
            )}
          />

          {/* Comments */}
          <Controller
            control={control}
            name="comments"
            render={({ field }) => (
              <Field>
                <FieldLabel className="text-xs text-muted-foreground">Comments</FieldLabel>
                <textarea
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e);
                    debouncedComments(e.target.value);
                  }}
                  onBlur={field.onBlur}
                  disabled={effectiveReadOnly}
                  placeholder="Add comments..."
                  rows={2}
                  data-slot="metadata-comments"
                  className="w-full rounded border border-input bg-background
                    px-2 py-1.5 text-sm text-foreground
                    placeholder:text-muted-foreground
                    focus:ring-1 focus:ring-ring focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed
                    resize-y"
                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                />
              </Field>
            )}
          />

          {/* Synonyms */}
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">Synonyms</FieldLabel>

            {/* Existing synonym chips */}
            {synonymValues.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {synonymValues.map((syn: SynonymEntry, index: number) => {
                  const sourceRef = syn.sources?.[0]?.$refText ?? '';
                  // RosettaClassSynonym stores value under `value.name`;
                  // RosettaSynonym (enum host) stores it under `body.values[0].name`.
                  const valueName = syn.value?.name ?? syn.body?.values?.[0]?.name;
                  const chipLabel = valueName ? `${sourceRef} — ${valueName}` : sourceRef;
                  return (
                    <span
                      key={`synonym-${sourceRef}:${index}`}
                      className="inline-flex items-center gap-1 rounded bg-card
                        px-2 py-0.5 text-xs text-foreground"
                    >
                      {chipLabel}
                      {!effectiveReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSynonym(index)}
                          aria-label="remove synonym"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Add row — source picker + optional value input + Add button */}
            {!effectiveReadOnly && (
              <div className="flex items-center gap-1 flex-wrap">
                <SourceRefField
                  value={pendingSource}
                  options={synonymSourceOptions}
                  onSelect={setPendingSource}
                  placeholder="Select source…"
                />
                {isEnumHost && (
                  <Input
                    variant="inline"
                    type="text"
                    value={pendingValue}
                    onChange={(e) => setPendingValue(e.target.value)}
                    placeholder="Value name…"
                    data-slot="synonym-value-input"
                    className="flex-1 min-w-0 px-2 py-1 text-xs"
                  />
                )}
                <button
                  type="button"
                  onClick={handleAddSynonym}
                  disabled={!pendingSource || (isEnumHost && !pendingValue)}
                  className="rounded bg-card px-2 py-1 text-xs text-foreground
                    hover:bg-muted transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            )}
          </Field>
        </FieldGroup>
      )}
    </div>
  );
}
