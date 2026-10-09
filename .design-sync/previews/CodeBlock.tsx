// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { CodeBlock } from '@rune-langium/design-system';

// J07 source-lsp: Rune DSL source excerpt.
export const RuneSource = () => (
  <div className="w-[520px]">
    <CodeBlock language="rune">{`namespace cdm.product.template

type Payout:
  interestRatePayout InterestRatePayout (0..*)
  cashflow Cashflow (0..*)

enum PeriodEnum:
  D
  W
  M
  Y`}</CodeBlock>
  </div>
);

// J11 codegen Code tab: generated TypeScript output.
export const GeneratedTypeScript = () => (
  <div className="w-[520px]">
    <CodeBlock language="typescript">{`import { z } from 'zod';

export const PayoutSchema = z.object({
  interestRatePayout: z.array(RatePayoutSchema).optional(),
  cashflow: z.array(CashflowSchema).optional()
});
export type Payout = z.infer<typeof PayoutSchema>;`}</CodeBlock>
  </div>
);

// J16 resilience: inline error output.
export const ErrorOutput = () => (
  <div className="w-[520px]">
    <CodeBlock language="text" className="text-destructive">{`Error: connect ECONNREFUSED 127.0.0.1:8787
    at TCPConnectWrap.afterConnect (node:net:1611:16)`}</CodeBlock>
  </div>
);
