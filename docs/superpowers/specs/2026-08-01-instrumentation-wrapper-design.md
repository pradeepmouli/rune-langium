# Repo-Wide Instrumentation Wrapper — Design

## Problem

PR #461 fixed a bug where curated cross-document references silently failed
to resolve in Form Preview (`pathToUri` prepended `/workspace/` to
bracket-prefixed curated-bundle paths, producing a URI that could never
match what the curated-mirror publish pipeline baked into serialized
`$ref`s). Diagnosing it took hours of live investigation, including a
detour through self-inflicted browser IndexedDB corruption, before landing
on an offline repro against real production data.

The failure signal that existed at the time — `unsupportedFeatures:
["unresolved-reference:Party"]` inside a `FormPreviewSchema`, silently
downgrading `status` to `'unsupported'` — carried no context about *why*.
Nothing distinguished "genuinely not yet hydrated," "hydrated but the URI
scheme doesn't match," or "genuinely absent from the corpus." Reconstructing
which of those applied required re-deriving the whole system's state by
hand.

**Goal:** make the *next* failure of this shape self-diagnosing — a log
line, not a re-investigation — by instrumenting every function in the
codebase (all three runtimes: browser, Web Workers, Cloudflare Pages
Functions) with a consistent wrap-capture-emit primitive, reusing the
telemetry pipe this repo already ships rather than adopting a parallel
logging system.

## Non-goals

- Not adopting OpenTelemetry: it doesn't remove the need for
  custom, privacy-aware sanitization (it has no concept of
  curated-vs-user-content), and would be a much bigger lift across three
  disparate runtimes for a wrap-a-function primitive we can write in a few
  lines.
- Not adopting Sentry: routes session data to a third-party vendor, a
  product/privacy decision this FSL source-available tool has already
  deliberately avoided (see the existing hand-rolled, non-reversible
  stack-hash `signatureFor()` in `telemetry-capture.ts`).
- Not adopting pino: its real value (async Node transports) explicitly
  doesn't fit Cloudflare Workers' short-lived-isolate model per Cloudflare's
  own community discussion. Running it anywhere in this design would mean
  its stripped "browser mode" with a custom write function — which is
  exactly the sink work below anyway, plus a dependency with documented
  edge-runtime friction.

## Foundation: extend the existing pipe, don't replace it

