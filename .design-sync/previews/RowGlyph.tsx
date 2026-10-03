// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { RowGlyph, Badge } from '@rune-langium/design-system';
import { ArrowUpRight } from 'lucide-react';

// J05 inspector: nav arrow beside a type reference field.
export const TypeReferenceNav = () => (
  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
    <span className="text-muted-foreground">type</span>
    <Badge variant="data">InterestRatePayout</Badge>
    <RowGlyph as="button" variant="nav" type="button" aria-label="Go to InterestRatePayout">
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </RowGlyph>
  </div>
);

// J05 structure view: enum-jump arrow on an enum-typed attribute row.
export const EnumNavRow = () => (
  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
    <span className="font-mono">periodUnit</span>
    <Badge variant="enum">PeriodEnum</Badge>
    <RowGlyph as="button" variant="enum-nav" type="button" aria-label="Navigate to PeriodEnum">
      ↗
    </RowGlyph>
  </div>
);

// J07 source-lsp: unresolved type marker on an attribute row.
export const UnresolvedRow = () => (
  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
    <span className="font-mono">economicTerms</span>
    <Badge variant="error">EconomicTerms</Badge>
    <RowGlyph variant="unresolved" role="img" aria-label="Unresolved type: EconomicTerms">
      ?
    </RowGlyph>
  </div>
);
