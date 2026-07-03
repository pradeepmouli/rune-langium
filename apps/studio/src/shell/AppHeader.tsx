// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/**
 * AppHeader — the single shell-level top bar, mounted once above
 * PerspectiveHost. Replaces Explore's private `studio-topbar` and App's
 * not-in-Explore brand header (see
 * docs/superpowers/specs/2026-07-03-shared-perspective-chrome-design.md).
 *
 * Composition: left brand+switcher (degradable), the active perspective's
 * centerSlot or title, its actions slot, then global utilities.
 *
 * The left brand/switcher and the global utilities move here from
 * ExplorePerspective in Task 3 of the shared-chrome plan — this task only
 * mounts the skeleton so AppHeader renders in every perspective.
 */
import { usePerspectiveStore } from '../store/perspective-store.js';
import { PERSPECTIVES } from './perspectives/perspective-registry.js';

export function AppHeader() {
  const activeId = usePerspectiveStore((s) => s.activePerspective);
  const perspective = PERSPECTIVES.find((p) => p.id === activeId);
  const Center = perspective?.centerSlot;
  const Actions = perspective?.actions;
  return (
    <header className="studio-topbar" aria-label="Studio workspace header" data-testid="app-header">
      <div className="studio-topbar__left">{/* brand + switcher moved here in Task 3 */}</div>
      {Center ? <Center /> : <div className="studio-topbar__title">{perspective?.title ?? perspective?.label}</div>}
      <div className="studio-topbar__right">
        {Actions ? <Actions /> : null}
        {/* global utilities moved here in Task 3 */}
      </div>
    </header>
  );
}
