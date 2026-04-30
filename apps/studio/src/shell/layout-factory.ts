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
import type { FactoryShape, LayoutColumn, PanelComponentName } from './layout-types.js';
export {
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
  'workspace.fileTree': 'Files',
  'workspace.editor': 'Source',
  'workspace.inspector': 'Structure',
  'workspace.problems': 'Problems',
  'workspace.output': 'Messages',
  'workspace.visualPreview': 'Visualize',
  'workspace.formPreview': 'Form',
  'workspace.codePreview': 'Code'
};

const SMALL_VIEWPORT_BREAKPOINT_PX = 1280;

export interface BuildLayoutInput {
  studioVersion: string;
  viewportWidth: number;
}

export function buildDefaultLayout(input: BuildLayoutInput): PanelLayoutRecord {
  const small = input.viewportWidth <= SMALL_VIEWPORT_BREAKPOINT_PX;

  const dockview: FactoryShape = {
    shape: 'factory',
    columns: [
      { component: 'workspace.fileTree', size: small ? 180 : 220 },
      {
        active: 'workspace.editor',
        weight: 3,
        tabs: [{ component: 'workspace.editor' }, { component: 'workspace.inspector' }]
      },
      { component: 'workspace.visualPreview', size: small ? 220 : 280 },
      {
        active: 'workspace.formPreview',
        size: small ? 280 : 340,
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
    version: 1,
    writtenBy: input.studioVersion,
    dockview
  };
}

export function getLayoutColumnComponents(column: LayoutColumn): PanelComponentName[] {
  return 'tabs' in column ? column.tabs.map((tab) => tab.component) : [column.component];
}
