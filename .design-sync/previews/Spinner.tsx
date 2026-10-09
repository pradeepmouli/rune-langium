// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Button, Spinner } from '@rune-langium/design-system';

// J03 cdm-load: loading state while the curated bundle hydrates.
export const LoadingCurated = () => (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Spinner className="size-4" /> Loading cdm.product.template…
  </div>
);

// J11 codegen: busy button while generating.
export const GeneratingButton = () => (
  <Button disabled>
    <Spinner /> Generating…
  </Button>
);

// Sizes with primary tint.
export const Sizes = () => (
  <div className="flex items-center gap-4 text-primary">
    <Spinner className="size-3" />
    <Spinner className="size-4" />
    <Spinner className="size-6" />
    <Spinner className="size-8" />
  </div>
);
