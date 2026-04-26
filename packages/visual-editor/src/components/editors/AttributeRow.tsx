// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * AttributeRow — inline editable row for a single Data type attribute.
 *
 * Reads/writes form state via `useFormContext` (provided by the parent
 * FormProvider) at the **canonical AST paths** for an `Attribute`:
 *
 *   attributes.${index}.name                    → string
 *   attributes.${index}.typeCall.type.$refText  → string (display name)
 *   attributes.${index}.card                    → RosettaCardinality { inf, sup?, unbounded? }
 *   attributes.${index}.override                → boolean
 *
 * Per R11 of `specs/013-z2f-editor-migration/research.md`, the editor
 * consumes the AST graph node directly — no projection layer. The bespoke
 * `<CardinalityPicker>` is part of the public component surface and is
 * shared with z2f's componentMap (`zod-form-components.tsx`), so its
 * string-based API is preserved; this row translates between the AST
 * `RosettaCardinality` shape and the picker's `(inf..sup)` string at the
 * boundary via `formatCardinality` / `parseCardinality`.
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
import { TypeLink } from './TypeLink.js';
import { CardinalityPicker } from './CardinalityPicker.js';
import { formatCardinality, parseCardinality } from '../../adapters/model-helpers.js';
import type { TypeOption, NavigateToNodeCallback } from '../../types.js';

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
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
  /** Whether this attribute overrides an inherited member. */
  isOverride?: boolean;
  /** Callback to revert an override (remove local, restore inherited). */
  onRevert?: () => void;
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
  disabled = false,
  onNavigateToNode,
  allNodeIds,
  isOverride: isOverrideProp,
  onRevert
}: AttributeRowProps) {
  const { control, getValues, setValue, watch } = useFormContext();
  const prefix = `attributes.${index}`;

  // AST-canonical reads (R11 / row-renderer contract §2). The picker still
  // talks in `(inf..sup)` strings, so we adapt at the row boundary rather
  // than mutating its public API (it ships in `components.ts` and is wired
  // into z2f's `componentMap` via `zod-form-components.tsx`).
  //
  // `RosettaCardinality` from the AST schema has `unbounded` as optional,
  // but `formatCardinality` expects `unbounded: boolean`. Normalise on read.
  const normaliseCard = (
    raw: { inf: number; sup?: number; unbounded?: boolean } | undefined
  ): { inf: number; sup?: number; unbounded: boolean } | undefined =>
    raw ? { ...raw, unbounded: raw.unbounded ?? false } : undefined;

  const isOverrideForm: boolean = watch(`${prefix}.override`);
  const isOverride = isOverrideProp ?? isOverrideForm;
  const typeName: string | undefined = watch(`${prefix}.typeCall.type.$refText`);
  const cardObj = normaliseCard(
    watch(`${prefix}.card`) as { inf: number; sup?: number; unbounded?: boolean } | undefined
  );
  const cardinalityString = formatCardinality(cardObj) || '(1..1)';

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      const currentType: string = getValues(`${prefix}.typeCall.type.$refText`) ?? 'string';
      const currentCard = normaliseCard(
        getValues(`${prefix}.card`) as
          | { inf: number; sup?: number; unbounded?: boolean }
          | undefined
      );
      onUpdate(
        index,
        committedName,
        newName,
        currentType,
        formatCardinality(currentCard) || '(1..1)'
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
      setValue(`${prefix}.typeCall.type.$refText`, newTypeName, { shouldDirty: true });
      const name: string = getValues(`${prefix}.name`);
      onUpdate(index, committedName, name, newTypeName, cardinalityString);
    },
    [index, committedName, prefix, availableTypes, getValues, setValue, cardinalityString, onUpdate]
  );

  // ---- Cardinality (immediate from picker) ---------------------------------

  const handleCardinalityChange = useCallback(
    (card: string) => {
      // Translate the picker's `(inf..sup)` string back to RosettaCardinality
      // for the AST-shaped form state, then forward the original string to
      // the action callback (EditorFormActions still take `cardinality: string`
      // — FR-002).
      setValue(`${prefix}.card`, parseCardinality(card), { shouldDirty: true });
      const name: string = getValues(`${prefix}.name`);
      onUpdate(index, committedName, name, typeName ?? 'string', card);
    },
    [index, committedName, prefix, typeName, getValues, setValue, onUpdate]
  );

  // ---- Drag reorder ---------------------------------------------------------
  //
  // Per R5 of `specs/013-z2f-editor-migration/research.md` (Pattern B): this
  // row owns the gesture surface (native HTML5 DnD via `dataTransfer`) and
  // delegates the actual reorder to the parent's `onReorder(from, to)`
  // callback. The parent (`DataTypeForm.handleReorderAttribute`) calls
  // `useFieldArray.move(from, to)` to update form state, then fires
  // `actions.reorderAttribute(nodeId, from, to)` so the graph store mirrors
  // the change. The upstream `arrayConfig.reorder: true` flag declared in
  // `z2f.config.ts` is the declarative scaffolding for Phase 8 (US6) when
  // the array is promoted to z2f-driven rendering — at which point the
  // upstream `<ArrayReorderHandle>` mounts alongside (or replaces) this
  // gesture surface but the `onReorder` route is unchanged.

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
      className={`flex items-center gap-1.5 py-1 px-1.5 rounded border border-transparent
        hover:border-border hover:bg-background/50 ${isOverride ? 'opacity-60' : ''}`}
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Drag handle */}
      <span
        data-slot="drag-handle"
        className="cursor-grab text-muted-foreground select-none text-xs shrink-0"
        aria-hidden="true"
      >
        ⠿
      </span>

      {/* Name input */}
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

      {/* Type selector + navigation link */}
      <div data-slot="attribute-type" className="w-32 shrink-0 flex items-center gap-1">
        <TypeLink
          typeName={typeName ?? ''}
          onNavigateToNode={onNavigateToNode}
          allNodeIds={allNodeIds}
          className="text-xs font-mono truncate"
        />
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
          value={cardinalityString}
          onChange={handleCardinalityChange}
          disabled={disabled}
        />
      </div>

      {/* Override badge */}
      {isOverride && (
        <span
          data-slot="override-badge"
          className="text-xs text-muted-foreground italic whitespace-nowrap"
        >
          override
        </span>
      )}

      {/* Remove / Revert button */}
      {isOverride && onRevert ? (
        <button
          data-slot="attribute-revert"
          type="button"
          onClick={onRevert}
          disabled={disabled}
          className="ml-auto shrink-0 text-xs px-2 py-0.5 border border-border rounded
            text-muted-foreground hover:text-foreground hover:border-input transition-colors
            disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Revert override for attribute ${committedName || 'unnamed'}`}
        >
          Revert
        </button>
      ) : (
        <button
          data-slot="attribute-remove"
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="ml-auto shrink-0 p-0.5 text-muted-foreground hover:text-destructive
            disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Remove attribute ${committedName || 'unnamed'}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export { AttributeRow };

// ---------------------------------------------------------------------------
// InheritedAttributeRow — read-only row for an inherited attribute
// ---------------------------------------------------------------------------

export interface InheritedAttributeRowProps {
  name: string;
  typeName: string;
  cardinality: string;
  ancestorName: string;
  onOverride: () => void;
  onNavigateToNode?: NavigateToNodeCallback;
  allNodeIds?: string[];
}

function InheritedAttributeRow({
  name,
  typeName,
  cardinality,
  ancestorName,
  onOverride,
  onNavigateToNode,
  allNodeIds
}: InheritedAttributeRowProps) {
  return (
    <div
      data-slot="inherited-attribute-row"
      data-name={name}
      className="flex items-center gap-1.5 py-1 px-1.5 rounded border border-transparent
        bg-muted/20 opacity-70"
    >
      {/* Spacer aligns with drag handle */}
      <span className="w-3 shrink-0" />

      <span
        data-slot="attribute-name"
        className="flex-1 min-w-0 px-1.5 py-0.5 text-sm font-mono text-muted-foreground truncate"
      >
        {name}
      </span>

      <div data-slot="attribute-type" className="w-32 shrink-0 flex items-center gap-1">
        <TypeLink
          typeName={typeName}
          onNavigateToNode={onNavigateToNode}
          allNodeIds={allNodeIds}
          className="text-xs font-mono truncate"
        />
      </div>

      <span data-slot="attribute-cardinality" className="shrink-0 text-xs text-muted-foreground">
        {cardinality}
      </span>

      <span
        data-slot="inherited-from-label"
        className="text-xs text-muted-foreground italic whitespace-nowrap"
      >
        inherited from {ancestorName}
      </span>

      <button
        data-slot="attribute-override"
        type="button"
        onClick={onOverride}
        aria-label={`Override inherited attribute ${name} from ${ancestorName}`}
        className="ml-auto shrink-0 text-xs px-2 py-0.5 border border-border rounded
          text-muted-foreground hover:text-foreground hover:border-input transition-colors"
      >
        Override
      </button>
    </div>
  );
}

export { InheritedAttributeRow };
