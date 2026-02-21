/**
 * EnumValueRow — inline editable row for a single enumeration value.
 *
 * Reads/writes form state via `useFormContext` (provided by the parent
 * FormProvider in EnumForm). The committed `name`/`displayName` props act
 * as diff anchors for callbacks; the live form values come from the form
 * context at `members[index].name` and `members[index].displayName`.
 *
 * Renders: drag handle (⠿) | value name input | display name input | remove button.
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
  /** Last-committed value name (used as oldName diff anchor in callbacks). */
  name: string;
  /** Last-committed display name (used as diff anchor in callbacks). */
  displayName: string;
  /** Node ID of the parent Enum — forwarded to callbacks for store dispatch. */
  nodeId: string;
  /** Index position of this member in the useFieldArray. */
  index: number;
  /** Commit value name/displayName changes to the graph. */
  onUpdate: (nodeId: string, oldName: string, newName: string, displayName?: string) => void;
  /** Remove this enum value. */
  onRemove: (nodeId: string, valueName: string) => void;
  /** Reorder (drag) callback; fromIndex → toIndex. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Whether the row is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumValueRow({
  name,
  displayName,
  nodeId,
  index,
  onUpdate,
  onRemove,
  onReorder,
  disabled = false
}: EnumValueRowProps) {
  const { control, getValues } = useFormContext();
  const prefix = `members.${index}`;

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitNameChange = useCallback(
    (newName: string) => {
      const currentDisplayName: string = getValues(`${prefix}.displayName`) ?? displayName;
      onUpdate(nodeId, name, newName, currentDisplayName || undefined);
    },
    [nodeId, name, displayName, prefix, getValues, onUpdate]
  );

  const debouncedName = useAutoSave(commitNameChange, 500);

  // ---- Display name auto-save (debounced) ----------------------------------

  const commitDisplayName = useCallback(
    (newDisplayName: string) => {
      const currentName: string = getValues(`${prefix}.name`) ?? name;
      onUpdate(nodeId, name, currentName, newDisplayName || undefined);
    },
    [nodeId, name, prefix, getValues, onUpdate]
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
        ⠿
      </span>

      {/* Value name via Controller */}
      <Controller
        control={control}
        name={`${prefix}.name`}
        render={({ field }) => {
          const isEmpty = (field.value ?? '').trim() === '';
          return (
            <input
              type="text"
              value={field.value ?? ''}
              onChange={(e) => {
                field.onChange(e);
                debouncedName(e.target.value);
              }}
              onBlur={field.onBlur}
              disabled={disabled}
              aria-label={`Value name for ${name || 'new value'}`}
              placeholder="Value name"
              className={`flex-1 min-w-0 px-2 py-1 text-sm rounded
              bg-transparent border
              ${isEmpty ? 'border-red-500' : 'border-border'}
              focus:outline-none focus:ring-1 focus:ring-ring`}
            />
          );
        }}
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
        onClick={() => onRemove(nodeId, name)}
        disabled={disabled}
        aria-label={`Remove value ${name || 'unnamed'}`}
        className="shrink-0 p-1 text-muted-foreground hover:text-destructive
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✕
      </button>
    </div>
  );
}

export { EnumValueRow };
