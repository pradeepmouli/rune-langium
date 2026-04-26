// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Layout factory — produces the default `PanelLayoutRecord` for a fresh
 * workspace and for the "Reset layout" command.
 *
 * Two shapes flow through `PanelLayoutRecord.dockview`:
 *
 *   - **factory** (`{ shape: 'factory', columns, bottomGroup }`) — what
 *     this module emits and what the layout-migrations sanitiser
 *     produces. Tightly typed, fixed-arity columns.
 *   - **native**  (`{ shape: 'native',  json }`) — a round-tripped
 *     `api.toJSON()` snapshot. Opaque to us; we only feed it back into
 *     `api.fromJSON()`.
 *
 * The discriminator (`shape`) makes the bridge's translation explicit
 * instead of structural-guessing.
 */

import type { PanelLayoutRecord } from '../workspace/persistence.js';

export const PANEL_COMPONENT_NAMES = [
  'workspace.fileTree',
  'workspace.editor',
  'workspace.inspector',
  'workspace.problems',
  'workspace.output',
  'workspace.visualPreview'
] as const;

export type PanelComponentName = (typeof PANEL_COMPONENT_NAMES)[number];

/**
 * User-facing tab titles for each locked panel component. Surfaced on
 * dockview's tab strip via `addPanel({ title })` (FR-008). Internal
 * `workspace.*` IDs must never leak into the rendered chrome.
 */
export const PANEL_TITLES: Record<PanelComponentName, string> = {
  'workspace.fileTree': 'Files',
  'workspace.editor': 'Editor',
  'workspace.inspector': 'Inspector',
  'workspace.problems': 'Problems',
  'workspace.output': 'Output',
  'workspace.visualPreview': 'Preview'
};

const SMALL_VIEWPORT_BREAKPOINT_PX = 1280;

export interface BuildLayoutInput {
  studioVersion: string;
  viewportWidth: number;
}

export interface LayoutNode {
  component: PanelComponentName;
  collapsed?: boolean;
  /** Pixel width hint. */
  size?: number;
  /** Relative weight when no explicit size is given. */
  weight?: number;
}

export interface BottomGroup {
  active: PanelComponentName;
  collapsed: boolean;
  tabs: LayoutNode[];
}

/**
 * Factory shape — what `buildDefaultLayout` emits and what the bridge
 * translates into `addPanel(...)` calls. Three columns, fixed-arity.
 */
export interface FactoryShape {
  shape: 'factory';
  columns: [LayoutNode, LayoutNode, LayoutNode];
  bottomGroup: BottomGroup;
}

/**
 * Native shape — `api.toJSON()` output. Opaque; the bridge feeds it
 * straight back to `api.fromJSON()`.
 */
export interface NativeShape {
  shape: 'native';
  json: unknown;
}

export type DockviewPayload = FactoryShape | NativeShape;

export function buildDefaultLayout(input: BuildLayoutInput): PanelLayoutRecord {
  const small = input.viewportWidth <= SMALL_VIEWPORT_BREAKPOINT_PX;

  const dockview: FactoryShape = {
    shape: 'factory',
    columns: [
      { component: 'workspace.fileTree', size: small ? 200 : 240 },
      { component: 'workspace.editor', weight: 3 },
      {
        component: 'workspace.inspector',
        size: small ? 0 : 320,
        collapsed: small
      }
    ],
    bottomGroup: {
      active: 'workspace.problems',
      collapsed: small,
      tabs: [
        { component: 'workspace.problems', collapsed: small },
        { component: 'workspace.output', collapsed: small },
        { component: 'workspace.visualPreview', collapsed: small }
      ]
    }
  };

  return {
    version: 1,
    writtenBy: input.studioVersion,
    dockview
  };
}
