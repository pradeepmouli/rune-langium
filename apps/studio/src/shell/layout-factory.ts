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
import type {
  FactoryShape,
  LayoutColumn,
  LayoutPreset,
  PanelComponentName
} from './layout-types.js';
export {
  type LayoutPreset,
  PANEL_COMPONENT_NAMES,
  type BottomGroup,
  type DockviewPayload,
  type FactoryShape,
  type LayoutColumn,
  type LayoutNode,
  type NativeShape,
  type PanelComponentName
} from './layout-types.js';

/**
 * User-facing tab titles for each locked panel component. Surfaced on
 * dockview's tab strip via `addPanel({ title })` (FR-008). Internal
 * `workspace.*` IDs must never leak into the rendered chrome.
 */
export const PANEL_TITLES: Record<PanelComponentName, string> = {
  'workspace.fileTree': 'Explorer',
  'workspace.editor': 'Source',
  'workspace.inspector': 'Inspector',
  'workspace.problems': 'Problems',
  'workspace.output': 'Messages',
  'workspace.visualPreview': 'Graph',
  'workspace.formPreview': 'Form',
  'workspace.codePreview': 'Code'
};

export const LAYOUT_SCHEMA_VERSION = 2;

const SMALL_VIEWPORT_BREAKPOINT_PX = 1280;

export interface BuildLayoutInput {
  studioVersion: string;
  viewportWidth: number;
  preset?: LayoutPreset;
}

export function buildDefaultLayout(input: BuildLayoutInput): PanelLayoutRecord {
  const small = input.viewportWidth <= SMALL_VIEWPORT_BREAKPOINT_PX;
  const preset = input.preset ?? 'edit';

  const navWidth = small ? (preset === 'navigate' ? 260 : 220) : preset === 'navigate' ? 320 : 260;
  const graphHeight = small
    ? preset === 'navigate'
      ? 260
      : 220
    : preset === 'navigate'
      ? 320
      : 260;
  const previewWidth = small
    ? preset === 'preview'
      ? 340
      : 300
    : preset === 'preview'
      ? 420
      : 360;

  const dockview: FactoryShape = {
    shape: 'factory',
    preset,
    columns: [
      {
        size: navWidth,
        bottomSize: graphHeight,
        top: { component: 'workspace.fileTree' },
        bottom: { component: 'workspace.visualPreview' }
      },
      {
        active: preset === 'navigate' ? 'workspace.inspector' : 'workspace.editor',
        weight: 3,
        tabs: [{ component: 'workspace.editor' }, { component: 'workspace.inspector' }]
      },
      {
        active: preset === 'preview' ? 'workspace.codePreview' : 'workspace.formPreview',
        size: previewWidth,
        tabs: [{ component: 'workspace.formPreview' }, { component: 'workspace.codePreview' }]
      }
    ],
    bottomGroup: {
      active: 'workspace.problems',
      collapsed: small,
      tabs: [
        { component: 'workspace.problems', collapsed: small },
        { component: 'workspace.output', collapsed: small }
      ]
    }
  };

  return {
    version: LAYOUT_SCHEMA_VERSION,
    writtenBy: input.studioVersion,
    dockview
  };
}

export function getLayoutColumnComponents(column: LayoutColumn): PanelComponentName[] {
  if ('tabs' in column) {
    return column.tabs.map((tab) => tab.component);
  }
  return [column.top.component, column.bottom.component];
}
