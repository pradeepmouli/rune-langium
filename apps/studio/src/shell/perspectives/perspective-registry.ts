// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { Layers, FolderOpen, GitBranch, Package, Settings } from 'lucide-react';
import type { Perspective } from './perspective-types.js';

/** Rail order, top group first; settings pinned to the bottom group. */
export const PERSPECTIVES: readonly Perspective[] = [
  { id: 'explore', label: 'Explore', icon: Layers, group: 'main', showsFileTabs: true, requiresWorkspace: true },
  { id: 'workspaces', label: 'Workspaces / Models', icon: FolderOpen, group: 'main', showsFileTabs: false, requiresWorkspace: false },
  { id: 'git', label: 'Git / Sync', icon: GitBranch, group: 'main', showsFileTabs: false, requiresWorkspace: true },
  { id: 'export', label: 'Export / Packaging', icon: Package, group: 'main', showsFileTabs: false, requiresWorkspace: true },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'bottom', showsFileTabs: false, requiresWorkspace: false }
];
