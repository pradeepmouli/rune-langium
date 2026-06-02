// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeReferenceField — the inspector's canonical type-reference surface.
 *
 * Composes the structure-view's canonical idioms (Phase 3): the selected type
 * renders as a `<TypeChip>` that opens a `<NamespaceTreePicker>` popover (the
 * same segmented-tree look as the namespace explorer), the WHOLE field is a
 * type-ref drop target (parity with the structure view's TypePickerCell), and
 * a right-edge nav arrow navigates to the type — placed so it never obstructs
 * the picker popover, which opens from the chip on the left.
 *
 * Read-only mode renders a disabled chip with no popover and no drop handlers;
 * the nav arrow remains (navigation is read-only-safe).
 */

import { useCallback, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@rune-langium/design-system/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import { resolveNodeId } from './TypeLink.js';
import { NamespaceTreePicker } from './NamespaceTreePicker.js';
import { TypeChip, type TypeChipKind } from './structure/TypeChip.js';
import { useTypeRefDrop } from '../../hooks/useTypeRefDrop.js';
import type { TypeRefPayload } from '../../types/structure-view.js';
import type { NavigateToNodeCallback, TypeKind, TypeOption } from '../../types.js';

export interface TypeReferenceFieldProps {
  value: string | null;
  options?: TypeOption[];
  onSelect: (value: string | null) => void;
  displayName?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  allowClear?: boolean;
  filterKinds?: Array<TypeKind | 'builtin'>;
  onNavigateToNode?: NavigateToNodeCallback;
  allNodeIds?: string[];
  readOnly?: boolean;
  className?: string;
}

// Map a TypeOption kind to the canonical TypeChip color variant. Func/Annotation
// (and an unknown/missing kind) fall to 'Unresolved' — they are not valid
// attribute type-refs, so they only appear here in degenerate states.
const KIND_TO_CHIP: Partial<Record<NonNullable<TypeOption['kind']>, TypeChipKind>> = {
  data: 'Data',
  choice: 'Choice',
  enum: 'Enum',
  record: 'Record',
  typeAlias: 'TypeAlias',
  basicType: 'BasicType',
  builtin: 'BasicType'
};

function toChipKind(kind: TypeOption['kind'] | undefined): TypeChipKind {
  return (kind && KIND_TO_CHIP[kind]) ?? 'Unresolved';
}

// Valid attribute type-ref kinds for the whole-field drop target. Func and
// Annotation are draggable from the explorer but never valid here.
const ATTR_DROP_KINDS: ReadonlyArray<TypeRefPayload['kind']> = [
  'Data',
  'Choice',
  'Enum',
  'BasicType',
  'Record',
  'TypeAlias'
];

export function TypeReferenceField({
  value,
  options,
  onSelect,
  displayName,
  placeholder = 'Select type...',
  emptyLabel,
  disabled = false,
  allowClear = false,
  filterKinds,
  onNavigateToNode,
  allNodeIds,
  readOnly = false,
  className
}: TypeReferenceFieldProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    const byValue = options?.find((option) => option.value === value);
    if (byValue) return byValue;
    if (displayName) {
      return options?.find((option) => option.label === displayName) ?? null;
    }
    return null;
  }, [displayName, options, value]);

  const effectiveValue = value ?? selected?.value ?? null;
  const typeLabel = displayName ?? selected?.label ?? '';
  const chipKind = toChipKind(selected?.kind);

  const resolvedNodeId = useMemo(() => {
    if (!typeLabel || !allNodeIds?.length) return undefined;
    return resolveNodeId(typeLabel, allNodeIds);
  }, [allNodeIds, typeLabel]);
  const canNavigate = Boolean(onNavigateToNode && resolvedNodeId);

  const handleNavigate = useCallback(() => {
    if (resolvedNodeId && onNavigateToNode) {
      onNavigateToNode(resolvedNodeId);
    }
  }, [onNavigateToNode, resolvedNodeId]);

  const handleSelect = useCallback(
    (val: string | null) => {
      onSelect(val);
      setOpen(false);
    },
    [onSelect]
  );

  // Whole-field drop target — dropping a type-ref anywhere on the field selects
  // it (parity with the structure view). The dropped payload's `typeId` is the
  // canonical `namespace::Name` id the store expects for cross-namespace
  // resolution; forward it directly, matching a click in the picker.
  const acceptKinds = useMemo<ReadonlyArray<TypeRefPayload['kind']>>(() => {
    if (disabled || readOnly) return [];
    if (!filterKinds || filterKinds.length === 0) return ATTR_DROP_KINDS;
    const toTypeKind = (k: TypeRefPayload['kind']): TypeKind =>
      k === 'BasicType' ? 'basicType' : k === 'TypeAlias' ? 'typeAlias' : (k.toLowerCase() as TypeKind);
    return ATTR_DROP_KINDS.filter((k) => filterKinds.includes(toTypeKind(k)));
  }, [disabled, readOnly, filterKinds]);

  const handleDrop = useCallback((payload: TypeRefPayload) => onSelect(payload.typeId), [onSelect]);
  const { dragOverHandlers, isOver } = useTypeRefDrop({ accept: acceptKinds, onDrop: handleDrop });

  const navButton = canNavigate ? (
    <button
      type="button"
      data-slot="type-link"
      onClick={handleNavigate}
      title={`Go to ${typeLabel}`}
      aria-label={`Go to ${typeLabel}`}
      className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-50 transition hover:bg-accent/50 hover:text-foreground hover:opacity-100"
    >
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </button>
  ) : null;

  return (
    <div
      data-slot="type-reference"
      data-empty={typeLabel ? 'false' : 'true'}
      data-readonly={readOnly ? 'true' : 'false'}
      data-drop-over={isOver ? 'true' : undefined}
      className={cn('rune-type-reference', className)}
      {...(readOnly ? {} : dragOverHandlers)}
    >
      {readOnly ? (
        typeLabel ? (
          <TypeChip
            typeName={typeLabel}
            typeKind={chipKind}
            disabled
            data-slot="type-picker-trigger"
            className="min-w-0 max-w-full truncate"
          />
        ) : (
          <span className="rune-type-reference__placeholder">{emptyLabel ?? placeholder}</span>
        )
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={disabled}
            render={
              typeLabel ? (
                <TypeChip
                  typeName={typeLabel}
                  typeKind={chipKind}
                  data-slot="type-picker-trigger"
                  className="min-w-0 max-w-full truncate"
                />
              ) : (
                <button type="button" data-slot="type-picker-trigger" className="rune-type-reference__placeholder">
                  {emptyLabel ?? placeholder}
                </button>
              )
            }
          />
          <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
            <NamespaceTreePicker
              options={options ?? []}
              value={effectiveValue}
              onSelect={handleSelect}
              filterKinds={filterKinds}
              allowClear={allowClear}
            />
          </PopoverContent>
        </Popover>
      )}

      {navButton}
    </div>
  );
}
