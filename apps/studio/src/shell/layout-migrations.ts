// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Layout sanitiser. Runs every time a `WorkspaceRecord.layout` is loaded
 * from persistence so the dockable shell never sees:
 *  - unknown component names (a panel was renamed or removed since the
 *    layout was last written),
 *  - layouts from a future schema version we don't understand,
 *  - a malformed / truncated record.
 *
 * Strategy:
 *  1. If the input doesn't parse as the current shape OR the version is
 *     newer than current → rebuild from `buildDefaultLayout`. The user
 *     loses customisations from the unknown version but never sees an
 *     empty / broken layout.
 *  2. If the input is otherwise valid: walk every node and drop entries
 *     whose `component` isn't in the locked registry, with a console
 *     warning so a regression in the registry shows up in dev.
 */

import type { PanelLayoutRecord } from '../workspace/persistence.js';
import { buildDefaultLayout, LAYOUT_SCHEMA_VERSION, type BuildLayoutInput } from './layout-factory.js';
import { PANEL_COMPONENT_NAMES, type FactoryShape } from './layout-types.js';

const KNOWN_COMPONENTS = new Set<string>(PANEL_COMPONENT_NAMES);
export const INVALID_LAYOUT_RESET_NOTICE =
  'Your saved layout was incompatible with this Studio version, so it was reset to the default arrangement.';

export interface LayoutSanitizationResult {
  layout: PanelLayoutRecord;
  notice?: string;
}

function validateNativeLayout(json: unknown): 'ok' | 'invalid-shape' | 'unknown-panel' | 'empty-panels' {
  if (!json || typeof json !== 'object') {
    return 'invalid-shape';
  }
  const record = json as Record<string, unknown>;
  const grid = record['grid'];
  const panels = record['panels'];
  if (!grid || typeof grid !== 'object' || !('root' in grid)) {
    return 'invalid-shape';
  }
  if (!panels || typeof panels !== 'object' || Array.isArray(panels)) {
    return 'invalid-shape';
  }
  const entries = Object.values(panels as Record<string, unknown>);
  if (entries.length === 0) {
    return 'empty-panels';
  }
  for (const panel of entries) {
    if (!panel || typeof panel !== 'object') {
      return 'invalid-shape';
    }
    const contentComponent = (panel as Record<string, unknown>)['contentComponent'];
    if (typeof contentComponent !== 'string') {
      return 'invalid-shape';
    }
    if (!KNOWN_COMPONENTS.has(contentComponent)) {
      return 'unknown-panel';
    }
  }
  return 'ok';
}

export function sanitizeLayout(input: unknown, ctx: BuildLayoutInput): PanelLayoutRecord {
  return sanitizeLayoutWithDiagnostics(input, ctx).layout;
}

export function sanitizeLayoutWithDiagnostics(input: unknown, ctx: BuildLayoutInput): LayoutSanitizationResult {
  if (!isPlausibleLayout(input)) {
    return { layout: buildDefaultLayout(ctx) };
  }
  if (input.version > LAYOUT_SCHEMA_VERSION) {
    return {
      layout: buildDefaultLayout(ctx),
      notice: INVALID_LAYOUT_RESET_NOTICE
    };
  }
  if (!hasKnownDockviewShape(input.dockview)) {
    return {
      layout: buildDefaultLayout(ctx),
      notice: INVALID_LAYOUT_RESET_NOTICE
    };
  }
  // Native (api.toJSON) snapshots can't be patched in place when the default
  // layout gains a panel, so any native layout older than the current schema
  // is force-reset to the factory default:
  //   • v5→v6: dockview 6.x changed its toJSON format (panels couldn't resize).
  //   • v6→v7: workspace.activity was added to the default bottom group; a
  //     pre-v7 native snapshot has no way to surface it without a reset.
  if (input.version <= 6 && input.dockview?.shape === 'native') {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] reset pre-v7 native layout to surface new default panels');
    return {
      layout: buildDefaultLayout(ctx),
      notice: INVALID_LAYOUT_RESET_NOTICE
    };
  }

  // Walk + drop unknown component names. Mutation happens on a deep clone
  // so the original (persisted) record stays untouched until a new save.
  const cloned: PanelLayoutRecord = JSON.parse(JSON.stringify(input));
  if (cloned.version < LAYOUT_SCHEMA_VERSION) {
    cloned.version = LAYOUT_SCHEMA_VERSION;
  }
  let droppedAny = false;
  let normalizedActive = false;
  let injectedPanel = false;
  walkAndDrop(cloned.dockview, () => {
    droppedAny = true;
  });
  if (cloned.dockview?.shape === 'factory') {
    const activeResult = normalizeFactoryActives(cloned.dockview);
    if (activeResult === 'invalid-shape') {
      // eslint-disable-next-line no-console
      console.warn('[layout-migrations] reset invalid saved layout to defaults');
      return {
        layout: buildDefaultLayout(ctx),
        notice: INVALID_LAYOUT_RESET_NOTICE
      };
    }
    normalizedActive = activeResult;
    // A factory snapshot persisted before a panel joined the default bottom
    // group (e.g. workspace.activity) upgrades cleanly above but would never
    // surface the new tab. Native snapshots get a full reset for this; factory
    // ones are structured, so patch in place — inject any missing default
    // bottom-group panels rather than discarding the user's arrangement.
    injectedPanel = ensureDefaultBottomPanels(cloned.dockview, ctx);
  } else if (cloned.dockview?.shape === 'native') {
    const nativeResult = validateNativeLayout(cloned.dockview.json);
    if (nativeResult !== 'ok') {
      // eslint-disable-next-line no-console
      console.warn('[layout-migrations] reset invalid saved layout to defaults');
      return {
        layout: buildDefaultLayout(ctx),
        notice: INVALID_LAYOUT_RESET_NOTICE
      };
    }
  }
  if (droppedAny) {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] dropped unknown component names from saved layout');
  }
  if (normalizedActive) {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] normalized invalid active tabs in saved layout');
  }
  if (injectedPanel) {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] injected missing default panels into saved factory layout');
  }
  return { layout: cloned };
}

