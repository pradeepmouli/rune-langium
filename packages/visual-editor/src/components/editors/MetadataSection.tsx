/**
 * MetadataSection — collapsible metadata editor for all form types.
 *
 * Provides editable fields for description, comments, and synonyms.
 * Description and comments auto-save with 500ms debounce.
 * Synonym add/remove are immediate (no debounce needed).
 */

import { useState, useCallback, useEffect } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MetadataSectionProps {
  /** Current definition/description text. */
  definition?: string;
  /** Current synonyms list. */
  synonyms?: string[];
  /** Current comments/annotations text. */
  comments?: string;
  /** Whether the metadata section is read-only. */
  readOnly?: boolean;
  /** Called when definition changes (debounced commit). */
  onDefinitionChange: (definition: string) => void;
  /** Called when a synonym is added. */
  onAddSynonym: (synonym: string) => void;
  /** Called when a synonym is removed by index. */
  onRemoveSynonym: (index: number) => void;
  /** Called when comments change (debounced commit). */
  onCommentsChange: (comments: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Collapsible metadata section with description, comments, and synonym fields.
 *
 * Default expanded. Includes auto-resize textareas for description and
 * comments, and a tag-list with inline add input for synonyms.
 */
export function MetadataSection({
  definition = '',
  synonyms = [],
  comments = '',
  readOnly = false,
  onDefinitionChange,
  onAddSynonym,
  onRemoveSynonym,
  onCommentsChange
}: MetadataSectionProps): React.ReactNode {
  const [expanded, setExpanded] = useState(true);
  const [localDefinition, setLocalDefinition] = useState(definition);
  const [localComments, setLocalComments] = useState(comments);
  const [synonymInput, setSynonymInput] = useState('');

  // Sync local state when props change (e.g., node selection change, undo/redo)
  useEffect(() => {
    setLocalDefinition(definition);
  }, [definition]);

  useEffect(() => {
    setLocalComments(comments);
  }, [comments]);

  // Debounced auto-save for description
  const debouncedDefinitionSave = useAutoSave(onDefinitionChange, 500);

  // Debounced auto-save for comments
  const debouncedCommentsSave = useAutoSave(onCommentsChange, 500);

  const handleDefinitionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalDefinition(val);
      debouncedDefinitionSave(val);
    },
    [debouncedDefinitionSave]
  );

  const handleCommentsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalComments(val);
      debouncedCommentsSave(val);
    },
    [debouncedCommentsSave]
  );

  const handleAddSynonym = useCallback(() => {
    const trimmed = synonymInput.trim();
    if (!trimmed) return;
    onAddSynonym(trimmed);
    setSynonymInput('');
  }, [synonymInput, onAddSynonym]);

  const handleSynonymKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSynonym();
      }
    },
    [handleAddSynonym]
  );

  return (
    <div data-slot="metadata-section" className="border-t border-border-default mt-3 pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-text-primary"
        aria-expanded={expanded}
      >
        <span>Metadata</span>
        <span className="text-xs text-text-secondary">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={localDefinition}
              onChange={handleDefinitionChange}
              disabled={readOnly}
              placeholder="Add a description..."
              rows={2}
              data-slot="metadata-description"
              className="w-full rounded border border-border-emphasis bg-surface-base
                px-2 py-1.5 text-sm text-text-primary
                placeholder:text-text-tertiary
                focus:ring-1 focus:ring-ring focus:outline-none
                disabled:opacity-50 disabled:cursor-not-allowed
                resize-y"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </div>

          {/* Comments */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Comments</label>
            <textarea
              value={localComments}
              onChange={handleCommentsChange}
              disabled={readOnly}
              placeholder="Add comments..."
              rows={2}
              data-slot="metadata-comments"
              className="w-full rounded border border-border-emphasis bg-surface-base
                px-2 py-1.5 text-sm text-text-primary
                placeholder:text-text-tertiary
                focus:ring-1 focus:ring-ring focus:outline-none
                disabled:opacity-50 disabled:cursor-not-allowed
                resize-y"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </div>

          {/* Synonyms */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Synonyms</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {synonyms.map((synonym, index) => (
                <span
                  key={`${synonym}-${index}`}
                  className="inline-flex items-center gap-1 rounded bg-surface-raised
                    px-2 py-0.5 text-xs text-text-primary"
                >
                  {synonym}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveSynonym(index)}
                      aria-label={`Remove synonym "${synonym}"`}
                      className="text-text-tertiary hover:text-status-error transition-colors"
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
                  className="flex-1 rounded border border-border-emphasis bg-surface-base
                    px-2 py-1 text-xs text-text-primary
                    placeholder:text-text-tertiary
                    focus:ring-1 focus:ring-ring focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddSynonym}
                  disabled={!synonymInput.trim()}
                  className="rounded bg-surface-raised px-2 py-1 text-xs text-text-primary
                    hover:bg-surface-overlay transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
