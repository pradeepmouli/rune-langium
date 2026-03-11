/**
 * AttributeRow — inline editable row for a single Data type attribute.
 *
 * Reads/writes form state via `useFormContext` (provided by the parent
 * FormProvider). Eliminates local `useState` so there are no stale-
 * closure issues when the parent form resets.
 *
 * Renders: drag handle (⠿) | name input | TypeSelector | CardinalityPicker | remove button.
 * Name changes are debounced (500 ms). Type and cardinality are immediate.
 * Override attributes display a dimmed "(override)" badge.
 *
 * @module
 */

import { useCallback, useMemo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { TypeSelector } from './TypeSelector.js';
import { CardinalityPicker } from './CardinalityPicker.js';
import type { TypeOption } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AttributeRowProps {
  /** Index position of this member in the useFieldArray. */
  index: number;
  /** Last-committed attribute name (for graph action diffing). */
  committedName: string;
  /** Available type options for the TypeSelector. */
  availableTypes: TypeOption[];
  /** Commit attribute changes to the graph. */
  onUpdate: (
    index: number,
    oldName: string,
    newName: string,
    typeName: string,
    cardinality: string
  ) => void;
  /** Remove this attribute by index. */
  onRemove: (index: number) => void;
  /** Reorder (drag) callback; fromIndex → toIndex. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Whether the form is read-only. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AttributeRow({
  index,
  committedName,
  availableTypes,
  onUpdate,
  onRemove,
  onReorder,
  disabled = false
}: AttributeRowProps) {
  const { control, getValues, setValue, watch } = useFormContext();
  const prefix = `members.${index}`;

  const isOverride: boolean = watch(`${prefix}.isOverride`);
  const typeName: string = watch(`${prefix}.typeName`);
  const cardinality: string = watch(`${prefix}.cardinality`);

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      const values = getValues(prefix);
      onUpdate(
        index,
        committedName,
        newName,
        values.typeName ?? 'string',
        values.cardinality ?? '(1..1)'
      );
    },
    [index, committedName, prefix, getValues, onUpdate]
  );

  const debouncedName = useAutoSave(commitName, 500);

  // ---- Type selection (immediate) ------------------------------------------

  const handleTypeSelect = useCallback(
    (value: string | null) => {
      if (!value) return;
      const option = availableTypes.find((o) => o.value === value);
      const newTypeName = option?.label ?? value;
      setValue(`${prefix}.typeName`, newTypeName, { shouldDirty: true });
      const name: string = getValues(`${prefix}.name`);
      onUpdate(index, committedName, name, newTypeName, cardinality ?? '(1..1)');
    },
    [index, committedName, prefix, availableTypes, getValues, setValue, cardinality, onUpdate]
  );

  // ---- Cardinality (immediate from picker) ---------------------------------

  const handleCardinalityChange = useCallback(
    (card: string) => {
      setValue(`${prefix}.cardinality`, card, { shouldDirty: true });
      const name: string = getValues(`${prefix}.name`);
      onUpdate(index, committedName, name, typeName ?? 'string', card);
    },
    [index, committedName, prefix, typeName, getValues, setValue, onUpdate]
  );

  // ---- Drag reorder (simplified up/down for now) ---------------------------

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(fromIndex) && fromIndex !== index) {
      onReorder(fromIndex, index);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  // ---- Resolve typeName (label) to option value for TypeSelector ----------

  const typeValue = useMemo(() => {
    const name = typeName ?? '';
    // Try exact value match first, then label match
    const byValue = availableTypes.find((o) => o.value === name);
    if (byValue) return byValue.value;
    const byLabel = availableTypes.find((o) => o.label === name);
    return byLabel?.value ?? name;
  }, [typeName, availableTypes]);

  // ---- Render --------------------------------------------------------------

  return (
    <div
      data-slot="attribute-row"
      data-index={index}
      className={`flex flex-col gap-1 py-1.5 px-1.5 rounded border border-transparent
        hover:border-border hover:bg-background/50 ${isOverride ? 'opacity-60' : ''}`}
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Row 1: drag handle + name + override badge + remove */}
      <div className="flex items-center gap-1.5">
        {/* Drag handle */}
        <span
          data-slot="drag-handle"
          className="cursor-grab text-muted-foreground select-none text-xs"
          aria-hidden="true"
        >
          ⠿
        </span>

        {/* Name input via Controller */}
        <Controller
          control={control}
          name={`${prefix}.name`}
          render={({ field }) => (
            <input
              data-slot="attribute-name"
              type="text"
              value={field.value}
              onChange={(e) => {
                field.onChange(e);
                debouncedName(e.target.value);
              }}
              onBlur={field.onBlur}
              disabled={disabled}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border border-transparent rounded
                focus:border-input focus:outline-none bg-transparent"
              placeholder="name"
              aria-label={`Attribute name: ${field.value}`}
            />
          )}
        />

        {/* Override badge */}
        {isOverride && (
          <span
            data-slot="override-badge"
            className="text-xs text-muted-foreground italic whitespace-nowrap"
          >
            override
          </span>
        )}

        {/* Remove button */}
        <button
          data-slot="attribute-remove"
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled || isOverride}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive
            disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Remove attribute ${committedName || 'unnamed'}`}
        >
          ✕
        </button>
      </div>

      {/* Row 2: type selector + cardinality */}
      <div className="flex items-center gap-1.5 pl-5">
        {/* Type selector */}
        <div data-slot="attribute-type" className="w-36 shrink-0">
          <TypeSelector
            value={typeValue}
            options={availableTypes}
            onSelect={handleTypeSelect}
            disabled={disabled}
            placeholder="type"
          />
        </div>

        {/* Cardinality */}
        <div data-slot="attribute-cardinality" className="shrink-0">
          <CardinalityPicker
            value={cardinality ?? '(1..1)'}
            onChange={handleCardinalityChange}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export { AttributeRow };
