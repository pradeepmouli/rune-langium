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
  opId?: number
): Span {
  return { op, subject, durationMs, level, opId };
}

function shouldSample(level: 'info' | 'warn' | 'error'): boolean {
  return Math.random() < SAMPLE_RATE[level];
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
  let lastOutputLen = useOutputStore.getState().lines.length;
  let lastActivityLen = useActivityStore.getState().entries.length;

  function flush(): void {
    if (buffer.length === 0) return;
    if (!useTelemetrySettingsStore.getState().enabled) {
      buffer = [];
      return;
    }
    const spans = buffer.splice(0, buffer.length);
    void client.emit({ event: 'op_spans', spans });
  }

  function considerFlush(): void {
    if (buffer.length >= MAX_BATCH) flush();
  }

  const unsubOutput = useOutputStore.subscribe((state) => {
    const lines: OutputLine[] = state.lines;
    if (lines.length <= lastOutputLen) {
      lastOutputLen = lines.length;
      return;
    }
    for (const line of lines.slice(lastOutputLen)) {
      if (line.severity !== 'error' && line.severity !== 'warn' && line.severity !== 'info') continue;
      if (!shouldSample(line.severity)) continue;
      buffer.push(toSpan(line.severity, line.op ?? 'output', line.subject, line.durationMs, line.opId));
    }
    lastOutputLen = lines.length;
    considerFlush();
  });

  const unsubActivity = useActivityStore.subscribe((state) => {
    const entries: ActivityEntry[] = state.entries;
    if (entries.length <= lastActivityLen) {
      lastActivityLen = entries.length;
      return;
    }
    for (const entry of entries.slice(lastActivityLen)) {
      const level = entry.ok ? 'info' : 'error';
      if (!shouldSample(level)) continue;
      buffer.push(toSpan(level, entry.tag, entry.subject, entry.durationMs, entry.opId));
    }
    lastActivityLen = entries.length;
    considerFlush();
  });

  const interval = setInterval(flush, FLUSH_INTERVAL_MS);

  return () => {
    unsubOutput();
    unsubActivity();
    clearInterval(interval);
  };
}
