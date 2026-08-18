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
  namespace?: string;
  message?: string;
  /**
   * Explicit `false` suppresses the Toast sink for this record while
   * leaving Activity-panel and telemetry-shipper visibility untouched.
   * Undefined (the default) preserves the original behavior of a
   * namespace-tagged call: both Toast and Activity render it. Use this
   * for calls that are activity/telemetry-worthy but not something a user
   * should see a popup for on every invocation (e.g. a background
   * connection-establish span that fires on every reconnect).
   */
  toast?: boolean;
  ts: number;
}

export type Emit = (record: TelemetryRecord) => void;

const LEVEL_ORDER: Record<Level, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

function noopEmit(): void {
  /* no-op until configureInstrumentation runs */
}

let currentEmit: Emit = noopEmit;

const additionalSinks = new Set<Emit>();

/**
 * Registers an additional sink alongside whatever configureInstrumentation
 * set as the primary emit — every emitted record is forwarded to both.
 * Returns an unregister function; call it on cleanup (e.g. a React
 * component's unmount) so a torn-down consumer stops receiving records.
 * `emit` stays "a plain function reference" — this is a fan-out dispatch
 * list, not a Sink interface/class.
 */
export function addInstrumentationSink(sink: Emit): () => void {
  additionalSinks.add(sink);
  return () => {
    additionalSinks.delete(sink);
  };
}

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
  additionalSinks.clear();
  isEnabledCheck = () => true;
  resetInstrumentationThresholdForTests();
}

// Shared by emitRecord's additionalSinks loop and emitToAdditionalSinksOnly
// below — a throwing sink must never mask the real application error/
// result flowing through withInstrumentation's own try/catch, nor prevent
// sibling sinks (registered independently) from receiving the same record.
function dispatchToSinks(sinks: Iterable<Emit>, record: TelemetryRecord): void {
  for (const sink of sinks) {
    try {
      sink(record);
    } catch {
      /* a sink must never break the app or its siblings */
    }
  }
}

/** Public export — used both internally by withInstrumentation and directly by callers (e.g. InstrumentationErrorBoundary) that hand-build a TelemetryRecord outside the capture/sanitize wrapper machinery. */
export function emitRecord(record: TelemetryRecord): void {
  // Matches this module's own "telemetry must never throw into the app"
  // invariant (see configureInstrumentation) — isolated the same way
  // dispatchToSinks isolates each additional sink.
  try {
    currentEmit(record);
  } catch {
    /* a sink must never break the app or its siblings */
  }
  dispatchToSinks(additionalSinks, record);
}

// Dispatches ONLY to additionalSinks (Activity/Toast), never to
// currentEmit (the primary diagnostic/telemetry-shipping sink — gated by
// the developer's own opt-in and eliminated from prod bundles by design,
// see IS_PROD below). Used exclusively by the notify-only fast path: a
// namespace-tagged call's user-facing notification must reach the user
// regardless of production build mode or telemetry opt-in — see
// docs/superpowers/specs/2026-08-02-instrumentation-multi-sink-design.md.
// Diagnostic capture/shipping (currentEmit) stays properly gated either way.
function emitToAdditionalSinksOnly(record: TelemetryRecord): void {
  dispatchToSinks(additionalSinks, record);
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
  /**
   * Set when the developer knows their own immediate caller wraps this call
   * in a local try/catch that swallows the error (preserving existing UX)
   * — see CodegenProvider.tsx's reportHydrationRetryExhausted for the
   * established pattern. Demotes the emitted error record's level from the
   * default 'error' to 'warn'. A further `errorLevel: 'debug'` demotes it
   * again, for known-noise handled errors not worth even a 'warn'.
   */
  handled?: boolean;
  /** Only meaningful when `handled: true`. */
  errorLevel?: 'warn' | 'debug';
  /**
   * Marks this call as toast/activity-eligible. Presence (not `level`) is
   * the actual gate the Toast/Activity sinks (apps/studio) check — see
   * docs/superpowers/specs/2026-08-02-instrumentation-multi-sink-design.md.
   * Absent by default; only set on calls a developer deliberately promotes.
   */
  namespace?: string;
  /**
   * Optional human-readable override for Toast/Activity display; falls
   * back to `op` when absent — most call sites should leave this unset.
   */
  message?: string;
  /**
   * Set to `false` to keep a namespace-tagged call out of the Toast sink
   * while it still reaches the Activity panel and telemetry-shipper.
   * Undefined (the default) means "toast-eligible", matching every
   * existing namespace-tagged call site's current behavior. See
   * TelemetryRecord.toast's doc comment for the rationale.
   */
  toast?: boolean;
}

