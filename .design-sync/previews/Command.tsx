// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
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
import { Box, FileCode, GitBranch, Settings } from 'lucide-react';

// J05 inspector: command palette, jump to a type or run an action.
export const Palette = () => (
  <div className="w-[520px] p-6">
    <Command className="rounded-lg border border-border shadow-md">
      <CommandInput placeholder="Search types, files, commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Types">
          <CommandItem value="Party">
            <Box /> Party{' '}
            <span className="ml-auto font-mono text-xs text-muted-foreground">cdm.base.staticdata.party</span>
          </CommandItem>
          <CommandItem value="PartyRole">
            <Box /> PartyRole{' '}
            <span className="ml-auto font-mono text-xs text-muted-foreground">cdm.base.staticdata.party</span>
          </CommandItem>
          <CommandItem value="PartyIdentifier">
            <Box /> PartyIdentifier{' '}
            <span className="ml-auto font-mono text-xs text-muted-foreground">cdm.base.staticdata.identifier</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Commands">
          <CommandItem value="generate-typescript">
            <FileCode /> Generate TypeScript{' '}
            <span className="ml-auto">
              <Kbd>Cmd+G</Kbd>
            </span>
          </CommandItem>
          <CommandItem value="git-sync">
            <GitBranch /> Sync with GitHub
          </CommandItem>
          <CommandItem value="settings">
            <Settings /> Open settings{' '}
            <span className="ml-auto">
              <Kbd>Cmd+,</Kbd>
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </div>
);

// J18 type closure: type picker for a field's type reference.
export const TypePicker = () => (
  <div className="w-[360px] p-6">
    <Command className="rounded-lg border border-border shadow-md">
      <CommandInput placeholder="Select a type..." />
      <CommandList>
        <CommandGroup heading="Built-in">
          <CommandItem value="string">string</CommandItem>
          <CommandItem value="int">int</CommandItem>
          <CommandItem value="date">date</CommandItem>
        </CommandGroup>
        <CommandGroup heading="cdm.base.datetime">
          <CommandItem value="BusinessCenters">BusinessCenters</CommandItem>
          <CommandItem value="Period">Period</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </div>
);
