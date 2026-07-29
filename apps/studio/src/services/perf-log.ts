// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * High-frequency operation timing (a debounced reparse, a workspace
 * autosave — anything that can fire once per keystroke) that has no
 * business rendering in the user-visible Activity/Output panels
 * (op-log.ts): those panels have a 200-entry ring buffer meant for
 * infrequent, meaningful events (LSP connect, model load, a toast), and
 * flooding them with one row per keystroke evicts exactly the entries
 * that ring buffer exists to keep. Kept in its own capped buffer instead,
 * exposed read-only via `window.__runeStudioPerfLog`
 * (perf-log-window-bridge.ts) so prod-ux journeys can poll real
 * completion timing instead of guessing a fixed wait, without touching
 * anything a user actually sees.
 */

export interface PerfLogEntry {
  op: string;
  subject?: string;
  ok: boolean;
  durationMs: number;
  ts: number;
  opId: number;
}

const MAX_ENTRIES = 200;
let entries: PerfLogEntry[] = [];

export function recordPerf(entry: PerfLogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
}

export function getPerfLogSnapshot(): PerfLogEntry[] {
  return entries;
}
