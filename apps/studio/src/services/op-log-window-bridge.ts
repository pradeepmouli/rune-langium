// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getOpLogSnapshot, type OpLogEntry } from './op-log.js';

export interface RuneStudioOpLogBridge {
  snapshot(): OpLogEntry[];
}

declare global {
  interface Window {
    __runeStudioOpLog?: RuneStudioOpLogBridge;
  }
}

/**
 * Installs an always-on, read-only window global exposing the studio's
 * operation log as structured JSON — unlike `test-api.ts`, this is NOT
 * gated by `import.meta.env.MODE`, so it works against the real production
 * build. It exposes nothing beyond what the Activity/Output panels already
 * render; there is no write method.
 */
export function installOpLogWindowBridge(): void {
  window.__runeStudioOpLog = {
    snapshot: getOpLogSnapshot
  };
}
