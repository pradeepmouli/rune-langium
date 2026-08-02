# Multi-Sink Instrumentation Routing — Design

## Problem

PR #462 (`docs/superpowers/specs/2026-08-01-instrumentation-wrapper-design.md`)
shipped a repo-wide instrumentation pipe for `apps/studio`, but it has exactly
one consumer today: the Output panel (`browser-sink.ts`'s
`routeTelemetryRecord`, which forwards every record that clears the global
threshold into `useOutputStore`). Two other UI surfaces exist, fully built,
and currently reached only indirectly:

- `StudioToastProvider` (`apps/studio/src/components/StudioToastProvider.tsx`)
  — a real toast system. `showToast`/`showLoadingToast`/`dismissToast`
  already mirror into `output-store`/`activity-store` internally (a
  deliberate, already-shipped "superset-of-toasts invariant" from
  `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md`), but
  nothing in the app calls `showToast` *from* the new instrumentation pipe
  — toasts today only fire from whatever UI code directly calls
  `useStudioToast()`, never from an arbitrary instrumented function's
  telemetry record.
- `ActivityPanel`/`useActivityStore`
  (`apps/studio/src/shell/panels/ActivityPanel.tsx`,
  `apps/studio/src/store/activity-store.ts`) — a scrollable activity feed
  with a well-shaped `ActivityEntry` type and a capped ring buffer. It is
  NOT currently empty in production (an earlier draft of this doc claimed
  otherwise — corrected: `StudioToastProvider`'s existing mirroring
  already populates it, generically tagged `'toast'`, whenever a toast
  fires). What's missing is a namespace-aware feed driven directly by the
  instrumentation pipe, independent of whether something also toasted.

This design wires both into the existing telemetry pipe as new,
independent sinks, reusing real existing primitives (`useActivityStore`'s
`addActivity`, and a new minimal pass-through on `StudioToastProvider` —
see Sink architecture) rather than building anything new or duplicating
`showToast()`'s own already-tested mirroring. It also tightens what
`'info'` means — today it's the *default* level for any un-nested
instrumented call (nearly all of the 277 call sites the original plan
instrumented), which would make every one of them a toast/activity trigger
if left as-is. That's the opposite of curated.

## Non-goals

- Not building new UI. `ActivityPanel` and `StudioToastProvider` already
  exist; this design gives them a real feed, plus one small filter control
  on the Activity Panel (see Namespace taxonomy below).
- Not reusing the Rune DSL "namespace" concept (user/model-defined strings
  like `cdm.base.staticdata.party`) for the new `Namespace` taxonomy below —
  confirmed explicitly during design: same word, deliberately different,
  much narrower concept (a small fixed set of app subsystems). The actual
  TypeScript type must be named to avoid colliding with any
  `Namespace`-related symbol already imported in a given file (e.g.
  `InstrumentationNamespace`, resolved at plan-writing time by checking
  actual import collisions site by site).
- Not touching `resolveLevel()`'s precedence order (explicit > `.child()`-
  inherited > depth-default) — an earlier framing of this design considered
  reversing it (depth overriding an explicit level unconditionally), but
  that was resolved during design: explicit levels stay protected once set;
  depth only ever determines the *default* when nothing was explicitly
  requested. `resolveLevel()`'s current, already-multiply-reviewed logic
  (Task 3 of the original plan) needs no change.
- Not retrofitting any of the original plan's 277 already-instrumented call
  sites to add an explicit `level`/`namespace` — the vast majority default
  to `'debug'` under the new depth scheme and never reach a sink that cares
  about `namespace` anyway. Only calls a developer deliberately promotes to
  toast/activity visibility need a `namespace` value, and that happens
  organically as those call sites get authored or revisited, not as a bulk
  sweep like the original plan's Task 14.

## Foundation: extend the existing pipe, don't replace it

Same principle as the parent design. `emit` stays "a plain function
reference" (no `Sink` interface/class) — it becomes a small fan-out
dispatcher to N registered consumers instead of a single function.
`configureInstrumentation` gains a way to register additional sinks
alongside (not replacing) the primary one; the Output panel's existing
`browser-sink.ts` wiring is untouched.

## Level model changes

