// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system';

// J11 codegen: pick the generation target (open list).
export const TargetPicker = () => (
  <div className="h-[260px] w-[260px] p-6">
    <Select defaultValue="typescript" defaultOpen>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Target" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Codegen target</SelectLabel>
          <SelectItem value="typescript">TypeScript</SelectItem>
          <SelectItem value="json-schema">JSON Schema</SelectItem>
          <SelectItem value="excel">Excel</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectItem value="zod">Zod schemas</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

// J14 git sync: branch selector, closed with a value.
export const BranchClosed = () => (
  <div className="w-[260px] p-6">
    <Select defaultValue="feat/settlement-date">
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Branch" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="main">main</SelectItem>
        <SelectItem value="feat/settlement-date">feat/settlement-date</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
