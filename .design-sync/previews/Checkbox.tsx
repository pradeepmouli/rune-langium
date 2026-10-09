// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Checkbox, Label } from '@rune-langium/design-system';

// J15 settings: autosave toggle, checked / unchecked.
export const SettingsCheckedUnchecked = () => (
  <div className="flex w-[320px] flex-col gap-3">
    <div className="flex items-center gap-2">
      <Checkbox id="autosave" defaultChecked />
      <Label htmlFor="autosave">Autosave to browser storage</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="telemetry" />
      <Label htmlFor="telemetry">Share anonymous timing data</Label>
    </div>
  </div>
);

// J12 import dialog: pick which generated types to import.
export const ImportTypeSelection = () => (
  <div className="flex w-[320px] flex-col gap-2 rounded-md border border-border bg-card p-3">
    {[
      ['Party', true],
      ['TradeState', true],
      ['ResetHistory', false]
    ].map(([n, c]) => (
      <div key={String(n)} className="flex items-center gap-2">
        <Checkbox id={`imp-${n}`} defaultChecked={c as boolean} />
        <Label htmlFor={`imp-${n}`} className="font-mono text-xs">
          {n as string}
        </Label>
      </div>
    ))}
  </div>
);

// J15 settings: disabled states.
export const Disabled = () => (
  <div className="flex w-[320px] flex-col gap-3">
    <div className="flex items-center gap-2">
      <Checkbox id="d1" disabled defaultChecked />
      <Label htmlFor="d1">Enforce strict validation</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="d2" disabled />
      <Label htmlFor="d2">Enable experimental codegen</Label>
    </div>
  </div>
);