Three changes to `packages/instrumentation-core/src/index.ts`, all
additive/behavior-preserving except where noted:

**1. `defaultLevelForDepth()` — depth 0 now defaults to `'debug'`, not
`'info'`.**

```ts
function defaultLevelForDepth(): Level {
  if (depth <= 0) return 'debug';
  return 'trace';
}
```

Collapses the old 3-tier depth ladder (`info`/`debug`/`trace`) to 2
(`debug`/`trace`) — `'info'` leaves the auto-assigned pool entirely and
becomes explicit-opt-in only. This is an intentional, silent behavior
change for every one of the original plan's 277 call sites that don't pass
an explicit `level` (i.e. nearly all of them): they now default to
`'debug'` instead of `'info'`. Not a regression — see Global threshold
change below for why this doesn't reduce what reaches the Output panel by
default.

**2. Error-path level splits three ways instead of one flat `'error'`.**

`InstrumentationOptions` gains a new field:

```ts
export interface InstrumentationOptions {
  // ...existing fields unchanged...
  /**
   * Set when the developer knows their own immediate caller wraps this
   * call in a local try/catch that swallows the error (preserving existing
   * UX) — the closest existing precedent is Task 8's
   * `reportHydrationRetryExhausted` pattern in the original plan
   * (CodegenProvider.tsx). Changes the default error-record level from
   * `'error'` to `'warn'`. A further explicit `errorLevel: 'debug'`
   * override exists for known-noise handled errors (e.g. an expected
   * validation failure implemented via exceptions) — not worth even a
   * `'warn'`.
   */
  handled?: boolean;
  errorLevel?: 'warn' | 'debug'; // only meaningful when handled: true
}
```

Default (no `handled`): `'error'` — matches today's shipped behavior
exactly, so every existing call site with no opinion here is unaffected.
`handled: true` (no `errorLevel`): `'warn'`. `handled: true, errorLevel:
'debug'`: `'debug'`.

**The Global Constraint "errors always emit unconditionally, regardless of
threshold" still applies to all three tiers** — confirmed explicitly during
design. Only the level TAG changes; whether the record is built and
emitted at all never depends on the configured threshold, for any of the
three tiers. `withInstrumentation`'s `catch` block still always calls
`emitError`, always rethrows, unchanged.

**3. Global default threshold drops from `'warn'` to `'info'`.**

```ts
let threshold: Level = 'info'; // was 'warn'
```

