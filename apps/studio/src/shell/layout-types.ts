// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const PANEL_COMPONENT_NAMES = [
  'workspace.fileTree',
  'workspace.editor',
  'workspace.inspector',
  'workspace.problems',
  'workspace.output',
  'workspace.visualPreview',
  'workspace.codePreview'
] as const;

export type PanelComponentName = (typeof PANEL_COMPONENT_NAMES)[number];

export interface LayoutNode {
  component: PanelComponentName;
  collapsed?: boolean;
  size?: number;
  weight?: number;
}

export interface BottomGroup {
  active: PanelComponentName;
  collapsed: boolean;
  tabs: LayoutNode[];
}

export interface FactoryShape {
  shape: 'factory';
  columns: [LayoutNode, LayoutNode, LayoutNode];
  bottomGroup: BottomGroup;
}

export interface NativeShape {
  shape: 'native';
  json: unknown;
}

export type DockviewPayload = FactoryShape | NativeShape;
