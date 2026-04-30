// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const PANEL_COMPONENT_NAMES = [
  'workspace.fileTree',
  'workspace.editor',
  'workspace.inspector',
  'workspace.problems',
  'workspace.output',
  'workspace.visualPreview',
  'workspace.formPreview',
  'workspace.codePreview'
] as const;

export type PanelComponentName = (typeof PANEL_COMPONENT_NAMES)[number];
export type EditorTabName = 'workspace.editor' | 'workspace.inspector';
export type PreviewTabName = 'workspace.formPreview' | 'workspace.codePreview';
export type UtilityTabName = 'workspace.problems' | 'workspace.output';

export interface LayoutNode<TComponent extends PanelComponentName = PanelComponentName> {
  component: TComponent;
  collapsed?: boolean;
  size?: number;
  weight?: number;
}

export interface LayoutGroup<TTab extends PanelComponentName = PanelComponentName> {
  active: TTab;
  collapsed?: boolean;
  size?: number;
  weight?: number;
  tabs: [LayoutNode<TTab>, ...LayoutNode<TTab>[]];
}

export type EditorGroup = LayoutGroup<EditorTabName>;
export type PreviewGroup = LayoutGroup<PreviewTabName>;
export type BottomGroup = LayoutGroup<UtilityTabName> & { collapsed: boolean };

export type LeftColumn = LayoutNode<'workspace.fileTree'>;
export type VisualizeColumn = LayoutNode<'workspace.visualPreview'>;
export type LayoutColumn = LeftColumn | EditorGroup | VisualizeColumn | PreviewGroup;

export interface FactoryShape {
  shape: 'factory';
  columns: [LeftColumn, EditorGroup, VisualizeColumn, PreviewGroup];
  bottomGroup: BottomGroup;
}

export interface NativeShape {
  shape: 'native';
  json: unknown;
}

export type DockviewPayload = FactoryShape | NativeShape;
