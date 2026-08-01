# Repo-Wide Instrumentation Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument every function across `apps/studio`'s three runtimes (browser, Web Workers, Cloudflare Pages Functions) with a level-gated capture-and-rethrow wrapper, reusing the existing telemetry pipe, so a future failure of PR #461's shape is a log line instead of a multi-hour re-investigation.

**Architecture:** One isomorphic core module (`configureInstrumentation`/`withInstrumentation`) with a plain-function `emit` sink configured once per runtime at bootstrap. `level` (not selective wrapping) gates what actually runs past a cheap short-circuit check. Wiring follows the codebase's existing shape: native TS 5.x method decorators for the already-class-based codegen emitters, a one-time `ts-morph` codemod (+ an oxlint rule to prevent regression) for everything function-based, including React components.

**Tech Stack:** TypeScript 5.9 (native decorators, no `experimentalDecorators`), `ts-morph` (new devDependency), existing `zustand` stores, existing `oxlint` custom plugin (`oxlint-plugins/rune.mjs`), existing telemetry pipe (`output-store.ts` → `telemetry-shipper.ts` → `apps/telemetry-worker`).

## Global Constraints

- No `Sink` interface/class anywhere — `emit` is always a plain `(record: TelemetryRecord) => void` function reference, set once via `configureInstrumentation()`.
- `withInstrumentation` never swallows a thrown error: always builds and emits an error-level record (unconditionally — `error` always clears the threshold) via `sanitizeError`, then always rethrows the original error unchanged. There is no `reportExhaustion()` — exhaustion is an ordinary `throw` of a named `Error` subclass through the same wrapper.
- `sanitize`/`sanitizeError` are mandatory, per-callsite parameters — never a default that captures a raw value. This is non-negotiable: TypeScript types are erased at runtime and cannot distinguish curated-safe data from user-authored content.
- Do NOT add OpenTelemetry, Sentry, or pino as dependencies.
- Do NOT migrate any function-based code (React components, `apps/studio/src` services/stores) to classes.
- Do NOT write a `rolldown-vite`/Rollup bundler AST-transform plugin. The `ts-morph` codemod (a one-time script producing ordinary, reviewable committed source) is the only automated-wiring mechanism for free functions.
- `op` defaults to the wrapped function's own `.name` when not given explicitly.
- The dynamic nesting-depth counter is a single shared module-level counter — an approximation under concurrent async work, acceptable as a *default* only; an explicit `level` always overrides it.
- Licensing: every new/modified file under `apps/studio/**` gets the `FSL-1.1-ALv2` SPDX header (`// SPDX-License-Identifier: FSL-1.1-ALv2` + `// Copyright (c) 2026 Pradeep Mouli`); every new/modified file under `packages/**` gets `MIT` (`// SPDX-License-Identifier: MIT` + the same copyright line).
- Browser path must keep `telemetry-shipper.ts`'s existing `safeSubject`-style allowlist as a second privacy gate — do not remove or bypass it.
- Spec: `docs/superpowers/specs/2026-08-01-instrumentation-wrapper-design.md` — every task below implements a specific section of it; consult it for the full reasoning behind a constraint if a step feels under-motivated.

---

### Task 1: Core types, `buildRecord`, and `configureInstrumentation`

**Files:**
- Create: `apps/studio/src/services/instrumentation/core.ts`
- Test: `apps/studio/test/services/instrumentation/core.test.ts`

**Interfaces:**
- Produces: `Level` (`'trace'|'debug'|'info'|'warn'|'error'`), `Capture` (`const enum { Input = 0b01, Output = 0b10 }`), `TelemetryRecord`, `Emit`, `configureInstrumentation(emit: Emit): void`, `resetInstrumentationForTests(): void` (test-only reset, mirrors how `useTelemetrySettingsStore` resets between test files).

- [ ] **Step 1: Write the failing tests**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  Capture,
  configureInstrumentation,
  resetInstrumentationForTests,
  __buildRecordForTests
} from '../../../src/services/instrumentation/core.js';

afterEach(() => {
  resetInstrumentationForTests();
});

