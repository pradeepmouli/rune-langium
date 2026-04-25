// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Bridge between our `PanelLayoutRecord` shape and dockview's native API.
 *
 * Why a bridge: our schema (`columns` + `bottomGroup`) is what gets
 * persisted in IndexedDB and migrated by `layout-migrations.ts`. Dockview
 * has its own JSON serialization (`api.toJSON()`) that's richer but
 * tied to its internal coordinate space. The bridge is one-directional:
 *  - on mount: translate `PanelLayoutRecord.dockview` into a sequence of
 *    `api.addPanel(...)` calls (with sizes + groups).
 *  - on serialize: persist the complete dockview JSON as opaque-to-us
 *    inside the same `dockview` field; the next mount feeds it straight
 *    back to `api.fromJSON(...)`.
 *
 * The first form (defaults) is what fresh workspaces and Reset Layout
 * produce. The second (full dockview JSON) is what subsequent sessions
 * see. `isFactoryShape()` discriminates.
 */

import type { DockviewApi, AddPanelOptions } from 'dockview-react';
import type { PanelLayoutRecord } from '../workspace/persistence.js';
import { buildDefaultLayout, type PanelComponentName } from './layout-factory.js';

interface FactoryShape {
  columns: Array<{
    component: PanelComponentName;
    size?: number;
    weight?: number;
    collapsed?: boolean;
  }>;
  bottomGroup: {
    active: PanelComponentName;
    collapsed: boolean;
    tabs: Array<{ component: PanelComponentName; collapsed?: boolean }>;
  };
}

/**
 * Distinguish a factory-shape layout (our schema, fresh workspace or
 * Reset Layout output) from a dockview-native layout (round-tripped
 * through api.toJSON). Factory shape has the discriminator field
 * `columns` at the top of `dockview`.
 */
export function isFactoryShape(layout: PanelLayoutRecord): boolean {
  const dv = layout.dockview as unknown;
  return (
    !!dv && typeof dv === 'object' && 'columns' in (dv as object) && 'bottomGroup' in (dv as object)
  );
}

/**
 * Apply a layout to a freshly-mounted dockview. If the layout is in our
 * factory shape, build it via `addPanel` calls. Otherwise treat it as a
 * dockview-native JSON blob and call `fromJSON`.
 */
export function applyLayout(api: DockviewApi, layout: PanelLayoutRecord): void {
  if (isFactoryShape(layout)) {
    applyFactoryShape(api, layout.dockview as unknown as FactoryShape);
  } else {
    try {
      api.fromJSON(layout.dockview as Parameters<DockviewApi['fromJSON']>[0]);
    } catch {
      // Saved layout is incompatible with current dockview version — fall
      // through to a default. The layout-migrations sanitiser already ran;
      // this catch is defence-in-depth for shape changes within a major.
      const fallback = buildDefaultLayout({
        studioVersion: '0.0.0',
        viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1920
      });
      applyFactoryShape(api, fallback.dockview as unknown as FactoryShape);
    }
  }
}

function applyFactoryShape(api: DockviewApi, shape: FactoryShape): void {
  // Defensive: a degenerate factory shape with no columns has nothing to
  // mount. Bail rather than crash — the layout-migrations sanitiser feeds
  // a fresh factory shape on the next render.
  if (!shape.columns?.[0] || !shape.columns[1] || !shape.columns[2]) return;

  const left = api.addPanel({
    id: shape.columns[0].component,
    component: shape.columns[0].component,
    initialWidth: shape.columns[0].size ?? 240
  } satisfies AddPanelOptions);

  api.addPanel({
    id: shape.columns[1].component,
    component: shape.columns[1].component,
    position: { referencePanel: left.id, direction: 'right' }
  });

  const inspector = api.addPanel({
    id: shape.columns[2].component,
    component: shape.columns[2].component,
    initialWidth: shape.columns[2].size ?? 320,
    position: { referencePanel: shape.columns[1].component, direction: 'right' }
  });
  if (shape.columns[2].collapsed) {
    inspector.group.api.setSize({ width: 0 });
  }

  // Bottom group: stack the three tabs in a single group below the editor.
  const firstTab = shape.bottomGroup.tabs[0];
  if (!firstTab) return;
  const firstBottom = api.addPanel({
    id: firstTab.component,
    component: firstTab.component,
    position: { referencePanel: shape.columns[1].component, direction: 'below' }
  });
  for (let i = 1; i < shape.bottomGroup.tabs.length; i++) {
    const tab = shape.bottomGroup.tabs[i];
    if (!tab) continue;
    api.addPanel({
      id: tab.component,
      component: tab.component,
      position: { referenceGroup: firstBottom.group, direction: 'within' }
    });
  }
  // Activate the requested default bottom tab.
  const active = api.getPanel(shape.bottomGroup.active);
  if (active) active.api.setActive();
  if (shape.bottomGroup.collapsed) {
    firstBottom.group.api.setSize({ height: 0 });
  }
}

/**
 * Snapshot the current layout for persistence. The returned shape is
 * stored as `PanelLayoutRecord.dockview` directly.
 */
export function serializeLayout(api: DockviewApi): unknown {
  return api.toJSON();
}
