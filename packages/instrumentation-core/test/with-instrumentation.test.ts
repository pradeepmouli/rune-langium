// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addInstrumentationSink,
  Capture,
  configureInstrumentation,
  getInstrumentationThreshold,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../src/index.js';

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
      expect.objectContaining({
        op: 'addOne',
        level: 'info',
        captured: Capture.Input | Capture.Output,
        input: [41],
        output: 42
      })
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
    const wrapped = withInstrumentation(
      () => {
        throw new Error('always propagates');
      },
      { op: 'x', sanitizeError: () => ({ signature: 'x' }) }
    );
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

  it('the wrapped function carries the same .name as op — React reads this for componentStack frames', () => {
    function MyComponent(): void {}
    const wrapped = withInstrumentation(MyComponent, {});
    expect(wrapped.name).toBe('MyComponent');
  });

  it('an explicit op overrides .name too, not just the telemetry field', () => {
    function anyName(): void {}
    const wrapped = withInstrumentation(anyName, { op: 'CustomOpName' });
    expect(wrapped.name).toBe('CustomOpName');
  });

  it('an above-threshold call through the default (pre-configuration) no-op sink never throws', () => {
    resetInstrumentationForTests(); // guarantee the no-op sink, not a leaked emit from a prior test
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 7, { op: 'unconfigured', level: 'info' });
    expect(wrapped()).toBe(7); // emit path runs, silently dropped — the design's "silent no-op" invariant
  });

  it('below-threshold async rejection ALWAYS emits error-level record regardless of threshold, then rethrows', async () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // only errors clear
    const boom = new Error('async boom');
    const wrapped = withInstrumentation(
      async () => {
        throw boom;
      },
      { op: 'asyncFail', level: 'trace', sanitizeError: (e) => ({ signature: 'Error:async boom' }) }
    );
    await expect(wrapped()).rejects.toThrow(boom);
    expect(emitted).toEqual([
      expect.objectContaining({ op: 'asyncFail', level: 'error', signature: 'Error:async boom' })
    ]);
  });
});

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
    const wrapped = withInstrumentation(
      () => {
        throw new Error('boom');
      },
      { op: 'explode' }
    );
    expect(() => wrapped()).toThrow('boom');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'error' })]);
  });

  it('handled:true (no errorLevel) demotes to warn', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('warn');
    const wrapped = withInstrumentation(
      () => {
        throw new Error('boom');
      },
      { op: 'explode', handled: true }
    );
    expect(() => wrapped()).toThrow('boom');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'warn' })]);
  });

  it('handled:true + errorLevel:"debug" demotes to debug', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(
      () => {
        throw new Error('noise');
      },
      { op: 'explode', handled: true, errorLevel: 'debug' }
    );
    expect(() => wrapped()).toThrow('noise');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'debug' })]);
  });

  it('all three error tiers still emit unconditionally regardless of threshold', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // strictest possible threshold
    const rethrown = withInstrumentation(
      () => {
        throw new Error('a');
      },
      { op: 'a' }
    );
    const handledWarn = withInstrumentation(
      () => {
        throw new Error('b');
      },
      { op: 'b', handled: true }
    );
    const handledDebug = withInstrumentation(
      () => {
        throw new Error('c');
      },
      { op: 'c', handled: true, errorLevel: 'debug' }
    );
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
    const wrapped = withInstrumentation(
      () => {
        throw new Error('boom');
      },
      { op: 'explode', handled: true, namespace: 'curated' }
    );
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

  it('a namespace-tagged success still emits at the default depth-0 level against the default threshold — matches how errors always emit unconditionally', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    // Default threshold ('info') + no explicit level: depth-0 default is
    // 'debug', which does NOT clear 'info' — without the namespace
    // override this would silently emit nothing, the exact
    // environment-dependent silence this fix exists to close on the
    // success side (the error side was already unconditional).
    const wrapped = withInstrumentation(() => 'ok', { op: 'promoted', namespace: 'workspace' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'promoted', namespace: 'workspace', level: 'debug' })]);
  });

  it('a namespace-tagged async success still emits at the default depth-0 level against the default threshold', async () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    const wrapped = withInstrumentation(async () => 'ok', { op: 'promotedAsync', namespace: 'lsp' });
    await wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'promotedAsync', namespace: 'lsp', level: 'debug' })]);
  });
});

