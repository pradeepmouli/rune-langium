// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { RadioGroup, RadioGroupItem, Label } from '@rune-langium/design-system';

// J11 codegen: choose target language.
export const CodegenTarget = () => (
  <RadioGroup defaultValue="zod" className="w-[280px]">
    {[
      ['zod', 'Zod schema'],
      ['typescript', 'TypeScript types'],
      ['json-schema', 'JSON Schema']
    ].map(([v, l]) => (
      <div key={v} className="flex items-center gap-2">
        <RadioGroupItem value={v} id={`t-${v}`} />
        <Label htmlFor={`t-${v}`}>{l}</Label>
      </div>
    ))}
  </RadioGroup>
);

// J12 import dialog: source kind, nothing preselected except first.
export const ImportSource = () => (
  <RadioGroup defaultValue="openapi" className="w-[280px] rounded-md border border-border bg-card p-3">
    {[
      ['openapi', 'OpenAPI document'],
      ['sql', 'SQL DDL'],
      ['jsonschema', 'JSON Schema']
    ].map(([v, l]) => (
      <div key={v} className="flex items-center gap-2">
        <RadioGroupItem value={v} id={`s-${v}`} />
        <Label htmlFor={`s-${v}`}>{l}</Label>
      </div>
    ))}
  </RadioGroup>
);

// J13 export: disabled group.
export const Disabled = () => (
  <RadioGroup defaultValue="excel" disabled className="w-[280px]">
    {[
      ['excel', 'Excel workbook'],
      ['rosetta', 'Rosetta source']
    ].map(([v, l]) => (
      <div key={v} className="flex items-center gap-2">
        <RadioGroupItem value={v} id={`e-${v}`} disabled />
        <Label htmlFor={`e-${v}`}>{l}</Label>
      </div>
    ))}
  </RadioGroup>
);
