/**
 * MetadataSection — collapsible metadata editor for all form types.
 *
 * Reads/writes definition, comments, and synonyms via `useFormContext`
 * (provided by the parent FormProvider). No prop-drilling needed.
 *
 * Definition and comments commit to graph actions via debounced callbacks.
 * Synonyms are managed as a form-state array with add/remove callbacks.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { useFormContext, Controller, useFieldArray } from 'react-hook-form';
import { Field, FieldLabel, FieldGroup } from '@rune-langium/design-system/ui/field';
import { useAutoSave } from '../../hooks/useAutoSave.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MetadataSectionProps {
  /** Whether the metadata section is read-only. */
  readOnly?: boolean;
  /** Called when definition changes (debounced commit to graph). */
  onDefinitionCommit: (definition: string) => void;
  /** Called when comments change (debounced commit to graph). */
  onCommentsCommit: (comments: string) => void;
  /** Called when a synonym is added (immediate commit to graph). */
  onSynonymAdd: (synonym: string) => void;
  /** Called when a synonym is removed by index (immediate commit to graph). */
  onSynonymRemove: (index: number) => void;
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
  readOnly = false,
  onDefinitionCommit,
  onCommentsCommit,
  onSynonymAdd,
  onSynonymRemove
}: MetadataSectionProps): React.ReactNode {
  const { control, getValues } = useFormContext();
  const [expanded, setExpanded] = useState(true);
  const [synonymInput, setSynonymInput] = useState('');

  // Synonyms field-array from the parent form
  const { append: appendSynonym, remove: removeSynonymField } = useFieldArray({
    control,
    name: 'synonyms' as any
  });

  // Debounced auto-save for definition
  const debouncedDefinition = useAutoSave(onDefinitionCommit, 500);

  // Debounced auto-save for comments
  const debouncedComments = useAutoSave(onCommentsCommit, 500);

  const handleAddSynonym = useCallback(() => {
    const trimmed = synonymInput.trim();
    if (!trimmed) return;
    // Update form state
    appendSynonym(trimmed as any);
    // Commit to graph
    onSynonymAdd(trimmed);
    setSynonymInput('');
  }, [synonymInput, appendSynonym, onSynonymAdd]);

  const handleRemoveSynonym = useCallback(
    (index: number) => {
      removeSynonymField(index);
      onSynonymRemove(index);
    },
    [removeSynonymField, onSynonymRemove]
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
                  disabled={readOnly}
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
                  disabled={readOnly}
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
                  {!readOnly && (
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
            {!readOnly && (
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
