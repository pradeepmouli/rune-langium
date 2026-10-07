// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Kbd
} from '@rune-langium/design-system';
import type { CommandEntryGroup } from '@rune-langium/design-system';
import { Box, FileCode, GitBranch, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PaletteValue {
  label: string;
  icon: LucideIcon;
  namespace?: string;
  shortcut?: string;
}

const paletteGroups: CommandEntryGroup<PaletteValue>[] = [
  {
    id: 'types',
    items: [
      { label: 'Party', icon: Box, namespace: 'cdm.base.staticdata.party' },
      { label: 'PartyRole', icon: Box, namespace: 'cdm.base.staticdata.party' },
      { label: 'PartyIdentifier', icon: Box, namespace: 'cdm.base.staticdata.identifier' }
    ].map((value) => ({ value, label: value.label, searchText: `${value.label} ${value.namespace}` }))
  },
  {
    id: 'commands',
    items: [
      { label: 'Generate TypeScript', icon: FileCode, shortcut: 'Cmd+G' },
      { label: 'Sync with GitHub', icon: GitBranch },
      { label: 'Open settings', icon: Settings, shortcut: 'Cmd+,' }
    ].map((value) => ({ value, label: value.label }))
  }
];

// J05 inspector: command palette, jump to a type or run an action.
export function Palette() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="w-[520px] p-6">
      <Command
        items={paletteGroups}
        onItemSelect={(value) => setSelected(value.label)}
        className="rounded-lg border border-border shadow-md"
      >
        <CommandInput aria-label="Search types, files, commands" placeholder="Search types, files, commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {paletteGroups.map((group, index) => (
            <div key={group.id}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup<PaletteValue> id={group.id} heading={group.id === 'types' ? 'Types' : 'Commands'}>
                {(item) => {
                  const { icon: Icon, namespace, shortcut } = item.value;
                  return (
                    <CommandItem key={item.label} value={item}>
                      <Icon /> {item.label}
                      {namespace && (
                        <span className="ml-auto font-mono text-xs text-muted-foreground">{namespace}</span>
                      )}
                      {shortcut && (
                        <span className="ml-auto">
                          <Kbd>{shortcut}</Kbd>
                        </span>
                      )}
                    </CommandItem>
                  );
                }}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
      <p role="status" aria-label="Selection" className="mt-3 text-xs text-muted-foreground">
        {selected ? `Selected: ${selected}` : 'Select a type or command.'}
      </p>
    </div>
  );
}

const typeGroups: CommandEntryGroup<string>[] = [
  { id: 'builtin', items: ['string', 'int', 'date'].map((value) => ({ value, label: value })) },
  { id: 'datetime', items: ['BusinessCenters', 'Period'].map((value) => ({ value, label: value })) }
];

// J18 type closure: type picker for a field's type reference.
export function TypePicker() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="w-[360px] p-6">
      <Command items={typeGroups} onItemSelect={setSelected} className="rounded-lg border border-border shadow-md">
        <CommandInput aria-label="Select a type" placeholder="Select a type..." />
        <CommandList>
          <CommandEmpty>No types found.</CommandEmpty>
          {typeGroups.map((group) => (
            <CommandGroup<string>
              key={group.id}
              id={group.id}
              heading={group.id === 'builtin' ? 'Built-in' : 'cdm.base.datetime'}
            >
              {(item) => (
                <CommandItem key={item.value} value={item}>
                  {item.label}
                </CommandItem>
              )}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
      <p role="status" aria-label="Selection" className="mt-3 text-xs text-muted-foreground">
        {selected ? `Selected type: ${selected}` : 'Select a type.'}
      </p>
    </div>
  );
}