This is the new floor for what can ever reach any sink, existing or new.
Verified this doesn't meaningfully increase volume: since nearly all 277
existing call sites now default to `'debug'` (change #1 above), and
`'debug'` (1) still doesn't clear an `'info'` (2) threshold, the actual
records reaching the Output panel by default stay roughly the same as
today — only genuinely curated `'info'`+ calls, plus `'warn'`/`'error'`
(unconditional per #2), pass through.

`resolveLevel()` itself is unchanged — explicit still beats
`.child()`-inherited still beats depth-default, exactly as Task 3 shipped
it.

## Namespace taxonomy

A new field on `InstrumentationOptions`. **Its presence is the actual
opt-in signal for Toast/Activity visibility** — not the record's numeric
`level` (see Sink architecture below for why level alone isn't a safe
gate). A developer sets `namespace` exactly when they want a call to be
toast/activity-eligible; everything else — the debug/trace-default
majority of calls, and critically, the ordinary unhandled/rethrown error
path every one of the original plan's 277 call sites already has by
default with zero opt-in — has no `namespace` and is correctly invisible
to Toast/Activity, reaching only the Output panel (unaffected, still shows
everything). Same "explicit, never inferred" philosophy the rest of this
system already uses (mirrors `sanitize`/`sanitizeError` being mandatory
per-callsite, never a smart default) — just expressed as presence rather
than a strictly-required field, since making it type-required would force
touching call sites that have no reason to ever reach these sinks.

```ts
export type InstrumentationNamespace =
  | 'codegen'      // codegen-service.ts, codegen-worker.ts, download/export flows
  | 'lsp'          // lsp-client.ts, lsp-session.ts, lsp-auth.ts, transport-provider.ts
  | 'workspace'    // workspace.ts, persistence.ts, folder-backing.ts, model-loader/cache/registry
  | 'git'          // git-backing.ts, git-sync.ts, github-auth.ts
  | 'form-preview' // preview-validator.ts, FormPreviewPanel, codegen-forms/*
  | 'curated'      // curated-fetch.ts, curated-closure.ts (curated-bundle hydration)
  | 'instrumentation'; // the telemetry system's own self-diagnostics (rare)
```

Grounded directly in the actual directory/service groupings the original
plan's Task 14 already swept — not a speculative taxonomy. Feeds:
`ActivityEntry.tag` (Activity sink), the Toast's `title` (Toast sink), and
a new filter control on `ActivityPanel.tsx` (the only new UI surface this
design adds — a small dropdown/segmented-control filtering the existing
entry list by namespace, not a new panel).

`namespace` stays genuinely optional at the type level (`namespace?:
InstrumentationNamespace`) — it must NOT be forced non-optional on
`.info()`/`.warn()`, because that would force a `namespace` value onto
every `handled: true` call site too (including ones that only want the
`'warn'` demotion, not toast/activity visibility). No new lint rule either
— unlike `rune/no-uninstrumented-export` (which enforces a hard coverage
invariant), there's no wrong answer to catch here: omitting `namespace` is
a valid, common, correct choice whenever a call isn't meant to be
toast/activity-visible.

## Sink architecture

**Output sink — unchanged.** `browser-sink.ts`'s `routeTelemetryRecord`
keeps its current behavior exactly: no local threshold, shows whatever
clears the global floor. Registered first, as today.

**Both new sinks gate on `namespace` presence, not numeric `level`.** This
is the fix from spec self-review: `level >= 'info'` alone is NOT a safe
gate, because every unconditionally-emitted error (`'error'`, and
`handled`'s `'warn'` tier) already clears that numeric floor by
construction — gating on level alone would turn every uncaught error from
any of the original plan's 277 call sites into a toast, none of which
opted into that. A record reaches each sink's own display logic only
when `record.namespace` is set; level still matters for *how* it's
displayed (e.g. toast variant), just not *whether*.

**Toast and Activity are two genuinely independent sinks, not one bundled
mechanism.** An earlier draft of this section considered routing the Toast
sink through the *existing* `showToast()` — rejected during design review:
`showToast()` (`StudioToastProvider.tsx`, already shipped) internally
mirrors every toast into both `output-store` and `activity-store` as a
deliberate, already-tested "superset-of-toasts invariant"
(`docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md` — *"any
event a user sees as a toast must also exist as an op-log entry"*). Routing
through it would make a *second*, independent Activity sink call
`addActivity()` directly for the same record — producing a duplicate
Activity entry (once via `showToast()`'s own mirror, tagged generically
`'toast'`; once via the new Activity sink, tagged with the real
`namespace`). Toast and Activity must be targetable independently, and
Toast itself must be a pure pass-through with no side effects of its own.

**`StudioToastContextValue` gains one new method, `notify`** — a minimal,
side-effect-free pass-through that does *only* the toast render (`add({...
})` from `useToastManager()`), nothing else:

```ts
interface StudioToastContextValue {
  // ...existing showToast/showLoadingToast/dismissToast, unchanged...
  /** Pure toast render, no output-store/activity-store mirroring. Used by
   *  the instrumentation Toast sink, which independently targets Activity
   *  itself — see docs/superpowers/specs/
   *  2026-08-02-instrumentation-multi-sink-design.md. */
  notify: (toast: StudioToastInput) => void;
}
```

The **existing** `showToast`/`showLoadingToast`/`dismissToast` and their
existing mirroring behavior are completely untouched by this design — no
existing call site, and no prod-ux-checkout-harness assertion, changes.
`notify` is new, narrower, additive.

**Toast sink — new.** Registered from inside `StudioToastProvider` itself
(not a standalone module-level function like the Output sink) — it needs
`notify`, which only exists inside that component's own React context.
Maps `TelemetryRecord.op` + `namespace` into the toast's
`title`/`description`; `level === 'error'` → toast `variant: 'destructive'`,
everything else (`'warn'`, `'info'`) → default variant.

**Activity sink — new, fully independent of the Toast sink.** Calls
`useActivityStore.getState().addActivity(tag, ok, msg, meta)` directly — a
new, additional producer into that store, alongside the store's existing
producers (`StudioToastProvider`'s own `showToast`/`showLoadingToast`/
`dismissToast`, which already write there today via the superset-of-toasts
mirror — this store is not currently unpopulated in production, contrary
to an earlier draft of this doc's Problem section; corrected there).
`TelemetryRecord` maps cleanly onto the existing `ActivityEntry` shape with
no changes needed to `activity-store.ts` itself: `namespace` → `tag`,
`level !== 'error'` → `ok`, `op` (or a short derived description) → `msg`,
`durationMs`/`ts` already line up directly.

**In practice today**, both sinks share the same gate (`namespace`
presence), so a namespace-tagged record currently produces both a toast and
an activity entry together — but the two sinks are architecturally
decoupled (independent registrations, independent implementations, no
shared internal call path), so a future refinement could target one without
the other without restructuring anything.

## Testing

Following the parent plan's established conventions (vitest, real
`configureInstrumentation`/reset-between-tests pattern, no new test
infrastructure):

- Fan-out dispatcher: unit tests confirming N registered sinks each
  independently receive a record that clears the global threshold, and
  that a sink's own local-threshold filtering is the sink's job, not the
  dispatcher's (the dispatcher forwards everything past the global gate;
  each sink decides for itself whether to act).
- `defaultLevelForDepth()`'s new depth-0-is-debug behavior: a direct
  regression test, since this changes previously-tested behavior from the
  parent plan's Task 3.
- The three error-level tiers (`handled` unset/`'warn'`/`'debug'` override):
  three explicit tests confirming the level tag, plus a test confirming
  emission stays unconditional-regardless-of-threshold for all three
  (the parent plan's existing error-path tests already cover the
  `handled`-unset/`'error'` case; this only needs the two new tiers).
- Toast sink: a component-level test rendering `StudioToastProvider`,
  driving a `namespace`-tagged instrumented call, and asserting a toast
  appears (via the new `notify` pass-through, not `showToast`) with the
  right `namespace`-derived title — mirroring
  `InstrumentationErrorBoundary.test.tsx`'s existing render-and-assert
  pattern from the parent plan's Task 11. A companion test confirms
  `showToast`'s own existing output-store/activity-store mirroring is
  unaffected — the new sink's addition doesn't touch that code path.
- Activity sink: a test asserting `useActivityStore`'s `entries` array
  gains a correctly-shaped `ActivityEntry` after a `namespace`-tagged call,
  and that neither (a) a `'debug'`-default call, nor (b) — the load-bearing
  regression case this design exists to prevent — an ordinary unhandled
  error with NO `namespace` set, adds an entry, even though the error's
  `'error'` level unconditionally clears the global threshold. (b) is the
  exact bug caught during this design's own self-review and must never
  regress: gating on `namespace` presence, not numeric level, is what keeps
  every uncaught error across the app from becoming a toast.
- Real integration check: `CodegenProvider.tsx`'s `reportHydrationRetryExhausted`
  (the `RetryExhaustedError` retrofit from the original plan's Task 8) gets
  promoted to `handled: true, namespace: 'curated'` as part of this design's
  implementation, not deferred. Today, when curated-namespace hydration
  exhausts its retry budget, the error is captured for telemetry but the
  user sees nothing — the local `try { ... } catch {}` swallows it silently
  by design (Task 8's own stated intent, preserving pre-instrumentation
  UX). This design makes that first real user-visible: the existing
  `CodegenProvider.retry-exhausted.test.tsx` gets extended to also assert a
  toast/activity entry now appears, giving both the Activity Panel and the
  Toast sink a genuinely useful, real (not synthetic) validation.

## Open follow-ups (not blocking this design)

- Whether toast filtering should eventually move beyond `namespace`
  presence to an explicit per-`op` allowlist within a namespace (raised
  during the original plan's own design work, re-flagged here) — deferred;
  namespace-gating should be curated enough at the volumes involved to
  start.
- Whether `InstrumentationNamespace` should eventually grow beyond the 7
  values above as the app grows new subsystems — additive, no structural
  change needed, not designed further here.
