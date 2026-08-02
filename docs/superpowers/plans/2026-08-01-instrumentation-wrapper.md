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
- Produces: `Level` (`'trace'|'debug'|'info'|'warn'|'error'`), `Capture` (a `const`-object of bitflags `{ Input: 0b01, Output: 0b10 }` — NOT a `const enum`: every tsconfig in this repo sets `isolatedModules`, and once Task 9 moves this module into a dist-built package, a `const enum` in the emitted `.d.ts` is ambient and un-referenceable from `isolatedModules` consumers), `TelemetryRecord`, `Emit`, `configureInstrumentation(emit: Emit): void`, `resetInstrumentationForTests(): void` (test-only reset, mirrors how `useTelemetrySettingsStore` resets between test files).

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

  it('an above-threshold call through the default (pre-configuration) no-op sink never throws', () => {
    resetInstrumentationForTests(); // guarantee the no-op sink, not a leaked emit from a prior test
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 7, { op: 'unconfigured', level: 'info' });
    expect(wrapped()).toBe(7); // emit path runs, silently dropped — the design's "silent no-op" invariant
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

// `bindingContext` is unused until Task 3 introduces `.child()` — declared now
// so error records carry the bound context the same way success records do.
function emitError(op: string, opts: InstrumentationOptions, err: unknown, bindingContext?: unknown): void {
  const { signature, context } = (opts.sanitizeError ?? defaultSanitizeError)(err);
  emitRecord({ op, level: 'error', captured: 0, signature, context: context ?? bindingContext, ts: Date.now() });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/with-instrumentation.test.ts`
Expected: PASS (6 tests)

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
    // NOTE: the first argument IS the baseContext itself (it lands verbatim in
    // record.context) — not an options bag with a `context` key.
    const moduleScoped = withInstrumentation.child({ module: 'codegen-worker' });
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

  it('baseContext also lands on the ERROR record when a wrapped call throws (unless sanitizeError supplies its own context)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    const moduleScoped = withInstrumentation.child({ module: 'codegen-worker' });
    const wrapped = moduleScoped(
      () => {
        throw new Error('boom');
      },
      { op: 'explodeInChild', sanitizeError: () => ({ signature: 'Error:boom' }) }
    );
    expect(() => wrapped()).toThrow('boom');
    expect(emitted).toEqual([
      expect.objectContaining({ op: 'explodeInChild', level: 'error', context: { module: 'codegen-worker' } })
    ]);
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

  // Regression coverage for a bug Task 2's review caught in ITS OWN early-plan
  // code shape (an `if (!clears) return fn.apply(...)` early-return before
  // entering the try/catch), which Task 2 fixed for the base wrapper. This
  // task's depth-tracking append re-introduces the SAME early-return shape in
  // its own literal code unless corrected — and for depth-tracking
  // specifically it is a SECOND bug, not just the error-emission one: an
  // early return before `depth++` means a below-threshold call's own nested
  // calls never see their parent's depth increment, silently under-counting
  // nesting. Both must hold even when the call itself never clears.
  it('a below-threshold call still increments depth for its own nested calls (regression: an early return before depth++ would hide nesting)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const inner = withInstrumentation(() => 1, { op: 'innerUnderBelowThresholdParent' });
    // outer is explicitly BELOW the 'trace' threshold isn't possible (trace is
    // the lowest level) — so gate outer's own emission via an explicit level
    // above the ambient default while asserting on the emitted array itself:
    // the real assertion is about depth's effect on `inner`, not on whether
    // `outer` itself emits.
    setInstrumentationThreshold('error'); // outer (default 'info') won't clear
    const outer = withInstrumentation(() => inner(), { op: 'outerBelowThreshold' });
    outer();
    const innerRecord = emitted.find((r: any) => r.op === 'innerUnderBelowThresholdParent');
    expect(innerRecord).toBeUndefined(); // inner is 'trace'-appropriate-depth but threshold is 'error', so it won't emit either — see next assertion for the real check
    // Re-run with a threshold that lets inner through, to prove depth was
    // still incremented by outer despite outer itself never clearing 'error'.
    setInstrumentationThreshold('debug');
    outer();
    const secondInnerRecord = emitted.find((r: any) => r.op === 'innerUnderBelowThresholdParent');
    expect(secondInnerRecord).toBeDefined();
    expect((secondInnerRecord as any).level).toBe('debug'); // depth=1 from outer -> inner defaults to debug, proving outer's depth++ ran even though outer itself never cleared 'error' on the first call
  });

  it('a below-threshold async rejection still emits an error record and still decrements depth on settle (regression: same early-return shape as Task 2, applied to the depth-tracking wrapper)', async () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    const boom = new Error('boom');
    const wrapped = withInstrumentation(
      async () => {
        throw boom;
      },
      { op: 'depthAsyncExplode', level: 'trace', sanitizeError: () => ({ signature: 'Error:boom' }) }
    );
    await expect(wrapped()).rejects.toThrow(boom);
    expect(emitted).toEqual([expect.objectContaining({ op: 'depthAsyncExplode', level: 'error' })]);
    // Depth must have been decremented on settle — a later top-level call
    // still defaults to 'info', not a deeper level, proving no leak.
    setInstrumentationThreshold('trace');
    const wrapped2 = withInstrumentation(() => 1, { op: 'afterAsyncExplode' });
    wrapped2();
    const afterRecord = emitted.find((r: any) => r.op === 'afterAsyncExplode');
    expect((afterRecord as any).level).toBe('info');
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
              if (clears) emitSuccessWithContext(op, level, capture, args, value, sanitize, performance.now() - start, context);
              return value;
            },
            (err) => {
              depth--;
              emitError(op, opts, err, context);
              throw err;
            }
          );
        }
        if (clears) emitSuccessWithContext(op, level, capture, args, result, sanitize, performance.now() - start, context);
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
```

Replace the plain `export function withInstrumentation` from Task 2 with:

```ts
export const withInstrumentation = makeWithInstrumentation();
```

(Delete Task 2's standalone `withInstrumentation` function body AND its now-dead `emitSuccess` helper — `makeWithInstrumentation()` with no binding plus `emitSuccessWithContext` reproduce the exact same behavior as the base case, so Task 2's tests keep passing unmodified.)

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
- Produces: `installInstrumentationBrowserSink(): void`; `routeTelemetryRecord(record: TelemetryRecord): void` (the record→`addLine` mapping as a standalone export — Task 5's worker relays call it directly rather than duplicating the mapping).

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
/**
 * Maps one TelemetryRecord onto the existing addLine shape. Exported
 * standalone because the worker relays (Task 5) route worker-originated
 * records through the exact same mapping — one mapping, not three copies.
 * `trace`/`debug` collapse to severity 'info' (OutputSeverity has no lower
 * tier, and the op_spans wire schema's level enum is closed over
 * info|warn|error) — with the default threshold they never get here at all.
 */
export function routeTelemetryRecord(record: TelemetryRecord): void {
  const addLine = useOutputStore.getState().addLine;
  const severity = record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : 'info';
  addLine(fmtLine(record.op, record.subject ?? ''), severity, {
    op: record.op,
    subject: record.subject,
    signature: record.signature,
    durationMs: record.durationMs
  });
}

export function installInstrumentationBrowserSink(): void {
  configureInstrumentation(routeTelemetryRecord);
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
- Modify: `apps/studio/src/workers/parser-worker.ts`, `apps/studio/src/workers/codegen-worker.ts`, `apps/studio/src/shell/providers/CodegenProvider.tsx`, `apps/studio/src/services/workspace.ts`
- Test: `apps/studio/test/services/instrumentation/worker-sink.test.ts`

**Interfaces:**
- Consumes: `configureInstrumentation`, `TelemetryRecord` (Task 1); `routeTelemetryRecord` (Task 4, reused by both relays, not duplicated).
- Produces: `installInstrumentationWorkerSink(post): void` and the `isTelemetryRecordMessage` guard; a `{ type: 'telemetry:record', record: TelemetryRecord }` message shape.
- Relay coverage note: the codegen worker's messages are owned by `CodegenProvider.tsx`'s persistent `handleMessage` listener; the parser worker has NO persistent main-thread listener — `workspace.ts` attaches per-request listeners that match on a response `id` and ignore everything else (verified: its `handler` early-returns unless `e.data?.id === id`, so an id-less `telemetry:record` message is protocol-safe there but also silently DROPPED). Both relays below are therefore required, one per worker owner.

- [ ] **Step 1: Write the failing test**

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
 * browser sink (routeTelemetryRecord) so a worker's captured error lands
 * in the identical pipe, sampling, and shipper as a main-thread one.
 * `post` is injected (rather than reaching for a global `self`) so this
 * is testable without a real Worker context.
 */
export function installInstrumentationWorkerSink(post: (msg: { type: 'telemetry:record'; record: TelemetryRecord }) => void): void {
  configureInstrumentation((record: TelemetryRecord) => {
    post({ type: 'telemetry:record', record });
  });
}

/**
 * Message guard for the relay side. Lives HERE (not in codegen-service.ts,
 * where the preview/instance guards are centralized) because it is not a
 * codegen-specific message — both workers post it, and both relay sites
 * import this one guard.
 */
export function isTelemetryRecordMessage(msg: unknown): msg is { type: 'telemetry:record'; record: TelemetryRecord } {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'telemetry:record';
}
```

Wire into both workers, at module top level (after existing imports, before any message-handler registration). **The `isWorkerGlobalScope()` guard is mandatory, not stylistic:** both worker modules are ALSO imported on the main thread for their exported guards/types (`workspace.ts` imports `isParseResponse` etc. from `parser-worker.js`; `CodegenProvider.tsx` imports `DeferredExportEntry` from it) — an unguarded top-level `installInstrumentationWorkerSink` would run during that main-thread import and hijack the main thread's `configureInstrumentation` slot away from the browser sink (with `self` being `window`, no less). Same shared-gate rationale as the existing message-listener registration (see PR #214 / `runtime-guards.ts`):

```ts
// apps/studio/src/workers/parser-worker.ts and codegen-worker.ts:
import { installInstrumentationWorkerSink } from '../services/instrumentation/worker-sink.js';

if (isWorkerGlobalScope()) {
  installInstrumentationWorkerSink((msg) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg));
}
```

Relay 1 — codegen worker: add a new case to `CodegenProvider.tsx`'s existing `handleMessage` function (the one already handling `isPreviewExecuteResultMessage`, etc. — add this check alongside the others, before the `isPreviewWorkerMessage` branch since it's an unrelated message type). The mapping is Task 4's `routeTelemetryRecord`, imported — not re-implemented:

```ts
import { routeTelemetryRecord } from '../../services/instrumentation/browser-sink.js';
import { isTelemetryRecordMessage } from '../../services/instrumentation/worker-sink.js';
// ... inside handleMessage:
if (isTelemetryRecordMessage(msg)) {
  routeTelemetryRecord(msg.record);
  return;
}
```

Relay 2 — parser worker: in `apps/studio/src/services/workspace.ts`, immediately after the `new Worker(new URL('../workers/parser-worker.ts', ...))` construction, attach ONE persistent listener (per-request listeners there are added/removed per call and ignore id-less messages, so without this the parser worker's records are silently dropped):

```ts
worker.addEventListener('message', (e: MessageEvent<unknown>) => {
  if (isTelemetryRecordMessage(e.data)) routeTelemetryRecord(e.data.record);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/worker-sink.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/worker-sink.ts apps/studio/src/workers/parser-worker.ts apps/studio/src/workers/codegen-worker.ts apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/src/services/workspace.ts apps/studio/test/services/instrumentation/worker-sink.test.ts
git commit -m "feat(studio): wire instrumentation core through both Web Workers into the browser pipe"
```

---

### Task 6: Cloudflare Pages Functions sink + edge toggle

**Files:**
- Create: `apps/studio/functions/lib/instrumentation-sink.ts`
- Modify: `apps/studio/functions/_middleware.ts` (the wiring — creating the sink without calling it anywhere would leave the edge runtime silently uninstrumented)
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

Wire it in `apps/studio/functions/_middleware.ts` (currently a documented no-op pass-through). Pages Functions expose `env` bindings only per-request — there is no module-scope `env` — so the middleware's request entry is the wiring point; `configureInstrumentation` just reassigns a module-level function reference, so re-running it per request is idempotent and effectively free:

```ts
import { installInstrumentationEdgeSink } from './lib/instrumentation-sink.js';

export const onRequest: PagesFunction<{ INSTRUMENTATION_ENABLED?: string }> = (ctx) => {
  installInstrumentationEdgeSink(ctx.env);
  return ctx.next();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run functions/test/instrumentation-sink.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/lib/instrumentation-sink.ts apps/studio/functions/_middleware.ts apps/studio/functions/test/instrumentation-sink.test.ts
git commit -m "feat(studio): Cloudflare Functions instrumentation sink, env-gated, wired via _middleware"
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

Vitest sets `import.meta.env.MODE` to `'test'` (not `'production'`) by default, so the prod gate is off in the normal test run — this test instead asserts the SOURCE contains the gate expression (a static check), since flipping `import.meta.env.PROD` at runtime inside a Vitest test is unreliable across bundler versions and isn't what actually matters — what matters is that the bundler can statically fold the check.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('production dead-code-elimination gate', () => {
  it('withInstrumentation short-circuits on the guarded import.meta.env PROD check', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/services/instrumentation/core.ts', import.meta.url)),
      'utf-8'
    );
    expect(source).toContain('.env?.PROD === true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/prod-gate.test.ts`
Expected: FAIL — no PROD gate in `core.ts` yet

- [ ] **Step 3: Add the gate**

The expression cannot be a bare `import.meta.env.PROD`: this core module is also loaded by runtimes with no Vite build — Cloudflare Pages Functions (Task 6 imports it) and, after Task 9's extraction, Node consumers via `packages/codegen` — where `import.meta.env` is `undefined`, so a bare member access would THROW on every instrumented call, and the property doesn't type-check under `functions/tsconfig.json` (no `vite/client` types). The cast + optional chain solves both; Vite/rolldown still statically replaces the `import.meta.env` reference in browser/worker builds, so the whole expression constant-folds there:

```ts
// Module scope in core.ts:
// - Vite/rolldown builds (browser + both workers): `import.meta.env` is
//   statically replaced, so IS_PROD folds to a build-time constant and the
//   instrumentation branch below it is eliminated from prod bundles.
// - Non-Vite runtimes (Pages Functions, Node): `import.meta.env` is
//   undefined; the optional chain makes IS_PROD a safe runtime `false`
//   (their own gates — env binding / threshold — still apply).
// - The cast keeps this type-checking under tsconfigs without vite/client.
const IS_PROD = (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true;
```

In `makeWithInstrumentation`'s `bound` closure (from Task 3), ahead of the existing level check:

```ts
if (IS_PROD) return fn.apply(this, args);
if (!isEnabledCheck()) return fn.apply(this, args);
const clears = levelClears(level, threshold);
if (!clears) return fn.apply(this, args);
```

`isEnabledCheck` is injected — `core.ts` must stay isomorphic (no zustand import — Cloudflare Functions can't import a browser zustand store). Add an optional `isEnabled: () => boolean` parameter to `configureInstrumentation`, defaulting to `() => true`:

```ts
let isEnabledCheck: () => boolean = () => true;

export function configureInstrumentation(emit: Emit, isEnabled: () => boolean = () => true): void {
  currentEmit = emit;
  isEnabledCheck = isEnabled;
}
```

(Also reset `isEnabledCheck` back to `() => true` inside `resetInstrumentationForTests`.)

Then wire the existing opt-in flag (reusing it, per the design's explicit "no second, parallel setting" requirement) — but at the RIGHT place per runtime:

- **Browser sink (Task 4's `installInstrumentationBrowserSink`)**: pass `() => useTelemetrySettingsStore.getState().enabled` as the second `configureInstrumentation` argument.
- **Worker sink (Task 5's `installInstrumentationWorkerSink`)**: do NOT pass the store check — a Web Worker has its own module graph, so importing the zustand store there yields a fresh instance permanently stuck at its `enabled: false` default, which would silently disable worker instrumentation forever. Workers keep the default `() => true` and the opt-in is enforced on the main thread instead: add an early return to Task 4's `routeTelemetryRecord` — `if (!useTelemetrySettingsStore.getState().enabled) return;` — which gates both relayed worker records and (redundantly but harmlessly) browser-originated ones at the single choke point before `addLine`.
- **Edge sink (Task 6)**: unchanged — its `env.INSTRUMENTATION_ENABLED` early-return already covers it, and `IS_PROD` is a safe `false` there per the guarded expression above.

- [ ] **Step 4: Update Tasks 4–5's tests for the new gate, run all suites**

Task 4's `browser-sink.test.ts` and Task 5's `worker-sink.test.ts` now need the opt-in flag on wherever `routeTelemetryRecord`/the browser `isEnabled` check is in the emit path — add to their `beforeEach`:

```ts
useTelemetrySettingsStore.setState({ enabled: true, hydrated: true });
```

(The core/`with-instrumentation` tests are unaffected — they configure a raw emit with the default `() => true`.)

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/ functions/test/instrumentation-sink.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/core.ts apps/studio/src/services/instrumentation/browser-sink.ts apps/studio/test/services/instrumentation/prod-gate.test.ts apps/studio/test/services/instrumentation/browser-sink.test.ts apps/studio/test/services/instrumentation/worker-sink.test.ts
git commit -m "feat(studio): gate instrumentation on prod builds + the existing telemetry opt-in flag"
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

Now retrofit `CodegenProvider.tsx`'s retry-cap-exhausted branch. Precision about the real code (verified): the `preview:result` handler has TWO `clearHydrationRetriesRemaining(targetId)` call sites, but only ONE is exhaustion-adjacent and NEITHER is the exhaustion branch itself —

- `unresolvedNames.length === 0` → `markResolved` + clear: the SUCCESS path. Do not touch.
- `namespacesToHydrate.size === 0` → clear: the "every unresolved name is genuinely unresolved, don't burn budget" path (see its own comment). This is give-up-by-classification, NOT retry exhaustion — its budget was deliberately never spent. Do not touch in this task.
- `const canRetry = orchestrator.beginRetryRound(targetId); if (canRetry) { ... }` — there is currently NO else. `canRetry === false` IS retry exhaustion (`HydrationOrchestrator.beginRetryRound` returns false once `attempts >= MAX_HYDRATION_RETRIES_PER_TARGET`), and today it does nothing but fall through to `setHydrationRetriesRemaining(targetId, 0)`. THIS is where the throw goes.

Define the thrower at module scope in `CodegenProvider.tsx`, wrapped BY HAND — the Task 12 codemod only rewrites *exported* function declarations, so a module-local helper like this would never be auto-wrapped; relying on "the codemod will get it later" would silently leave the entire exhaustion path uninstrumented:

```ts
import { MAX_HYDRATION_RETRIES_PER_TARGET } from '../../services/hydration-orchestrator.js'; // new import — only the class is imported today
import { withInstrumentation } from '../../services/instrumentation/core.js';
import { RetryExhaustedError } from '../../services/instrumentation/errors.js';

const reportHydrationRetryExhausted = withInstrumentation(
  function reportHydrationRetryExhausted(targetId: string, attempts: number): never {
    throw new RetryExhaustedError(targetId, attempts);
  },
  {
    op: 'hydrationRetryExhausted',
    // targetId is deliberately NOT captured: a preview target can be a
    // user-authored type fqn, not just a curated id. Error-class name +
    // attempt count are structurally safe.
    sanitizeError: (err) => ({
      signature: err instanceof Error ? err.name : 'Error',
      context: err instanceof RetryExhaustedError ? { attempts: err.attempts } : undefined
    })
  }
);
```

Add an `else` to the `if (canRetry)` branch, with the caller's own `try/catch` so today's observable UX (fall through, `setHydrationRetriesRemaining(targetId, 0)` still runs after the if/else, schema `status`/`unsupportedFeatures` drive the UI) is unchanged — the only behavioral addition is that instrumentation now sees the give-up:

```ts
if (canRetry) {
  // ... existing retry-request loop, unchanged ...
} else {
  try {
    reportHydrationRetryExhausted(targetId, MAX_HYDRATION_RETRIES_PER_TARGET);
  } catch {
    // Preserves today's observable UX. This catch exists ONLY so the throw
    // routes through instrumentation's error-capture path without changing
    // control flow for anything downstream of this handler.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/errors.test.ts test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`
Expected: PASS. (Write `CodegenProvider.retry-exhausted.test.tsx` following the existing patterns in `apps/studio/test/shell/providers/CodegenProvider.test.tsx`. `reportHydrationRetryExhausted` is module-local and cannot be spied on directly — assert through its observable effects instead: install a test emit via `configureInstrumentation`, set the threshold as needed (error records always clear it), drive a `preview:result` message whose unresolved names map to a deferred export after the orchestrator's budget is exhausted (`beginRetryRound` returning false), then assert (a) exactly one emitted record with `op: 'hydrationRetryExhausted'`, `level: 'error'`, `signature: 'RetryExhaustedError'`, `context: { attempts: 5 }`, (b) the retries-remaining state still ends at 0 exactly as before the retrofit, and (c) no exception escapes the handler.)

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

Change the SPDX header at the top of the moved file from `FSL-1.1-ALv2` to `MIT` (the code itself is unmodified — see Global Constraints on licensing). Create `packages/instrumentation-core/package.json` AND `packages/instrumentation-core/tsconfig.json` following the exact pattern of `packages/curated-schema` (`name`, `version`, `private`, `type: module`, dist-pointing `exports` with `types`, `build: tsc -b`, `test: vitest run`, `type-check`, `devDependencies` for `vitest`). **Dist-pointing exports (curated-schema's pattern) are required here, not the `visual-editor` src-pointing style**: `packages/codegen` builds to `dist/` and runs in real Node (CLI, and studio's vitest config force-externalizes `@rune-langium/codegen` to Node's native loader) — Node cannot load a `.ts` exports target at runtime. Consequence to note in the task: like codegen, instrumentation-core must be REBUILT after any source change before dependents' tests see it. Re-export from the old location so Tasks 1–8's existing import paths keep working:

```ts
// apps/studio/src/services/instrumentation/core.ts (replaces the moved file)
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
export * from '@rune-langium/instrumentation-core';
```

Add `@rune-langium/instrumentation-core` as a `workspace:*` dependency of BOTH `apps/studio/package.json` AND `packages/codegen/package.json` (this task's decorator, Step 4, imports it from codegen — forgetting the codegen side is the licensing bug this whole restructuring exists to prevent), then run `pnpm install` to link the new workspace package, and `pnpm --filter @rune-langium/instrumentation-core run build`.

Move Task 1–3's `core.test.ts`/`with-instrumentation.test.ts`/`with-instrumentation-child.test.ts` AND Task 7's `prod-gate.test.ts` to `packages/instrumentation-core/test/` and update their relative import paths (`../src/index.js`; prod-gate reads `../src/index.ts` as source text). `prod-gate.test.ts` must move because it asserts on the SOURCE of the module containing the gate — after this move the studio-side `core.ts` is a 3-line re-export and the assertion would fail against it.

- [ ] **Step 2: Run the moved tests to confirm the restructure didn't break anything**

Run: `pnpm --filter @rune-langium/instrumentation-core run build && pnpm --filter @rune-langium/instrumentation-core run test && pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/`
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
git add packages/instrumentation-core apps/studio/src/services/instrumentation/core.ts apps/studio/package.json packages/codegen/package.json pnpm-lock.yaml apps/studio/test/services/instrumentation/ packages/codegen/src/instrument.ts packages/codegen/src/emit/zod-emitter.ts packages/codegen/test/instrument.test.ts
git commit -m "feat(codegen): extract MIT-licensed instrumentation-core package, add native method decorator, instrument ZodNamespaceEmitter"
```

---

### Task 10: Apply the decorator to the remaining codegen emitters

**Files:**
- Modify: `packages/codegen/src/emit/ts-emitter.ts`, `json-schema-emitter.ts`, `sql-emitter.ts`, `xsd-emitter.ts`, `openapi-emitter.ts`

**Interfaces:**
- Consumes: `debug` decorator from Task 9 — mechanical repeat of the same pattern, no new interface.

- [ ] **Step 1: Apply `@debug()` to each remaining `*NamespaceEmitter` class's per-type emission methods**

For each of `TsNamespaceEmitter`, `JsonSchemaNamespaceEmitter`, `SqlNamespaceEmitter`, `XsdNamespaceEmitter`, `OpenApiNamespaceEmitter`: import `debug` from `../instrument.js`, and add `@debug()` above each PUBLIC per-type emission hook the class implements from the `NamespaceEmitter` interface (`packages/codegen/src/emit/namespace-emitter.ts`): `emitEnumeration`, `emitTypeAlias`, `emitData`, plus the optional `emitChoice`/`emitDataPrelude` where a given emitter implements them. Do NOT blanket-decorate every method whose name starts with `emit` — the emitters also have many PRIVATE `emit*` helpers (e.g. zod-emitter's `emitAttribute`, `emitObjectBody`, …) that Task 9 deliberately left undecorated; mirror Task 9's actual selection, the interface hooks. (Note: `BaseNamespaceEmitter` itself only declares `finalize()` abstract — the shared per-type contract lives on the `NamespaceEmitter` interface, not the base class.)

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
- Modify: `apps/studio/src/main.tsx`, `apps/studio/src/services/telemetry-capture.ts` (export the existing private `signatureFor` — see Step 4)
- Test: `apps/studio/test/components/InstrumentationErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: `emitRecord` (Task 1) — the boundary emits a hand-built `TelemetryRecord` directly rather than wrapping a function, so it uses `emitRecord`, promoted from "internal" to a documented public export in Step 1 (the need only becomes concrete here, so the promotion happens in this task rather than retroactively editing Task 1). Also `signatureFor` from `telemetry-capture.ts`.

- [ ] **Step 1: Promote `emitRecord` to a public export**

In `packages/instrumentation-core/src/index.ts`, remove the "Internal — not exported publicly" comment above `emitRecord` and confirm it's already exported (it is, from Task 1 — the comment was aspirational, not enforced; this step just corrects the comment and confirms the public contract).

- [ ] **Step 2: Write the failing test**

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
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
import { signatureFor } from '../services/telemetry-capture.js';

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
      // signatureFor (telemetry-capture.ts, exported for this in this task —
      // change its `function signatureFor` to `export function signatureFor`)
      // is allowlisted-name + hashed-top-stack-frame, deliberately EXCLUDING
      // error.message: messages are low-entropy, guessable text that can
      // interpolate user/model content — see signatureFor's own doc comment.
      // Never put raw error.message in a shipped record.
      signature: signatureFor(error),
      // componentStack names studio's OWN components (bundled code shipped to
      // every user), not user content — safe to truncate-and-carry.
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
git add packages/instrumentation-core/src/index.ts apps/studio/src/components/InstrumentationErrorBoundary.tsx apps/studio/src/main.tsx apps/studio/src/services/telemetry-capture.ts apps/studio/test/components/InstrumentationErrorBoundary.test.tsx
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
import path from 'node:path';
import { Project } from 'ts-morph';

// cwd is apps/studio when invoked via `pnpm --filter @rune-langium/studio exec`
// (and when vitest runs the test below) — every path here is relative to the
// PACKAGE root, not the repo root.
const CORE_MODULE = path.resolve('src/services/instrumentation/core.ts');

function relativeImportPathFor(fileDir: string): string {
  // Computed per-file so every rewritten file imports withInstrumentation
  // via a correct relative path regardless of its depth under src/ (or
  // functions/ — the same expression yields `../../src/...` from there).
  let rel = path.relative(fileDir, CORE_MODULE).replace(/\.ts$/, '.js');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

export function runCodemod(globPattern: string): void {
  // skipAddingFilesFromTsConfig is load-bearing: without it the Project
  // pre-loads EVERY file in the studio tsconfig, and iterating the project's
  // source files would rewrite the whole package on any invocation instead
  // of just the glob. Iterate ONLY the files the glob added, for the same
  // reason.
  const project = new Project({ tsConfigFilePath: 'tsconfig.json', skipAddingFilesFromTsConfig: true });
  const sourceFiles = project.addSourceFilesAtPaths(globPattern);
  for (const sourceFile of sourceFiles) {
    if (sourceFile.getFullText().includes('@instrumentation-codemod-applied')) continue; // idempotency marker
    const fns = sourceFile.getFunctions().filter((fn) => fn.isExported() && fn.getName());
    if (fns.length === 0) continue;
    const importPath = relativeImportPathFor(sourceFile.getDirectoryPath());
    for (const fn of fns) {
      const name = fn.getName()!;
      const isAsync = fn.isAsync();
      const typeParamsText = fn.getTypeParameters().map((p) => p.getText()).join(', ');
      const paramsText = fn.getParameters().map((p) => p.getText()).join(', ');
      const returnTypeText = fn.getReturnTypeNode()?.getText() ?? '';
      const bodyText = fn.getBodyText() ?? '';
      const fnText = `${isAsync ? 'async ' : ''}function ${name}${typeParamsText ? `<${typeParamsText}>` : ''}(${paramsText})${returnTypeText ? `: ${returnTypeText}` : ''} {\n${bodyText}\n}`;
      fn.replaceWithText(
        `export const ${name} = withInstrumentation(${fnText}, { op: '${name}', sanitize: () => '[unsanitized-default: REVIEW]', sanitizeError: (e) => ({ signature: e instanceof Error ? e.name : 'Error' }) });`
      );
    }
    sourceFile.addImportDeclaration({ moduleSpecifier: importPath, namedImports: ['withInstrumentation'] });
    sourceFile.insertText(0, '// @instrumentation-codemod-applied\n');
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

**Known, accepted limitation — hoisting:** the declaration→`const` rewrite removes function hoisting. A same-module call site ABOVE the (former) declaration becomes a "block-scoped variable used before its declaration" error, surfaced by the `tsc --noEmit` gate that follows every codemod run — resolve by reordering, or leave that one function unwrapped (with an inline oxlint-disable for Task 13's rule) if reordering is invasive. The rewrite also drops any JSDoc attached to the function — check the diff for lost doc comments and re-attach them above the new `const`.

**Deliberate, flagged limitation**: the codemod's default `sanitize` is a placeholder string (`'[unsanitized-default: REVIEW]'`), not a silent pass-through of raw values — this is intentional and matches the Global Constraint that sanitization must never default to capturing raw data. Every codemod'd file needs a human pass replacing the placeholder with a real per-function sanitizer (or explicitly deciding `capture: 0`, i.e. never capture input/output for that function, only duration/errors) — this is called out explicitly in Task 13's review step, not silently left as permanent placeholder text in shipped code.

- [ ] **Step 3: Prove it on one real, low-risk file**

```bash
git checkout -b codemod-proof-slice
pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts "src/utils/uri.ts"
git diff apps/studio/src/utils/uri.ts
```

Manually inspect the diff: confirm `pathToUri` and `uriToPath` (the file's two exports — there is no third function in `uri.ts`) are rewritten to `withInstrumentation(...)` calls with correct relative import, confirm the file still type-checks and its existing tests still pass unmodified:

Run: `pnpm --filter @rune-langium/studio exec tsc --noEmit && pnpm --filter @rune-langium/studio exec vitest run test/components/pathToUri.test.ts`
Expected: type-check clean, all `pathToUri.test.ts` tests still PASS (the codemod must not change any function's observable behavior — its wrapping is transparent for the success path per Task 2's design)

Discard the proof branch's changes (this was a proof run, not the real sweep — Task 13 does the real one with sanitizers filled in):

```bash
git checkout apps/studio/src/utils/uri.ts
git checkout docs/instrumentation-wrapper-design # return to the working branch
git branch -D codemod-proof-slice
```

- [ ] **Step 4: Write a unit test for the codemod itself, against a fixture file**

Location: `apps/studio/test/scripts/instrument-codemod.test.ts` — it MUST live under `test/` (not next to the script) because `vitest.config.ts`'s `include` only covers `test/**/*.test.{ts,tsx}` and `functions/test/**/*.test.ts`; a test file in `scripts/` would silently never run.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodemod } from '../../scripts/instrument-codemod.js';

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

Run: `pnpm --filter @rune-langium/studio exec vitest run test/scripts/instrument-codemod.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/scripts/instrument-codemod.ts apps/studio/test/scripts/instrument-codemod.test.ts apps/studio/package.json pnpm-lock.yaml
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

Scoping via `overrides` is required, not optional: the studio package also contains `test/`, `scripts/`, and Playwright config files full of exported helper functions that no codemod pass will ever wrap — an unscoped rule would flag all of them, and Task 14's flip to `"error"` would then fail CI on files outside the design's scope (`apps/studio/src` + the Functions runtime code, per the spec's "Retrofit scope"). `functions/test/` is deliberately not listed for the same reason.

```json
{
  "jsPlugins": ["../../oxlint-plugins/rune.mjs"],
  "rules": {
    "rune/no-raw-arbitrary-value": "error",
    "rune/no-raw-node-id": "error"
  },
  "overrides": [
    {
      "files": ["src/**", "functions/api/**", "functions/lib/**", "functions/_middleware.ts"],
      "rules": {
        "rune/no-uninstrumented-export": "warn"
      }
    }
  ]
}
```

Start at `"warn"`, not `"error"` — the repo-wide sweep (Task 14) hasn't run yet at this point in the plan, so turning this on as `"error"` before every existing exported function is covered would fail CI immediately on unrelated, pre-existing code. Task 14's final step flips it to `"error"` once the sweep is complete and clean.

- [ ] **Step 3: Verify the rule fires on a known-bad fixture and stays silent on a known-good one**

The fixtures must live under a path the Step 2 `overrides.files` globs actually match (a `/tmp` file would never trigger the scoped rule), so create them under `src/`, lint, and delete — never commit them:

```bash
cat > apps/studio/src/services/__tmp-lint-fixture-bad.ts <<'EOF'
export function unwrapped(x: number): number {
  return x;
}
EOF
cat > apps/studio/src/services/__tmp-lint-fixture-good.ts <<'EOF'
import { withInstrumentation } from './instrumentation/core.js';
export const wrapped = withInstrumentation(function wrapped(x: number): number {
  return x;
}, { op: 'wrapped' });
EOF
pnpm --filter @rune-langium/studio exec oxlint --config .oxlintrc.json src/services/__tmp-lint-fixture-bad.ts
# Expected: reports rune/no-uninstrumented-export
pnpm --filter @rune-langium/studio exec oxlint --config .oxlintrc.json src/services/__tmp-lint-fixture-good.ts
# Expected: no rune/no-uninstrumented-export report
rm apps/studio/src/services/__tmp-lint-fixture-bad.ts apps/studio/src/services/__tmp-lint-fixture-good.ts
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
- Modify: every exported function under ALL of `apps/studio/src/` — by directory group: `services/`, `store/`, `shell/`, `components/`, `workers/`, `utils/` (this is where `pathToUri` — the PR #461 function this whole design exists for — actually lives; omitting it would instrument everything EXCEPT the motivating example), `hooks/`, `lang/`, `lens/`, `opfs/`, `workspace/`, `codegen-forms/`, and the top-level `src/*.ts(x)` files (`App.tsx`, `config.ts`, `test-api.ts`) — plus `apps/studio/functions/api/`, `functions/lib/`, `functions/_middleware.ts`
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

- [ ] **Step 3: Repeat Steps 1–2 for every remaining directory group from the Files list above**

Group order (one codemod+review+commit cycle per group, committing after each group passes clean — keeps each diff reviewable and bisectable): `src/shell/`, `src/components/` (React components included — same codemod, same review process), `src/workers/`, `src/utils/`, `src/hooks/`, `src/lang/`, `src/lens/`, `src/opfs/`, `src/workspace/`, `src/codegen-forms/`, top-level `src/*.ts(x)`, then `functions/api/` + `functions/lib/` + `functions/_middleware.ts`.

Two categories the codemod does NOT rewrite, which each group's pass must handle by hand before its commit (Task 13's rule flags them, so the Step 4 error-flip fails otherwise):

- `export const f = (...) => ...` arrow/function-expression exports — the codemod only rewrites `export function` DECLARATIONS. Wrap these manually in `withInstrumentation(...)` (zustand `create(...)` stores and other non-function `const` exports are not flagged and need nothing).
- Functions legitimately left unwrapped (hoisting conflicts per Task 12's known limitation, or the instrumentation core's own modules) — add an inline oxlint-disable comment with a one-line reason.

- [ ] **Step 4: Flip `rune/no-uninstrumented-export` to `"error"`**

Inside the `overrides` entry Task 13 added (the rule lives there, not in the top-level `rules` block):

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

- **Spec coverage**: Problem/Goal → Task 8 (concrete exhaustion example) + Tasks 1-7 (the core pipe); Non-goals → respected throughout (no OTel/Sentry/pino deps added anywhere, no class migration, no bundler plugin — Task 12 uses `ts-morph`, a pre-build script); Core API → Tasks 1-3; Sinks/Toggle → Tasks 4-7; Levels/thresholds → Tasks 1-3 (resolved the "exact handling" open question from the spec: **no change to `telemetry-shipper.ts`'s `SAMPLE_RATE` table or `telemetry.ts`'s wire schema is needed**, contrary to the spec's speculative "either... or" framing — but for a two-part reason, verified against both files: (1) with the default `'warn'` threshold, `trace`/`debug`/`info` success records never reach `addLine` at all, so the shipper never sees them; (2) when the threshold IS lowered for troubleshooting, the browser sink maps `trace`/`debug` to severity `'info'` BEFORE `addLine` (OutputSeverity and the wire schema's closed `level: z.enum(['info','warn','error'])` have no lower tier), so they ship as ordinary info spans at the existing 2% sample — the shipper's `severity !== 'error' && !== 'warn' && !== 'info'` filter does NOT drop them, and does not need to); Wiring mechanism (decorators + codemod + lint rule + Error Boundary) → Tasks 9-14; Known sanitization gap for workers/edge → explicitly left unresolved per the spec's own "not solved by this design" framing, not silently dropped from this plan either.
- **Placeholder scan**: the codemod's `'[unsanitized-default: REVIEW]'` string is a deliberate, flagged, temporary artifact of the codemod's OWN output — not a placeholder in this PLAN. Task 14 exists specifically to eliminate every instance of it from shipped code before the lint rule goes to `"error"`.
- **Type consistency**: `TelemetryRecord`, `Level`, `Capture`, `InstrumentationOptions`, `Emit` are defined once (Task 1) and referenced identically by name in every later task; `withInstrumentation`/`.child`/`.trace`/`.debug`/`.info`/`.warn` signatures introduced in Tasks 2-3 are reused verbatim in Tasks 4-14, not redefined.
- **New finding during planning, not in the original spec**: `packages/codegen` (MIT) needs the core module too (Task 9's decorator), but the core module started life under `apps/studio` (FSL). Task 9 extracts it into a new small MIT package (`packages/instrumentation-core`) rather than duplicating the module under two licenses — the spec didn't anticipate this because the class-based/decorator insight came from `packages/codegen`, a different package than where the design's examples (`apps/studio`) lived. Flagging this explicitly since it's a real, licensing-driven restructuring a plan reviewer should know was deliberate, not an oversight.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-01-instrumentation-wrapper.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
