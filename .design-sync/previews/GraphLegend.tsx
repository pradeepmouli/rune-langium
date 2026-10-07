// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { GraphLegend } from '@rune-langium/design-system';

// J06 structure view: the legend pinned to the graph canvas corner.
export const CanvasLegend = () => (
  <div className="relative h-[220px] w-[420px] rounded-lg border border-border bg-background">
    <div className="absolute bottom-3 left-3">
      <GraphLegend />
    </div>
  </div>
);
