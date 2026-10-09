// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Textarea, Label } from '@rune-langium/design-system';

// J08 edit round-trip: type description in the inspector.
export const TypeDescription = () => (
  <div className="flex w-[360px] flex-col gap-1.5">
    <Label htmlFor="desc">Description</Label>
    <Textarea
      id="desc"
      defaultValue="Represents the state of a trade at a point in time, including the position and any resets that have occurred."
    />
  </div>
);

// J05 inspector: empty with placeholder.
export const EmptyPlaceholder = () => (
  <div className="flex w-[360px] flex-col gap-1.5">
    <Label htmlFor="desc-empty">Definition</Label>
    <Textarea id="desc-empty" placeholder="Describe what Party represents…" />
  </div>
);

// J09 form-function: multi-line condition body, monospace.
export const ConditionBody = () => (
  <div className="flex w-[360px] flex-col gap-1.5">
    <Label htmlFor="cond">Condition</Label>
    <Textarea
      id="cond"
      className="font-mono text-xs"
      rows={3}
      defaultValue={'condition TradeDateRequired:\n  if tradeDate exists\n  then tradeDate <= effectiveDate'}
    />
  </div>
);

// J16 resilience: disabled while a save is in flight.
export const Disabled = () => (
  <div className="flex w-[360px] flex-col gap-1.5">
    <Label htmlFor="desc-off">Description</Label>
    <Textarea id="desc-off" disabled defaultValue="Locked while the workspace syncs." />
  </div>
);
