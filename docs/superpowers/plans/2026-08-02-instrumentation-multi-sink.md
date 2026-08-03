# Multi-Sink Instrumentation Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built-but-currently-unreachable-from-instrumentation Toast and Activity Panel UI surfaces into the existing `apps/studio` telemetry pipe (PR #462) as two genuinely independent sinks, and rework the `Level` default/error-tier scheme so `'info'` becomes a deliberately curated, explicit-opt-in signal instead of a depth-based default.

**Architecture:** `packages/instrumentation-core`'s `emitRecord` becomes a fan-out dispatcher (a primary sink plus N additional registered sinks, still plain function references — no `Sink` interface/class). A new `namespace` field on `InstrumentationOptions`/`TelemetryRecord` is the actual opt-in signal for Toast/Activity visibility (not numeric `level` — every unconditionally-emitted error already clears any numeric floor by construction). The Toast sink calls a new, minimal, side-effect-free `notify` pass-through added to `StudioToastContextValue` — never the existing `showToast`, which already has its own separate, already-shipped output/activity mirroring that must not be duplicated. The Activity sink calls `useActivityStore`'s existing `addActivity` directly. Both sinks are independently registered and independently gated.

**Tech Stack:** TypeScript 5.9+ strict/ESM, vitest, React 19, zustand 5 — no new dependencies.

## Global Constraints

- No `Sink` interface/class anywhere — `emit` stays a plain function reference; `addInstrumentationSink` registers additional plain function sinks into a fan-out set, it does not replace `configureInstrumentation`'s existing single-primary-sink contract.
- `namespace` presence (not numeric `level`) is the sole gate for Toast/Activity visibility. A record with no `namespace` must never reach either sink, regardless of level — this is the load-bearing regression every relevant task's tests must assert.
- Toast and Activity are two fully independent sinks with no shared internal call path. The Toast sink must call the new `notify` pass-through, never the existing `showToast` (which has its own separate, already-shipped `output-store`/`activity-store` mirroring — the "superset-of-toasts invariant" from `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md`). Routing through `showToast` would double-write Activity entries.
- The **existing** `showToast`/`showLoadingToast`/`dismissToast` and their existing mirroring behavior must not be modified by any task in this plan. No existing call site, and no existing prod-ux-checkout-harness assertion, changes.
- `resolveLevel()`'s precedence order (explicit > `.child()`-inherited > depth-default) is unchanged — do not touch it.
- The default (no `handled` option) error-record level stays `'error'` — every one of the original instrumentation-wrapper plan's 277 call sites that don't opt into `handled` must see zero behavior change.
- Global default threshold changes from `'warn'` to `'info'` in `packages/instrumentation-core/src/index.ts`.
- `namespace` stays optional at the type level (`namespace?: string` in core, `namespace?: InstrumentationNamespace` in studio call sites) — never forced non-optional, no new lint rule enforcing its presence.
- Licensing: `packages/instrumentation-core/**` = MIT, `apps/studio/**` = FSL-1.1-ALv2. Every new/modified file keeps the correct SPDX header for its directory.

---

### Task 1: Level model — depth default, error tiering, `namespace` field

**Files:**
- Modify: `packages/instrumentation-core/src/index.ts`
- Test: `packages/instrumentation-core/test/with-instrumentation.test.ts`

**Interfaces:**
- Consumes: nothing new — modifies existing `defaultLevelForDepth`, `emitError`, `emitSuccessWithContext`, `TelemetryRecord`, `InstrumentationOptions`, `threshold`/`resetInstrumentationThresholdForTests`.
- Produces: `InstrumentationOptions.handled?: boolean`, `InstrumentationOptions.errorLevel?: 'warn' | 'debug'`, `InstrumentationOptions.namespace?: string`, `TelemetryRecord.namespace?: string`. Task 3/5/6 consume `namespace` from `InstrumentationOptions`/`TelemetryRecord` by these exact names.

- [ ] **Step 1: Write the failing tests**

Add to `packages/instrumentation-core/test/with-instrumentation.test.ts` (extend the existing import list at the top of the file to also import `getInstrumentationThreshold`):

```ts
import {
  Capture,
  configureInstrumentation,
  getInstrumentationThreshold,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../src/index.js';
```

Append these new `describe` blocks at the end of the file:

