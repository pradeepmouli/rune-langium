// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ComponentType } from 'react';
import type { DockviewApi } from 'dockview-react';
import type { DockLayoutProps } from '@rune-langium/design-system/ui/dock-layout';

export interface WorkbenchDefinition {
  id: 'explore' | 'prototype' | 'export';
  panels: Readonly<Record<string, ComponentType>>;
  titles: Readonly<Record<string, string>>;
  buildDefault(api: DockviewApi, width: number): void;
}

export interface WorkbenchHostProps {
  definition: WorkbenchDefinition;
  initialNativeLayout?: unknown;
  onNativeLayoutChange(json: unknown): void;
  onReady?(api: DockviewApi): void;
  className?: DockLayoutProps['className'];
  defaultTabComponent?: DockLayoutProps['defaultTabComponent'];
  rightHeaderActionsComponent?: DockLayoutProps['rightHeaderActionsComponent'];
}