describe('configureInstrumentation', () => {
  it('routes buildRecord output to the configured emit function', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    const record = __buildRecordForTests('testOp', 'info', { captured: Capture.Input, input: 'x' });
    expect(emitted).toEqual([]);
    // buildRecord alone does not emit — emit is a separate, explicit call.
    expect(record.op).toBe('testOp');
    expect(record.level).toBe('info');
    expect(record.captured).toBe(Capture.Input);
    expect(record.input).toBe('x');
    expect(typeof record.ts).toBe('number');
  });

  it('defaults to a silent no-op emit before configureInstrumentation is ever called', () => {
    // resetInstrumentationForTests() in afterEach guarantees a clean slate; this
    // test runs BEFORE any configure call in this suite has a chance to leak in.
    resetInstrumentationForTests();
    expect(() => {
      const record = __buildRecordForTests('unconfigured', 'error', { captured: 0 });
      // Calling the current (default no-op) emit must never throw.
      // core.ts exposes the current emit only indirectly via withInstrumentation
      // in Task 2 — here we just confirm buildRecord itself never throws.
      void record;
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/core.test.ts`
Expected: FAIL — `Cannot find module '../../../src/services/instrumentation/core.js'`

- [ ] **Step 3: Implement `core.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Isomorphic instrumentation core — no DOM/window/zustand/Node imports.
 * Used identically from browser code, Web Worker code, and Cloudflare
 * Pages Functions code. See docs/superpowers/specs/
 * 2026-08-01-instrumentation-wrapper-design.md for the full design.
 */

export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export const enum Capture {
  Input = 0b01,
  Output = 0b10
}

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/core.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/core.ts apps/studio/test/services/instrumentation/core.test.ts
git commit -m "feat(studio): instrumentation core types, buildRecord, configureInstrumentation"
```

---

### Task 2: `withInstrumentation` — level-gated wrap, capture, sanitize, always-rethrow

**Files:**
- Modify: `apps/studio/src/services/instrumentation/core.ts`
- Test: `apps/studio/test/services/instrumentation/with-instrumentation.test.ts`

**Interfaces:**
- Consumes: `Level`, `Capture`, `TelemetryRecord`, `emitRecord`, `levelClears` from Task 1.
- Produces: `InstrumentationOptions`, `withInstrumentation(fn, opts?): typeof fn`, `getInstrumentationThreshold()`/`setInstrumentationThreshold(level)` (module-level threshold, defaults to `'warn'` — deliberately conservative so `trace`/`debug` never fire unless a caller explicitly lowers it for troubleshooting).

- [ ] **Step 1: Write the failing tests**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Capture,
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';

afterEach(() => {
  resetInstrumentationForTests();
});

describe('withInstrumentation', () => {
  it('below-threshold calls skip all instrumentation work and just run fn', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // only errors clear
    const sanitize = vi.fn((v: unknown) => v);
    const wrapped = withInstrumentation((x: number) => x + 1, {
      op: 'addOne',
      level: 'info',
      capture: Capture.Input | Capture.Output,
      sanitize
    });
    expect(wrapped(41)).toBe(42);
    expect(emitted).toEqual([]);
    expect(sanitize).not.toHaveBeenCalled();
  });

  it('at-or-above-threshold success calls sanitize and emit for captured parts', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation((x: number) => x + 1, {
      op: 'addOne',
      level: 'info',
      capture: Capture.Input | Capture.Output,
      sanitize: (v) => v
    });
    expect(wrapped(41)).toBe(42);
    expect(emitted).toEqual([
      expect.objectContaining({ op: 'addOne', level: 'info', captured: Capture.Input | Capture.Output, input: [41], output: 42 })
    ]);
  });

  it('a thrown error ALWAYS emits an error-level record regardless of threshold, then rethrows unchanged', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // even the strictest threshold
    const boom = new Error('boom');
    const wrapped = withInstrumentation(
      () => {
        throw boom;
      },
      { op: 'explode', level: 'trace', sanitizeError: (e) => ({ signature: 'Error:boom', context: undefined }) }
    );
    expect(() => wrapped()).toThrow(boom);
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'error', signature: 'Error:boom' })]);
  });

  it('never swallows — there is no way to make withInstrumentation NOT rethrow', () => {
    configureInstrumentation(() => {});
    const wrapped = withInstrumentation(() => {
      throw new Error('always propagates');
    }, { op: 'x', sanitizeError: () => ({ signature: 'x' }) });
    expect(() => wrapped()).toThrow('always propagates');
  });

  it('op defaults to fn.name when not given', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    function myNamedFunction(): void {}
    const wrapped = withInstrumentation(myNamedFunction, { level: 'info' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'myNamedFunction' })]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/with-instrumentation.test.ts`
Expected: FAIL — `withInstrumentation`/`setInstrumentationThreshold` not exported

- [ ] **Step 3: Implement `withInstrumentation` (append to `core.ts`)**

```ts
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
    if (!clears) {
      return fn.apply(this, args);
    }
    const sanitize = opts.sanitize ?? ((v: unknown) => v);
    const start = performance.now();
    try {
      const result = fn.apply(this, args);
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
      return result;
    } catch (err) {
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

function emitError(op: string, opts: InstrumentationOptions, err: unknown): void {
  const { signature, context } = (opts.sanitizeError ?? defaultSanitizeError)(err);
  emitRecord({ op, level: 'error', captured: 0, signature, context, ts: Date.now() });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/with-instrumentation.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/core.ts apps/studio/test/services/instrumentation/with-instrumentation.test.ts
git commit -m "feat(studio): withInstrumentation — level-gated capture, sanitize, always-rethrow"
```

---

### Task 3: Dynamic depth default level, `.child()` context/level binding, level-named sugar

**Files:**
- Modify: `apps/studio/src/services/instrumentation/core.ts`
- Test: `apps/studio/test/services/instrumentation/with-instrumentation-child.test.ts`

**Interfaces:**
- Consumes: `withInstrumentation`, `InstrumentationOptions`, `Level` from Tasks 1–2.
- Produces: `withInstrumentation.child(baseContext, opts?)`, `withInstrumentation.trace/.debug/.info/.warn(fn, opts?)`.

- [ ] **Step 1: Write the failing tests**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  Capture,
  configureInstrumentation,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';

afterEach(() => {
  resetInstrumentationForTests();
  resetInstrumentationThresholdForTests();
});

describe('withInstrumentation.child', () => {
  it('merges baseContext into every call made through the bound instance', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    const moduleScoped = withInstrumentation.child({ context: { module: 'codegen-worker' } });
    const wrapped = moduleScoped((x: number) => x, { op: 'passthrough', level: 'info' });
    wrapped(1);
    expect(emitted).toEqual([expect.objectContaining({ op: 'passthrough', context: { module: 'codegen-worker' } })]);
  });

  it('a level set on .child() is inherited by wrapped calls that do not specify their own', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('debug');
    const verbose = withInstrumentation.child({}, { level: 'debug' });
    const wrapped = verbose(() => 1, { op: 'quiet' }); // no explicit level — inherits 'debug'
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'quiet', level: 'debug' })]);
  });

  it('an explicit level at the wrap site overrides an inherited .child() level', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('warn');
    const verbose = withInstrumentation.child({}, { level: 'debug' });
    const wrapped = verbose(() => 1, { op: 'loud', level: 'warn' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'loud', level: 'warn' })]);
  });
});

describe('withInstrumentation level-named sugar', () => {
  it('.debug(fn, opts) is equivalent to withInstrumentation(fn, { ...opts, level: "debug" })', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('debug');
    const wrapped = withInstrumentation.debug(() => 1, { op: 'viaSugar' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'viaSugar', level: 'debug' })]);
  });
});

