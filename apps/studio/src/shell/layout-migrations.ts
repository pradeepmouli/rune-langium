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
import { buildDefaultLayout, type BuildLayoutInput } from './layout-factory.js';
import { PANEL_COMPONENT_NAMES, type FactoryShape } from './layout-types.js';

const CURRENT_VERSION = 1;
const KNOWN_COMPONENTS = new Set<string>(PANEL_COMPONENT_NAMES);
export const INVALID_LAYOUT_RESET_NOTICE =
  'Your saved layout was incompatible with this Studio version, so it was reset to the default arrangement.';

export interface LayoutSanitizationResult {
  layout: PanelLayoutRecord;
  notice?: string;
}

export function sanitizeLayout(input: unknown, ctx: BuildLayoutInput): PanelLayoutRecord {
  return sanitizeLayoutWithDiagnostics(input, ctx).layout;
}

export function sanitizeLayoutWithDiagnostics(
  input: unknown,
  ctx: BuildLayoutInput
): LayoutSanitizationResult {
  if (!isPlausibleLayout(input)) {
    return { layout: buildDefaultLayout(ctx) };
  }
  if (input.version > CURRENT_VERSION) {
    return { layout: buildDefaultLayout(ctx) };
  }
  // Walk + drop unknown component names. Mutation happens on a deep clone
  // so the original (persisted) record stays untouched until a new save.
  const cloned: PanelLayoutRecord = JSON.parse(JSON.stringify(input));
  let droppedAny = false;
  let normalizedActive = false;
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
  }
  if (droppedAny) {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] dropped unknown component names from saved layout');
  }
  if (normalizedActive) {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] normalized invalid active tabs in saved layout');
  }
  return { layout: cloned };
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
  const groups = [shape.columns[1], shape.columns[3], shape.bottomGroup];
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
