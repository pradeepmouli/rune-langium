// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeSelector — searchable type dropdown with kind-colored badges.
 *
 * Uses composition-based architecture: accepts `renderTrigger` and
 * `renderPopover` render-props so the host app can inject shadcn
 * Popover + Command primitives. Falls back to a shadcn Select
 * when render-props are not provided.
 */

import { useState, useMemo } from 'react';
import type { TypeOption, TypeKind } from '../../types.js';
import { badgeVariants } from '@rune-langium/design-system/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system/ui/select';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TypeSelectorProps {
  /** Currently selected type value (node ID or built-in type name). */
  value: string | null;
  /** Available types to choose from. May be undefined before types are loaded. */
  options?: TypeOption[];
  /** Placeholder text. */
  placeholder?: string;
  /** Called when a type is selected. */
  onSelect: (value: string | null) => void;
  /** Whether the selector is disabled. */
  disabled?: boolean;
  /** Whether to include a "None" / clear option. */
  allowClear?: boolean;
  /** Filter options to specific kinds. */
  filterKinds?: Array<TypeKind | 'builtin'>;
  /** Render-prop for the trigger (button that opens the popover). */
  renderTrigger?: (props: TypeSelectorTriggerProps) => React.ReactNode;
  /** Render-prop for the popover content (search + list). */
  renderPopover?: (props: TypeSelectorPopoverProps) => React.ReactNode;
}

export interface TypeSelectorTriggerProps {
  /** Currently selected option, or null. */
  selected: TypeOption | null;
  /** Placeholder text. */
  placeholder: string;
  /** Whether the popover is open. */
  open: boolean;
  /** Toggle the popover. */
  onToggle: () => void;
  /** Whether the selector is disabled. */
  disabled: boolean;
}

export interface TypeSelectorPopoverProps {
  /** Grouped and filtered options ready for rendering. */
  groups: TypeSelectorGroup[];
  /** Current search query. */
  searchQuery: string;
  /** Update the search query. */
  onSearchChange: (query: string) => void;
  /** Handle option selection. */
  onSelect: (value: string | null) => void;
  /** Whether to show a "None" clear option. */
  allowClear: boolean;
  /** The currently selected value. */
  selectedValue: string | null;
}

export interface TypeSelectorGroup {
  label: string;
  options: TypeOption[];
}

// ---------------------------------------------------------------------------
// Kind badge color mapping
//
// Per R12 (specs/013-z2f-editor-migration/research.md), editor components
// must consume colors via design-system primitives or `var(--color-*)`
// tokens, never hardcoded Tailwind palette utilities (the kind matched by
// the no-hardcoded-colours CI guard at packages/visual-editor/test/quality).
// We delegate to `badgeVariants` from `@rune-langium/design-system/ui/badge`
// (which owns the kind-specific palette) and to design-tokens CSS variables
// for the inline dot indicators.
// ---------------------------------------------------------------------------

/**
 * Map a TypeKind to the design-system Badge variant key. The Badge component
 * already exposes `data | enum | choice | func | record | typeAlias |
 * basicType | annotation` variants. `builtin` falls through to `basicType`
 * (gray) — visually unchanged from the previous local mapping.
 */
type BadgeKindVariant =
  | 'data'
  | 'enum'
  | 'choice'
  | 'func'
  | 'record'
  | 'typeAlias'
  | 'basicType'
  | 'annotation';

function kindToBadgeVariant(kind: TypeKind | 'builtin'): BadgeKindVariant {
  return kind === 'builtin' ? 'basicType' : kind;
}

/**
 * Solid dot colors for inline type indicators. Token-backed for the four
 * kinds with dedicated `--color-{kind}` vars in theme.css; the remaining
 * kinds reuse the muted-foreground token. This is a deliberate, minor
 * visual shift documented in T077 — the previous mapping used per-kind
 * Tailwind palette colors that bypassed the design-tokens layer.
 */
