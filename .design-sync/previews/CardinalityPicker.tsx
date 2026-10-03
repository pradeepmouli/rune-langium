// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { CardinalityPicker } from '@rune-langium/design-system';

const noop = () => {};

// J08 edit round-trip: the three trigger variants — compact box, structure-view chip, inspector pill.
export const Variants = () => (
  <div className="flex flex-col gap-3 text-sm text-muted-foreground">
    <div className="flex items-center gap-3">
      <span className="w-16">default</span>
      <CardinalityPicker value="(1..1)" onChange={noop} />
      <CardinalityPicker value="(0..*)" onChange={noop} />
    </div>
    <div className="flex items-center gap-3">
      <span className="w-16">chip</span>
      <CardinalityPicker variant="chip" value="(0..1)" onChange={noop} />
      <CardinalityPicker variant="chip" value="(1..*)" onChange={noop} />
    </div>
    <div className="flex items-center gap-3">
      <span className="w-16">pill</span>
      <CardinalityPicker variant="pill" value="(1..1)" onChange={noop} />
      <CardinalityPicker variant="pill" value="(2..5)" onChange={noop} disabled />
    </div>
  </div>
);

// J05 inspector: attribute rows — name, type, cardinality.
export const AttributeRows = () => (
  <div className="flex w-[380px] flex-col divide-y divide-border rounded-md border border-border bg-card text-sm">
    {[
      ['tradeDate', 'date', '(1..1)'],
      ['party', 'Party', '(1..*)'],
      ['settlementTerms', 'SettlementTerms', '(0..1)']
    ].map(([name, type, card]) => (
      <div key={name} className="flex items-center gap-3 px-3 py-2">
        <span className="flex-1 font-mono text-foreground">{name}</span>
        <span className="font-mono text-xs text-data">{type}</span>
        <CardinalityPicker variant="chip" value={card} onChange={noop} />
      </div>
    ))}
  </div>
);