let threshold: Level = 'info';

export function setInstrumentationThreshold(level: Level): void {
  threshold = level;
}

export function getInstrumentationThreshold(): Level {
  return threshold;
}

/** Test-only: restores the default threshold between test files. */
export function resetInstrumentationThresholdForTests(): void {
  threshold = 'info';
}

function defaultSanitizeError(err: unknown): SanitizeErrorResult {
  const name = err instanceof Error ? err.name : 'Error';
  return { signature: `${name}:unspecified` };
}

function errorLevelFor(opts: InstrumentationOptions): Level {
  if (!opts.handled) return 'error';
  return opts.errorLevel ?? 'warn';
}

// `bindingContext` lets `.child()`-bound wrappers (Task 3) attach their bound
// context to error records the same way success records do. `dispatch`
// defaults to the normal full fan-out (emitRecord); the notify-only fast
// path below passes emitToAdditionalSinksOnly instead, reusing this exact
// signature/context-extraction logic without duplicating it. `durationMs` is
// optional (callers that never captured a start time, e.g. legacy callers of
// this internal function, simply omit it) but every real call site in this
// module now passes the real elapsed time — a 100%-sampled failure span
// with no duration can't distinguish an immediate rejection from one that
// only failed after a real timeout, which defeats exactly the kind of
// latency investigation this instrumentation exists for.
function emitError(
  op: string,
  opts: InstrumentationOptions,
  err: unknown,
  bindingContext?: unknown,
  dispatch: Emit = emitRecord,
  durationMs?: number
): void {
  const { signature, context } = (opts.sanitizeError ?? defaultSanitizeError)(err);
  dispatch({
    op,
    level: errorLevelFor(opts),
    captured: 0,
    signature,
    context: context ?? bindingContext,
    namespace: opts.namespace,
    message: opts.message,
    toast: opts.toast,
    durationMs,
    ts: Date.now()
  });
}

const identitySanitize = (v: unknown): unknown => v;

// The notify-only fast path: runs when a wrapped call is skipped for
// diagnostic-capture purposes (production build, or the developer's own
// telemetry opt-in is off) BUT the call is namespace-tagged — a developer
// explicitly promoted it to toast/activity-eligible, and that promise must
// hold regardless of build mode or opt-in state. No depth tracking, no
// input/output capture (capture: 0 throughout — Toast/Activity never read
// them), no threshold gating (matches the full path's "errors always emit
// unconditionally" invariant; successes here are always explicitly
// requested via `namespace`, so there's no default-noise concern to gate).
// Dispatches only to additionalSinks (emitToAdditionalSinksOnly) — the
// primary diagnostic/telemetry-shipping sink stays properly gated.
function runNotifyOnly<F extends (...args: any[]) => any>(
  fn: F,
  opts: InstrumentationOptions,
  op: string,
  thisArg: unknown,
  args: unknown[]
): ReturnType<F> {
  // Real elapsed time, not a placeholder: this fast path skips the full
  // wrapper's depth/threshold machinery, but a namespace-tagged call's
  // duration is exactly what a diagnostic span (e.g. a connect-phase
  // timing) exists to report — a hardcoded 0 here would silently defeat
  // that for every production build, since this is the ONLY path
  // namespace-tagged calls take in prod (see makeWithInstrumentation's
  // IS_PROD branch above).
  const start = performance.now();
  try {
    const result = fn.apply(thisArg, args);
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          emitSuccessWithContext(
            op,
            opts.level ?? 'info',
            0,
            args,
            value,
            identitySanitize,
            performance.now() - start,
            undefined,
            opts.namespace,
            opts.message,
            emitToAdditionalSinksOnly,
            opts.toast
          );
          return value;
        },
        (err) => {
          emitError(op, opts, err, undefined, emitToAdditionalSinksOnly, performance.now() - start);
          throw err;
        }
      ) as ReturnType<F>;
    }
    emitSuccessWithContext(
      op,
      opts.level ?? 'info',
      0,
      args,
      result,
      identitySanitize,
      performance.now() - start,
      undefined,
      opts.namespace,
      opts.message,
      emitToAdditionalSinksOnly,
      opts.toast
    );
    return result;
  } catch (err) {
    emitError(op, opts, err, undefined, emitToAdditionalSinksOnly, performance.now() - start);
    throw err;
  }
}

