// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useMemo, useState, type ReactElement } from 'react';
import {
  TypeSelector,
  buildTypeOptions,
  getKindDotClass,
  selectNodeRepository,
  useEditorStore
} from '@rune-langium/visual-editor';
import type { TypeKind } from '@rune-langium/visual-editor';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@rune-langium/design-system/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import { ChevronsUpDown } from 'lucide-react';
import { withInstrumentation } from '../services/instrumentation/core.js';

export interface WorkspaceTypePickerProps {
  value: string | null;
  onSelect(value: string | null): void;
  filterKinds: TypeKind[];
  allowClear?: boolean;
  label: string;
}

/**
 * A searchable type picker over the current workspace repository.
 *
 * It derives options from the editor store only; selecting an option delegates
 * to its caller and intentionally does not change Explore's selected node.
 */
export const WorkspaceTypePicker = withInstrumentation(
  function WorkspaceTypePicker({
    value,
    onSelect,
    filterKinds,
    allowClear = false,
    label
  }: WorkspaceTypePickerProps): ReactElement {
    const nodesById = useEditorStore((state) => state.nodesById);
    const repository = selectNodeRepository(nodesById);
    const options = useMemo(() => buildTypeOptions(repository, false), [repository]);
    const [popoverKey, setPopoverKey] = useState(0);
    const searchLabel = `Search ${label.toLocaleLowerCase()}`;

    const resetPopover = () => {
      setPopoverKey((current) => current + 1);
    };

    return (
      <Popover key={popoverKey} onOpenChange={(open) => !open && resetPopover()}>
        <TypeSelector
          value={value}
          options={options}
          placeholder={label}
          onSelect={(nextValue) => {
            resetPopover();
            onSelect(nextValue);
          }}
          allowClear={allowClear}
          filterKinds={filterKinds}
          renderTrigger={({ selected, placeholder, onToggle, disabled }) => (
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={label}
                  disabled={disabled}
                  onClick={onToggle}
                >
                  <span className="truncate">
                    {selected
                      ? `${selected.label}${selected.namespace ? ` — ${selected.namespace}` : ''}`
                      : placeholder}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
                </button>
              }
            />
          )}
          renderPopover={({ groups, searchQuery, onSearchChange, onSelect: selectOption, allowClear: canClear }) => (
            <PopoverContent className="w-80 p-0" align="start">
              <Command label={searchLabel} shouldFilter={false}>
                <CommandInput autoFocus placeholder={searchLabel} value={searchQuery} onValueChange={onSearchChange} />
                <CommandList>
                  <CommandEmpty>No matching types.</CommandEmpty>
                  {canClear && (
                    <CommandGroup>
                      <CommandItem value="__clear__" aria-label="Clear selection" onSelect={() => selectOption(null)}>
                        Clear selection
                      </CommandItem>
                    </CommandGroup>
                  )}
                  {groups.map((group) => (
                    <CommandGroup key={group.label} heading={group.label}>
                      {group.options.map((option) => {
                        const optionLabel = `${option.label}${option.namespace ? ` — ${option.namespace}` : ''}`;
                        return (
                          <CommandItem
                            key={option.value}
                            value={option.value}
                            aria-label={optionLabel}
                            onSelect={() => selectOption(option.value)}
                          >
                            <span
                              className={`size-2 shrink-0 rounded-full ${getKindDotClass(option.kind)}`}
                              aria-hidden="true"
                            />
                            <span>{option.label}</span>
                            {option.namespace && (
                              <span className="ml-auto text-xs text-muted-foreground">{option.namespace}</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          )}
        />
      </Popover>
    );
  },
  { op: 'WorkspaceTypePicker' }
);
