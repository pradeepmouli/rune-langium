// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { IconButtonGroup, Button } from '@rune-langium/design-system';
import { ChevronsDownUp, ChevronsUpDown, Copy, Filter, RotateCcw, Upload } from 'lucide-react';

// J04 explorer toolbar: expand / collapse / filter icon cluster.
export const ExplorerToolbar = () => (
  <IconButtonGroup aria-label="Explorer actions">
    <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label="Expand all">
      <ChevronsUpDown />
    </Button>
    <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label="Collapse all">
      <ChevronsDownUp />
    </Button>
    <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label="Filter">
      <Filter />
    </Button>
    <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label="Import">
      <Upload />
    </Button>
  </IconButtonGroup>
);

// J09 form preview: Copy / Reset pair.
export const FormPreviewCopyReset = () => (
  <IconButtonGroup aria-label="Form preview actions">
    <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label="Copy JSON">
      <Copy />
    </Button>
    <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label="Reset form">
      <RotateCcw />
    </Button>
  </IconButtonGroup>
);
