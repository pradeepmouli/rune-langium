// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { LucideIcon } from 'lucide-react';

export type PerspectiveId = 'explore' | 'workspaces' | 'git' | 'export' | 'settings';

export interface Perspective {
  id: PerspectiveId;
  label: string;
  icon: LucideIcon;
  /** Rail placement: 'main' (top group) or 'bottom' (settings group). */
  group: 'main' | 'bottom';
  /** Only Explore shows the dockview file tabs. */
  showsFileTabs: boolean;
  /** Explore/Git/Export need a loaded workspace; rail button disabled otherwise. */
  requiresWorkspace: boolean;
}
