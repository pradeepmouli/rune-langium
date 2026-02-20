/**
 * EnumValueRow — inline editable row for a single enumeration value.
 *
 * Reads/writes form state via `useFormContext` (provided by the parent
 * FormProvider in EnumForm). Eliminates local `useState` so there are
 * no stale-closure issues when the parent form resets.
 *
 * Renders: drag handle (⠇) | value name input | display name input | remove button.
 * Name/displayName changes are debounced (500 ms). Empty names show a red border.
 *
 * @module
 */

import { useCallback } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { useAutoSave } from '../../hooks/useAutoSave.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnumValueRowProps {
  /** Index position of this member in the useFieldArray. */
  index: number;
  /** Last-committed value name (for graph action diffing). */
  committedName: string;
  /** Last-committed display name (for graph action diffing). */
  committedDisplayName: string;
  /** Commit value name/displayName changes to the graph. */
  onUpdate: (index: number, oldName: string, newName: string, displayName?: string) => void;
  /** Remove this enum value by index. */
  onRemove: (index: number) => void;
  /** Reorder (drag) callback; fromIndex → toIndex. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Whether the row is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumValueRow({
  index,
  committedName,
  committedDisplayName,
  onUpdate,
  onRemove,
  onReorder,
  disabled = false
}: EnumValueRowProps) {
  const { control, getValues, watch } = useFormContext();
  const prefix = `members.${index}`;

  const localName: string = watch(`${prefix}.name`);

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitNameChange = useCallback(
    (newName: string) => {
      const displayName: string = getValues(`${prefix}.displayName`) ?? '';
      onUpdate(index, committedName, newName, displayName || undefined);
    },
    [index, committedName, prefix, getValues, onUpdate]
  );

  const debouncedName = useAutoSave(commitNameChange, 500);

  // ---- Display name auto-save (debounced) ----------------------------------

  const commitDisplayName = useCallback(
    (newDisplayName: string) => {
      const name: string = getValues(`${prefix}.name`);
      onUpdate(index, committedName, name, newDisplayName || undefined);
    },
    [index, committedName, prefix, getValues, onUpdate]
  );

  const debouncedDisplayName = useAutoSave(commitDisplayName, 500);

  // ---- Drag reorder --------------------------------------------------------

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(fromIndex) && fromIndex !== index) {
      onReorder(fromIndex, index);
    }
  }

  // ---- Render -------------------------------------------------------------

  const isEmpty = (localName ?? '').trim() === '';

  return (
    <div
      data-slot="enum-value-row"
      className="flex items-center gap-1.5 py-1"
      role="listitem"
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag handle */}
      <span
        data-slot="drag-handle"
        className="cursor-grab text-muted-foreground text-xs select-none shrink-0"
        aria-hidden="true"
      >
        ⠇
      </span>

      {/* Value name via Controller */}
      <Controller
        control={control}
        name={`${prefix}.name`}
        render={({ field }) => (
          <input
            type="text"
            value={field.value ?? ''}
            onChange={(e) => {
              field.onChange(e);
              debouncedName(e.target.value);
            }}
            onBlur={field.onBlur}
            disabled={disabled}
            aria-label={`Value name for ${committedName || 'new value'}`}
            placeholder="Value name"
            className={`flex-1 min-w-0 px-2 py-1 text-sm rounded
              bg-transparent border
              ${isEmpty ? 'border-red-500' : 'border-border'}
              focus:outline-none focus:ring-1 focus:ring-ring`}
          />
        )}
      />

      {/* Display name via Controller */}
      <Controller
        control={control}
        name={`${prefix}.displayName`}
        render={({ field }) => (
          <input
            type="text"
            value={field.value ?? ''}
            onChange={(e) => {
              field.onChange(e);
              debouncedDisplayName(e.target.value);
            }}
            onBlur={field.onBlur}
            disabled={disabled}
            placeholder="Display name (optional)"
            className="flex-1 min-w-0 px-2 py-1 text-sm rounded
              bg-transparent border border-border
              focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={disabled}
        aria-label={`Remove value ${committedName || 'unnamed'}`}
        className="shrink-0 p-1 text-muted-foreground hover:text-destructive
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✕
      </button>
    </div>
  );
}

export { EnumValueRow };
