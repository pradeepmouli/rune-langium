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
export type LayoutPreset = 'navigate' | 'edit' | 'preview';

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

export interface LayoutStack<
  TTop extends PanelComponentName = PanelComponentName,
  TBottom extends PanelComponentName = PanelComponentName
> {
  top: LayoutNode<TTop>;
  bottom: LayoutNode<TBottom>;
  size?: number;
  bottomSize?: number;
}

export type EditorGroup = LayoutGroup<EditorTabName>;
export type PreviewGroup = LayoutGroup<PreviewTabName>;
export type BottomGroup = LayoutGroup<UtilityTabName> & { collapsed: boolean };

/** @deprecated Use ExplorerColumn. */
export type NavigationColumn = LayoutStack<'workspace.fileTree', 'workspace.visualPreview'>;

// Explorer-only column (single panel, no bottom stack)
export type ExplorerColumn = LayoutNode<'workspace.fileTree'>;

// Center workspace stack — graph, source, inspector as switchable panes
export type CenterStackTabName =
  | 'workspace.visualPreview'
  | 'workspace.editor'
  | 'workspace.inspector';
export type CenterGroup = LayoutGroup<CenterStackTabName>;

export type LayoutColumn = ExplorerColumn | CenterGroup | PreviewGroup;

export interface FactoryShape {
  shape: 'factory';
  preset?: LayoutPreset;
  columns: [ExplorerColumn, CenterGroup, PreviewGroup];
  bottomGroup: BottomGroup;
}

export interface NativeShape {
  shape: 'native';
  json: unknown;
}

export type DockviewPayload = FactoryShape | NativeShape;
