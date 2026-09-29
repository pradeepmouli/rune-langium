// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, Separator } from '@rune-langium/design-system';

// J14 git sync: branch and sync status popover in the Studio header.
export const GitSyncStatus = () => (
  <div className="p-6">
    <Popover open>
      <PopoverTrigger render={<Button variant="secondary" size="sm" />}>feat/settlement-date</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Git sync</span>
            <Badge variant="secondary">2 ahead</Badge>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            pradeepmouli/cdm-trade-model
            <br />
            origin/feat/settlement-date
          </div>
          <Separator />
          <div className="flex flex-col gap-1 text-xs text-foreground">
            <span>3 files changed</span>
            <span className="text-muted-foreground">TradeState.rosetta, Party.rosetta, datetime.rosetta</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm">
              Pull
            </Button>
            <Button size="sm">Push changes</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

// J09 form preview: cardinality hint popover on a field.
export const CardinalityHint = () => (
  <div className="p-6">
    <Popover open>
      <PopoverTrigger render={<Button variant="secondary" size="sm" />}>partyId (1..1)</PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-sm text-foreground">Required, single value</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Cardinality <span className="font-mono">(1..1)</span> means every Party must carry exactly one partyId.
        </p>
      </PopoverContent>
    </Popover>
  </div>
);
