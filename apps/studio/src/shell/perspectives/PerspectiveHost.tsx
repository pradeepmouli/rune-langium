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
import { PERSPECTIVES } from './perspective-registry.js';
import { SettingsPerspective } from './screens/SettingsPerspective.js';
import { WorkspacesPerspective } from './screens/WorkspacesPerspective.js';
import { GitSyncPerspective } from './screens/GitSyncPerspective.js';
import { ExportPerspective } from './screens/ExportPerspective.js';
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
  // Host-level fallback: a workspace-requiring perspective (explore/git/export)
  // with no workspace would render a blank pane — and its rail button is
  // disabled, stranding the user. This happens when `hasWorkspace` drops to
  // false while the store is still on such a perspective (e.g. the last
  // editable file is deleted while in Explore; the store isn't normalized on
  // every such transition). Fall back to the always-available Workspaces
  // launcher rather than relying on every caller to reset the store.
  const requiresWorkspace = PERSPECTIVES.find((p) => p.id === active)?.requiresWorkspace ?? false;
  const missingRequiredContext =
    active === 'explore' ? !hasExploreContent : requiresWorkspace && !hasWorkspace;
  const effective = missingRequiredContext ? 'workspaces' : active;
  return (
    <div className="flex-1 min-h-0">
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
      {effective === 'settings' && <SettingsPerspective />}
    </div>
  );
}
