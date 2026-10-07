// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Alert, AlertDescription, AlertTitle } from '@rune-langium/design-system';
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';

// J11 codegen Code tab: destructive banner when the codegen service is down.
export const ServiceUnavailable = () => (
  <div className="w-[560px]">
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Code generation unavailable</AlertTitle>
      <AlertDescription>
        <p>
          Code generation service is not available. Start it with <code className="font-mono">pnpm codegen:start</code>,
          or set <code className="font-mono">VITE_CODEGEN_URL</code> to a reachable service.
        </p>
      </AlertDescription>
    </Alert>
  </div>
);

// J11 export dialog: validation warnings before generating.
export const ValidationWarnings = () => (
  <div className="w-[560px]">
    <Alert variant="warning">
      <AlertTriangle />
      <AlertTitle>Validation warnings</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          <li>cdm.product.template: unresolved type reference 'EconomicTerms'</li>
          <li>cdm.event.common: attribute 'tradeDate' has no cardinality</li>
        </ul>
      </AlertDescription>
    </Alert>
  </div>
);

// J03 import dialog: neutral merge banner.
export const MergeBanner = () => (
  <div className="w-[560px]">
    <Alert>
      <Info />
      <AlertTitle>Merging into workspace</AlertTitle>
      <AlertDescription>
        3 namespaces from the imported JSON Schema will be added to the open workspace.
      </AlertDescription>
    </Alert>
  </div>
);

// J14 git-sync: clone failure without an icon.
export const CloneError = () => (
  <div className="w-[560px]">
    <Alert variant="destructive">
      <AlertDescription>
        Clone failed: repository 'finos/common-domain-model' was not found or access was denied.
      </AlertDescription>
    </Alert>
  </div>
);
