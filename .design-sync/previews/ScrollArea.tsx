// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { ScrollArea, ScrollBar } from '@rune-langium/design-system';

const types = [
  'Party',
  'PartyRole',
  'TradeState',
  'Trade',
  'Product',
  'Payout',
  'InterestRatePayout',
  'ResolvablePriceQuantity',
  'BusinessCenters',
  'BusinessDayAdjustments',
  'Frequency',
  'Period',
  'Counterparty',
  'Account',
  'Identifier',
  'Lineage'
];

// J04 explorer: long type list in a fixed-height scroll area.
export const ExplorerTypeList = () => (
  <ScrollArea className="h-[220px] w-[280px] rounded-lg border border-border bg-sidebar">
    <ul className="space-y-1 p-2 font-mono text-xs text-sidebar-foreground">
      {types.map((t) => (
        <li key={t} className="rounded px-2 py-1">
          {t}
        </li>
      ))}
    </ul>
  </ScrollArea>
);

// J11 codegen code tab: wide generated code with a horizontal scrollbar.
export const CodePaneHorizontal = () => (
  <ScrollArea className="h-[120px] w-[380px] rounded-lg border border-border bg-card">
    <pre className="p-3 font-mono text-xs text-foreground">{`export const TradeStateSchema = z.object({ trade: TradeSchema, state: StateSchema.optional(), resetHistory: z.array(ResetSchema).optional() });
export type TradeState = z.infer<typeof TradeStateSchema>;`}</pre>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);