```ts
describe('depth-based default level', () => {
  it('depth-0 (top-level) calls default to debug, not info', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation((x: number) => x + 1, { op: 'addOne', capture: 0 });
    wrapped(41);
    expect(emitted).toEqual([expect.objectContaining({ op: 'addOne', level: 'debug' })]);
  });

  it('nested calls (depth >= 1) default to trace', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const inner = withInstrumentation((x: number) => x + 1, { op: 'inner', capture: 0 });
    const outer = withInstrumentation(() => inner(41), { op: 'outer', capture: 0 });
    outer();
    expect(emitted).toEqual([
      expect.objectContaining({ op: 'inner', level: 'trace' }),
      expect.objectContaining({ op: 'outer', level: 'debug' })
    ]);
  });
});

describe('error-level tiering', () => {
  it('default (no handled) error stays "error" — matches today\'s shipped behavior', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    const wrapped = withInstrumentation(() => {
      throw new Error('boom');
    }, { op: 'explode' });
    expect(() => wrapped()).toThrow('boom');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'error' })]);
  });

  it('handled:true (no errorLevel) demotes to warn', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('warn');
    const wrapped = withInstrumentation(() => {
      throw new Error('boom');
    }, { op: 'explode', handled: true });
    expect(() => wrapped()).toThrow('boom');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'warn' })]);
  });

  it('handled:true + errorLevel:"debug" demotes to debug', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(() => {
      throw new Error('noise');
    }, { op: 'explode', handled: true, errorLevel: 'debug' });
    expect(() => wrapped()).toThrow('noise');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'debug' })]);
  });

  it('all three error tiers still emit unconditionally regardless of threshold', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // strictest possible threshold
    const rethrown = withInstrumentation(() => {
      throw new Error('a');
    }, { op: 'a' });
    const handledWarn = withInstrumentation(() => {
      throw new Error('b');
    }, { op: 'b', handled: true });
    const handledDebug = withInstrumentation(() => {
      throw new Error('c');
    }, { op: 'c', handled: true, errorLevel: 'debug' });
    expect(() => rethrown()).toThrow();
    expect(() => handledWarn()).toThrow();
    expect(() => handledDebug()).toThrow();
    expect(emitted).toEqual([
      expect.objectContaining({ op: 'a', level: 'error' }),
      expect.objectContaining({ op: 'b', level: 'warn' }),
      expect.objectContaining({ op: 'c', level: 'debug' })
    ]);
  });
});

describe('namespace threading', () => {
  it('namespace passes through on a success record', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'notify', level: 'info', namespace: 'workspace' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'notify', namespace: 'workspace' })]);
  });

  it('namespace passes through on an error record', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    const wrapped = withInstrumentation(() => {
      throw new Error('boom');
    }, { op: 'explode', handled: true, namespace: 'curated' });
    expect(() => wrapped()).toThrow();
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', namespace: 'curated' })]);
  });

  it('namespace is undefined when not set — never defaults', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'plain', level: 'info' });
    wrapped();
    expect((emitted[0] as { namespace?: string }).namespace).toBeUndefined();
  });
});

describe('global default threshold', () => {
  it("default threshold is 'info', not 'warn'", () => {
    expect(getInstrumentationThreshold()).toBe('info');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/instrumentation-core exec vitest run test/with-instrumentation.test.ts`
Expected: FAIL — `handled`/`errorLevel`/`namespace` don't exist on `InstrumentationOptions`, `defaultLevelForDepth` still returns `'info'` at depth 0, `getInstrumentationThreshold()` still returns `'warn'`.

- [ ] **Step 3: Implement**

In `packages/instrumentation-core/src/index.ts`:

Change `TelemetryRecord` (add `namespace`):

```ts
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
  ts: number;
}
```

Change `InstrumentationOptions` (add `handled`, `errorLevel`, `namespace`):

```ts
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
}
```

Change the threshold default (two places):

```ts
let threshold: Level = 'info';
```

```ts
/** Test-only: restores the default threshold between test files. */
export function resetInstrumentationThresholdForTests(): void {
  threshold = 'info';
}
```

Change `defaultLevelForDepth`:

```ts
function defaultLevelForDepth(): Level {
  if (depth <= 0) return 'debug';
  return 'trace';
}
```

Change `emitError` (compute the level tier, thread `namespace`):

```ts
function errorLevelFor(opts: InstrumentationOptions): Level {
  if (!opts.handled) return 'error';
  return opts.errorLevel ?? 'warn';
}

// `bindingContext` lets `.child()`-bound wrappers attach their bound
// context to error records the same way success records do.
function emitError(op: string, opts: InstrumentationOptions, err: unknown, bindingContext?: unknown): void {
  const { signature, context } = (opts.sanitizeError ?? defaultSanitizeError)(err);
  emitRecord({
    op,
    level: errorLevelFor(opts),
    captured: 0,
    signature,
    context: context ?? bindingContext,
    namespace: opts.namespace,
    ts: Date.now()
  });
}
```

Change `emitSuccessWithContext`'s signature (add a `namespace` parameter) and both call sites inside `wrapped`:

```ts
function emitSuccessWithContext(
  op: string,
  level: Level,
  capture: number,
  args: unknown[],
  output: unknown,
  sanitize: (value: unknown, which: 'input' | 'output') => unknown,
  durationMs: number,
  context: unknown,
  namespace: string | undefined
): void {
  const record: TelemetryRecord = { op, level, captured: capture, ts: Date.now(), durationMs, context, namespace };
  if (capture & Capture.Input) record.input = sanitize(args, 'input');
  if (capture & Capture.Output) record.output = sanitize(output, 'output');
  emitRecord(record);
}
```

