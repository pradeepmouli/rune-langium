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
  /** Available types to choose from. */
  options: TypeOption[];
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
// ---------------------------------------------------------------------------

const KIND_BADGE_COLORS: Record<TypeKind | 'builtin', string> = {
  data: 'bg-blue-500/20 text-blue-400',
  choice: 'bg-amber-500/20 text-amber-400',
  enum: 'bg-green-500/20 text-green-400',
  func: 'bg-purple-500/20 text-purple-400',
  builtin: 'bg-gray-500/20 text-gray-400'
};

/**
 * Returns badge CSS classes for a given type kind.
 */
export function getKindBadgeClasses(kind: TypeKind | 'builtin'): string {
  return KIND_BADGE_COLORS[kind] ?? KIND_BADGE_COLORS.builtin;
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
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

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
      <SelectTrigger data-slot="type-selector">
        <SelectValue placeholder={allowClear ? '— None —' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value={NONE_SENTINEL}>— None —</SelectItem>}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                [{getKindLabel(opt.kind)}] {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
