// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * EnumValueRow — inline editable row for a single enumeration value.
 *
 * Reads/writes form state via `useFormContext` (provided by the parent
 * FormProvider in EnumForm). The committed `name`/`displayName` props act
 * as diff anchors for callbacks; the live form values come from the form
 * context at `enumValues[index].name` and `enumValues[index].display`
 * (AST-canonical paths per R11 of `specs/013-z2f-editor-migration`).
 *
 * Renders: drag handle (⠿) | value name input | display name input | remove button.
 * Name/displayName changes are debounced (500 ms). Empty names show a
 * destructive border (token-backed per R12).
 *
 * A synonym sub-section below the main row appears when `synonymSourceOptions`
 * is supplied (threaded from EnumForm). Synonym add requires both a source
 * pick AND a value string — RosettaEnumSynonym always has a `synonymValue`.
 * Qualify rule (plan L15) matches MetadataSection: cross-namespace sources
 * persist as `${ns}.${name}` via `resolveSynonymRefText`.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import { X } from 'lucide-react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Button } from '@rune-langium/design-system/ui/button';
import { Input } from '@rune-langium/design-system/ui/input';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useEditorActionsContext } from '../forms/sections/EditorActionsContext.js';
import { SourceRefField } from './SourceRefField.js';
import { resolveSynonymRefText } from './synonym-ref.js';
import type { SourceRefOption } from '../../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnumSynonymEntry = {
  $type?: string;
  sources?: { $refText?: string }[];
  synonymValue?: string;
};

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
  /** Whether this local value overrides an inherited value with the same name. */
  isOverride?: boolean;
  /** Callback to revert this override, restoring the inherited value. */
  onRevert?: () => void;
  /**
   * Available synonym source options threaded from EnumForm via PaginatedEnumValues.
   * When non-empty, a synonym sub-section (chips + add-row) appears below the main row.
   */
  synonymSourceOptions?: SourceRefOption[];
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
  disabled = false,
  isOverride = false,
  onRevert,
  synonymSourceOptions = []
}: EnumValueRowProps) {
  const { control, getValues, setValue } = useFormContext();
  const editorCtx = useEditorActionsContext();
  const effectiveReadOnly = Boolean(disabled || editorCtx?.readOnly);
  // AST-canonical paths (R11): `enumValues[].name` and `enumValues[].display`.
  // Pre-migration this row read `members.${index}.{name,displayName}` from a
  // hand-authored projection schema; the projection layer is gone now.
  const prefix = `enumValues.${index}`;

  // Synonym picker state — source canonical id + value text
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState('');

  // Subscribe to the synonym array so chips update after add/remove.
  // defaultValue is seeded from getValues() (a synchronous form-store read)
  // rather than a bare [] because useWatch does not auto-populate from nested
  // defaultValues on the initial render — getValues does.
  const rawEnumSynonyms = useWatch({
    control,
    name: `${prefix}.enumSynonyms` as any,
    defaultValue: getValues(`${prefix}.enumSynonyms`) ?? []
  });
  const enumSynonyms = (Array.isArray(rawEnumSynonyms) ? rawEnumSynonyms : []) as EnumSynonymEntry[];

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitNameChange = useCallback(
    (newName: string) => {
      const currentDisplayName: string = getValues(`${prefix}.display`) ?? displayName;
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

  // ---- Synonym add/remove --------------------------------------------------

  const handleAddEnumSynonym = useCallback(() => {
    if (!pendingSource || !pendingValue) return;
    const opt = synonymSourceOptions.find((o) => o.value === pendingSource);
    // plan L15: cross-namespace qualifies; same-namespace stays bare.
    const refText = resolveSynonymRefText(opt, editorCtx?.nodeId, pendingSource);
    // Optimistic form-state update for immediate chip display
    const currentSyns: EnumSynonymEntry[] = (getValues(`${prefix}.enumSynonyms`) ?? []) as EnumSynonymEntry[];
    setValue(`${prefix}.enumSynonyms` as any, [
      ...currentSyns,
      { $type: 'RosettaEnumSynonym', sources: [{ $refText: refText }], synonymValue: pendingValue }
    ]);
    // Commit to graph
    if (editorCtx) {
      editorCtx.actions.addEnumValueSynonym(editorCtx.nodeId, index, refText, pendingValue);
    }
    setPendingSource(null);
    setPendingValue('');
  }, [pendingSource, pendingValue, synonymSourceOptions, editorCtx, prefix, getValues, setValue, index]);

  const handleRemoveEnumSynonym = useCallback(
    (synIndex: number) => {
      const currentSyns: EnumSynonymEntry[] = (getValues(`${prefix}.enumSynonyms`) ?? []) as EnumSynonymEntry[];
      setValue(
        `${prefix}.enumSynonyms` as any,
        currentSyns.filter((_, i) => i !== synIndex)
      );
      if (editorCtx) {
        editorCtx.actions.removeEnumValueSynonym(editorCtx.nodeId, index, synIndex);
      }
    },
    [editorCtx, prefix, getValues, setValue, index]
  );

  // Show the synonym section when there are existing synonyms OR when the
  // host supplies options (so the user can add synonyms to this value).
  const showSynonymSection = enumSynonyms.length > 0 || (!effectiveReadOnly && synonymSourceOptions.length > 0);

  // ---- Render -------------------------------------------------------------

  return (
    <div
      data-slot="enum-value-row"
      className="rune-inspector-row border border-transparent px-1 py-1 hover:border-border"
      role="listitem"
      draggable={!effectiveReadOnly}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Main row: handle | name | display | badge | action button */}
      <div className="flex items-center gap-1.5">
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
              <Input
                variant="inline"
                type="text"
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e);
                  debouncedName(e.target.value);
                }}
                onBlur={field.onBlur}
                disabled={effectiveReadOnly}
                aria-label={`Value name for ${name || 'new value'}`}
                placeholder="Value name"
                className={`flex-1 min-w-0 px-2 py-1 text-sm${isEmpty ? ' border-destructive' : ''}`}
              />
            );
          }}
        />

        {/* Display name via Controller */}
        <Controller
          control={control}
          name={`${prefix}.display`}
          render={({ field }) => (
            <Input
              variant="inline"
              type="text"
              value={field.value ?? ''}
              onChange={(e) => {
                field.onChange(e);
                debouncedDisplayName(e.target.value);
              }}
              onBlur={field.onBlur}
              disabled={effectiveReadOnly}
              placeholder="Display name (optional)"
              className="flex-1 min-w-0 px-2 py-1 text-sm"
            />
          )}
        />

        {/* Override badge */}
        {isOverride && (
          <Badge data-slot="override-badge" variant="warning" className="shrink-0 text-3xs">
            override
          </Badge>
        )}

        {/* Revert button (for overrides) or Remove button */}
        {isOverride && onRevert ? (
          <button
            type="button"
            onClick={onRevert}
            disabled={effectiveReadOnly}
            aria-label={`Revert override for value ${name || 'unnamed'}`}
            className="shrink-0 text-xs px-2 py-0.5 border border-border rounded
              text-muted-foreground hover:text-foreground hover:border-input transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Revert
          </button>
        ) : (
          // Icon-button replaces literal "✕" Unicode glyph. Same pattern as
          // AttributeRow / ChoiceOptionRow / FunctionInputRow — lucide <X />
          // in a ghost icon-button with hover:text-destructive preserved.
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(nodeId, name)}
            disabled={effectiveReadOnly}
            aria-label={`Remove value ${name || 'unnamed'}`}
            title={`Remove value ${name || 'unnamed'}`}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      {/* Synonym sub-section — chips + add-row */}
      {showSynonymSection && (
        <div data-slot="enum-value-synonyms" className="pl-4 pt-1 flex flex-col gap-1">
          {/* Existing synonym chips */}
          {enumSynonyms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {enumSynonyms.map((syn: EnumSynonymEntry, synIdx: number) => {
                const sourceRef = syn.sources?.[0]?.$refText ?? '';
                const synonymValue = syn.synonymValue ?? '';
                const chipLabel = synonymValue ? `${sourceRef} — ${synonymValue}` : sourceRef;
                return (
                  <span
                    key={`enum-syn-${sourceRef}:${synIdx}`}
                    className="inline-flex items-center gap-1 rounded bg-card
                      px-2 py-0.5 text-xs text-foreground"
                  >
                    {chipLabel}
                    {!effectiveReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEnumSynonym(synIdx)}
                        aria-label={`remove enum synonym ${sourceRef}`}
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

          {/* Add row: source picker + value input + Add button */}
          {!effectiveReadOnly && synonymSourceOptions.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <SourceRefField
                value={pendingSource}
                options={synonymSourceOptions}
                onSelect={setPendingSource}
                placeholder="Select source…"
              />
              <Input
                variant="inline"
                type="text"
                value={pendingValue}
                onChange={(e) => setPendingValue(e.target.value)}
                placeholder="Synonym value…"
                data-slot="enum-synonym-value-input"
                className="flex-1 min-w-0 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={handleAddEnumSynonym}
                disabled={!pendingSource || !pendingValue}
                className="rounded bg-card px-2 py-1 text-xs text-foreground
                  hover:bg-muted transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { EnumValueRow };

// ---------------------------------------------------------------------------
// InheritedEnumValueRow — read-only row for an inherited enum value
// ---------------------------------------------------------------------------

export interface InheritedEnumValueRowProps {
  name: string;
  displayName?: string;
  ancestorName: string;
  onOverride: () => void;
  /** When true, hide the Override button to prevent mutations on locked types. */
  disabled?: boolean;
}

function InheritedEnumValueRow({ name, displayName, ancestorName, onOverride, disabled }: InheritedEnumValueRowProps) {
  const editorCtx = useEditorActionsContext();
  const effectiveDisabled = Boolean(disabled || editorCtx?.readOnly);

  return (
    <div
      data-slot="inherited-enum-value-row"
      data-name={name}
      className="flex items-center gap-1.5 py-1 rounded border border-transparent
        bg-muted/20 opacity-70"
      role="listitem"
    >
      {/* Spacer aligns with drag handle */}
      <span className="w-3 shrink-0" />

      <span className="flex-1 min-w-0 px-2 py-1 text-sm text-muted-foreground font-mono truncate">{name}</span>

      {displayName && (
        <span className="flex-1 min-w-0 px-2 py-1 text-sm text-muted-foreground italic truncate">{displayName}</span>
      )}

      <span data-slot="inherited-from-label" className="text-xs text-muted-foreground italic whitespace-nowrap">
        inherited from {ancestorName}
      </span>

      {!effectiveDisabled && (
        <button
          data-slot="enum-value-override"
          type="button"
          onClick={onOverride}
          aria-label={`Override inherited value ${name} from ${ancestorName}`}
          className="ml-auto shrink-0 text-xs px-2 py-0.5 border border-border rounded
            text-muted-foreground hover:text-foreground hover:border-input transition-colors"
        >
          Override
        </button>
      )}
    </div>
  );
}

export { InheritedEnumValueRow };
