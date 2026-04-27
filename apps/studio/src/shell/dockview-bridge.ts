// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Bridge between our `PanelLayoutRecord` shape and dockview's native API.
 *
 * Why a bridge: our schema (`columns` + `bottomGroup`) is what gets
 * persisted in IndexedDB and migrated by `layout-migrations.ts`. Dockview
 * has its own JSON serialization (`api.toJSON()`) that's richer but
 * tied to its internal coordinate space. The bridge is one-directional:
 *   - on mount: translate `PanelLayoutRecord.dockview` into a sequence of
 *     `api.addPanel(...)` calls (factory shape) OR feed the raw
 *     dockview JSON to `api.fromJSON(...)` (native shape).
 *   - on serialize: persist the `api.toJSON()` snapshot under the
 *     `{ shape: 'native', json }` discriminator.
 *
 * The `shape` field of `DockviewPayload` makes the dispatch explicit,
 * eliminating the structural `isFactoryShape()` guess.
 *
 * If `api.fromJSON` rejects (saved layout incompatible with the current
 * dockview version), we log the cause AND fall back to a fresh factory
 * layout. The user sees their carefully-arranged panels reset, so
 * silent failure here is the wrong default — `console.error` makes the
 * cause discoverable.
 */

import type { DockviewApi, AddPanelOptions } from 'dockview-react';
import type { PanelLayoutRecord } from '../workspace/persistence.js';
import type { BottomGroup, DockviewPayload, LayoutNode } from './layout-types.js';
import { buildDefaultLayout, PANEL_TITLES, type FactoryShape } from './layout-factory.js';

/** Re-export for callers that previously imported from this module. */
export type { FactoryShape } from './layout-factory.js';

/**
 * Distinguish a factory-shape layout from a native (round-tripped)
 * layout. Kept as a typed predicate so call sites can narrow.
 */
export function isFactoryShape(payload: DockviewPayload | null): payload is {
  shape: 'factory';
  columns: [LayoutNode, LayoutNode, LayoutNode];
  bottomGroup: BottomGroup;
} {
  return !!payload && payload.shape === 'factory';
}

/**
 * Apply a layout to a freshly-mounted dockview. Factory shape goes
 * through `addPanel` calls; native shape goes through `fromJSON`. A
 * `null` payload (fresh workspace, unmigrated record) builds a default.
 */
export function applyLayout(api: DockviewApi, layout: PanelLayoutRecord): void {
  const payload = layout.dockview;
  if (!payload) {
    applyFactoryShape(api, defaultFactoryShape(layout));
    return;
  }
  if (payload.shape === 'factory') {
    applyFactoryShape(api, payload as FactoryShape);
    return;
  }
  // shape === 'native'
  try {
    api.fromJSON(payload.json as Parameters<DockviewApi['fromJSON']>[0]);
  } catch (err) {
    // The user just lost their saved layout. Don't be silent — log the
    // cause + a sample of the JSON so the bug is filable. layout-migrations
    // already ran the sanitiser, so reaching this catch implies a shape
    // change inside dockview itself.
    // eslint-disable-next-line no-console
    console.error('[dockview-bridge] api.fromJSON rejected, falling back to default layout', {
      err: errMessage(err),
      jsonPreview: previewJson(payload.json)
    });
    applyFactoryShape(api, defaultFactoryShape(layout));
  }
}

function defaultFactoryShape(layout: PanelLayoutRecord): FactoryShape {
  return buildDefaultLayout({
    studioVersion: layout.writtenBy || '0.0.0',
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1920
  }).dockview as FactoryShape;
}

function applyFactoryShape(api: DockviewApi, shape: FactoryShape): void {
  // The 3-tuple `columns` type guarantees three entries at compile time;
  // the runtime guard is for records that round-tripped through `unknown`
  // (older persistence schemas) and ended up shorter.
  const c0 = shape.columns[0];
  const c1 = shape.columns[1];
  const c2 = shape.columns[2];
  if (!c0 || !c1 || !c2) {
    // eslint-disable-next-line no-console
    console.warn(
      '[dockview-bridge] factory shape has fewer than 3 columns, falling back to default'
    );
    return;
  }

  const left = api.addPanel({
    id: c0.component,
    component: c0.component,
    title: PANEL_TITLES[c0.component],
    initialWidth: c0.size ?? 240
  } satisfies AddPanelOptions);

  api.addPanel({
    id: c1.component,
    component: c1.component,
    title: PANEL_TITLES[c1.component],
    position: { referencePanel: left.id, direction: 'right' }
  });

  const inspector = api.addPanel({
    id: c2.component,
    component: c2.component,
    title: PANEL_TITLES[c2.component],
    initialWidth: c2.size ?? 320,
    position: { referencePanel: c1.component, direction: 'right' }
  });
  if (c2.collapsed) inspector.group.api.setSize({ width: 0 });

  // Bottom group: stack tabs in a single group below the editor.
  const firstTab = shape.bottomGroup.tabs[0];
  if (!firstTab) return;
  const firstBottom = api.addPanel({
    id: firstTab.component,
    component: firstTab.component,
    title: PANEL_TITLES[firstTab.component],
    position: { referencePanel: c1.component, direction: 'below' }
  });
  for (let i = 1; i < shape.bottomGroup.tabs.length; i++) {
    const tab = shape.bottomGroup.tabs[i];
    if (!tab) continue;
    api.addPanel({
      id: tab.component,
      component: tab.component,
      title: PANEL_TITLES[tab.component],
      position: { referenceGroup: firstBottom.group, direction: 'within' }
    });
  }
  const active = api.getPanel(shape.bottomGroup.active);
  if (active) active.api.setActive();
  if (shape.bottomGroup.collapsed) firstBottom.group.api.setSize({ height: 0 });
}

/**
 * Snapshot the current layout for persistence. The returned shape is
 * stored as `PanelLayoutRecord.dockview` directly; the next mount will
 * route it through `api.fromJSON()`.
 */
export function serializeLayout(api: DockviewApi): DockviewPayload {
  return { shape: 'native', json: api.toJSON() };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function previewJson(json: unknown): string {
  try {
    const s = JSON.stringify(json);
    return s.slice(0, 256);
  } catch {
    return '[unserialisable]';
  }
}
