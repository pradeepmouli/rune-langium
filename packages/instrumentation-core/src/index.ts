// SPDX-License-Identifier: MIT
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

// Module scope in core.ts:
// - Vite/rolldown builds (browser + both workers): `import.meta.env` is
//   statically replaced, so IS_PROD folds to a build-time constant and the
//   instrumentation branch below it is eliminated from prod bundles.
// - Non-Vite runtimes (Pages Functions, Node): `import.meta.env` is
//   undefined; the optional chain makes IS_PROD a safe runtime `false`
//   (their own gates — env binding / threshold — still apply).
// - The cast keeps this type-checking under tsconfigs without vite/client.
const IS_PROD = (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true;

let isEnabledCheck: () => boolean = () => true;

/**
 * Sets the module-level sink for the current runtime context. Call exactly
 * once, at each runtime's own entry point (mirrors installTelemetryCapture's
 * bootstrap pattern in telemetry-capture.ts). Before this runs, every
 * instrumented call's emit is silently dropped — never throws, never
 * buffers, matching telemetry-shipper.ts's "telemetry must never throw into
 * the app" invariant.
 *
 * `isEnabled` is an injected runtime opt-in check (defaulting to always-on)
 * rather than a direct zustand import — core.ts must stay isomorphic since
 * Cloudflare Functions and (post-Task-9) Node consumers can't import a
 * browser zustand store.
 */
export function configureInstrumentation(emit: Emit, isEnabled: () => boolean = () => true): void {
  currentEmit = emit;
  isEnabledCheck = isEnabled;
}

/** Test-only: restores the pre-configuration no-op sink and default threshold between test files. */
export function resetInstrumentationForTests(): void {
  currentEmit = noopEmit;
  isEnabledCheck = () => true;
  resetInstrumentationThresholdForTests();
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

// `bindingContext` lets `.child()`-bound wrappers (Task 3) attach their bound
// context to error records the same way success records do.
function emitError(op: string, opts: InstrumentationOptions, err: unknown, bindingContext?: unknown): void {
  const { signature, context } = (opts.sanitizeError ?? defaultSanitizeError)(err);
  emitRecord({ op, level: 'error', captured: 0, signature, context: context ?? bindingContext, ts: Date.now() });
}

// Dynamic nesting-depth counter — a single shared value, incremented on
// entry and decremented on exit of ANY instrumented call. Approximate
// under concurrent async work (see design doc); used only as a DEFAULT,
// never a hard guarantee — an explicit `level` always wins.
let depth = 0;

function defaultLevelForDepth(): Level {
  if (depth <= 0) return 'info';
  if (depth <= 2) return 'debug';
  return 'trace';
}

interface ChildBinding {
  context?: unknown;
  level?: Level;
  parent?: ChildBinding;
}

function resolveLevel(binding: ChildBinding | undefined, explicit: Level | undefined): Level {
  if (explicit) return explicit;
  for (let b = binding; b; b = b.parent) {
    if (b.level) return b.level;
  }
  return defaultLevelForDepth();
}

function resolveContext(binding: ChildBinding | undefined): unknown {
  return binding?.context;
}

function makeWithInstrumentation(binding?: ChildBinding) {
  function bound<F extends (...args: any[]) => any>(fn: F, opts: InstrumentationOptions = {}): F {
    const op = opts.op ?? fn.name ?? 'anonymous';
    const capture = opts.capture ?? 0;
    const context = resolveContext(binding);
    const wrapped = function (this: unknown, ...args: unknown[]) {
      if (IS_PROD) return fn.apply(this, args);
      if (!isEnabledCheck()) return fn.apply(this, args);
      const level = resolveLevel(binding, opts.level);
      const clears = levelClears(level, threshold);
      // NO early `if (!clears) return fn.apply(...)` here — Task 2's review
      // caught exactly this shape as a real bug (it makes error-record
      // emission conditional on threshold, which the Global Constraints
      // forbid) and fixed it for the base wrapper by always running `fn`
      // inside the try/catch and gating only SUCCESS emission on `clears`.
      // For THIS depth-tracking wrapper specifically, the early return would
      // ALSO have been a second, independent bug: `depth++` sits below it, so
      // a below-threshold call would never increment depth, silently hiding
      // its own nested calls' true nesting level. `clears` therefore now
      // gates ONLY the `emitSuccessWithContext` calls below, never whether
      // `fn` runs inside the try, never whether `depth` is tracked, and never
      // whether an error/rejection is captured.
      const sanitize = opts.sanitize ?? ((v: unknown) => v);
      const start = performance.now();
      depth++;
      // `isAsync` guards the `finally` below: when fn returns a Promise, depth
      // must stay incremented until the promise actually SETTLES (the `.then`/
      // catch callbacks below own decrementing it then) — not when this
      // synchronous wrapper call returns the still-pending promise. Without
      // this flag, `finally` (which always runs on the way out of `try`, even
      // past an early `return`) would decrement depth immediately on handoff,
      // undercounting nesting depth for any async call with async work still
      // in flight beneath it.
      let isAsync = false;
      try {
        const result = fn.apply(this, args);
        if (result instanceof Promise) {
          isAsync = true;
          return result.then(
            (value) => {
              depth--;
              if (clears)
                emitSuccessWithContext(op, level, capture, args, value, sanitize, performance.now() - start, context);
              return value;
            },
            (err) => {
              depth--;
              emitError(op, opts, err, context);
              throw err;
            }
          );
        }
        if (clears)
          emitSuccessWithContext(op, level, capture, args, result, sanitize, performance.now() - start, context);
        return result;
      } catch (err) {
        emitError(op, opts, err, context);
        throw err;
      } finally {
        if (!isAsync) depth--;
      }
    };
    return wrapped as F;
  }
  bound.child = (childContext: unknown, childOpts: { level?: Level } = {}) =>
    makeWithInstrumentation({ context: childContext, level: childOpts.level, parent: binding });
  (['trace', 'debug', 'info', 'warn'] as const).forEach((lvl) => {
    (bound as any)[lvl] = <F extends (...args: any[]) => any>(fn: F, opts: InstrumentationOptions = {}) =>
      bound(fn, { ...opts, level: lvl });
  });
  return bound as typeof bound & {
    child: typeof bound.child;
    trace: <F extends (...args: any[]) => any>(fn: F, opts?: InstrumentationOptions) => F;
    debug: <F extends (...args: any[]) => any>(fn: F, opts?: InstrumentationOptions) => F;
    info: <F extends (...args: any[]) => any>(fn: F, opts?: InstrumentationOptions) => F;
    warn: <F extends (...args: any[]) => any>(fn: F, opts?: InstrumentationOptions) => F;
  };
}

function emitSuccessWithContext(
  op: string,
  level: Level,
  capture: number,
  args: unknown[],
  output: unknown,
  sanitize: (value: unknown, which: 'input' | 'output') => unknown,
  durationMs: number,
  context: unknown
): void {
  const record: TelemetryRecord = { op, level, captured: capture, ts: Date.now(), durationMs, context };
  if (capture & Capture.Input) record.input = sanitize(args, 'input');
  if (capture & Capture.Output) record.output = sanitize(output, 'output');
  emitRecord(record);
}

export const withInstrumentation = makeWithInstrumentation();
