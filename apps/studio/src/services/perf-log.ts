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

/**
 * The opId most recently allocated for each `op`, updated synchronously
 * the moment the operation starts (before any await). A caller (e.g. a
 * prod-ux journey) that triggers an edit and immediately reads this can
 * learn exactly which opId corresponds to the operation IT triggered,
 * then wait for that exact opId to complete (`PerfLogEntry.opId` on the
 * matching snapshot entry) — the only race-free way to correlate a
 * specific edit to a specific completion when multiple instances of the
 * same op (e.g. several `workspaceSave` calls from rapid edits) can be in
 * flight and completing out of order.
 */
const lastStartedOpId = new Map<string, number>();

export function recordPerfStart(op: string, opId: number): void {
  lastStartedOpId.set(op, opId);
}

export function getLastStartedOpId(op: string): number | undefined {
  return lastStartedOpId.get(op);
}

export function recordPerf(entry: PerfLogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
}

export function getPerfLogSnapshot(): PerfLogEntry[] {
  return entries;
}