/**
 * Ensure a factory layout's bottom group contains every panel the current
 * default places there, inserting any missing ones at their default position.
 * Returns true if anything was injected. Idempotent: a layout that already
 * matches the default is left untouched.
 */
function ensureDefaultBottomPanels(shape: FactoryShape, ctx: BuildLayoutInput): boolean {
  const defaults = buildDefaultLayout(ctx);
  if (defaults.dockview?.shape !== 'factory') return false;
  const defaultComponents = defaults.dockview.bottomGroup.tabs.map((tab) => tab.component);
  const present = new Set(shape.bottomGroup.tabs.map((tab) => tab.component));
  let injected = false;
  defaultComponents.forEach((component, index) => {
    if (present.has(component)) return;
    const insertAt = Math.min(index, shape.bottomGroup.tabs.length);
    shape.bottomGroup.tabs.splice(insertAt, 0, { component });
    present.add(component);
    injected = true;
  });
  return injected;
}

function isPlausibleLayout(input: unknown): input is PanelLayoutRecord {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return (
    typeof obj['version'] === 'number' &&
    typeof obj['writtenBy'] === 'string' &&
    obj['dockview'] !== undefined &&
    obj['dockview'] !== null
  );
}

function hasKnownDockviewShape(payload: unknown): payload is NonNullable<PanelLayoutRecord['dockview']> {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const shape = (payload as { shape?: unknown }).shape;
  return shape === 'factory' || shape === 'native';
}

/**
 * Walk the dockview tree and remove any node whose `component` field names
 * a panel that's no longer in the registry. Mutates in place.
 */
function walkAndDrop(node: unknown, onDrop: () => void): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      const filtered = value.filter((entry) => {
        if (entry && typeof entry === 'object') {
          const c = (entry as Record<string, unknown>)['component'];
          if (typeof c === 'string' && !KNOWN_COMPONENTS.has(c)) {
            onDrop();
            return false;
          }
        }
        return true;
      });
      // Recurse into the survivors.
      filtered.forEach((entry) => walkAndDrop(entry, onDrop));
      obj[key] = filtered;
    } else if (value && typeof value === 'object') {
      walkAndDrop(value, onDrop);
    }
  }
}

function normalizeFactoryActives(shape: FactoryShape): boolean | 'invalid-shape' {
  let normalized = false;
  if (!Array.isArray(shape.columns)) {
    return 'invalid-shape';
  }
  if (shape.columns.length !== 3) {
    return 'invalid-shape';
  }
  // v3 layout: columns[0] is an ExplorerColumn (single `component` field).
  // v2 layout: columns[0] is a NavigationColumn ({ top, bottom } stack).
  // Migrate v2→v3 inline rather than resetting.
  const col0 = shape.columns[0] as unknown as Record<string, unknown>;
  if (col0 && typeof col0 === 'object' && 'top' in col0 && 'bottom' in col0) {
    // v2 NavigationColumn → extract fileTree as ExplorerColumn, drop visualPreview
    // (it's now in the center group). Mutate in place.
    const top = col0.top as { component?: string } | undefined;
    if (top?.component === 'workspace.fileTree') {
      (shape.columns as unknown[])[0] = { component: 'workspace.fileTree', size: col0.size ?? 248 };
      normalized = true;
    } else {
      return 'invalid-shape';
    }
  }
  const explorerCol = shape.columns[0];
  if (!isExplorerColumn(explorerCol) || explorerCol.component !== 'workspace.fileTree') {
    return 'invalid-shape';
  }
  const groups = [shape.columns[1], shape.columns[2], shape.bottomGroup];
  for (const group of groups) {
    if (!group || !('tabs' in group) || !Array.isArray(group.tabs) || group.tabs.length === 0) {
      return 'invalid-shape';
    }
    if (typeof group.active !== 'string') {
      return 'invalid-shape';
    }
    const components = group.tabs.map((tab) => tab.component);
    if (components.some((component) => typeof component !== 'string')) {
      return 'invalid-shape';
    }
    if (components.includes(group.active)) continue;
    const [first] = components;
    if (!first) {
      continue;
    }
    group.active = first;
    normalized = true;
  }
  return normalized;
}

/** Guard for the v3 ExplorerColumn shape: a single `component` string, no top/bottom. */
function isExplorerColumn(value: unknown): value is FactoryShape['columns'][0] & {
  component: string;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { component?: unknown };
  return typeof record.component === 'string';
}
