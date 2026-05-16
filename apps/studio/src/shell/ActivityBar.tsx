// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ActivityBar — always-visible left rail outside the dockview group. Hosts
 * the workspace switcher entry point, model registry, and settings. Lives
 * outside dockview so user-customised layouts can't accidentally hide it.
 */

import type React from 'react';
import { Layers, Network, Search, Database, Bell, Settings } from 'lucide-react';

interface Props {
  onWorkspaceClick: () => void;
  onModelsClick: () => void;
  onSettingsClick: () => void;
}

export function ActivityBar({ onWorkspaceClick, onModelsClick, onSettingsClick }: Props): React.ReactElement {
  return (
    <nav aria-label="Studio activity bar" data-testid="activity-bar" className="studio-rail">
      <div className="studio-rail__group">
        <button
          type="button"
          className="studio-rail__btn"
          aria-label="Explorer"
          aria-pressed="true"
          onClick={onWorkspaceClick}
        >
          <span className="studio-rail__pip" />
          <Layers className="size-4" />
        </button>
        <button type="button" disabled className="studio-rail__btn" aria-label="Graph">
          <Network className="size-4" />
        </button>
        <button type="button" disabled className="studio-rail__btn" aria-label="Search">
          <Search className="size-4" />
        </button>
        <button type="button" className="studio-rail__btn" aria-label="Curated models" onClick={onModelsClick}>
          <Database className="size-4" />
        </button>
      </div>
      <div className="studio-rail__spacer" />
      <div className="studio-rail__group">
        <button type="button" disabled className="studio-rail__btn" aria-label="Notifications">
          <Bell className="size-4" />
        </button>
        <button type="button" className="studio-rail__btn" aria-label="Settings" onClick={onSettingsClick}>
          <Settings className="size-4" />
        </button>
      </div>
    </nav>
  );
}
