// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Separator } from '@rune-langium/design-system';

// J05 inspector: horizontal rule between the header and attribute list.
export const HorizontalInInspector = () => (
  <div className="w-[300px] rounded-lg border border-border bg-card p-3 text-sm text-foreground">
    <div className="font-medium">Party</div>
    <div className="text-xs text-muted-foreground">cdm.base.staticdata.party</div>
    <Separator className="my-3" />
    <div className="font-mono text-xs">partyId string (1..*)</div>
    <div className="font-mono text-xs">name string (0..1)</div>
  </div>
);

// J14 header chrome: vertical rules between toolbar groups.
export const VerticalInToolbar = () => (
  <div className="flex h-8 items-center gap-3 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
    <span>Structure</span>
    <Separator orientation="vertical" />
    <span>Source</span>
    <Separator orientation="vertical" />
    <span className="text-muted-foreground">main, 3 ahead</span>
  </div>
);
