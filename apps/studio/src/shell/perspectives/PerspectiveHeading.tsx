// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/**
 * PerspectiveHeading — the active perspective's name + icon, rendered in the
 * chrome row directly below the app header (the same row that carries
 * Explore's "Show utilities" / "Reset layout" actions). Every perspective
 * shows this heading in the same location: Explore embeds it in DockShell's
 * layout-presets bar; the other screens get it via PerspectiveHost.
 */
import type React from 'react';
import { PERSPECTIVES } from './perspective-registry.js';
import type { PerspectiveId } from './perspective-types.js';

export function PerspectiveHeading({ perspectiveId }: { perspectiveId: PerspectiveId }): React.ReactElement | null {
  const perspective = PERSPECTIVES.find((p) => p.id === perspectiveId);
  if (!perspective) return null;
  const Icon = perspective.icon;
  return (
    <div className="studio-layout-presets__title" data-testid="perspective-heading">
      <Icon className="size-4" aria-hidden="true" />
      <span>{perspective.title ?? perspective.label}</span>
    </div>
  );
}
