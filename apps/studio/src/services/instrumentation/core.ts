// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Isomorphic instrumentation core — no DOM/window/zustand/Node imports.
 * Used identically from browser code, Web Worker code, and Cloudflare
 * Pages Functions code. See docs/superpowers/specs/
 * 2026-08-01-instrumentation-wrapper-design.md for the full design.
 */

export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';

// Plain const object, not `const enum` — see Task 1's Interfaces note
// (isolatedModules + cross-package .d.ts make const enums a hazard here).
export const Capture = {
  Input: 0b01,
  Output: 0b10
} as const;

export interface TelemetryRecord {
  op: string;
  level: Level;
  captured: number;
  input?: unknown;
  output?: unknown;
  subject?: string;
  signature?: string;
  durationMs?: number;
  context?: unknown;
  ts: number;
}

export type Emit = (record: TelemetryRecord) => void;

const LEVEL_ORDER: Record<Level, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

function noopEmit(): void {
  /* no-op until configureInstrumentation runs */
}

let currentEmit: Emit = noopEmit;

/**
 * Sets the module-level sink for the current runtime context. Call exactly
 * once, at each runtime's own entry point (mirrors installTelemetryCapture's
 * bootstrap pattern in telemetry-capture.ts). Before this runs, every
 * instrumented call's emit is silently dropped — never throws, never
 * buffers, matching telemetry-shipper.ts's "telemetry must never throw into
 * the app" invariant.
 */
export function configureInstrumentation(emit: Emit): void {
  currentEmit = emit;
}

/** Test-only: restores the pre-configuration no-op sink between test files. */
export function resetInstrumentationForTests(): void {
  currentEmit = noopEmit;
}

/** Internal — Task 2's withInstrumentation calls this; not exported publicly. */
export function emitRecord(record: TelemetryRecord): void {
  currentEmit(record);
}

export function levelClears(level: Level, threshold: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

/** Test-only export — real callers never construct a TelemetryRecord directly. */
export function __buildRecordForTests(
  op: string,
  level: Level,
  fields: Partial<Omit<TelemetryRecord, 'op' | 'level' | 'ts'>> & { captured: number }
): TelemetryRecord {
  return { op, level, ts: Date.now(), ...fields };
}
