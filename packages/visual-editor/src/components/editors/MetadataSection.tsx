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
 * @module
 */

import { useState, useCallback } from 'react';
import { useFormContext, Controller, useFieldArray } from 'react-hook-form';
import { Field, FieldLabel, FieldGroup } from '@rune-langium/design-system/ui/field';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useEditorActionsContext } from '../forms/sections/EditorActionsContext.js';

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
  /** Called when a synonym is added (immediate commit to graph). */
  onSynonymAdd?: (synonym: string) => void;
  /** Called when a synonym is removed by index (immediate commit to graph). */
  onSynonymRemove?: (index: number) => void;
  /**
   * z2f-host-supplied list of field paths this section groups (declarative
   * path). Optional and intentionally unused at render time per
   * `section-component.md` §3 — the section knows its field set.
   */
  fields?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Collapsible metadata section with description, comments, and synonym fields.
 *
 * Reads field values from the parent `FormProvider` context. Auto-resize
 * textareas for description and comments, tag-list with inline add for synonyms.
 */
export function MetadataSection({
  readOnly,
  onDefinitionCommit,
  onCommentsCommit,
  onSynonymAdd,
  onSynonymRemove
}: MetadataSectionProps): React.ReactNode {
  const { control, getValues } = useFormContext();
  const [expanded, setExpanded] = useState(true);
  const [synonymInput, setSynonymInput] = useState('');

  // ------ Declarative-path fallback (Phase 7 / US5) -----------------------
  //
  // When a callback prop is missing the host must have wrapped this tree
  // with <EditorActionsProvider>; we derive the action via the context.
  // If neither is present we no-op (read-only-style behaviour, contract §6).
  const ctx = useEditorActionsContext();
  const effectiveReadOnly = readOnly ?? ctx?.readOnly ?? false;

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
    (synonym: string) => {
      if (onSynonymAdd) return onSynonymAdd(synonym);
      if (ctx) ctx.actions.addSynonym(ctx.nodeId, synonym);
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
    const trimmed = synonymInput.trim();
    if (!trimmed) return;
    // Update form state
    appendSynonym(trimmed as any);
    // Commit to graph
    effectiveOnSynonymAdd(trimmed);
    setSynonymInput('');
  }, [synonymInput, appendSynonym, effectiveOnSynonymAdd]);

  const handleRemoveSynonym = useCallback(
    (index: number) => {
      removeSynonymField(index);
      effectiveOnSynonymRemove(index);
    },
    [removeSynonymField, effectiveOnSynonymRemove]
  );

  const handleSynonymKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSynonym();
      }
    },
    [handleAddSynonym]
  );

  // Read synonym values from form state
  const synonymValues: string[] = getValues('synonyms') ?? [];

  return (
    <div data-slot="metadata-section" className="border-t border-border mt-3 pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-foreground"
        aria-expanded={expanded}
      >
        <span>Metadata</span>
        <span className="text-xs text-muted-foreground">{expanded ? '\u25be' : '\u25b8'}</span>
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
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {synonymValues.map((synonym: string, index: number) => (
                <span
                  key={`synonym-${index}`}
                  className="inline-flex items-center gap-1 rounded bg-card
                    px-2 py-0.5 text-xs text-foreground"
                >
                  {synonym}
                  {!effectiveReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSynonym(index)}
                      aria-label={`Remove synonym "${synonym}"`}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!effectiveReadOnly && (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={synonymInput}
                  onChange={(e) => setSynonymInput(e.target.value)}
                  onKeyDown={handleSynonymKeyDown}
                  placeholder="Add synonym..."
                  data-slot="metadata-synonym-input"
                  className="flex-1 rounded border border-input bg-background
                    px-2 py-1 text-xs text-foreground
                    placeholder:text-muted-foreground
                    focus:ring-1 focus:ring-ring focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddSynonym}
                  disabled={!synonymInput.trim()}
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
