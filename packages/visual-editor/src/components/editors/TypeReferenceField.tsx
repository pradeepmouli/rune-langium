// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useCallback, useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { TypeSelector } from './TypeSelector.js';
import { resolveNodeId } from './TypeLink.js';
import type { NavigateToNodeCallback, TypeKind, TypeOption } from '../../types.js';

const KIND_DOT_CLASS: Record<TypeKind | 'builtin', string> = {
  data: 'bg-data',
  choice: 'bg-choice',
  enum: 'bg-enum',
  func: 'bg-func',
  record: 'bg-data',
  typeAlias: 'bg-muted-foreground',
  basicType: 'bg-muted-foreground',
  annotation: 'bg-choice',
  builtin: 'bg-muted-foreground'
};

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
  const selected = useMemo(() => {
    const byValue = options?.find((option) => option.value === value);
    if (byValue) return byValue;
    if (displayName) {
      return options?.find((option) => option.label === displayName) ?? null;
    }
    return null;
  }, [displayName, options, value]);

  const effectiveValue = useMemo(() => {
    if (value) return value;
    return selected?.value ?? null;
  }, [selected, value]);

  const typeLabel = displayName ?? selected?.label ?? '';
  const resolvedNodeId = useMemo(() => {
    if (!typeLabel || !allNodeIds?.length) return undefined;
    return resolveNodeId(typeLabel, allNodeIds);
  }, [allNodeIds, typeLabel]);
  const canNavigate = Boolean(onNavigateToNode && resolvedNodeId);
  const dotClass = selected ? (KIND_DOT_CLASS[selected.kind] ?? KIND_DOT_CLASS.builtin) : null;

  const handleNavigate = useCallback(() => {
    if (resolvedNodeId && onNavigateToNode) {
      onNavigateToNode(resolvedNodeId);
    }
  }, [onNavigateToNode, resolvedNodeId]);

  return (
    <div
      data-slot="type-reference"
      data-empty={typeLabel ? 'false' : 'true'}
      data-readonly={readOnly ? 'true' : 'false'}
      className={`rune-type-reference ${className ?? ''}`.trim()}
    >
      {!readOnly && (
        <div className="rune-type-reference__picker-wrap">
          <TypeSelector
            value={effectiveValue}
            options={options}
            onSelect={onSelect}
            disabled={disabled}
            allowClear={allowClear}
            filterKinds={filterKinds}
            placeholder={placeholder}
            triggerClassName="rune-type-reference__picker w-7 min-w-7 px-0 justify-center border-0 bg-transparent shadow-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_[data-slot=select-value]]:sr-only"
          />
        </div>
      )}

      {typeLabel ? (
        canNavigate ? (
          <button
            type="button"
            data-slot="type-link"
            onClick={handleNavigate}
            className="rune-type-reference__link rune-type-reference__link--navigable"
            title={`Go to ${typeLabel}`}
          >
            {dotClass && <span className={`rune-type-reference__dot ${dotClass}`} aria-hidden="true" />}
            <span className="rune-type-reference__label">{typeLabel}</span>
            <ArrowUpRight className="rune-type-reference__icon" aria-hidden="true" />
          </button>
        ) : (
          <span data-slot="type-link" className="rune-type-reference__link rune-type-reference__link--static">
            {dotClass && <span className={`rune-type-reference__dot ${dotClass}`} aria-hidden="true" />}
            <span className="rune-type-reference__label">{typeLabel}</span>
          </span>
        )
      ) : (
        <span className="rune-type-reference__placeholder">{emptyLabel ?? placeholder}</span>
      )}
    </div>
  );
}
