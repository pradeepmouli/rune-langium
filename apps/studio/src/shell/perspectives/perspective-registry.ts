// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { Layers, FolderOpen, GitBranch, Package, Settings } from 'lucide-react';
import type { Perspective } from './perspective-types.js';

/** Rail order, top group first; settings pinned to the bottom group. */
export const PERSPECTIVES: readonly Perspective[] = [
  { id: 'explore', label: 'Explore', icon: Layers, group: 'main', requiresWorkspace: true },
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
