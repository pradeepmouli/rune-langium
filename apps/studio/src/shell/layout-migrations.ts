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
 *     empty / broken layout (FR-025).
 *  2. If the input is otherwise valid: walk every node and drop entries
 *     whose `component` isn't in the locked registry, with a console
 *     warning so a regression in the registry shows up in dev.
 */

import type { PanelLayoutRecord } from '../workspace/persistence.js';
import {
  buildDefaultLayout,
  PANEL_COMPONENT_NAMES,
  type BuildLayoutInput
} from './layout-factory.js';

const CURRENT_VERSION = 1;
const KNOWN_COMPONENTS = new Set<string>(PANEL_COMPONENT_NAMES);

export function sanitizeLayout(input: unknown, ctx: BuildLayoutInput): PanelLayoutRecord {
  if (!isPlausibleLayout(input)) {
    return buildDefaultLayout(ctx);
  }
  if (input.version > CURRENT_VERSION) {
    return buildDefaultLayout(ctx);
  }
  // Walk + drop unknown component names. Mutation happens on a deep clone
  // so the original (persisted) record stays untouched until a new save.
  const cloned: PanelLayoutRecord = JSON.parse(JSON.stringify(input));
  let droppedAny = false;
  walkAndDrop(cloned.dockview, () => {
    droppedAny = true;
  });
  if (droppedAny) {
    // eslint-disable-next-line no-console
    console.warn('[layout-migrations] dropped unknown component names from saved layout');
  }
  return cloned;
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