describe('global default threshold', () => {
  it("default threshold is 'info', not 'warn'", () => {
    expect(getInstrumentationThreshold()).toBe('info');
  });
});

// Exercises the notify-only fast path via the isEnabledCheck()-false branch
// — the runtime-togglable half of `if (IS_PROD) {...} if (!isEnabledCheck())
// {...}`, both of which share byte-identical inner logic. IS_PROD itself is
// a build-time constant (see the prod-gate suite) that can only be
// exercised by an actual production build, not a unit test.
describe('notify-only fast path — diagnostics disabled but namespace-tagged', () => {
  it('a namespace-tagged success call still reaches additional sinks, never the primary sink', () => {
    const primary: unknown[] = [];
    const additional: unknown[] = [];
    configureInstrumentation(
      (r) => primary.push(r),
      () => false // diagnostics disabled — matches the IS_PROD branch's shape
    );
    const unregister = addInstrumentationSink((r) => additional.push(r));
    const wrapped = withInstrumentation(() => 'ok', {
      op: 'notify',
      namespace: 'workspace',
      message: 'Something happened'
    });
    expect(wrapped()).toBe('ok'); // return value unaffected
    expect(primary).toEqual([]); // primary/diagnostic sink stays gated
    expect(additional).toEqual([
      expect.objectContaining({ op: 'notify', namespace: 'workspace', message: 'Something happened' })
    ]);
    unregister();
  });

  it('a namespace-tagged thrown error still reaches additional sinks, never the primary sink, and still rethrows', () => {
    const primary: unknown[] = [];
    const additional: unknown[] = [];
    configureInstrumentation(
      (r) => primary.push(r),
      () => false
    );
    const unregister = addInstrumentationSink((r) => additional.push(r));
    const boom = new Error('boom');
    const wrapped = withInstrumentation(
      () => {
        throw boom;
      },
      { op: 'explode', handled: true, namespace: 'curated', sanitizeError: () => ({ signature: 'Error:boom' }) }
    );
    expect(() => wrapped()).toThrow(boom);
    expect(primary).toEqual([]);
    expect(additional).toEqual([
      expect.objectContaining({ op: 'explode', namespace: 'curated', level: 'warn', signature: 'Error:boom' })
    ]);
    unregister();
  });

  it('a namespace-tagged async success/rejection still reach additional sinks, never the primary sink', async () => {
    const primary: unknown[] = [];
    const additional: unknown[] = [];
    configureInstrumentation(
      (r) => primary.push(r),
      () => false
    );
    const unregister = addInstrumentationSink((r) => additional.push(r));
    const succeed = withInstrumentation(async () => 'async-ok', { op: 'asyncOk', namespace: 'lsp' });
    await expect(succeed()).resolves.toBe('async-ok');
    const boom = new Error('async boom');
    const fail = withInstrumentation(
      async () => {
        throw boom;
      },
      { op: 'asyncFail', handled: true, namespace: 'git', sanitizeError: () => ({ signature: 'Error:async boom' }) }
    );
    await expect(fail()).rejects.toThrow(boom);
    expect(primary).toEqual([]);
    expect(additional).toEqual([
      expect.objectContaining({ op: 'asyncOk', namespace: 'lsp' }),
      expect.objectContaining({ op: 'asyncFail', namespace: 'git', signature: 'Error:async boom' })
    ]);
    unregister();
  });

  it('a call with NO namespace is a bare passthrough — no emission anywhere, identical to pre-existing behavior', () => {
    const primary: unknown[] = [];
    const additional: unknown[] = [];
    configureInstrumentation(
      (r) => primary.push(r),
      () => false
    );
    const unregister = addInstrumentationSink((r) => additional.push(r));
    const wrapped = withInstrumentation(() => 42, { op: 'plain' });
    expect(wrapped()).toBe(42);
    expect(primary).toEqual([]);
    expect(additional).toEqual([]);
    unregister();
  });
});
