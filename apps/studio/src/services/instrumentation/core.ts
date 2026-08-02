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

/** Test-only: restores the pre-configuration no-op sink and default threshold between test files. */
export function resetInstrumentationForTests(): void {
  currentEmit = noopEmit;
  threshold = 'warn';
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

export interface SanitizeErrorResult {
  signature: string;
  context?: unknown;
}

export interface InstrumentationOptions {
  op?: string;
  level?: Level;
  capture?: number;
  sanitize?: (value: unknown, which: 'input' | 'output') => unknown;
  sanitizeError?: (err: unknown) => SanitizeErrorResult;
}

let threshold: Level = 'warn';

export function setInstrumentationThreshold(level: Level): void {
  threshold = level;
}

export function getInstrumentationThreshold(): Level {
  return threshold;
}

/** Test-only: restores the default threshold between test files. */
export function resetInstrumentationThresholdForTests(): void {
  threshold = 'warn';
}

function defaultSanitizeError(err: unknown): SanitizeErrorResult {
  const name = err instanceof Error ? err.name : 'Error';
  return { signature: `${name}:unspecified` };
}

export function withInstrumentation<F extends (...args: any[]) => any>(fn: F, opts: InstrumentationOptions = {}): F {
  const op = opts.op ?? fn.name ?? 'anonymous';
  const capture = opts.capture ?? 0;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const level = opts.level ?? 'info'; // depth-based default lands in Task 3
    const clears = levelClears(level, threshold);
    const sanitize = opts.sanitize ?? ((v: unknown) => v);
    const start = performance.now();
    try {
      const result = fn.apply(this, args);
      // Only emit success if at/above threshold
      if (clears) {
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              emitSuccess(op, level, capture, args, value, sanitize, performance.now() - start);
              return value;
            },
            (err) => {
              emitError(op, opts, err);
              throw err;
            }
          );
        }
        emitSuccess(op, level, capture, args, result, sanitize, performance.now() - start);
      }
      return result;
    } catch (err) {
      // Errors ALWAYS emit, regardless of threshold
      emitError(op, opts, err);
      throw err;
    }
  };
  return wrapped as F;
}

function emitSuccess(
  op: string,
  level: Level,
  capture: number,
  args: unknown[],
  output: unknown,
  sanitize: (value: unknown, which: 'input' | 'output') => unknown,
  durationMs: number
): void {
  const record: TelemetryRecord = { op, level, captured: capture, ts: Date.now(), durationMs };
  if (capture & Capture.Input) record.input = sanitize(args, 'input');
  if (capture & Capture.Output) record.output = sanitize(output, 'output');
  emitRecord(record);
}

// `bindingContext` is unused until Task 3 introduces `.child()` — declared now
// so error records carry the bound context the same way success records do.
function emitError(op: string, opts: InstrumentationOptions, err: unknown, bindingContext?: unknown): void {
  const { signature, context } = (opts.sanitizeError ?? defaultSanitizeError)(err);
  emitRecord({ op, level: 'error', captured: 0, signature, context: context ?? bindingContext, ts: Date.now() });
}
