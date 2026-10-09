// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { TypeSelector } from '@rune-langium/design-system';

const options = [
  { value: 'string', label: 'string', kind: 'builtin' as const },
  { value: 'date', label: 'date', kind: 'builtin' as const },
  {
    value: 'cdm.base.staticdata.party.Party',
    label: 'Party',
    kind: 'data' as const,
    namespace: 'cdm.base.staticdata.party'
  },
  {
    value: 'cdm.base.staticdata.party.PayerReceiver',
    label: 'PayerReceiver',
    kind: 'choice' as const,
    namespace: 'cdm.base.staticdata.party'
  },
  {
    value: 'cdm.base.datetime.BusinessDayConventionEnum',
    label: 'BusinessDayConventionEnum',
    kind: 'enum' as const,
    namespace: 'cdm.base.datetime'
  }
];

// J08 edit round-trip: attribute type field in the inspector — selected, empty, disabled.
export const Triggers = () => (
  <div className="flex w-[320px] flex-col gap-3">
    <TypeSelector value="cdm.base.staticdata.party.Party" options={options} onSelect={() => {}} />
    <TypeSelector value="cdm.base.datetime.BusinessDayConventionEnum" options={options} onSelect={() => {}} />
    <TypeSelector value={null} options={options} placeholder="Select a type…" onSelect={() => {}} allowClear />
    <TypeSelector value="date" options={options} onSelect={() => {}} disabled />
  </div>
);
