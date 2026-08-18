// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, type OutputLine } from '../store/output-store.js';
import { useActivityStore, type ActivityEntry } from '../store/activity-store.js';
import { useTelemetrySettingsStore } from '../store/telemetry-settings.js';
import type { TelemetryClient } from './telemetry.js';
import { CURATED_MODEL_IDS } from '@rune-langium/curated-schema';
import { withInstrumentation } from './instrumentation/core.js';

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
  // durationMs producers (model-store.ts, preview-store.ts) compute it as
  // `performance.now() - startedAt`, which is fractional — the wire schema
  // requires an integer (z.number().int()). Without rounding here,
  // client.emit()'s schema validation throws for any span carrying a
  // fractional duration, and flush()'s catch(() => {}) silently discards
  // the WHOLE batch (including any 100%-sampled error entries bundled in
  // it), not just the offending span.
  const roundedDurationMs = durationMs !== undefined ? Math.round(durationMs) : undefined;
  return { op, subject, durationMs: roundedDurationMs, level, opId, signature };
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
//
// `modelLoad` alone is NOT sufficient: it also fires for CUSTOM-URL model
// sources (createCustomModelSource in model-registry.ts), whose `source.id`
// is `custom-${hashUrl(repoUrl)}` — a deterministic, dictionary-matchable
// hash of a user's own repository URL, not a curated id. Every `modelLoad`
// subject must therefore ALSO be checked against the real curated-id set,
// not just the op name.
const SAFE_SUBJECT_OPS = new Set(['modelLoad']);
const CURATED_MODEL_ID_SET = new Set<string>(CURATED_MODEL_IDS);

function safeSubject(op: string, subject: string | undefined): string | undefined {
  if (!SAFE_SUBJECT_OPS.has(op) || subject === undefined) return undefined;
  return CURATED_MODEL_ID_SET.has(subject) ? subject : undefined;
}

function maxId(ids: Array<{ id: number }>): number {
  let max = 0;
  for (const item of ids) if (item.id > max) max = item.id;
  return max;
}

// Module-scope, not per-install: App.tsx's shipper effect only installs
// once telemetryEnabled resolves true (hydrateTelemetrySettings() is a
// fire-and-forget async read — see App.tsx's own comment), but the
// instrumentation Activity sink (installInstrumentationActivitySink) is
// installed unconditionally at module load in main.tsx, before React even
// mounts. For a RETURNING user whose opt-in is already persisted enabled,
// a namespace-tagged span (e.g. transport-provider.ts's connect-phase
// timing) can complete and land in the Activity store BEFORE this effect
// ever runs. Starting the watermark at "current max" — correct for every
// LATER re-install, where it deliberately avoids re-shipping a backlog
// accumulated while telemetry was off — would permanently skip exactly
// those pre-hydration cold-start spans on the FIRST install of a session.
let hasInstalledBefore = false;

/** Test-only: lets a fresh test simulate "first install of a new browser session" without carrying state across test files/cases. */
// oxlint-disable-next-line rune/no-uninstrumented-export -- test-only reset scaffolding (matches resetInstrumentationForTests's own exemption in instrumentation-core), never called from a real app code path; instrumenting it would just be noise in every test run.
export function resetTelemetryShipperForTests(): void {
  hasInstalledBefore = false;
}

export const installTelemetryShipper = withInstrumentation(
  function installTelemetryShipper(client: Pick<TelemetryClient, 'emit'>): () => void {
    let buffer: Span[] = [];
    // Some ops (e.g. model-store.ts's load success/failure paths) publish the
    // SAME logical event to BOTH output-store and activity-store, sharing one
    // opId — e.g. a failed model load's Output-panel line (severity 'error',
    // 100% sampled) and its paired Activity entry (ok:false -> level 'error',
    // also 100% sampled) would otherwise both get buffered as independent
    // spans, double-counting that single failure in the server-side duration
    // histogram/signature counts (and skewing failure counts relative to
    // successes, which usually only clear ONE store's sampling gate). Track
    // opIds already buffered THIS flush window and keep only the first copy.
    const seenOpIds = new Set<number>();
    // Watermarks are the highest `id` seen so far (each store's own
    // monotonically-increasing counter), NOT array length. Both stores are
    // ring buffers that trim from the front once they hit their cap
    // (MAX_LINES=500 / MAX_ENTRIES=200), so `length` stops growing forever
    // once a store saturates even though content keeps rotating underneath —
    // a length-based watermark would silently stop capturing new entries.
    // `id` values are never reused and always increase, so they survive
    // rotation as well as growth.
    let lastOutputId = hasInstalledBefore ? maxId(useOutputStore.getState().lines) : 0;
    let lastActivityId = hasInstalledBefore ? maxId(useActivityStore.getState().entries) : 0;
    hasInstalledBefore = true;

    function bufferSpan(span: Span): void {
      if (span.opId !== undefined) {
        if (seenOpIds.has(span.opId)) return;
        seenOpIds.add(span.opId);
      }
      buffer.push(span);
    }

    function flush(): void {
      if (buffer.length === 0) return;
      seenOpIds.clear();
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

    function processOutputState(state: { lines: OutputLine[] }): void {
      const lines: OutputLine[] = state.lines;
      const newLines = lines.filter((line) => line.id > lastOutputId);
      if (newLines.length === 0) return;
      for (const line of newLines) {
        if (line.severity !== 'error' && line.severity !== 'warn' && line.severity !== 'info') continue;
        if (!shouldSample(line.severity)) continue;
        const op = line.op ?? 'output';
        bufferSpan(
          toSpan(line.severity, op, safeSubject(op, line.subject), line.durationMs, line.opId, line.signature)
        );
      }
      lastOutputId = maxId(lines);
      considerFlush();
    }

    function processActivityState(state: { entries: ActivityEntry[] }): void {
      const entries: ActivityEntry[] = state.entries;
      const newEntries = entries.filter((entry) => entry.id > lastActivityId);
      if (newEntries.length === 0) return;
      for (const entry of newEntries) {
        const level = entry.ok ? 'info' : 'error';
        if (!shouldSample(level)) continue;
        bufferSpan(
          toSpan(level, entry.tag, safeSubject(entry.tag, entry.subject), entry.durationMs, entry.opId, entry.signature)
        );
      }
      lastActivityId = maxId(entries);
      considerFlush();
    }

    const unsubOutput = useOutputStore.subscribe(processOutputState);
    const unsubActivity = useActivityStore.subscribe(processActivityState);
    // Zustand's subscribe() only fires on FUTURE state changes — it never
    // replays existing state to a newly-registered listener. Without this
    // catch-up sweep, a first-install watermark of 0 (see hasInstalledBefore
    // above) would still never actually ship anything that arrived before
    // install: the listener simply never runs for entries that predate the
    // subscription. On a later (re-toggle) install this is a harmless no-op
    // — the watermark already equals the current max, so nothing new is
    // found.
    processOutputState(useOutputStore.getState());
    processActivityState(useActivityStore.getState());

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    return () => {
      unsubOutput();
      unsubActivity();
      clearInterval(interval);
    };
    // `client` is a function-bearing object (not serializable) and the return
    // is a cleanup closure — nothing about this call is safe or useful to
    // capture beyond duration/errors.
  },
  { op: 'installTelemetryShipper' }
);
