// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Command — searchable action list built on Base UI Combobox.
 *
 * @module
 */

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Search } from 'lucide-react';

import { cn } from '../utils';

export interface CommandEntry<Value> {
  readonly value: Value;
  readonly label: string;
  readonly searchText?: string;
}

export interface CommandEntryGroup<Value> {
  readonly id: string;
  readonly items: readonly CommandEntry<Value>[];
}

interface CommandProps<Value> extends React.ComponentProps<'div'> {
  readonly items: readonly CommandEntry<Value>[] | readonly CommandEntryGroup<Value>[];
  readonly onItemSelect: (value: Value) => void;
}

function Command<Value>({ items, onItemSelect, className, children, ...props }: CommandProps<Value>) {
  return (
    <Combobox.Root<CommandEntry<Value>>
      items={items}
      value={null}
      inline
      open
      autoHighlight
      itemToStringLabel={(item) => item.searchText ?? item.label}
      onValueChange={(item) => {
        if (item !== null) onItemSelect(item.value);
      }}
    >
      <div
        data-slot="command"
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded bg-popover text-popover-foreground',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </Combobox.Root>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof Combobox.Input>) {
  return (
    <div className="flex items-center border-b border-input px-3" data-slot="command-input-wrapper">
      <Search className="mr-2 size-4 shrink-0 opacity-50" />
      <Combobox.Input
        data-slot="command-input"
        className={cn(
          'flex h-10 w-full rounded bg-transparent py-3 text-sm outline-none',
          'placeholder:text-muted-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof Combobox.List>) {
  return (
    <Combobox.List
      data-slot="command-list"
      className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof Combobox.Empty>) {
  return (
    <Combobox.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

interface CommandCollectionProps<Value> {
  readonly children: (item: CommandEntry<Value>, index: number) => React.ReactNode;
}

function CommandCollection<Value>({ children }: CommandCollectionProps<Value>) {
  return <Combobox.Collection>{children}</Combobox.Collection>;
}

interface CommandGroupProps<Value> extends Omit<React.ComponentProps<typeof Combobox.Group>, 'children' | 'items'> {
  readonly id: string;
  readonly heading?: React.ReactNode;
  readonly children: (item: CommandEntry<Value>, index: number) => React.ReactNode;
}

function CommandGroup<Value>({ id, heading, className, children, ...props }: CommandGroupProps<Value>) {
  const filteredGroups = Combobox.useFilteredItems<CommandEntryGroup<Value>>();
  const filteredItems = filteredGroups.find((group) => group.id === id)?.items ?? [];

  if (filteredItems.length === 0) return null;

  return (
    <Combobox.Group
      data-slot="command-group"
      items={filteredItems}
      className={cn('overflow-hidden p-1 text-foreground', className)}
      {...props}
    >
      {heading ? (
        <Combobox.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {heading}
        </Combobox.GroupLabel>
      ) : null}
      <CommandCollection>{children}</CommandCollection>
    </Combobox.Group>
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof Combobox.Separator>) {
  return (
    <Combobox.Separator data-slot="command-separator" className={cn('-mx-1 h-px bg-border', className)} {...props} />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof Combobox.Item>) {
  return (
    <Combobox.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandCollection,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
};
