// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ActivityBar — always-visible left rail outside the dockview group. Hosts
 * the workspace switcher entry point, model registry, and settings. Lives
 * outside dockview so user-customised layouts can't accidentally hide it.
 */

import type React from 'react';
import { Button } from '@rune-langium/design-system/ui/button';

interface Props {
  onWorkspaceClick: () => void;
  onModelsClick: () => void;
  onSettingsClick: () => void;
}

export function ActivityBar({
  onWorkspaceClick,
  onModelsClick,
  onSettingsClick
}: Props): React.ReactElement {
  return (
    <nav
      role="navigation"
      aria-label="Studio activity bar"
      data-testid="activity-bar"
      className="flex flex-col items-center gap-1.5 p-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onWorkspaceClick}
        aria-label="Workspaces"
        className="studio-chrome-button"
      >
        WS
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onModelsClick}
        aria-label="Models"
        className="studio-chrome-button"
      >
        M
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onSettingsClick}
        aria-label="Settings"
        className="studio-chrome-button"
      >
        ⚙
      </Button>
    </nav>
  );
}
