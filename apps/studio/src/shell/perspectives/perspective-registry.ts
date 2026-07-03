// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { Layers, FolderOpen, GitBranch, Package, Settings } from 'lucide-react';
import type { Perspective, PerspectiveId } from './perspective-types.js';
import { ExploreCenterSlot, ExploreActions } from './explore-chrome.js';

/** Rail order, top group first; settings pinned to the bottom group. */
export const PERSPECTIVES: readonly Perspective[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: Layers,
    group: 'main',
    requiresWorkspace: true,
    centerSlot: ExploreCenterSlot,
    actions: ExploreActions
  },
  {
    id: 'workspaces',
    label: 'Workspaces / Models',
    icon: FolderOpen,
    group: 'main',
    requiresWorkspace: false,
    title: 'Workspaces / Models'
  },
  {
    id: 'git',
    label: 'Git / Sync',
    icon: GitBranch,
    group: 'main',
    requiresWorkspace: true,
    title: 'Git / Sync'
  },
  {
    id: 'export',
    label: 'Export / Packaging',
    icon: Package,
    group: 'main',
    requiresWorkspace: true,
    title: 'Export / Packaging'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    group: 'bottom',
    requiresWorkspace: false,
    title: 'Settings'
  }
];

/**
 * The single source of truth for "which perspective is actually showing" —
 * consumed by BOTH `PerspectiveHost` (the body) and `AppHeader` (the bar) so
 * they can never disagree (PR #369 Copilot finding: AppHeader read the raw
 * store value while PerspectiveHost applied this fallback, producing
 * mismatched chrome in the fallback state).
 *
 * A workspace-requiring perspective (explore/git/export) with no workspace
 * would render a blank pane — and its rail button is disabled, stranding the
 * user. This happens when `hasWorkspace`/`hasExploreContent` drop while the
 * store is still on such a perspective (e.g. the last editable file is
 * deleted while in Explore; the store isn't normalized on every such
 * transition). Fall back to the always-available Workspaces launcher rather
 * than relying on every caller to reset the store.
 */
export function resolveEffectivePerspective(
  active: PerspectiveId,
  ctx: { hasWorkspace: boolean; hasExploreContent: boolean }
): PerspectiveId {
  const requiresWorkspace = PERSPECTIVES.find((p) => p.id === active)?.requiresWorkspace ?? false;
  const missingRequiredContext = active === 'explore' ? !ctx.hasExploreContent : requiresWorkspace && !ctx.hasWorkspace;
  return missingRequiredContext ? 'workspaces' : active;
}