describe('dynamic nesting-depth default level', () => {
  it('a top-level call (no instrumented calls above it) defaults to info', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace'); // let everything through so the DEFAULT is visible
    const wrapped = withInstrumentation(() => 1, { op: 'shallow' }); // no explicit level
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'shallow', level: 'info' })]);
  });

  it('a call made from inside another instrumented call defaults lower (debug, not info)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const inner = withInstrumentation(() => 1, { op: 'inner' }); // no explicit level
    const outer = withInstrumentation(() => inner(), { op: 'outer' }); // no explicit level
    outer();
    const innerRecord = emitted.find((r: any) => r.op === 'inner') as any;
    expect(innerRecord.level).toBe('debug');
  });

  it('depth is correctly decremented after a synchronous call returns, so a later top-level call is still info (regression: a prior version leaked depth on every sync call)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(() => 1, { op: 'repeat' });
    wrapped();
    wrapped();
    wrapped();
    expect(emitted.every((r: any) => r.level === 'info')).toBe(true);
  });

  it('depth is correctly decremented after an async call settles, not before', async () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(async () => 1, { op: 'asyncRepeat' });
    await wrapped();
    await wrapped();
    expect(emitted.every((r: any) => r.level === 'info')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/with-instrumentation-child.test.ts`
Expected: FAIL — `withInstrumentation.child`/`.debug` are `undefined`

- [ ] **Step 3: Implement depth tracking, `.child()`, and level-named sugar (append to `core.ts`)**

```ts
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
      const level = resolveLevel(binding, opts.level);
      const clears = levelClears(level, threshold);
      if (!clears) return fn.apply(this, args);
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
              emitSuccessWithContext(op, level, capture, args, value, sanitize, performance.now() - start, context);
              return value;
            },
            (err) => {
              depth--;
              emitError(op, opts, err);
              throw err;
            }
          );
        }
        emitSuccessWithContext(op, level, capture, args, result, sanitize, performance.now() - start, context);
        return result;
      } catch (err) {
        emitError(op, opts, err);
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
```

Replace the plain `export function withInstrumentation` from Task 2 with:

```ts
export const withInstrumentation = makeWithInstrumentation();
```

(Delete Task 2's standalone `withInstrumentation` function body — `makeWithInstrumentation()` with no binding reproduces the exact same behavior as its base case, so Task 2's tests keep passing unmodified.)

- [ ] **Step 4: Run all instrumentation tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/`
Expected: PASS (all tests from Tasks 1–3)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/core.ts apps/studio/test/services/instrumentation/with-instrumentation-child.test.ts
git commit -m "feat(studio): depth-based default level, .child() binding, level-named sugar"
```

---

### Task 4: Browser sink + bootstrap wiring

**Files:**
- Create: `apps/studio/src/services/instrumentation/browser-sink.ts`
- Modify: `apps/studio/src/main.tsx`
- Test: `apps/studio/test/services/instrumentation/browser-sink.test.ts`

**Interfaces:**
- Consumes: `TelemetryRecord`, `configureInstrumentation` (Task 1); `addLine`, `fmtLine` from `apps/studio/src/store/output-store.ts` (existing, unmodified).
- Produces: `installInstrumentationBrowserSink(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutputStore } from '../../../src/store/output-store.js';
import {
  Capture,
  resetInstrumentationForTests,
  withInstrumentation,
  setInstrumentationThreshold,
  resetInstrumentationThresholdForTests
} from '../../../src/services/instrumentation/core.js';
import { installInstrumentationBrowserSink } from '../../../src/services/instrumentation/browser-sink.js';

beforeEach(() => {
  useOutputStore.setState({ lines: [] });
  resetInstrumentationForTests();
  resetInstrumentationThresholdForTests();
});

describe('installInstrumentationBrowserSink', () => {
  it('routes a TelemetryRecord into useOutputStore.addLine with the mapped fields', () => {
    installInstrumentationBrowserSink();
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, {
      op: 'browserOp',
      level: 'info',
      capture: Capture.Output,
      sanitize: (v) => v
    });
    wrapped();
    const lines = useOutputStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ op: 'browserOp', severity: 'info' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/browser-sink.test.ts`
Expected: FAIL — `browser-sink.js` module not found

- [ ] **Step 3: Implement the browser sink**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, fmtLine } from '../../store/output-store.js';
import { configureInstrumentation, type TelemetryRecord } from './core.js';

/**
 * Wires the instrumentation core's emit sink to the SAME addLine op-log
 * telemetry-shipper.ts already reads — this is a new PRODUCER into the
 * existing pipe, not a second channel. Call once at browser bootstrap
 * (apps/studio/src/main.tsx), mirroring installTelemetryCapture().
 */
export function installInstrumentationBrowserSink(): void {
  configureInstrumentation((record: TelemetryRecord) => {
    const addLine = useOutputStore.getState().addLine;
    const severity = record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : 'info';
    addLine(fmtLine(record.op, record.subject ?? ''), severity, {
      op: record.op,
      subject: record.subject,
      signature: record.signature,
      durationMs: record.durationMs
    });
  });
}
```

- [ ] **Step 4: Wire into `main.tsx` and run test to verify it passes**

In `apps/studio/src/main.tsx`, alongside the existing `install*` bootstrap calls:

```ts
import { installInstrumentationBrowserSink } from './services/instrumentation/browser-sink.js';
// ...
installInstrumentationBrowserSink();
```

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/browser-sink.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/browser-sink.ts apps/studio/src/main.tsx apps/studio/test/services/instrumentation/browser-sink.test.ts
git commit -m "feat(studio): wire instrumentation core to the existing browser telemetry pipe"
```

---

### Task 5: Worker sink + main-thread relay

**Files:**
- Create: `apps/studio/src/services/instrumentation/worker-sink.ts`
- Modify: `apps/studio/src/workers/parser-worker.ts`, `apps/studio/src/workers/codegen-worker.ts`, `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Test: `apps/studio/test/services/instrumentation/worker-sink.test.ts`

**Interfaces:**
- Consumes: `configureInstrumentation`, `TelemetryRecord` (Task 1); the browser sink's mapping logic (Task 4, reused, not duplicated).
- Produces: `installInstrumentationWorkerSink(post: (msg: unknown) => void): void`; a `{ type: 'telemetry:record', record: TelemetryRecord }` message shape.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { installInstrumentationWorkerSink } from '../../../src/services/instrumentation/worker-sink.js';
import { configureInstrumentation, resetInstrumentationForTests } from '../../../src/services/instrumentation/core.js';

describe('installInstrumentationWorkerSink', () => {
  it('posts a telemetry:record message via the given post function', () => {
    resetInstrumentationForTests();
    const posted: unknown[] = [];
    installInstrumentationWorkerSink((msg) => posted.push(msg));
    const emit = (globalThis as any).__lastConfiguredEmit; // not real — see Step 3 for the real assertion shape
  });
});
```

(Rewritten in Step 3 once the real export shape is fixed — see the actual test below.)

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { installInstrumentationWorkerSink } from '../../../src/services/instrumentation/worker-sink.js';
import {
  Capture,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';

describe('installInstrumentationWorkerSink', () => {
  it('posts a telemetry:record message carrying the TelemetryRecord via the given post function', () => {
    resetInstrumentationForTests();
    resetInstrumentationThresholdForTests();
    const posted: unknown[] = [];
    installInstrumentationWorkerSink((msg) => posted.push(msg));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, { op: 'workerOp', level: 'info', capture: Capture.Output, sanitize: (v) => v });
    wrapped();
    expect(posted).toEqual([{ type: 'telemetry:record', record: expect.objectContaining({ op: 'workerOp' }) }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/worker-sink.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the worker sink**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { configureInstrumentation, type TelemetryRecord } from './core.js';

/**
 * Wires the instrumentation core's emit sink to postMessage a
 * `telemetry:record` message. The main thread relays this into the SAME
 * browser sink (see CodegenProvider.tsx's worker-message handling) so a
 * worker's captured error lands in the identical pipe, sampling, and
 * shipper as a main-thread one. `post` is injected (rather than reaching
 * for a global `self`) so this is testable without a real Worker context.
 */
export function installInstrumentationWorkerSink(post: (msg: { type: 'telemetry:record'; record: TelemetryRecord }) => void): void {
  configureInstrumentation((record: TelemetryRecord) => {
    post({ type: 'telemetry:record', record });
  });
}
```

Wire into both workers, at module top level (after existing imports, before any message-handler registration):

```ts
// apps/studio/src/workers/parser-worker.ts and codegen-worker.ts:
import { installInstrumentationWorkerSink } from '../services/instrumentation/worker-sink.js';
installInstrumentationWorkerSink((msg) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg));
```

Add a new case to `CodegenProvider.tsx`'s existing `handleMessage` function (the one already handling `isPreviewExecuteResultMessage`, etc. — add this check alongside the others, before the `isPreviewWorkerMessage` branch since it's an unrelated message type):

```ts
if (isTelemetryRecordMessage(msg)) {
  const addLine = useOutputStore.getState().addLine;
  const record = msg.record;
  const severity = record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : 'info';
  addLine(fmtLine(record.op, record.subject ?? ''), severity, {
    op: record.op,
    subject: record.subject,
    signature: record.signature,
    durationMs: record.durationMs
  });
  return;
}
```

Add the guard next to `CodegenProvider.tsx`'s other message-type guards (or a shared `worker-messages.ts` if one already centralizes them — check before adding a new one, per this repo's DRY convention):

```ts
function isTelemetryRecordMessage(msg: unknown): msg is { type: 'telemetry:record'; record: TelemetryRecord } {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'telemetry:record';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/worker-sink.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/worker-sink.ts apps/studio/src/workers/parser-worker.ts apps/studio/src/workers/codegen-worker.ts apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/test/services/instrumentation/worker-sink.test.ts
git commit -m "feat(studio): wire instrumentation core through both Web Workers into the browser pipe"
```

---

### Task 6: Cloudflare Pages Functions sink + edge toggle

**Files:**
- Create: `apps/studio/functions/lib/instrumentation-sink.ts`
- Test: `apps/studio/functions/test/instrumentation-sink.test.ts`

**Interfaces:**
- Consumes: `configureInstrumentation`, `TelemetryRecord`, `withInstrumentation` (Task 1–3) — the core module is isomorphic, so Functions import it directly from `apps/studio/src/services/instrumentation/core.js` (already proven cross-directory-importable in this repo — `apps/studio/functions/api/parse.ts` and siblings already import from `../lib/*`; this task imports from `../../src/services/instrumentation/core.js` instead, a new cross-boundary import worth flagging in code review since existing functions/ code has not imported from src/ before).

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { installInstrumentationEdgeSink } from '../lib/instrumentation-sink.js';
import {
  Capture,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../src/services/instrumentation/core.js';

describe('installInstrumentationEdgeSink', () => {
  it('logs a JSON.stringify of the record via console.log, enabled by env flag', () => {
    resetInstrumentationForTests();
    resetInstrumentationThresholdForTests();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installInstrumentationEdgeSink({ INSTRUMENTATION_ENABLED: 'true' });
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, { op: 'edgeOp', level: 'info', capture: Capture.Output, sanitize: (v) => v });
    wrapped();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ op: 'edgeOp' });
    logSpy.mockRestore();
  });

  it('does nothing when INSTRUMENTATION_ENABLED is not set', () => {
    resetInstrumentationForTests();
    resetInstrumentationThresholdForTests();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installInstrumentationEdgeSink({});
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, { op: 'edgeOp', level: 'info' });
    wrapped();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run functions/test/instrumentation-sink.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the edge sink**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { configureInstrumentation, type TelemetryRecord } from '../../src/services/instrumentation/core.js';

/**
 * Cloudflare Pages Functions have no Vite import.meta.env.PROD dead-code
 * elimination (Wrangler-built, not Vite-built) — gated at runtime by an
 * env binding instead. console.log(JSON.stringify(...)) is deliberate:
 * Cloudflare Workers Logs already scrapes structured console.log JSON
 * (the same pattern apps/telemetry-worker itself uses post-PR #451), so
 * this needs no new server-side plumbing.
 */
export function installInstrumentationEdgeSink(env: { INSTRUMENTATION_ENABLED?: string }): void {
  if (env.INSTRUMENTATION_ENABLED !== 'true') return;
  configureInstrumentation((record: TelemetryRecord) => {
    console.log(JSON.stringify(record));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run functions/test/instrumentation-sink.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/lib/instrumentation-sink.ts apps/studio/functions/test/instrumentation-sink.test.ts
git commit -m "feat(studio): Cloudflare Functions instrumentation sink, env-gated"
```

---

### Task 7: Vite production dead-code-elimination gate

**Files:**
- Modify: `apps/studio/src/services/instrumentation/core.ts`
- Test: `apps/studio/test/services/instrumentation/prod-gate.test.ts`

**Interfaces:**
- Consumes: `withInstrumentation`'s internal `makeWithInstrumentation` closure (Task 3).
- Produces: no new exports — modifies `withInstrumentation`'s internal short-circuit to also check `import.meta.env.PROD`.

- [ ] **Step 1: Write the failing test**

Vitest sets `import.meta.env.MODE` to `'test'` (not `'production'`) by default, so `import.meta.env.PROD` is `false` in the normal test run — this test instead asserts the SOURCE contains the gate (a static check), since flipping `import.meta.env.PROD` at runtime inside a Vitest test is unreliable across bundler versions and isn't what actually matters — what matters is that Rollup can statically eliminate the branch, which requires the literal `import.meta.env.PROD` expression to appear directly in a condition, not be wrapped in a helper function Rollup can't see through.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('production dead-code-elimination gate', () => {
  it('withInstrumentation short-circuits on a literal import.meta.env.PROD check', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/services/instrumentation/core.ts', import.meta.url)),
      'utf-8'
    );
    expect(source).toMatch(/import\.meta\.env\.PROD/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/prod-gate.test.ts`
Expected: FAIL — no `import.meta.env.PROD` in `core.ts` yet

- [ ] **Step 3: Add the gate**

In `makeWithInstrumentation`'s `bound` closure (from Task 3), change the level-check line:

```ts
// Before:
      const clears = levelClears(level, threshold);
      if (!clears) return fn.apply(this, args);

// After:
      if (import.meta.env.PROD) return fn.apply(this, args); // Rollup dead-code-eliminates this branch in prod builds
      const clears = levelClears(level, threshold) && useTelemetrySettingsStoreEnabled();
      if (!clears) return fn.apply(this, args);
```

This requires importing the existing telemetry opt-in flag. Since `core.ts` must stay isomorphic (no zustand import — Cloudflare Functions can't import a browser zustand store), inject it instead: add an optional `isEnabled: () => boolean` parameter to `configureInstrumentation`, defaulting to `() => true`:

```ts
let isEnabledCheck: () => boolean = () => true;

export function configureInstrumentation(emit: Emit, isEnabled: () => boolean = () => true): void {
  currentEmit = emit;
  isEnabledCheck = isEnabled;
}
```

And in `bound`:

```ts
if (import.meta.env.PROD) return fn.apply(this, args);
if (!isEnabledCheck()) return fn.apply(this, args);
const clears = levelClears(level, threshold);
if (!clears) return fn.apply(this, args);
```

Update Task 4's `installInstrumentationBrowserSink` and Task 5's `installInstrumentationWorkerSink` to pass `() => useTelemetrySettingsStore.getState().enabled` as the second argument (reusing the existing opt-in flag, per the design's explicit "no second, parallel setting" requirement). Task 6's edge sink already has its own `env.INSTRUMENTATION_ENABLED` gate and does not need this second parameter (Cloudflare Functions have no Vite build at all, so `import.meta.env.PROD` is meaningless there — the edge sink's existing early-return already covers it).

- [ ] **Step 4: Run test to verify it passes; re-run Tasks 1–6's suites to confirm no regression**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/ functions/test/instrumentation-sink.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/core.ts apps/studio/src/services/instrumentation/browser-sink.ts apps/studio/src/services/instrumentation/worker-sink.ts apps/studio/test/services/instrumentation/prod-gate.test.ts
git commit -m "feat(studio): gate instrumentation on import.meta.env.PROD + the existing telemetry opt-in flag"
```

---

### Task 8: `RetryExhaustedError` + `CodegenProvider` retrofit (the concrete "exhaustion throws" example)

**Files:**
- Create: `apps/studio/src/services/instrumentation/errors.ts`
- Modify: `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Test: `apps/studio/test/services/instrumentation/errors.test.ts`, `apps/studio/test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`

**Interfaces:**
- Produces: `class RetryExhaustedError extends Error { readonly targetId: string; readonly attempts: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { RetryExhaustedError } from '../../../src/services/instrumentation/errors.js';

describe('RetryExhaustedError', () => {
  it('carries targetId and attempts, and is a real Error', () => {
    const err = new RetryExhaustedError('cdm.base.staticdata.party.Party', 5);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RetryExhaustedError');
    expect(err.targetId).toBe('cdm.base.staticdata.party.Party');
    expect(err.attempts).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/errors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `RetryExhaustedError`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Thrown by a retry-cap-exhausted / give-up branch instead of quietly
 * transitioning state. Flows through the exact same withInstrumentation
 * capture-and-rethrow path as any other exception — there is no separate
 * reportExhaustion() API (see the design doc's "Exhaustion is not a
 * separate API" section). Named so sanitizers/dashboards can categorize
 * "gave up after N attempts" apart from a genuine bug.
 */
export class RetryExhaustedError extends Error {
  constructor(
    public readonly targetId: string,
    public readonly attempts: number
  ) {
    super(`Retry budget exhausted for "${targetId}" after ${attempts} attempt(s)`);
    this.name = 'RetryExhaustedError';
  }
}
```

Now retrofit `CodegenProvider.tsx`'s retry-cap-exhausted branch (the `namespacesToHydrate.size === 0` / `!canRetry` path inside the `preview:result` handler, which today only calls `clearHydrationRetriesRemaining(targetId)`). Wrap the throwing call in an ordinary `try/catch` at the call site so today's observable UX (clear the retry counter, let the schema's own `status`/`unsupportedFeatures` drive the UI) is unchanged — the only behavior addition is that instrumentation now sees it:

```ts
function giveUpOnHydration(targetId: string, attempts: number): void {
  try {
    throw new RetryExhaustedError(targetId, attempts);
  } catch (err) {
    clearHydrationRetriesRemaining(targetId);
    throw err; // re-thrown deliberately — see withInstrumentation's "never swallows" contract;
               // this function itself should be wrapped with withInstrumentation by the Task 12 codemod.
  }
}
```

Replace the two `clearHydrationRetriesRemaining(targetId)` call sites in the retry-exhausted branches (the `namespacesToHydrate.size === 0` early-return, and the `canRetry === false` branch inside `beginRetryRound`'s else) with `giveUpOnHydration(targetId, MAX_HYDRATION_RETRIES_PER_TARGET)` wrapped in the caller's own `try/catch { /* preserve existing no-op UX */ }`, since `CodegenProvider`'s `handleMessage` is a `postMessage` event handler — an uncaught throw there would surface as an `unhandledrejection`-adjacent path depending on how the event listener is invoked, not silently vanish, but the existing behavior (continue processing, no visible change) must be preserved explicitly rather than left to chance:

```ts
try {
  giveUpOnHydration(targetId, MAX_HYDRATION_RETRIES_PER_TARGET);
} catch {
  // Preserves today's observable UX: schema.status/unsupportedFeatures already
  // drive the "could not resolve" UI; this catch exists ONLY so the throw
  // routes through instrumentation's error-capture path without changing
  // control flow for anything downstream of this handler.
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/errors.test.ts test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`
Expected: PASS. (Write `CodegenProvider.retry-exhausted.test.tsx` following the existing test patterns already present in `apps/studio/test/shell/providers/` for this component — assert `giveUpOnHydration` is invoked and that `clearHydrationRetriesRemaining` still fires exactly as before the retrofit.)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/errors.ts apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/test/services/instrumentation/errors.test.ts apps/studio/test/shell/providers/CodegenProvider.retry-exhausted.test.tsx
git commit -m "feat(studio): RetryExhaustedError — exhaustion throws through instrumentation instead of silently transitioning state"
```

---

### Task 9: Native method decorator (`@instrument`/`@trace`/`@debug`/`@info`/`@warn`) + apply to `ZodNamespaceEmitter`

**Files:**
- Create: `packages/codegen/src/instrument.ts`
- Modify: `packages/codegen/src/emit/zod-emitter.ts`
- Test: `packages/codegen/test/instrument.test.ts`

**Interfaces:**
- Consumes: `withInstrumentation`, `InstrumentationOptions` — **note the licensing boundary**: `packages/codegen` is MIT, `apps/studio` is FSL-1.1-ALv2. The instrumentation core currently lives under `apps/studio/src/services/instrumentation/core.ts` (FSL). `packages/codegen` (MIT) must not import FSL-licensed code. Move the core module to a new MIT-licensed shared location this task creates: `packages/instrumentation-core/src/index.ts` (new package), re-exported from `apps/studio/src/services/instrumentation/core.ts` for backward compatibility with Tasks 1–8's import paths. This is a real, necessary restructuring surfaced by this task — call it out explicitly in the task's PR description.
- Produces: `instrument(opts?)`, `trace/debug/info/warn` decorator factories.

- [ ] **Step 1: Move the core module to a new MIT package**

```bash
mkdir -p packages/instrumentation-core/src
git mv apps/studio/src/services/instrumentation/core.ts packages/instrumentation-core/src/index.ts
```

Change the SPDX header at the top of the moved file from `FSL-1.1-ALv2` to `MIT` (the code itself is unmodified — see Global Constraints on licensing). Create `packages/instrumentation-core/package.json` following the exact pattern of an existing small internal package (check `packages/curated-schema/package.json` for the template: `name`, `version`, `type: module`, `exports`, `devDependencies` for `typescript`/`vitest`). Re-export from the old location so Tasks 1–8's existing import paths keep working:

```ts
// apps/studio/src/services/instrumentation/core.ts (replaces the moved file)
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
export * from '@rune-langium/instrumentation-core';
```

Add `@rune-langium/instrumentation-core` as a `workspace:*` dependency of `apps/studio/package.json`. Move Task 1–3's `core.test.ts`/`with-instrumentation.test.ts`/`with-instrumentation-child.test.ts` to `packages/instrumentation-core/test/` and update their relative import paths.

- [ ] **Step 2: Run the moved tests to confirm the restructure didn't break anything**

Run: `pnpm --filter @rune-langium/instrumentation-core exec vitest run && pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/`
Expected: PASS (moved tests pass from their new location; studio's re-export doesn't break Tasks 4–8's tests)

- [ ] **Step 3: Write the failing decorator test**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold
} from '@rune-langium/instrumentation-core';
import { debug } from '../src/instrument.js';

afterEach(() => {
  resetInstrumentationForTests();
  resetInstrumentationThresholdForTests();
});

describe('@debug() method decorator', () => {
  it('wraps a class method so it emits through the instrumentation pipe and still returns normally', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('debug');
    class Example {
      @debug()
      double(x: number): number {
        return x * 2;
      }
    }
    const result = new Example().double(21);
    expect(result).toBe(42);
    expect(emitted).toEqual([expect.objectContaining({ op: 'double', level: 'debug' })]);
  });

  it('propagates a thrown error from the decorated method and still emits an error record', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    class Example {
      @debug()
      explode(): void {
        throw new Error('boom');
      }
    }
    expect(() => new Example().explode()).toThrow('boom');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'error' })]);
  });
});
```

- [ ] **Step 4: Implement the decorator and run tests to verify they pass**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation, type InstrumentationOptions, type Level } from '@rune-langium/instrumentation-core';

/**
 * Native TS 5.x method decorator (standards-track syntax — no
 * experimentalDecorators). Applies withInstrumentation to a class method,
 * defaulting `op` to the method's own name. See docs/superpowers/specs/
 * 2026-08-01-instrumentation-wrapper-design.md's "Wiring mechanism"
 * section — this is the class-based counterpart to the ts-morph codemod
 * used for free functions.
 */
export function instrument(opts: InstrumentationOptions = {}) {
  return function (original: (...args: unknown[]) => unknown, ctx: ClassMethodDecoratorContext) {
    const op = opts.op ?? String(ctx.name);
    return function (this: unknown, ...args: unknown[]) {
      return withInstrumentation(original.bind(this), { ...opts, op })(...args);
    };
  };
}

type LevelDecoratorOptions = Omit<InstrumentationOptions, 'level'>;
const levelDecorator = (level: Level) => (opts: LevelDecoratorOptions = {}) => instrument({ ...opts, level });

export const trace = levelDecorator('trace');
export const debug = levelDecorator('debug');
export const info = levelDecorator('info');
export const warn = levelDecorator('warn');
```

Confirm `packages/codegen/tsconfig.json` targets a TS/lib version with native decorator support (TS 5.0+; this repo is 5.9+ per its own conventions, so this should already be satisfied — verify, don't assume, since decorator syntax requires `target`/`lib` to not force the legacy `experimentalDecorators` path).

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/instrument.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Apply `@debug()` to `ZodNamespaceEmitter`'s methods and commit**

In `packages/codegen/src/emit/zod-emitter.ts`, decorate the per-type emission methods (the ones most likely to be where a PR #461-shaped bug would hide — a specific type's resolution failing):

```ts
class ZodNamespaceEmitter extends BaseNamespaceEmitter {
  @debug()
  emitData(data: Data): void { /* unchanged body */ }

  @debug()
  emitChoice(choice: Choice): void { /* unchanged body */ }

  @debug()
  emitEnumeration(enumNode: RosettaEnumeration): void { /* unchanged body */ }

  @debug()
  emitTypeAlias(typeAlias: RosettaTypeAlias): void { /* unchanged body */ }
}
```

Run the FULL codegen package test suite (not just the new one) to confirm decorating these methods doesn't change any existing emitter output:

Run: `pnpm --filter @rune-langium/codegen test`
Expected: PASS, zero regressions

```bash
git add packages/instrumentation-core apps/studio/src/services/instrumentation/core.ts apps/studio/package.json apps/studio/test/services/instrumentation/ packages/codegen/src/instrument.ts packages/codegen/src/emit/zod-emitter.ts packages/codegen/test/instrument.test.ts
git commit -m "feat(codegen): extract MIT-licensed instrumentation-core package, add native method decorator, instrument ZodNamespaceEmitter"
```

---

### Task 10: Apply the decorator to the remaining codegen emitters

**Files:**
- Modify: `packages/codegen/src/emit/ts-emitter.ts`, `json-schema-emitter.ts`, `sql-emitter.ts`, `xsd-emitter.ts`, `openapi-emitter.ts`

**Interfaces:**
- Consumes: `debug` decorator from Task 9 — mechanical repeat of the same pattern, no new interface.

- [ ] **Step 1: Apply `@debug()` to each remaining `*NamespaceEmitter` class's per-type emission methods**

For each of `TsNamespaceEmitter`, `JsonSchemaNamespaceEmitter`, `SqlNamespaceEmitter`, `XsdNamespaceEmitter`, `OpenApiNamespaceEmitter`: import `debug` from `../instrument.js`, and add `@debug()` above each method whose name starts with `emit` (mirroring exactly what Task 9 did for `ZodNamespaceEmitter` — same method-name pattern across all six emitters, since they share `BaseNamespaceEmitter`'s contract).

- [ ] **Step 2: Run the full codegen suite for each emitter to confirm zero output changes**

Run: `pnpm --filter @rune-langium/codegen test`
Expected: PASS, zero regressions — decorating changes instrumentation, not emitted output.

- [ ] **Step 3: Commit**

```bash
git add packages/codegen/src/emit/ts-emitter.ts packages/codegen/src/emit/json-schema-emitter.ts packages/codegen/src/emit/sql-emitter.ts packages/codegen/src/emit/xsd-emitter.ts packages/codegen/src/emit/openapi-emitter.ts
git commit -m "feat(codegen): instrument remaining namespace emitters (ts, json-schema, sql, xsd, openapi)"
```

---

### Task 11: React Error Boundary

**Files:**
- Create: `apps/studio/src/components/InstrumentationErrorBoundary.tsx`
- Modify: `apps/studio/src/main.tsx`
- Test: `apps/studio/test/components/InstrumentationErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: `emitRecord`-equivalent — since `core.ts`'s `emitRecord` is internal, the boundary calls `withInstrumentation`'s public surface indirectly by importing `configureInstrumentation`'s already-installed sink is not accessible directly; instead it constructs a `TelemetryRecord` via the same shape and calls a newly-exported `emitDirectly(record)` (Task 1's `emitRecord`, promoted to a public export — add this in this task, not retroactively editing Task 1's step, since the need only becomes concrete here).

- [ ] **Step 1: Promote `emitRecord` to a public export**

In `packages/instrumentation-core/src/index.ts`, remove the "Internal — not exported publicly" comment above `emitRecord` and confirm it's already exported (it is, from Task 1 — the comment was aspirational, not enforced; this step just corrects the comment and confirms the public contract).

- [ ] **Step 2: Write the failing test**

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { configureInstrumentation, resetInstrumentationForTests } from '@rune-langium/instrumentation-core';
import { InstrumentationErrorBoundary } from '../../src/components/InstrumentationErrorBoundary.js';

function Bomb(): never {
  throw new Error('render crash');
}

describe('InstrumentationErrorBoundary', () => {
  it('renders a fallback and emits an error-level record when a child throws during render', () => {
    resetInstrumentationForTests();
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the caught error too
    render(
      <InstrumentationErrorBoundary>
        <Bomb />
      </InstrumentationErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(emitted).toEqual([expect.objectContaining({ op: 'ReactRenderCrash', level: 'error' })]);
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/InstrumentationErrorBoundary.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the boundary and wire it into `main.tsx`**

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { emitRecord } from '@rune-langium/instrumentation-core';

/**
 * React's render-crash mechanism is an Error Boundary (class component —
 * the only way React, including React 19, supports this API). This is
 * the ONE React-specific piece instrumentation doesn't get for free from
 * withInstrumentation on the component body: a component-body wrapper
 * doesn't catch effects failing (they run detached from the render call),
 * and a render crash propagates past it exactly as it always did, up to
 * whatever catches it — which today is nothing (no Error Boundary
 * existed anywhere in this app before this task).
 */
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class InstrumentationErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    emitRecord({
      op: 'ReactRenderCrash',
      level: 'error',
      captured: 0,
      signature: `${error.name}:${error.message.slice(0, 80)}`,
      context: { componentStack: info.componentStack?.slice(0, 500) },
      ts: Date.now()
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <div role="alert">Something went wrong. Try reloading the page.</div>;
    }
    return this.props.children;
  }
}
```

In `main.tsx`, wrap `<App />`:

```tsx
import { InstrumentationErrorBoundary } from './components/InstrumentationErrorBoundary.js';
// ...
createRoot(root).render(
  <StrictMode>
    <InstrumentationErrorBoundary>
      <App />
    </InstrumentationErrorBoundary>
  </StrictMode>
);
```

- [ ] **Step 5: Run test to verify it passes, then commit**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/InstrumentationErrorBoundary.test.tsx`
Expected: PASS

```bash
git add packages/instrumentation-core/src/index.ts apps/studio/src/components/InstrumentationErrorBoundary.tsx apps/studio/src/main.tsx apps/studio/test/components/InstrumentationErrorBoundary.test.tsx
git commit -m "feat(studio): React Error Boundary reporting render crashes into the instrumentation pipe"
```

---

### Task 12: `ts-morph` codemod script (build + prove on a representative slice)

**Files:**
- Create: `apps/studio/scripts/instrument-codemod.ts`
- Add devDependency: `ts-morph` to `apps/studio/package.json` (present transitively in the workspace already — `ts-morph@26.0.0` resolves under `node_modules/.pnpm/`, so this is a proven-compatible version, not a speculative new install)
- Test: run against one real, low-risk file as proof (`apps/studio/src/utils/uri.ts`) before Task 13 runs it repo-wide.

**Interfaces:**
- Produces: a CLI script `pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts <glob>` that rewrites unwrapped exported functions in place.

- [ ] **Step 1: Add the devDependency**

```bash
pnpm --filter @rune-langium/studio add -D ts-morph
```

- [ ] **Step 2: Write the codemod script**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * One-time codemod: finds top-level `export function` declarations not
 * already wrapped in withInstrumentation, and rewrites them to call it,
 * defaulting `op` to the function's own name. Run once per target glob,
 * result is ordinary committed source — NOT a live build-time transform
 * (see docs/superpowers/specs/2026-08-01-instrumentation-wrapper-design.md's
 * "Wiring mechanism" for why a rolldown-vite bundler plugin was rejected).
 *
 * Usage: pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts "src/services/*.ts"
 */
import { Project, SyntaxKind, type FunctionDeclaration } from 'ts-morph';

const IMPORT_SPECIFIER = '../services/instrumentation/core.js'; // relative import gets adjusted per-file below

function relativeImportPathFor(fileDir: string): string {
  // Computed per-file so every rewritten file imports withInstrumentation
  // via a correct relative path regardless of its depth under src/.
  const path = require('node:path') as typeof import('node:path');
  const target = path.resolve('apps/studio/src/services/instrumentation/core.ts');
  let rel = path.relative(fileDir, target).replace(/\.ts$/, '.js');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function alreadyWrapped(fn: FunctionDeclaration): boolean {
  // A function whose body is literally `return withInstrumentation(...)`-shaped
  // doesn't apply here (this codemod targets FUNCTION DECLARATIONS, which
  // can't themselves be reassigned to a wrapped const in place) — see the
  // rewrite strategy below: declarations become `export const name = withInstrumentation(function name(...) {...}, opts)`.
  return false; // idempotency check happens via a marker comment instead — see Step 2 body.
}

export function runCodemod(globPattern: string): void {
  const project = new Project({ tsConfigFilePath: 'apps/studio/tsconfig.json' });
  project.addSourceFilesAtPaths(globPattern);
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getFullText().includes('@instrumentation-codemod-applied')) continue; // idempotency marker
    const fns = sourceFile.getFunctions().filter((fn) => fn.isExported() && fn.getName());
    if (fns.length === 0) continue;
    const importPath = relativeImportPathFor(sourceFile.getDirectoryPath());
    let changed = false;
    for (const fn of fns) {
      const name = fn.getName()!;
      const isAsync = fn.isAsync();
      const paramsText = fn.getParameters().map((p) => p.getText()).join(', ');
      const returnTypeText = fn.getReturnTypeNode()?.getText() ?? '';
      const bodyText = fn.getBodyText() ?? '';
      const fnText = `${isAsync ? 'async ' : ''}function ${name}(${paramsText})${returnTypeText ? `: ${returnTypeText}` : ''} {\n${bodyText}\n}`;
      fn.replaceWithText(
        `export const ${name} = withInstrumentation(${fnText}, { op: '${name}', sanitize: (v) => '[unsanitized-default: REVIEW]', sanitizeError: (e) => ({ signature: e instanceof Error ? e.name : 'Error' }) });`
      );
      changed = true;
    }
    if (changed) {
      sourceFile.addImportDeclaration({ moduleSpecifier: importPath, namedImports: ['withInstrumentation'] });
      sourceFile.insertText(0, '// @instrumentation-codemod-applied\n');
    }
  }
  project.saveSync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const glob = process.argv[2];
  if (!glob) {
    console.error('Usage: tsx instrument-codemod.ts <glob>');
    process.exit(1);
  }
  runCodemod(glob);
}
```

**Deliberate, flagged limitation**: the codemod's default `sanitize` is a placeholder string (`'[unsanitized-default: REVIEW]'`), not a silent pass-through of raw values — this is intentional and matches the Global Constraint that sanitization must never default to capturing raw data. Every codemod'd file needs a human pass replacing the placeholder with a real per-function sanitizer (or explicitly deciding `capture: 0`, i.e. never capture input/output for that function, only duration/errors) — this is called out explicitly in Task 13's review step, not silently left as permanent placeholder text in shipped code.

- [ ] **Step 3: Prove it on one real, low-risk file**

```bash
git checkout -b codemod-proof-slice
pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts "src/utils/uri.ts"
git diff apps/studio/src/utils/uri.ts
```

Manually inspect the diff: confirm `pathToUri`/`uriToPath`/`curatedPathToUri` are rewritten to `withInstrumentation(...)` calls with correct relative import, confirm the file still type-checks and its existing tests still pass unmodified:

Run: `pnpm --filter @rune-langium/studio exec tsc --noEmit && pnpm --filter @rune-langium/studio exec vitest run test/components/pathToUri.test.ts`
Expected: type-check clean, all `pathToUri.test.ts` tests still PASS (the codemod must not change any function's observable behavior — its wrapping is transparent for the success path per Task 2's design)

Discard the proof branch's changes (this was a proof run, not the real sweep — Task 13 does the real one with sanitizers filled in):

```bash
git checkout apps/studio/src/utils/uri.ts
git checkout docs/instrumentation-wrapper-design # return to the working branch
git branch -D codemod-proof-slice
```

- [ ] **Step 4: Write a unit test for the codemod itself, against a fixture file**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodemod } from '../scripts/instrument-codemod.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemod-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runCodemod', () => {
  it('wraps an exported function declaration in withInstrumentation', () => {
    const file = join(dir, 'sample.ts');
    writeFileSync(file, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    runCodemod(file);
    const rewritten = readFileSync(file, 'utf-8');
    expect(rewritten).toContain('withInstrumentation(');
    expect(rewritten).toContain("op: 'add'");
  });

  it('is idempotent — running twice does not double-wrap', () => {
    const file = join(dir, 'sample2.ts');
    writeFileSync(file, 'export function sub(a: number, b: number): number {\n  return a - b;\n}\n');
    runCodemod(file);
    const once = readFileSync(file, 'utf-8');
    runCodemod(file);
    const twice = readFileSync(file, 'utf-8');
    expect(twice).toBe(once);
  });
});
```

Run: `pnpm --filter @rune-langium/studio exec vitest run scripts/instrument-codemod.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/scripts/instrument-codemod.ts apps/studio/scripts/instrument-codemod.test.ts apps/studio/package.json pnpm-lock.yaml
git commit -m "feat(studio): ts-morph codemod for wrapping free functions in withInstrumentation, proven on one file"
```

---

### Task 13: oxlint enforcement rule — flag new unwrapped exported functions

**Files:**
- Modify: `oxlint-plugins/rune.mjs`, `apps/studio/.oxlintrc.json`
- Test: manual verification (this repo's existing `rune/*` rules have no dedicated unit tests — they're verified by running oxlint against known-good/known-bad fixtures inline; follow that established pattern, don't introduce a new one)

**Interfaces:**
- Produces: `rune/no-uninstrumented-export` oxlint rule.

- [ ] **Step 1: Add the rule to `oxlint-plugins/rune.mjs`**

```js
// ── rune/no-uninstrumented-export ────────────────────────────────────
// Flags a top-level `export function`/`export const fn = (...) => {}`
// NOT already wrapped in withInstrumentation. Enforcement-only — this
// does NOT autofix (none of this plugin's existing rules do; the
// one-time ts-morph codemod, not this lint rule, performs the rewrite).
// Its job is purely to catch a NEW function added after the codemod's
// initial sweep that forgot to opt in.
const INSTRUMENTATION_MARKER = 'withInstrumentation';

const noUninstrumentedExport = {
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;
        if (decl.type === 'FunctionDeclaration') {
          context.report({
            message: `Exported function "${decl.id?.name ?? '(anonymous)'}" is not wrapped in withInstrumentation — run the codemod (apps/studio/scripts/instrument-codemod.ts) or wrap it manually.`,
            node: decl
          });
          return;
        }
        if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations) {
            const init = declarator.init;
            if (!init) continue;
            const isArrowOrFunctionExpr = init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression';
            const isWrapped =
              init.type === 'CallExpression' &&
              init.callee &&
              ((init.callee.type === 'Identifier' && init.callee.name === INSTRUMENTATION_MARKER) ||
                (init.callee.type === 'MemberExpression' &&
                  init.callee.object?.type === 'Identifier' &&
                  init.callee.object.name === INSTRUMENTATION_MARKER));
            if (isArrowOrFunctionExpr && !isWrapped) {
              context.report({
                message: `Exported function "${declarator.id?.name ?? '(anonymous)'}" is not wrapped in withInstrumentation.`,
                node: declarator
              });
            }
          }
        }
      }
    };
  }
};
```

Add it to the plugin's exports:

```js
export default {
  meta: { name: 'rune' },
  rules: {
    'no-palette-utility': noPaletteUtility,
    'no-raw-arbitrary-value': noRawArbitraryValue,
    'no-raw-node-id': noRawNodeId,
    'no-raw-edge-id': noRawEdgeId,
    'no-uninstrumented-export': noUninstrumentedExport
  }
};
```

- [ ] **Step 2: Enable it in `apps/studio/.oxlintrc.json`, scoped to the directories this design targets**

```json
{
  "jsPlugins": ["../../oxlint-plugins/rune.mjs"],
  "rules": {
    "rune/no-raw-arbitrary-value": "error",
    "rune/no-raw-node-id": "error",
    "rune/no-uninstrumented-export": "warn"
  }
}
```

Start at `"warn"`, not `"error"` — the repo-wide sweep (Task 14) hasn't run yet at this point in the plan, so turning this on as `"error"` before every existing exported function is covered would fail CI immediately on unrelated, pre-existing code. Task 14's final step flips it to `"error"` once the sweep is complete and clean.

- [ ] **Step 3: Verify the rule fires on a known-bad fixture and stays silent on a known-good one**

```bash
cat > /tmp/rune-lint-fixture-bad.ts <<'EOF'
export function unwrapped(x: number): number {
  return x;
}
EOF
cat > /tmp/rune-lint-fixture-good.ts <<'EOF'
import { withInstrumentation } from '../services/instrumentation/core.js';
export const wrapped = withInstrumentation(function wrapped(x: number): number {
  return x;
}, { op: 'wrapped' });
EOF
pnpm --filter @rune-langium/studio exec oxlint --config .oxlintrc.json /tmp/rune-lint-fixture-bad.ts
# Expected: reports rune/no-uninstrumented-export
pnpm --filter @rune-langium/studio exec oxlint --config .oxlintrc.json /tmp/rune-lint-fixture-good.ts
# Expected: no rune/no-uninstrumented-export report
rm /tmp/rune-lint-fixture-bad.ts /tmp/rune-lint-fixture-good.ts
```

- [ ] **Step 4: Run the full lint suite to confirm nothing else broke**

Run: `pnpm run lint`
Expected: PASS with warnings (not errors) for currently-unwrapped exports — this is expected and correct at this point in the plan; Task 14 addresses them.

- [ ] **Step 5: Commit**

```bash
git add oxlint-plugins/rune.mjs apps/studio/.oxlintrc.json
git commit -m "feat(studio): rune/no-uninstrumented-export oxlint rule (warn), enforces codemod coverage going forward"
```

---

### Task 14: Run the codemod repo-wide, fill in real sanitizers, flip the lint rule to error

**Files:**
- Modify: every exported function under `apps/studio/src/services/`, `apps/studio/src/store/`, `apps/studio/src/shell/`, `apps/studio/src/components/`, `apps/studio/src/workers/parser-worker.ts`, `apps/studio/src/workers/codegen-worker.ts`, `apps/studio/functions/`
- Modify: `apps/studio/.oxlintrc.json` (final step)

**Interfaces:**
- Consumes: `runCodemod` (Task 12), `rune/no-uninstrumented-export` (Task 13).

This task is necessarily large and mechanical; the review gate is "does the build/type-check/test suite stay green and does every placeholder sanitizer get replaced," not "read every line of a multi-thousand-line diff by hand." Split it into sub-steps by directory so review stays tractable per-PR rather than one enormous diff.

- [ ] **Step 1: Run the codemod against `apps/studio/src/services/`, `apps/studio/src/store/`**

```bash
pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts "src/services/**/*.ts"
pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts "src/store/**/*.ts"
```

- [ ] **Step 2: Replace every `'[unsanitized-default: REVIEW]'` placeholder in the changed files**

```bash
rg -l "unsanitized-default: REVIEW" apps/studio/src/services apps/studio/src/store
```

For each match, either supply a real `sanitize`/`sanitizeError` per the function's actual argument/return shape (curated type names, counts, booleans — safe; raw file content, model source, user-typed text — never), or set `capture: 0` (no input/output capture, duration/errors only) where nothing about the call is safe or useful to capture. This step cannot be further mechanized — per the Global Constraints, sanitization is deliberately a manual, per-callsite judgment call, not something this plan can pre-decide for every function.

Run: `pnpm --filter @rune-langium/studio exec tsc --noEmit && pnpm --filter @rune-langium/studio test`
Expected: type-check clean, full suite green, zero remaining `unsanitized-default` placeholders in these two directories.

- [ ] **Step 3: Repeat Steps 1–2 for `apps/studio/src/shell/`, `apps/studio/src/components/` (React components included — same codemod, same review process), the two Web Workers, and `apps/studio/functions/`**

Run the same three commands (codemod, `rg` for remaining placeholders, `tsc --noEmit && test`) once per directory group, committing after each group passes clean — this keeps each commit's diff reviewable and bisectable if something regresses.

- [ ] **Step 4: Flip `rune/no-uninstrumented-export` to `"error"`**

```json
"rune/no-uninstrumented-export": "error"
```

Run: `pnpm run lint`
Expected: PASS with zero warnings/errors — confirms full coverage across every directory this plan targeted.

- [ ] **Step 5: Full repo verification and final commit**

Run: `pnpm run lint && pnpm run type-check && pnpm test`
Expected: all three green.

```bash
git add -A
git commit -m "feat(studio): repo-wide instrumentation sweep — codemod applied, sanitizers reviewed, lint rule enforced as error"
```

---

## Self-review notes (writing-plans skill checklist)

- **Spec coverage**: Problem/Goal → Task 8 (concrete exhaustion example) + Tasks 1-7 (the core pipe); Non-goals → respected throughout (no OTel/Sentry/pino deps added anywhere, no class migration, no bundler plugin — Task 12 uses `ts-morph`, a pre-build script); Core API → Tasks 1-3; Sinks/Toggle → Tasks 4-7; Levels/thresholds → Tasks 1-3 (resolved the "exact handling" open question from the spec: `trace`/`debug` never reach `telemetry-shipper.ts` at all in the normal case, since `withInstrumentation`'s threshold check prevents `addLine` from ever being called for them — confirmed against the shipper's own existing `severity !== 'error' && !== 'warn' && !== 'info'` filter, so **no change to `telemetry-shipper.ts`'s `SAMPLE_RATE` table or `telemetry.ts`'s wire schema is needed**, contrary to the spec's speculative "either... or" framing); Wiring mechanism (decorators + codemod + lint rule + Error Boundary) → Tasks 9-14; Known sanitization gap for workers/edge → explicitly left unresolved per the spec's own "not solved by this design" framing, not silently dropped from this plan either.
- **Placeholder scan**: the codemod's `'[unsanitized-default: REVIEW]'` string is a deliberate, flagged, temporary artifact of the codemod's OWN output — not a placeholder in this PLAN. Task 14 exists specifically to eliminate every instance of it from shipped code before the lint rule goes to `"error"`.
- **Type consistency**: `TelemetryRecord`, `Level`, `Capture`, `InstrumentationOptions`, `Emit` are defined once (Task 1) and referenced identically by name in every later task; `withInstrumentation`/`.child`/`.trace`/`.debug`/`.info`/`.warn` signatures introduced in Tasks 2-3 are reused verbatim in Tasks 4-14, not redefined.
- **New finding during planning, not in the original spec**: `packages/codegen` (MIT) needs the core module too (Task 9's decorator), but the core module started life under `apps/studio` (FSL). Task 9 extracts it into a new small MIT package (`packages/instrumentation-core`) rather than duplicating the module under two licenses — the spec didn't anticipate this because the class-based/decorator insight came from `packages/codegen`, a different package than where the design's examples (`apps/studio`) lived. Flagging this explicitly since it's a real, licensing-driven restructuring a plan reviewer should know was deliberate, not an oversight.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-01-instrumentation-wrapper.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