// Dynamic nesting-depth counter — a single shared value, incremented on
// entry and decremented on exit of ANY instrumented call. Approximate
// under concurrent async work (see design doc); used only as a DEFAULT,
// never a hard guarantee — an explicit `level` always wins.
let depth = 0;

function defaultLevelForDepth(): Level {
  if (depth <= 0) return 'debug';
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
      // A namespace-tagged call's user-facing notification must reach the
      // user even here — see runNotifyOnly's own doc comment. Every other
      // call (no namespace, the overwhelming majority) takes the exact
      // same bare `fn.apply` path as before this branch existed.
      if (IS_PROD) {
        if (!opts.namespace) return fn.apply(this, args);
        return runNotifyOnly(fn, opts, op, this, args);
      }
      if (!isEnabledCheck()) {
        if (!opts.namespace) return fn.apply(this, args);
        return runNotifyOnly(fn, opts, op, this, args);
      }
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
              // `|| opts.namespace`: a namespace-tagged success is always
              // explicitly requested by the developer (see runNotifyOnly's
              // own comment) — it must emit regardless of the depth-based
              // default level/threshold, the same way errors already emit
              // unconditionally. Without this, a namespace-tagged success
              // silently misses `clears` at the default depth-0 'debug'
              // level against the 'info' threshold — exactly the kind of
              // environment-dependent silence this whole plan exists to
              // eliminate, just on the success side instead of the error
              // side.
              if (clears || opts.namespace)
                emitSuccessWithContext(
                  op,
                  level,
                  capture,
                  args,
                  value,
                  sanitize,
                  performance.now() - start,
                  context,
                  opts.namespace,
                  opts.message,
                  undefined,
                  opts.toast
                );
              return value;
            },
            (err) => {
              depth--;
              emitError(op, opts, err, context, undefined, performance.now() - start);
              throw err;
            }
          );
        }
        // `|| opts.namespace` — see the identical comment on the async
        // success branch above; same reasoning, sync path.
        if (clears || opts.namespace)
          emitSuccessWithContext(
            op,
            level,
            capture,
            args,
            result,
            sanitize,
            performance.now() - start,
            context,
            opts.namespace,
            opts.message,
            undefined,
            opts.toast
          );
        return result;
      } catch (err) {
        emitError(op, opts, err, context, undefined, performance.now() - start);
        throw err;
      } finally {
        if (!isAsync) depth--;
      }
    };
    // React reads a component's function `.name` for error-boundary
    // componentStack frames and DevTools — without this, every wrapped
    // component (the codemod wraps nearly all of them) shows up as the
    // generic closure name `wrapped`, destroying the diagnostic context
    // this module exists to add. `configurable: true` matches
    // Function.prototype.name's own descriptor, so this behaves exactly
    // like a normal named function to any other introspection.
    Object.defineProperty(wrapped, 'name', { value: op, configurable: true });
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

// `dispatch` defaults to the normal full fan-out (emitRecord); the
// notify-only fast path below passes emitToAdditionalSinksOnly instead,
// always with capture: 0 (Toast/Activity never read input/output).
function emitSuccessWithContext(
  op: string,
  level: Level,
  capture: number,
  args: unknown[],
  output: unknown,
  sanitize: (value: unknown, which: 'input' | 'output') => unknown,
  durationMs: number,
  context: unknown,
  namespace: string | undefined,
  message: string | undefined,
  dispatch: Emit = emitRecord,
  toast?: boolean
): void {
  const record: TelemetryRecord = {
    op,
    level,
    captured: capture,
    ts: Date.now(),
    durationMs,
    context,
    namespace,
    message,
    toast
  };
  if (capture & Capture.Input) record.input = sanitize(args, 'input');
  if (capture & Capture.Output) record.output = sanitize(output, 'output');
  dispatch(record);
}

export const withInstrumentation = makeWithInstrumentation();
