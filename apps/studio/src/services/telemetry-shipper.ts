// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, type OutputLine } from '../store/output-store.js';
import { useActivityStore, type ActivityEntry } from '../store/activity-store.js';
import { useTelemetrySettingsStore } from '../store/telemetry-settings.js';
import type { TelemetryClient } from './telemetry.js';

const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 20;
// Conservative defaults (spec §7: "errors ship at 100%, warns sampled, info
// heavily sampled") — not spec-mandated numbers, tunable without a schema
// change since sampling lives entirely client-side.
const SAMPLE_RATE: Record<'info' | 'warn' | 'error', number> = { error: 1, warn: 0.2, info: 0.02 };

interface Span {
  op: string;
  subject?: string;
  durationMs?: number;
  level: 'info' | 'warn' | 'error';
  signature?: string;
  opId?: number;
}

function toSpan(
  level: 'info' | 'warn' | 'error',
  op: string,
  subject?: string,
  durationMs?: number,
  opId?: number,
  signature?: string
): Span {
  return { op, subject, durationMs, level, opId, signature };
}

function shouldSample(level: 'info' | 'warn' | 'error'): boolean {
  return Math.random() < SAMPLE_RATE[level];
}

// `subject` is a free-form correlator set by whichever op-log producer
// published the entry — most producers never set it, but the ones that do
// aren't all safe to ship: model-store.ts's `modelLoad` subject is a
// curated model id (cdm/fpml/rune-dsl), which the Privacy UI's own promise
// explicitly allows ("curated type fqns are fine"), while preview-store.ts's
// `functionExecute` subject is the model's own function name — user-authored
// model source content, which is exactly what "never scratch workspace
// text" rules out. Rather than trust every current and future producer to
// self-police what it puts in `subject`, this shipper (the one place all of
// it funnels through before leaving the browser) only forwards `subject`
// for an explicit allowlist of ops already vetted as curated-only.
const SAFE_SUBJECT_OPS = new Set(['modelLoad']);

function safeSubject(op: string, subject: string | undefined): string | undefined {
  return SAFE_SUBJECT_OPS.has(op) ? subject : undefined;
}

function maxId(ids: Array<{ id: number }>): number {
  let max = 0;
  for (const item of ids) if (item.id > max) max = item.id;
  return max;
}

/**
 * Subscribes to the SAME two stores op-log.ts already reads (output-store,
 * activity-store) — this is a second READER of existing publish points, not
 * a new logging mechanism. Buffers sampled entries and ships one `op_spans`
 * batch per flush, gated live on the opt-in (re-checked every flush, not
 * just at install time, per the belt-and-suspenders note in Task 2).
 */
export function installTelemetryShipper(client: Pick<TelemetryClient, 'emit'>): () => void {
  let buffer: Span[] = [];
  // Watermarks are the highest `id` seen so far (each store's own
  // monotonically-increasing counter), NOT array length. Both stores are
  // ring buffers that trim from the front once they hit their cap
  // (MAX_LINES=500 / MAX_ENTRIES=200), so `length` stops growing forever
  // once a store saturates even though content keeps rotating underneath —
  // a length-based watermark would silently stop capturing new entries.
  // `id` values are never reused and always increase, so they survive
  // rotation as well as growth.
  let lastOutputId = maxId(useOutputStore.getState().lines);
  let lastActivityId = maxId(useActivityStore.getState().entries);

  function flush(): void {
    if (buffer.length === 0) return;
    if (!useTelemetrySettingsStore.getState().enabled) {
      buffer = [];
      return;
    }
    const spans = buffer.splice(0, buffer.length);
    // Telemetry must never throw into the app (see module doc) — swallow
    // any rejection, including a schema-validation throw from client.emit
    // itself (not just network failures caught inside emit's own try/catch),
    // so it never surfaces as an unhandled rejection that installTelemetryCapture
    // (Task 2) would re-capture and re-queue as noise.
    void client.emit({ event: 'op_spans', spans }).catch(() => {});
  }

  function considerFlush(): void {
    if (buffer.length >= MAX_BATCH) flush();
  }

  const unsubOutput = useOutputStore.subscribe((state) => {
    const lines: OutputLine[] = state.lines;
    const newLines = lines.filter((line) => line.id > lastOutputId);
    if (newLines.length === 0) return;
    for (const line of newLines) {
      if (line.severity !== 'error' && line.severity !== 'warn' && line.severity !== 'info') continue;
      if (!shouldSample(line.severity)) continue;
      const op = line.op ?? 'output';
      buffer.push(toSpan(line.severity, op, safeSubject(op, line.subject), line.durationMs, line.opId, line.signature));
    }
    lastOutputId = maxId(lines);
    considerFlush();
  });

  const unsubActivity = useActivityStore.subscribe((state) => {
    const entries: ActivityEntry[] = state.entries;
    const newEntries = entries.filter((entry) => entry.id > lastActivityId);
    if (newEntries.length === 0) return;
    for (const entry of newEntries) {
      const level = entry.ok ? 'info' : 'error';
      if (!shouldSample(level)) continue;
      buffer.push(toSpan(level, entry.tag, safeSubject(entry.tag, entry.subject), entry.durationMs, entry.opId));
    }
    lastActivityId = maxId(entries);
    considerFlush();
  });

  const interval = setInterval(flush, FLUSH_INTERVAL_MS);

  return () => {
    unsubOutput();
    unsubActivity();
    clearInterval(interval);
  };
}
