// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Button } from '@rune-langium/design-system';
import { Download, FolderOpen, Plus, RefreshCw, Trash2 } from 'lucide-react';

// J01 first-run: the start page's primary + secondary actions.
export const StartPageActions = () => (
  <div className="flex items-center gap-3">
    <Button>
      <FolderOpen /> Open workspace
    </Button>
    <Button variant="secondary">
      <Plus /> New scratch model
    </Button>
    <Button variant="link">Load CDM from curated</Button>
  </div>
);

// Every variant, as used across Studio chrome and dialogs.
export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Generate code</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="outline">Preview</Button>
    <Button variant="ghost">Reset filters</Button>
    <Button variant="destructive">
      <Trash2 /> Delete workspace
    </Button>
    <Button variant="link">View diagnostics</Button>
  </div>
);

// Sizes, including the icon sizes used by panel toolbars.
export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="xs">Apply</Button>
    <Button size="sm">Apply</Button>
    <Button>Apply</Button>
    <Button size="lg">Apply</Button>
    <Button size="icon-sm" variant="outline" aria-label="Refresh">
      <RefreshCw />
    </Button>
    <Button size="icon" variant="outline" aria-label="Download">
      <Download />
    </Button>
  </div>
);

// J14 git-sync / header chrome: frosted glass toolbar toggles (aria-pressed = active).
export const GlassToolbar = () => (
  <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
    <Button variant="glass" size="sm" aria-pressed="true">
      Structure
    </Button>
    <Button variant="glass" size="sm">
      Source
    </Button>
    <Button variant="glass" size="sm">
      Form
    </Button>
  </div>
);

// Disabled state (e.g. Export while the model has errors).
export const Disabled = () => (
  <div className="flex items-center gap-3">
    <Button disabled>Export bundle</Button>
    <Button variant="secondary" disabled>
      Sync now
    </Button>
  </div>
);
