// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Layout factory — produces the default `PanelLayoutRecord` for a fresh
 * workspace and for the "Reset layout" command.
 *
 * The dockview JSON shape is opaque to the rest of Studio; this module
 * is the only place that knows the panel topology. The six component
 * names locked in `contracts/dockview-panel-registry.md` are exported
 * here so consumers reference one source of truth.
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

const SMALL_VIEWPORT_BREAKPOINT_PX = 1280;

export interface BuildLayoutInput {
  studioVersion: string;
  viewportWidth: number;
}

interface LayoutNode {
  component: PanelComponentName;
  collapsed?: boolean;
  size?: number;
  /** Editor area takes a larger relative size by default. */
  weight?: number;
}

interface DockviewLayoutShape {
  /** Left-to-right column groups: file tree → editor → inspector. */
  columns: LayoutNode[];
  /** Bottom panel — tabbed group hosting problems/output/visualPreview. */
  bottomGroup: { active: PanelComponentName; tabs: LayoutNode[]; collapsed: boolean };
}

export function buildDefaultLayout(input: BuildLayoutInput): PanelLayoutRecord {
  const small = input.viewportWidth <= SMALL_VIEWPORT_BREAKPOINT_PX;

  const dockview: DockviewLayoutShape = {
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
    dockview: dockview as unknown as PanelLayoutRecord['dockview']
  };
}