Inside `makeWithInstrumentation`'s `wrapped` function, update both `emitSuccessWithContext(...)` call sites to pass `opts.namespace` as the new last argument:

```ts
          return result.then(
            (value) => {
              depth--;
              if (clears)
                emitSuccessWithContext(
                  op,
                  level,
                  capture,
                  args,
                  value,
                  sanitize,
                  performance.now() - start,
                  context,
                  opts.namespace
                );
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
          emitSuccessWithContext(
            op,
            level,
            capture,
            args,
            result,
            sanitize,
            performance.now() - start,
            context,
            opts.namespace
          );
        return result;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/instrumentation-core exec vitest run test/with-instrumentation.test.ts`
Expected: PASS (all new tests, plus every pre-existing test in this file still green — the `finally`/`depth--`/`clears`-gates-only-emission structure is untouched, only the level/error-tier computation and the new `namespace` field changed).

Also run the FULL instrumentation-core suite to confirm nothing else regressed:

Run: `pnpm --filter @rune-langium/instrumentation-core test`
Expected: PASS (this includes `core.test.ts`, `with-instrumentation-child.test.ts`, `prod-gate.test.ts` — none of which this task's changes should affect, but confirm).

- [ ] **Step 5: Commit**

```bash
git add packages/instrumentation-core/src/index.ts packages/instrumentation-core/test/with-instrumentation.test.ts
git commit -m "feat(instrumentation-core): depth-default is debug not info, 3-tier error level, namespace field"
```

---

### Task 2: Fan-out sink registration

**Files:**
- Modify: `packages/instrumentation-core/src/index.ts`
- Test: `packages/instrumentation-core/test/multi-sink.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `TelemetryRecord`/`Emit` (unchanged shape from Task 1's perspective — this task only changes `emitRecord`'s dispatch, not the record shape).
- Produces: `addInstrumentationSink(sink: Emit): () => void`. Task 3's `installInstrumentationActivitySink` and Task 5's Toast-sink `useEffect` both consume this exact function by this exact name and signature.

- [ ] **Step 1: Write the failing test**

Create `packages/instrumentation-core/test/multi-sink.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  addInstrumentationSink,
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../src/index.js';

afterEach(() => {
  resetInstrumentationForTests();
});

describe('addInstrumentationSink', () => {
  it('an additional sink receives records alongside the primary configureInstrumentation sink', () => {
    const primary: unknown[] = [];
    const secondary: unknown[] = [];
    configureInstrumentation((r) => primary.push(r));
    addInstrumentationSink((r) => secondary.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    wrapped();
    expect(primary).toEqual([expect.objectContaining({ op: 'test' })]);
    expect(secondary).toEqual([expect.objectContaining({ op: 'test' })]);
  });

  it('multiple additional sinks all receive the same record', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    configureInstrumentation(() => {});
    addInstrumentationSink((r) => a.push(r));
    addInstrumentationSink((r) => b.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    wrapped();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('the returned unregister function stops future delivery to that sink', () => {
    const received: unknown[] = [];
    configureInstrumentation(() => {});
    const unregister = addInstrumentationSink((r) => received.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    wrapped();
    expect(received).toHaveLength(1);
    unregister();
    wrapped();
    expect(received).toHaveLength(1);
  });

  it('resetInstrumentationForTests clears all additional sinks between tests', () => {
    configureInstrumentation(() => {});
    addInstrumentationSink(() => {
      throw new Error('this sink should never fire after reset');
    });
    resetInstrumentationForTests();
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    expect(() => wrapped()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/instrumentation-core exec vitest run test/multi-sink.test.ts`
Expected: FAIL — `addInstrumentationSink` is not exported.

- [ ] **Step 3: Implement**

In `packages/instrumentation-core/src/index.ts`, add near `currentEmit`'s declaration:

```ts
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
```

Change `emitRecord`:

```ts
export function emitRecord(record: TelemetryRecord): void {
  currentEmit(record);
  for (const sink of additionalSinks) sink(record);
}
```

Change `resetInstrumentationForTests`:

```ts
export function resetInstrumentationForTests(): void {
  currentEmit = noopEmit;
  additionalSinks.clear();
  isEnabledCheck = () => true;
  resetInstrumentationThresholdForTests();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/instrumentation-core exec vitest run test/multi-sink.test.ts`
Expected: PASS (4 tests).

Run the full package suite again: `pnpm --filter @rune-langium/instrumentation-core test`
Expected: PASS, zero regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/instrumentation-core/src/index.ts packages/instrumentation-core/test/multi-sink.test.ts
git commit -m "feat(instrumentation-core): fan-out sink registration via addInstrumentationSink"
```

---

### Task 3: `InstrumentationNamespace` type + Activity sink

**Files:**
- Create: `apps/studio/src/services/instrumentation/namespace.ts`
- Create: `apps/studio/src/services/instrumentation/activity-sink.ts`
- Modify: `apps/studio/src/main.tsx`
- Test: `apps/studio/test/services/instrumentation/activity-sink.test.ts`

**Interfaces:**
- Consumes: `addInstrumentationSink` (Task 2), `TelemetryRecord` (Task 1), `useActivityStore`'s existing `addActivity(tag, ok, msg, meta)` (`apps/studio/src/store/activity-store.ts` — unmodified by this task).
- Produces: `InstrumentationNamespace` type (7 values, exact list below). `installInstrumentationActivitySink(): () => void`. Task 4 consumes `InstrumentationNamespace` for the filter UI. Task 6 consumes the string literal `'curated'` from this type.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/services/instrumentation/namespace.ts` (no test needed — a pure type alias, exercised by the tests below and by Task 4/6's consumers):

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * A small, fixed set of app subsystems — the gate for Toast/Activity
 * visibility (see docs/superpowers/specs/
 * 2026-08-02-instrumentation-multi-sink-design.md). Deliberately NOT the
 * Rune DSL "namespace" concept (user/model-defined strings like
 * cdm.base.staticdata.party) — same word, different, much narrower thing.
 */
export type InstrumentationNamespace =
  | 'codegen' // codegen-service.ts, codegen-worker.ts, download/export flows
  | 'lsp' // lsp-client.ts, lsp-session.ts, lsp-auth.ts, transport-provider.ts
  | 'workspace' // workspace.ts, persistence.ts, folder-backing.ts, model-loader/cache/registry
  | 'git' // git-backing.ts, git-sync.ts, github-auth.ts
  | 'form-preview' // preview-validator.ts, FormPreviewPanel, codegen-forms/*
  | 'curated' // curated-fetch.ts, curated-closure.ts (curated-bundle hydration)
  | 'instrumentation'; // the telemetry system's own self-diagnostics (rare)
```

Create `apps/studio/test/services/instrumentation/activity-sink.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';
import { useActivityStore } from '../../../src/store/activity-store.js';
import { installInstrumentationActivitySink } from '../../../src/services/instrumentation/activity-sink.js';

afterEach(() => {
  resetInstrumentationForTests();
  useActivityStore.setState({ entries: [] });
});

describe('installInstrumentationActivitySink', () => {
  it('a namespace-tagged call adds a correctly-shaped ActivityEntry', () => {
    configureInstrumentation(() => {});
    const unregister = installInstrumentationActivitySink();
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'testOp', level: 'info', namespace: 'workspace' });
    wrapped();
    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag: 'workspace', ok: true, msg: 'testOp' });
    unregister();
  });

  it('a debug-default call (no namespace) does NOT add an entry', () => {
    configureInstrumentation(() => {});
    installInstrumentationActivitySink();
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(() => 'ok', { op: 'plainOp' });
    wrapped();
    expect(useActivityStore.getState().entries).toHaveLength(0);
  });

  it('regression: an ordinary unhandled error with NO namespace does NOT add an entry, even though it unconditionally clears the global threshold', () => {
    configureInstrumentation(() => {});
    installInstrumentationActivitySink();
    setInstrumentationThreshold('error');
    const wrapped = withInstrumentation(() => {
      throw new Error('boom');
    }, { op: 'explode' });
    expect(() => wrapped()).toThrow('boom');
    expect(useActivityStore.getState().entries).toHaveLength(0);
  });

  it('a namespace-tagged handled error adds an entry with ok:false', () => {
    configureInstrumentation(() => {});
    installInstrumentationActivitySink();
    setInstrumentationThreshold('warn');
    const wrapped = withInstrumentation(() => {
      throw new Error('boom');
    }, { op: 'retryExhausted', handled: true, namespace: 'curated' });
    expect(() => wrapped()).toThrow('boom');
    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag: 'curated', ok: false, msg: 'retryExhausted' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/activity-sink.test.ts`
Expected: FAIL — `activity-sink.js` does not exist.

- [ ] **Step 3: Implement**

Create `apps/studio/src/services/instrumentation/activity-sink.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { addInstrumentationSink, type TelemetryRecord } from './core.js';
import { useActivityStore } from '../../store/activity-store.js';

/**
 * Feeds the Activity Panel from the shared telemetry pipe. Gates on
 * `record.namespace` being set, NOT numeric level — every unconditionally-
 * emitted error already clears any numeric floor by construction, so
 * gating on level alone would turn every uncaught error anywhere in the
 * app into an activity entry. `namespace` presence is what marks a call as
 * deliberately activity-worthy. See docs/superpowers/specs/
 * 2026-08-02-instrumentation-multi-sink-design.md.
 *
 * Independent of the Toast sink (StudioToastProvider.tsx) — a separate
 * registration, calling `addActivity` directly, never routed through any
 * toast machinery.
 */
export function installInstrumentationActivitySink(): () => void {
  return addInstrumentationSink((record: TelemetryRecord) => {
    if (!record.namespace) return;
    useActivityStore.getState().addActivity(record.namespace, record.level !== 'error', record.op, {
      subject: record.subject,
      durationMs: record.durationMs
    });
  });
}
```

In `apps/studio/src/main.tsx`, add the import alongside the existing `installInstrumentationBrowserSink` import:

```ts
import { installInstrumentationBrowserSink } from './services/instrumentation/browser-sink.js';
import { installInstrumentationActivitySink } from './services/instrumentation/activity-sink.js';
```

And add the call immediately after `installInstrumentationBrowserSink();`:

```ts
installOpLogWindowBridge();
installPerfLogWindowBridge();
installTypeGraphWindowBridge();
installInstrumentationBrowserSink();
installInstrumentationActivitySink();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/instrumentation/activity-sink.test.ts`
Expected: PASS (4 tests).

Run: `pnpm --filter @rune-langium/studio exec tsc --noEmit`
Expected: clean (confirms `main.tsx`'s new import/call resolve correctly).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instrumentation/namespace.ts apps/studio/src/services/instrumentation/activity-sink.ts apps/studio/src/main.tsx apps/studio/test/services/instrumentation/activity-sink.test.ts
git commit -m "feat(studio): InstrumentationNamespace type + Activity sink, wired at bootstrap"
```

---

### Task 4: `ActivityPanel` namespace filter

**Files:**
- Modify: `apps/studio/src/shell/panels/ActivityPanel.tsx`
- Test: `apps/studio/test/shell/panels/ActivityPanel.test.tsx` (new)

**Interfaces:**
- Consumes: `InstrumentationNamespace` (Task 3), `useActivityStore`'s existing `entries`/`clearEntries` (unmodified).
- Produces: nothing new consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Write the failing tests**

Create `apps/studio/test/shell/panels/ActivityPanel.test.tsx`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useActivityStore } from '../../../src/store/activity-store.js';
import { ActivityPanel } from '../../../src/shell/panels/ActivityPanel.js';

afterEach(() => {
  useActivityStore.setState({ entries: [] });
});

describe('ActivityPanel namespace filter', () => {
  it('shows all entries by default', () => {
    useActivityStore.getState().addActivity('codegen', true, 'generated');
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    render(<ActivityPanel />);
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('filters entries by the selected namespace', () => {
    useActivityStore.getState().addActivity('codegen', true, 'generated');
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    render(<ActivityPanel />);
    fireEvent.change(screen.getByTestId('activity-namespace-filter'), { target: { value: 'codegen' } });
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.queryByText('connected')).not.toBeInTheDocument();
  });

  it('shows a filter-specific empty state when no entries match', () => {
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    render(<ActivityPanel />);
    fireEvent.change(screen.getByTestId('activity-namespace-filter'), { target: { value: 'git' } });
    expect(screen.getByText('No activity matches this filter.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/panels/ActivityPanel.test.tsx`
Expected: FAIL — no element with `data-testid="activity-namespace-filter"` exists yet.

- [ ] **Step 3: Implement**

Replace `apps/studio/src/shell/panels/ActivityPanel.tsx` in full:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@rune-langium/design-system/utils';
import { useActivityStore } from '../../store/activity-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';
import type { InstrumentationNamespace } from '../../services/instrumentation/namespace.js';

const NAMESPACE_FILTERS: Array<InstrumentationNamespace | 'all'> = [
  'all',
  'codegen',
  'lsp',
  'workspace',
  'git',
  'form-preview',
  'curated',
  'instrumentation'
];

export const ActivityPanel = withInstrumentation(
  function ActivityPanel(): React.ReactElement {
    const entries = useActivityStore((s) => s.entries);
    const clearEntries = useActivityStore((s) => s.clearEntries);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [filter, setFilter] = useState<InstrumentationNamespace | 'all'>('all');

    const filteredEntries = useMemo(
      () => (filter === 'all' ? entries : entries.filter((entry) => entry.tag === filter)),
      [entries, filter]
    );

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [filteredEntries]);

    return (
      <section
        aria-label="Activity"
        data-testid="panel-activity"
        data-component="workspace.activity"
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
          <span className="text-xs font-medium text-foreground">Activity</span>
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter activity by namespace"
              data-testid="activity-namespace-filter"
              className="rounded border border-border bg-transparent px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
              value={filter}
              onChange={(e) => setFilter(e.target.value as InstrumentationNamespace | 'all')}
            >
              {NAMESPACE_FILTERS.map((ns) => (
                <option key={ns} value={ns}>
                  {ns === 'all' ? 'All' : ns}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
              onClick={clearEntries}
            >
              Clear
            </button>
          </div>
        </div>
        <div ref={scrollRef} aria-live="polite" className="studio-scroll flex-1 overflow-auto px-1 py-1">
          {filteredEntries.length === 0 ? (
            <p className="px-2 py-3 font-mono text-2xs text-muted-foreground/60">
              {entries.length === 0 ? 'No activity yet.' : 'No activity matches this filter.'}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 font-mono text-xs">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid items-center gap-2.5 rounded px-1.5 py-1 text-foreground/70 hover:bg-accent"
                  style={{ gridTemplateColumns: '48px 80px 1fr' }}
                >
                  <span className="text-muted-foreground/60">{entry.time}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-center text-3xs font-semibold uppercase tracking-[0.04em]',
                      entry.ok ? 'bg-teal-400/10 text-teal-400' : 'bg-destructive/15 text-destructive'
                    )}
                  >
                    {entry.tag}
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  },
  { op: 'ActivityPanel' }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/panels/ActivityPanel.test.tsx`
Expected: PASS (3 tests).

Run: `pnpm --filter @rune-langium/studio exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/panels/ActivityPanel.tsx apps/studio/test/shell/panels/ActivityPanel.test.tsx
git commit -m "feat(studio): ActivityPanel namespace filter"
```

---

### Task 5: `notify` pass-through + Toast sink

**Files:**
- Modify: `apps/studio/src/components/StudioToastProvider.tsx`
- Test: `apps/studio/test/components/StudioToastProvider.test.tsx`

**Interfaces:**
- Consumes: `addInstrumentationSink` (Task 2), `TelemetryRecord` (Task 1).
- Produces: `StudioToastContextValue.notify(toast: StudioToastInput): void` — a pure, side-effect-free toast render. Task 6's real-integration test does not call this directly (it fires through the instrumentation pipe), but any future manual caller may use it the same way as `showToast`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/studio/test/components/StudioToastProvider.test.tsx`. First, extend the existing imports at the top of the file:

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudioToastProvider, useStudioToast } from '../../src/components/StudioToastProvider.js';
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../src/services/instrumentation/core.js';
```

Add a new harness component alongside the existing `LoadingToastHarness`/`ShowToastHarness`:

```tsx
function NotifyHarness() {
  const { notify } = useStudioToast();
  return (
    <button onClick={() => notify({ title: 'workspace', description: 'testOp', variant: 'default' })}>notify</button>
  );
}
```

Append two new `describe` blocks at the end of the file:

```tsx
describe('StudioToastProvider — notify pass-through', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
  });

  it('notify renders a toast without touching output-store or activity-store', async () => {
    render(
      <StudioToastProvider>
        <NotifyHarness />
      </StudioToastProvider>
    );
    screen.getByText('notify').click();

    const toast = await screen.findByText('testOp');
    expect(toast).toBeTruthy();
    expect(useOutputStore.getState().lines).toHaveLength(0);
    expect(useActivityStore.getState().entries).toHaveLength(0);
  });

  it("showToast's existing mirroring is unaffected by notify's addition", () => {
    render(
      <StudioToastProvider>
        <ShowToastHarness />
      </StudioToastProvider>
    );
    screen.getByText('show').click();
    expect(useActivityStore.getState().entries).toHaveLength(1);
    expect(useActivityStore.getState().entries[0].tag).toBe('toast');
  });
});

describe('StudioToastProvider — instrumentation Toast sink', () => {
  afterEach(() => {
    resetInstrumentationForTests();
  });

  it('a namespace-tagged instrumented call fires a toast via notify', async () => {
    render(
      <StudioToastProvider>
        <div />
      </StudioToastProvider>
    );
    configureInstrumentation(() => {});
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'downloadCode', level: 'info', namespace: 'codegen' });
    wrapped();

    const toast = await screen.findByText('downloadCode');
    expect(toast).toBeTruthy();
    const toastRoot = toast.closest('[data-slot="toast"]');
    expect(toastRoot!.getAttribute('data-variant')).toBe('default');
  });

  it('an ordinary unhandled error with NO namespace does NOT fire a toast', () => {
    render(
      <StudioToastProvider>
        <div />
      </StudioToastProvider>
    );
    configureInstrumentation(() => {});
    setInstrumentationThreshold('error');
    const wrapped = withInstrumentation(() => {
      throw new Error('boom');
    }, { op: 'explode' });
    expect(() => wrapped()).toThrow('boom');
    expect(screen.queryByText('explode')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/StudioToastProvider.test.tsx`
Expected: FAIL — `notify` does not exist on `StudioToastContextValue`.

- [ ] **Step 3: Implement**

In `apps/studio/src/components/StudioToastProvider.tsx`:

Change the top imports (add `useEffect` to the React import, add the new instrumentation-core import):

```ts
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager
} from '@rune-langium/design-system/ui/toast';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import { useOutputStore, fmtLine } from '../store/output-store.js';
import { useActivityStore } from '../store/activity-store.js';
import { allocateOpId } from '../services/op-log.js';
import { addInstrumentationSink, withInstrumentation, type TelemetryRecord } from '../services/instrumentation/core.js';
```

Change `StudioToastContextValue` (add `notify`):

```ts
interface StudioToastContextValue {
  showToast: (toast: StudioToastInput) => void;
  /**
   * Shows a spinner toast for a background process (e.g. on-demand curated
   * namespace hydration) that has no natural "done" moment of its own to key
   * a UI state off — the toast stays open (no auto-dismiss timeout) until
   * the caller explicitly dismisses it via the returned id.
   */
  showLoadingToast: (toast: StudioLoadingToastInput) => string;
  /** Dismisses a toast by id (e.g. one returned by `showLoadingToast`). */
  dismissToast: (id: string) => void;
  /**
   * Pure toast render, no output-store/activity-store mirroring. Used by
   * the instrumentation Toast sink, which independently targets Activity
   * itself — see docs/superpowers/specs/
   * 2026-08-02-instrumentation-multi-sink-design.md. showToast's existing
   * mirroring is unaffected; this is a new, narrower, additive primitive.
   */
  notify: (toast: StudioToastInput) => void;
}
```

Inside `StudioToastInner`, immediately after the existing `dismissToast` `useCallback` block (right before `const contextValue = useMemo<StudioToastContextValue>(...)`), insert `notify` and the Toast sink registration:

```ts
  const notify = useCallback(
    (input: StudioToastInput) => {
      add({
        title: input.title,
        description: input.description,
        type: input.variant ?? 'default',
        timeout: input.duration
      });
    },
    [add]
  );

  useEffect(() => {
    return addInstrumentationSink((record: TelemetryRecord) => {
      if (!record.namespace) return;
      notify({
        title: record.namespace,
        description: record.op,
        variant: record.level === 'error' ? 'destructive' : 'default'
      });
    });
  }, [notify]);
```

Change `contextValue`'s `useMemo` to include `notify`:

```ts
  const contextValue = useMemo<StudioToastContextValue>(
    () => ({ showToast, showLoadingToast, dismissToast, notify }),
    [showToast, showLoadingToast, dismissToast, notify]
  );
```

Change `NOOP_TOAST` (add `notify`):

```ts
const NOOP_TOAST: StudioToastContextValue = {
  showToast: () => {},
  showLoadingToast: () => '',
  dismissToast: () => {},
  notify: () => {}
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/StudioToastProvider.test.tsx`
Expected: PASS — all pre-existing tests in this file (including the "superset-of-toasts invariant" describe block) still pass unmodified, plus the 4 new tests.

Run: `pnpm --filter @rune-langium/studio exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/components/StudioToastProvider.tsx apps/studio/test/components/StudioToastProvider.test.tsx
git commit -m "feat(studio): notify pass-through + instrumentation Toast sink on StudioToastProvider"
```

---

### Task 6: Real integration — `reportHydrationRetryExhausted` becomes user-visible

**Files:**
- Modify: `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Test: `apps/studio/test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`

**Interfaces:**
- Consumes: `handled`/`namespace` (Task 1), `installInstrumentationActivitySink` (Task 3), `StudioToastProvider`'s `notify`-driven Toast sink (Task 5).
- Produces: nothing consumed by later tasks — this is the plan's final task.

This task makes the one, real, already-shipped `handled`-error call site in the app (`reportHydrationRetryExhausted`, from the original instrumentation-wrapper plan's Task 8) actually exercise the new level tiering and become user-visible for the first time. Today, when curated-namespace hydration exhausts its retry budget, the error is captured for telemetry but the user sees nothing — the call site's own `try { ... } catch {}` swallows it silently by design (preserving pre-instrumentation UX, per the original Task 8's stated intent).

- [ ] **Step 1: Write the failing test (extend the existing file)**

In `apps/studio/test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`, change the existing assertion inside the first `it(...)` block (the `level: 'error'` line is now wrong — this call site becomes `handled: true`, so its default level is `'warn'`, and it now carries a `namespace`):

```ts
    expect(emitted).toEqual([
      expect.objectContaining({
        op: 'hydrationRetryExhausted',
        level: 'warn', // was 'error' — this call site is now `handled: true`
        signature: 'RetryExhaustedError',
        namespace: 'curated',
        context: { attempts: MAX_HYDRATION_RETRIES_PER_TARGET }
      })
    ]);
```

Extend the file's imports to add the new pieces the second test below needs:

```tsx
import { CodegenProvider } from '../../../src/shell/providers/CodegenProvider.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';
import { usePreviewStore } from '../../../src/store/preview-store.js';
import { useActivityStore } from '../../../src/store/activity-store.js';
import { useEditorStore } from '@rune-langium/visual-editor';
import { StudioToastProvider } from '../../../src/components/StudioToastProvider.js';
import { installInstrumentationActivitySink } from '../../../src/services/instrumentation/activity-sink.js';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  type TelemetryRecord
} from '../../../src/services/instrumentation/core.js';
import { MAX_HYDRATION_RETRIES_PER_TARGET } from '../../../src/services/hydration-orchestrator.js';
```

Change the `render`/`screen` import at the top of the file to also import `screen`:

```tsx
import { afterEach, describe, it, expect, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
```

Add a new `it(...)` block at the end of the existing `describe('CodegenProvider retry-budget exhaustion instrumentation', ...)` block:

```tsx
  it('the exhausted-retry error reaches the user: a toast fires and an Activity entry is recorded', async () => {
    useActivityStore.setState({ entries: [] });
    const unregisterActivitySink = installInstrumentationActivitySink();
    setInstrumentationThreshold('warn'); // handled errors default to 'warn' — must clear this threshold

    usePreviewStore.getState().resetPreviewState();
    usePreviewStore.setState({
      selectedTargetId: 'Scheme',
      selectedTarget: { id: 'Scheme', namespace: 'fpml.consolidated.confirmation', name: 'Scheme', kind: 'data' }
    });

    render(
      <StudioToastProvider>
        <WorkspaceStateContext.Provider value={wsState('ws-exhaust-2')}>
          <CodegenProvider>
            <div />
          </CodegenProvider>
        </WorkspaceStateContext.Provider>
      </StudioToastProvider>
    );

    const worker = FakeWorker.instances[0]!;
    const generateMsg = worker.posted.find((m) => m.type === 'preview:generate' && m.targetId === 'Scheme');
    expect(generateMsg).toBeDefined();

    for (let i = 0; i < MAX_HYDRATION_RETRIES_PER_TARGET; i++) {
      sendUnresolvedPreviewResult(worker, 'Scheme', generateMsg.requestId);
    }
    await act(async () => {
      sendUnresolvedPreviewResult(worker, 'Scheme', generateMsg.requestId);
    });

    const toast = await screen.findByText('hydrationRetryExhausted');
    expect(toast).toBeTruthy();

    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag: 'curated', ok: false, msg: 'hydrationRetryExhausted' });

    unregisterActivitySink();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`
Expected: FAIL — the first test's `level: 'error'`/missing-`namespace` assertion fails against today's shipped code; the new test finds no toast/activity entry since `reportHydrationRetryExhausted` doesn't yet set `handled`/`namespace`.

- [ ] **Step 3: Implement**

In `apps/studio/src/shell/providers/CodegenProvider.tsx`, change `reportHydrationRetryExhausted`'s options:

```ts
const reportHydrationRetryExhausted = withInstrumentation(
  function reportHydrationRetryExhausted(targetId: string, attempts: number): never {
    throw new RetryExhaustedError(targetId, attempts);
  },
  {
    op: 'hydrationRetryExhausted',
    // Handled: the call site below wraps this in an empty try/catch,
    // deliberately swallowing it to preserve existing UX (established in
    // the original instrumentation-wrapper plan's Task 8) — 'warn', not
    // the default 'error'. namespace: 'curated' is what makes the Toast
    // and Activity sinks pick it up: today, exhausting the curated-
    // hydration retry budget gives the user zero feedback; this is the
    // first thing that changes that.
    handled: true,
    namespace: 'curated',
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.retry-exhausted.test.tsx`
Expected: PASS (both tests).

Run the FULL studio suite plus type-check and lint, since this is the plan's final task:

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test`
Expected: type-check clean; all tests pass except the pre-existing, documented `.resources/`-corpus-dependent failures in `test/integration/lsp-integration.test.ts` (unrelated to this plan, present before and after every task).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/test/shell/providers/CodegenProvider.retry-exhausted.test.tsx
git commit -m "feat(studio): curated-hydration retry exhaustion becomes user-visible via Toast/Activity"
```

---

## Self-review notes (writing-plans skill checklist)

- **Spec coverage**: Level model changes (defaultLevelForDepth, error tiering, global threshold) → Task 1; fan-out dispatcher → Task 2; Namespace taxonomy + Activity sink → Task 3; ActivityPanel filter UI → Task 4; notify pass-through + Toast sink (the corrected, independent-sinks architecture from design review) → Task 5; the design's "real integration check" testing requirement → Task 6. `resolveLevel()` unchanged and the existing `showToast`/mirroring unchanged are both Non-goals in the design — no task touches either, confirmed by re-reading Tasks 1–6 above.
- **Placeholder scan**: no TBD/TODO markers; every step has real, complete code; the design doc's one deferred implementation choice (enforcement mechanism for `namespace`) was resolved during design review itself (no lint rule, stays optional) before this plan was written, so no placeholder carried forward into any task.
- **Type consistency**: `InstrumentationOptions.namespace?: string` (Task 1, core — generic) vs. `InstrumentationNamespace` (Task 3, studio — the closed union) are deliberately different types at different layers, per the design's Non-goals section; Task 4/6 both import and use `InstrumentationNamespace` by that exact name; `addInstrumentationSink`'s signature (Task 2) is used identically by Task 3's `activity-sink.ts` and Task 5's `StudioToastProvider.tsx`; `TelemetryRecord.namespace`/`.op`/`.level` are read identically by Task 3 and Task 5's sink implementations.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-02-instrumentation-multi-sink.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
