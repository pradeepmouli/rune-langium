// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Label, Input, Checkbox } from '@rune-langium/design-system';

// J05 inspector: label above input.
export const StackedField = () => (
  <div className="flex w-[320px] flex-col gap-1.5">
    <Label htmlFor="l-type">Type</Label>
    <Input id="l-type" defaultValue="TradeState" />
  </div>
);

// J15 settings: label paired with a checkbox.
export const CheckboxLabel = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="l-auto" defaultChecked />
    <Label htmlFor="l-auto">Autosave to browser storage</Label>
  </div>
);

// J08 edit round-trip: muted mono label for a namespace.
export const MutedMonoLabel = () => (
  <div className="flex w-[320px] flex-col gap-1.5">
    <Label htmlFor="l-ns" className="font-mono text-xs text-muted-foreground">
      cdm.base.datetime
    </Label>
    <Input id="l-ns" defaultValue="tradeDate" />
  </div>
);