- **Browser**: `apps/studio/src/services/telemetry-capture.ts` publishes
  into `useOutputStore.addLine`; `telemetry-shipper.ts` samples by level
  (error 100%, warn 20%, info 2%), batches, ships one `op_spans` event per
  15s to `apps/telemetry-worker`, which aggregates via Cloudflare Workers
  Logs (migrated off a Durable Object in PR #451).
- This design adds ONE producer into that same pipe — it does not create a
  second channel, second sampling policy, or second shipper.

## Core API

One module (e.g. `apps/studio/src/services/instrumentation/core.ts`),
isomorphic — no DOM/window/zustand/Node imports — used identically from
browser code, worker code, and Cloudflare Functions code.

### `configureInstrumentation(emit: Emit): void`

Sets the module-level sink for the current runtime context. Called exactly
once, at each runtime's own entry point — mirroring the existing
`installTelemetryCapture()` bootstrap pattern in this codebase:

```ts
type Emit = (record: TelemetryRecord) => void;
```

(`Level` and `TelemetryRecord` are defined once, under "Levels and
thresholds" and "Record shape" below — not repeated here.)

- **Browser** entry point: `configureInstrumentation((r) =>
  addLine(fmtLine(r.op, r.subject ?? ''), r.level, { op: r.op, subject:
  r.subject, signature: r.signature, durationMs: r.durationMs }))` — calls
  the existing `addLine` directly; `telemetry-shipper.ts` is untouched.
- **Each Web Worker** (`parser-worker.ts`, `codegen-worker.ts`), at module
  top level: `configureInstrumentation((r) => self.postMessage({ type:
  'telemetry:record', record: r }))`. The main thread's existing
  worker-message handler (`CodegenProvider.tsx` already has one) gets one
  new `case 'telemetry:record'` that calls the same browser sink above —
  so a worker's captured error lands in the identical pipe, sampling, and
  shipper as a main-thread one.
- **Each Cloudflare Pages Function**, at module scope:
  `configureInstrumentation((r) => console.log(JSON.stringify(r)))`.
  Workers Logs already scrapes structured `console.log` JSON — this is the
  same pattern `apps/telemetry-worker` itself already uses post-PR #451, so
  no new server-side plumbing.

Before `configureInstrumentation` runs, the sink defaults to a no-op —
never throws, never buffers, matching `telemetry-shipper.ts`'s existing
"telemetry must never throw into the app" invariant. Calls that happen to
fire during module initialization, before bootstrap wires the real sink,
are silently dropped rather than queued.

### `withInstrumentation(fn, opts): WrappedFn`

The single wrapping primitive. Wraps a sync or async function. Meant to be
applied to **every** function, manually or (later, once proven) via a
codemod — see "Retrofit scope, revisited" below. `level` is the actual
gatekeeper of what gets processed at runtime, not selective wrapping.

```ts
type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const enum Capture {
  Input = 0b01,
  Output = 0b10,
}

interface InstrumentationOptions {
  op?: string;                              // defaults to fn.name
  level?: Level;                            // default: see "Default level" below
  capture?: number;                         // Capture bitflags, default 0 (neither)
  sanitize?: (value: unknown, which: 'input' | 'output') => unknown;
  sanitizeError?: (err: unknown) => { signature: string; context?: unknown };
}
```

- **Level check short-circuits first.** Before any sanitize/duration/
  record-building work happens, `withInstrumentation` compares the call's
  effective level against the current threshold; below threshold, it does
  nothing but `return fn(...args)` (or `await`, for async `fn`) — one
  comparison, no allocation. This is what makes "instrument every
  function" viable in hot paths (the codegen namespace walkers, Langium's
  linker) rather than a perf regression: the vast majority of calls, most
  of the time, cost one comparison and nothing else.
- **Default level, when not given explicitly**, comes from *dynamic*
  nesting depth — a module-level counter `withInstrumentation` itself
  increments on entry and decrements on exit (not `Error().stack`
  parsing; directly measures "how many other instrumented calls are
  already on the stack," which is what we actually care about). Shallow
  calls (little/no instrumented nesting above them — e.g. a
  `preview:result` handler entry point) default higher (`info`); deeply
  nested calls (recursive AST-walkers, per-node emitter functions)
  default lower (`trace`/`debug`). This was chosen over a *static*
  call-graph-depth default: a function like `pathToUri` is called from
  both a shallow UI handler and deep inside a worker pipeline, so it has
  no single well-defined static depth — dynamic depth sidesteps that by
  measuring the specific call, not the function in the abstract.
  **Caveat**: a single shared counter is an approximation under
  concurrent async work — two sibling `await`ed instrumented calls
  in flight at once will each observe some depth from the other,
  since JS doesn't give a free per-logical-call-chain counter the way a
  synchronous stack would. Acceptable for a *default* (still correlates
  with typical recursive/tree-walking code, which is the actual case this
  is optimizing for), but not something to build a hard guarantee on; an
  explicit `level` always overrides it when precision actually matters.
- `op` defaults to `fn.name` — most call sites never state it. (This
  relies on the wrapped function having a real name and the build not
  mangling it; since instrumentation is compiled out of production
  entirely — see Toggle below — this only has to hold for dev/preview
  builds, which are unminified by default.)
- On successful return, if the level clears the threshold: builds a
  record including `input`/`output` only for the bits set in `capture`,
  each run through `sanitize` first. Emits via the configured sink.
- On throw: **always** builds an error-level record regardless of the
  configured threshold (`error` always clears it — see Levels below), via
  `sanitizeError` (or a default reusing `telemetry-capture.ts`'s existing
  `signatureFor()`-style stack-hash approach if none is given), emits it,
  and **always rethrows the original error unchanged**. There is no
  swallow mode on the wrapper itself — a wrapper that sometimes swallows
  would have to invent a return value in place of whatever the function
  was supposed to produce, which turns instrumentation into something
  that changes program behavior rather than just observing it. Call sites
  that need to preserve today's "soft give-up" UX do so with an ordinary
  `try/catch` around the wrapped call, same as they would around any
  function that can throw.

### Levels and thresholds

Extends the existing three-level `OutputSeverity`
(`'info'|'warn'|'error'`) with `'trace'` and `'debug'` below `'info'` —
the tier most instrumented calls default to, almost always filtered out
by the threshold. `error` always clears any threshold (matching "always
instrument errors, exhaustion is an error" — an exhaustion throw must
never be silently dropped by a level filter).

`telemetry-shipper.ts`'s `SAMPLE_RATE` table needs one corresponding
change: `trace`/`debug` either get their own (very low, e.g. `0.001`)
sample rate, or — more likely correct, since they're already
threshold-filtered before reaching the shipper at all in normal operation
— are simply never forwarded past the browser sink unless the runtime
threshold is explicitly lowered for active troubleshooting. Exact
handling is an implementation-plan detail, not a design fork.

### Context binding

```ts
withInstrumentation.child(baseContext, opts?): typeof withInstrumentation
```

Returns a bound version of `withInstrumentation` that merges `baseContext`
into every call made through it, so a cluster of related wraps (e.g.
everything inside one module) doesn't repeat the same `op` prefix or
correlator fields at every call site.

### Level inheritance

`.child()` also accepts an optional `level` in `opts`:

```ts
withInstrumentation.child({ op: 'codegen-worker' }, { level: 'debug' })
```

Resolving a call's effective level walks up the chain of `.child()`
scopes it was created through until one sets a `level`, falling back to
the single global default (set via `configureInstrumentation` or a
runtime override) if none in the chain does. This gives "turn on verbose
logging for one module without touching every call site in it" — the
same capability `pino`/`debug`-style "namespace" logging provides —
without adopting either: the whole mechanism is a parent-pointer walk
plus a `Map`, not a dependency. (Evaluated and rejected reusing an actual
library for this the same way as elsewhere in this design: both `pino`
and the smaller `debug` package assume `process.env`/`localStorage` as
their config source, which doesn't exist uniformly across
browser/Worker/Cloudflare-Functions — the shim required to make either
work here is comparable in size to just writing the chain-walk directly.)

### Exhaustion is not a separate API

There is no `reportExhaustion()` helper. A retry-cap-exhausted or
give-up branch simply `throw`s — conventionally a named subclass (e.g.
`class RetryExhaustedError extends Error`) so sanitizers/dashboards can
categorize "we gave up after N attempts" apart from a genuine bug — and
flows through the exact same `withInstrumentation` capture-and-rethrow
path as any other exception. If a call site doesn't catch it, it doesn't
get lost either: it surfaces as an uncaught rejection, which
`telemetry-capture.ts`'s existing `window.onerror`/`unhandledrejection`
listeners already capture into the same pipe as a last-resort net (browser
only — see Known gaps below).

### What's automatic vs. what must stay manual

Automatic, because it's purely structural and reveals nothing about
values: argument count, `typeof` per argument, call duration, whether the
call threw, `op` defaulted from `fn.name`.

**Not automatic, and deliberately so:** which parts of an argument or
return value are *safe to log*. TypeScript types are erased at runtime —
there's no reflection distinguishing "this `string` is a curated type
name" from "this `string` is raw user file content"; both are just
`string` at the type level. This is a semantic judgment about the value,
not the function's signature, so `sanitize` stays a mandatory,
per-callsite decision. A generic wrapper that guessed here would risk
exactly the "never scratch workspace text" privacy invariant
`telemetry-capture.ts` was built to protect.

## Record shape

```ts
interface TelemetryRecord {
  op: string;
  level: Level;                  // 'trace' | 'debug' | 'info' | 'warn' | 'error'
  captured: number;              // Capture bitflags actually present
  input?: unknown;                // present iff captured & Capture.Input
  output?: unknown;               // present iff captured & Capture.Output
  subject?: string;
  signature?: string;
  durationMs?: number;
  context?: unknown;
  ts: number;
}
```

Same shape from every runtime. The browser sink adapts it onto the
existing `AddLineMeta`/`Span` fields; worker and edge sinks pass it through
close to verbatim (edge as raw JSON).

## Sanitization / privacy

- `sanitize`/`sanitizeError` are mandatory per callsite — no default that
  captures raw values.
- Browser path keeps `telemetry-shipper.ts`'s existing `safeSubject`-style
  allowlist as a second gate (defense in depth for the one runtime that
  already has one).
- **Known gap**: workers and Cloudflare Functions don't have an equivalent
  second gate today — their safety rests entirely on each callsite's
  `sanitize` being correct. Worth a follow-up (e.g. a shared allowlist
  module both the shipper and a future worker/edge gate import), not
  solved by this design.
- Workers have no `window`, so `telemetry-capture.ts`'s
  `window.onerror`/`unhandledrejection` last-resort net doesn't extend to
  worker or edge contexts — an uncaught throw in a worker or Function
  that nobody wraps is only captured if something explicitly wraps it.

## Toggle

- **Browser / Web Workers** (Vite-bundled): every instrumented call is
  gated `if (!import.meta.env.PROD ||
  useTelemetrySettingsStore.getState().enabled)`. `import.meta.env.PROD`
  is statically known at build time, so Rollup dead-code-eliminates the
  branch entirely in production builds — zero runtime cost, zero data
  captured in prod regardless of the runtime toggle. The dev/preview
  runtime toggle reuses the *existing* telemetry opt-in flag
  (`useTelemetrySettingsStore`) rather than adding a second, parallel
  setting.
- **Cloudflare Pages Functions** (Wrangler-built, not Vite — no
  `import.meta.env.PROD` dead-code elimination available there): gated by
  an `env.INSTRUMENTATION_ENABLED` binding instead. A cheap runtime
  `console.log` guard is acceptable on the edge; this is not a hot path in
  the way Langium's linker/codegen walkers are.

## Testing

- Unit tests on the core module: mock the sink via
  `configureInstrumentation`, assert record shape/`captured` flags, assert
  errors always emit AND always rethrow (never swallowed), assert `op`
  defaults to `fn.name`, assert the pre-configuration no-op never throws.
- One integration test per sink adapter: browser (asserts `addLine`
  receives the mapped shape), worker (asserts the `telemetry:record`
  postMessage relay lands in the same output-store call as the browser
  sink), edge (asserts the `console.log` argument JSON-parses to the
  expected record shape).
- Test isolation: `configureInstrumentation` needs a matching
  reset/override for tests, mirroring how `useTelemetrySettingsStore`
  already resets between test files.

## Retrofit scope, revisited

Full repo-wide, and — since `level` is now the real gatekeeper of what
gets processed, not selective wrapping — the target is every function
across `apps/studio/src`, the two Web Workers, and `apps/studio/functions`,
not just error-handling sites specifically. Every error-handling site
(`try/catch`, `.catch()`, give-up/exhausted branches) still gets the same
treatment as before: retry-cap-exhausted and similar give-up branches that
don't throw today are changed to throw (a named Error subclass), and the
call site gets an explicit `try/catch` to preserve existing observable
behavior — a real, one-time change at each such site, not a transparent
drop-in.

**Manual first, codemod later — not a compile-time bundler transform.**
Making `level` the gatekeeper answers the *noise* half of the objection to
auto-wrapping every function (a build-time transform was raised and set
aside earlier in this design's discussion), but not the *toolchain* half:
this repo's Vite setup is `rolldown-vite` (Rust-based), and a custom
AST-rewrite plugin for it is less-trodden ground than a stock Rollup/Babel
setup — worth proving the pattern by hand first. Once `withInstrumentation`
is applied manually across a representative slice of the codebase and the
default-level/depth heuristic is validated against real usage, a codemod
(or, if the toolchain cooperates, a build-time transform) to mechanically
apply it everywhere else is a reasonable follow-up, not a rejected idea —
just sequenced after the primitive is proven, per this repo's usual
pilot-before-generalizing convention.

## Open follow-ups (not blocking this design)

- The sanitization gap for workers/edge (no second allowlist gate) noted
  above.
- Whether a CI corpus-invariant gate (reusing the offline-repro pattern
  from PR #461's verification — round-tripping real curated content
  through `hydrateModelDocuments` and asserting zero false
  `unresolved-reference`s) should be pursued alongside this as a
  complementary *prevention* lever, since this instrumentation design
  only shortens *diagnosis* time, it doesn't stop a similar bug from
  shipping in the first place.
