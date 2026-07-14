// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/**
 * PerspectiveHost — renders the active perspective in the shell content slot.
 * Explore (the `ExplorePerspective` DockShell workbench) is ALWAYS mounted and
 * hidden via `display:none` when inactive — keep-alive preserves the dockview
 * layout, open files, unsaved edits, and the LSP worker. The other four screens
 * mount on demand.
 */
import type React from 'react';
import { usePerspectiveStore } from '../../store/perspective-store.js';
import { resolveEffectivePerspective } from './perspective-registry.js';
import { SettingsPerspective } from './screens/SettingsPerspective.js';
import { WorkspacesPerspective } from './screens/WorkspacesPerspective.js';
import { GitSyncPerspective } from './screens/GitSyncPerspective.js';
import { ExportPerspective } from './screens/ExportPerspective.js';
import { PrototypePerspective } from './screens/PrototypePerspective.js';
import { ExplorePerspective } from '../ExplorePerspective.js';
import type { WorkspaceKind } from '../../workspace/persistence.js';
import type { WorkspaceFile } from '../../services/workspace.js';

interface Props {
  hasWorkspace: boolean;
  hasExploreContent: boolean;
  /** Forwarded to GitSyncPerspective for the sync-engine subscription. */
  workspaceId?: string;
  /** Forwarded to GitSyncPerspective for the sync-engine subscription. */
  workspaceKind?: WorkspaceKind;
  /** Workspace files forwarded to ExportPerspective for the Download flow. */
  files?: ReadonlyArray<WorkspaceFile>;
}

export function PerspectiveHost({
  hasWorkspace,
  hasExploreContent,
  workspaceId,
  workspaceKind,
  files
}: Props): React.ReactElement {
  const active = usePerspectiveStore((s) => s.activePerspective);
  // Effective-perspective fallback — shared with AppHeader via
  // resolveEffectivePerspective so the bar and the body never disagree.
  const effective = resolveEffectivePerspective(active, { hasWorkspace, hasExploreContent });
  return (
    // `min-w-0` is load-bearing: this is a flex item of the App content row.
    // Without it the item's `min-width: auto` refuses to shrink below its
    // content's min-content width, so a wide child (e.g. the open-file tab
    // strip with many files) forces this host — and the whole layout — past
    // the viewport. `min-w-0` lets it honor the row width and clip/scroll inside.
    <div className="flex-1 min-h-0 min-w-0">
      {/* Explore: kept alive — hidden via display:none, NEVER unmounted. */}
      <div
        data-perspective-slot="explore"
        className="h-full"
        style={{ display: effective === 'explore' ? undefined : 'none' }}
      >
        <ExplorePerspective />
      </div>
      {effective === 'workspaces' && <WorkspacesPerspective />}
      {effective === 'git' && <GitSyncPerspective workspaceId={workspaceId} workspaceKind={workspaceKind} />}
      {effective === 'export' && <ExportPerspective files={files} />}
      {effective === 'prototype' && <PrototypePerspective />}
      {effective === 'settings' && <SettingsPerspective />}
    </div>
  );
}
