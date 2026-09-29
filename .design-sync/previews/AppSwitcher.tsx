// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { AppSwitcher } from '@rune-langium/design-system';

// J01 first-run: Studio header switcher, Studio active.
export const StudioCurrent = () => (
  <div className="rounded-lg border border-border bg-card p-2">
    <AppSwitcher current="studio" />
  </div>
);

// Docs surface header: Docs active.
export const DocsCurrent = () => (
  <div className="rounded-lg border border-border bg-card p-2">
    <AppSwitcher current="docs" />
  </div>
);

// Landing site header on a staging deploy with overridden URLs.
export const HomeStaging = () => (
  <div className="rounded-lg border border-border bg-card p-2">
    <AppSwitcher current="home" urls={{ studio: 'https://staging.daikonic.dev/rune-studio/' }} />
  </div>
);
