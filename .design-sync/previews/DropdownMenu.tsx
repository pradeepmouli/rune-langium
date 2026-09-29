// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@rune-langium/design-system';
import { Copy, FileCode, Pencil, Trash2 } from 'lucide-react';

// J05 inspector / J08 edit: context menu on a type node in the Explorer.
export const TypeNodeActions = () => (
  <div className="p-6">
    <DropdownMenu open>
      <DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>Party</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>cdm.base.staticdata.party</DropdownMenuLabel>
          <DropdownMenuItem>
            <Pencil /> Rename type <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy /> Copy qualified name
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileCode /> Go to source <DropdownMenuShortcut>Cmd+B</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2 /> Delete type
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

// J11 codegen: choose which generated targets to show in the Code tab.
export const CodegenTargets = () => (
  <div className="p-6">
    <DropdownMenu open>
      <DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>Targets</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Generate targets</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>TypeScript</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>JSON Schema</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>Excel</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Layout</DropdownMenuLabel>
          <DropdownMenuRadioGroup value="per-namespace">
            <DropdownMenuRadioItem value="per-namespace">One file per namespace</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="single">Single bundled module</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
