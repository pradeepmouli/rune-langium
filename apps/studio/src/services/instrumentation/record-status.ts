// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { TelemetryRecord } from './core.js';

/**
 * Single derivation of "is this record a failure" for every studio-side
 * sink (Activity, Toast). `signature` is set only by instrumentation-core's
 * emitError, never on the success path — a level-independent discriminator
 * that correctly classifies `handled: true` errors (demoted to warn/debug
 * level but still failures). See docs/superpowers/specs/
 * 2026-08-02-instrumentation-multi-sink-design.md.
 */
// Deliberately NOT wrapped in withInstrumentation: every sink
// (activity-sink.ts, StudioToastProvider.tsx) calls this synchronously from
// INSIDE core.ts's emitRecord dispatch loop. Wrapping it would make every
// single telemetry record's sink dispatch re-enter emitRecord to report on
// itself — pure overhead/noise for a one-line predicate, not a real
// instrumentation boundary.
// oxlint-disable-next-line rune/no-uninstrumented-export
export function isFailureRecord(record: TelemetryRecord): boolean {
  return record.signature !== undefined;
}
