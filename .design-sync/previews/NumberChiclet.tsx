// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { NumberChiclet } from '@rune-langium/design-system';

// J04 explorer hydration: namespace header row with type count.
export const NamespaceRow = () => (
  <div className="flex w-[320px] items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
    <span className="font-mono">cdm.base.datetime</span>
    <NumberChiclet>42</NumberChiclet>
  </div>
);

// J17/J05 diagnostics panel: severity pills with counts.
export const DiagnosticsCounts = () => (
  <div className="flex w-[320px] flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm text-foreground">
    <div className="flex items-center gap-2">
      <span>Errors</span>
      <NumberChiclet>3</NumberChiclet>
    </div>
    <div className="flex items-center gap-2">
      <span>Warnings</span>
      <NumberChiclet>12</NumberChiclet>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs">TradeState.rosetta</span>
      <NumberChiclet>1</NumberChiclet>
    </div>
  </div>
);

// J01 first run: dock tab counts, small and large numbers.
export const DockTabCounts = () => (
  <div className="flex w-[360px] items-center gap-4 border-b border-border px-3 py-2 text-sm text-foreground">
    <span className="flex items-center gap-1.5">
      Explorer <NumberChiclet>7</NumberChiclet>
    </span>
    <span className="flex items-center gap-1.5">
      Problems <NumberChiclet>128</NumberChiclet>
    </span>
    <span className="flex items-center gap-1.5">
      Files <NumberChiclet>1204</NumberChiclet>
    </span>
  </div>
);
