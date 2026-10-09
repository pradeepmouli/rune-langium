// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Collapsible, CollapsibleTrigger, CollapsibleContent, Button } from '@rune-langium/design-system';
import { ChevronDown, ChevronRight } from 'lucide-react';

// J04 explorer hydration: an expanded namespace group with its types listed.
export const ExpandedNamespace = () => (
  <Collapsible defaultOpen className="w-[320px] rounded-lg border border-border bg-card p-2">
    <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-1 py-1 text-sm font-medium text-foreground">
      <ChevronDown className="size-4" /> cdm.base.datetime
      <span className="ml-auto text-xs text-muted-foreground">4</span>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ul className="ml-6 mt-1 space-y-1 font-mono text-xs text-muted-foreground">
        <li>BusinessCenters</li>
        <li>BusinessDayAdjustments</li>
        <li>Frequency</li>
        <li>Period</li>
      </ul>
    </CollapsibleContent>
  </Collapsible>
);

// J04 explorer hydration: collapsed sibling namespaces awaiting on-demand hydration.
export const CollapsedNamespaces = () => (
  <div className="w-[320px] space-y-1 rounded-lg border border-border bg-card p-2">
    {[
      ['cdm.base.math', 12],
      ['cdm.product.template', 31],
      ['cdm.event.common', 27]
    ].map(([ns, n]) => (
      <Collapsible key={ns as string}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-1 py-1 text-sm font-medium text-foreground">
          <ChevronRight className="size-4" /> {ns}
          <span className="ml-auto text-xs text-muted-foreground">{n}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>hidden</CollapsibleContent>
      </Collapsible>
    ))}
  </div>
);

// J13 export perspective: advanced options disclosure with a button trigger.
export const AdvancedOptions = () => (
  <Collapsible defaultOpen className="w-[360px] space-y-2 rounded-lg border border-border bg-card p-3">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-foreground">Advanced options</span>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>Toggle</CollapsibleTrigger>
    </div>
    <CollapsibleContent className="space-y-1 text-sm text-muted-foreground">
      <div>Target: TypeScript (Zod)</div>
      <div>Bundle namespaces: cdm.base.*, cdm.product.*</div>
    </CollapsibleContent>
  </Collapsible>
);