const KIND_DOT_TOKEN_CLASS: Record<TypeKind | 'builtin', string> = {
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

/**
 * Returns badge CSS classes for a given type kind. Wraps the design-system
 * `badgeVariants` so callers (e.g. `ChoiceOptionRow`, `TypeLink`) get
 * token-backed colors automatically.
 */
export function getKindBadgeClasses(kind: TypeKind | 'builtin'): string {
  return badgeVariants({ variant: kindToBadgeVariant(kind) });
}

/**
 * Returns a human-readable label for a type kind.
 */
export function getKindLabel(kind: TypeKind | 'builtin'): string {
  const labels: Record<TypeKind | 'builtin', string> = {
    data: 'Data',
    choice: 'Choice',
    enum: 'Enum',
    func: 'Function',
    record: 'Record',
    typeAlias: 'Type Alias',
    basicType: 'Basic Type',
    annotation: 'Annotation',
    builtin: 'Built-in'
  };
  return labels[kind] ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Searchable type selector with kind-colored badges.
 *
 * When `renderTrigger` and `renderPopover` are provided, uses composition
 * to inject host app UI primitives (e.g., shadcn Popover + Command).
 * Otherwise falls back to a shadcn Select.
 */
export function TypeSelector({
  value,
  options,
  placeholder = 'Select type...',
  onSelect,
  disabled = false,
  allowClear = false,
  filterKinds,
  renderTrigger,
  renderPopover
}: TypeSelectorProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter options by kind if specified
  const filteredOptions = useMemo(() => {
    if (!options) return [];
    if (!filterKinds || filterKinds.length === 0) return options;
    return options.filter((opt) => filterKinds.includes(opt.kind));
  }, [options, filterKinds]);

  // Apply search filter
  const searchedOptions = useMemo(() => {
    if (!searchQuery.trim()) return filteredOptions;
    const query = searchQuery.toLowerCase();
    return filteredOptions.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [filteredOptions, searchQuery]);

  // Group options by kind then namespace
  const groups = useMemo((): TypeSelectorGroup[] => {
    const result: TypeSelectorGroup[] = [];

    // Built-in types first
    const builtins = searchedOptions.filter((o) => o.kind === 'builtin');
    if (builtins.length > 0) {
      result.push({ label: 'Built-in', options: builtins });
    }

    // Group user types by namespace
    const byNamespace = new Map<string, TypeOption[]>();
    for (const opt of searchedOptions) {
      if (opt.kind === 'builtin') continue;
      const ns = opt.namespace ?? 'Global';
      if (!byNamespace.has(ns)) {
        byNamespace.set(ns, []);
      }
      byNamespace.get(ns)!.push(opt);
    }

    for (const [ns, opts] of byNamespace) {
      result.push({ label: ns, options: opts });
    }

    return result;
  }, [searchedOptions]);

  // Find current selection
  const selected = useMemo(() => options?.find((o) => o.value === value) ?? null, [options, value]);

  const handleSelect = (val: string | null) => {
    onSelect(val);
    setOpen(false);
    setSearchQuery('');
  };

  const handleToggle = () => {
    if (!disabled) {
      setOpen(!open);
      if (open) setSearchQuery('');
    }
  };

  // Composition mode: use render-props
  if (renderTrigger && renderPopover) {
    return (
      <>
        {renderTrigger({
          selected,
          placeholder,
          open,
          onToggle: handleToggle,
          disabled
        })}
        {open &&
          renderPopover({
            groups,
            searchQuery,
            onSearchChange: setSearchQuery,
            onSelect: handleSelect,
            allowClear,
            selectedValue: value
          })}
      </>
    );
  }

  // Fallback mode: shadcn Select
  const NONE_SENTINEL = '__none__';
  return (
    <Select
      value={value ?? NONE_SENTINEL}
      onValueChange={(val) => handleSelect(val === NONE_SENTINEL ? null : val)}
      disabled={disabled}
    >
      <SelectTrigger data-slot="type-selector" className="h-7 text-xs px-2">
        <SelectValue placeholder={allowClear ? '— None —' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value={NONE_SENTINEL}>— None —</SelectItem>}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-block size-2 rounded-full shrink-0 ${KIND_DOT_TOKEN_CLASS[opt.kind] ?? KIND_DOT_TOKEN_CLASS.builtin}`}
                    aria-hidden="true"
                  />
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
