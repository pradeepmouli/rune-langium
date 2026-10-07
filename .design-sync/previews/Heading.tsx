// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Heading } from '@rune-langium/design-system';

// J01 first-run: start page hierarchy.
export const Levels = () => (
  <div className="flex flex-col gap-3">
    <Heading level={1}>Rune Studio</Heading>
    <Heading level={2}>Open a workspace</Heading>
    <Heading level={3}>Recent models</Heading>
    <Heading level={4}>cdm-product-template</Heading>
  </div>
);

// J05 inspector: semantic h3 rendered at visual size 4 (no heading-level skip).
export const SemanticVsVisual = () => (
  <div className="flex flex-col gap-2">
    <Heading level={2} as="h3" size={4}>
      Attributes
    </Heading>
    <p className="text-sm text-muted-foreground">Rendered as h3 with the size-4 treatment.</p>
  </div>
);

// J03 cdm-load: panel title with muted description.
export const PanelTitle = () => (
  <div className="flex flex-col gap-1">
    <Heading level={3}>Curated models</Heading>
    <p className="text-sm text-muted-foreground">Load the FINOS Common Domain Model from the curated mirror.</p>
  </div>
);
