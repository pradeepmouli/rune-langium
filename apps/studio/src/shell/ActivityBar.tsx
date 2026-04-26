// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ActivityBar — always-visible left rail outside the dockview group. Hosts
 * the workspace switcher entry point, model registry, and settings. Lives
 * outside dockview so user-customised layouts can't accidentally hide it.
 */

import type React from 'react';

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
    <nav role="navigation" aria-label="Studio activity bar" data-testid="activity-bar">
      <button type="button" onClick={onWorkspaceClick} aria-label="Workspaces">
        WS
      </button>
      <button type="button" onClick={onModelsClick} aria-label="Models">
        M
      </button>
      <button type="button" onClick={onSettingsClick} aria-label="Settings">
        ⚙
      </button>
    </nav>
  );
}
