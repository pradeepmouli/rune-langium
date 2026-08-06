# Retire `preview-validator.ts`'s Structural Validator Design

**Goal:** Replace `apps/studio/src/services/preview-validator.ts`'s hand-rolled structural Zod validator (`buildFieldValidator`/`buildSchemaValidator`/`validatePreviewSample`) with real validation against the actual generated Zod schema, using `emitStandaloneZodSchema` (merged via PR #470), at both of its call sites.

**Architecture:** `codegen-worker.ts` compiles the target type's real Zod schema (via `emitStandaloneZodSchema` + a `new Function` sandbox extending the existing `runInWorkerSandbox` pattern) and validates instance data against it with one `.safeParse()` call — which also absorbs the separately-run condition-predicate loop, since the real schema already embeds `.refine()`/`.superRefine()` condition checks. Both consumers of structural validation (Prototype Workspace's instance editor and the plain Form Preview panel) route through this one worker-side path via the existing `instance:validate`/`instance:validateResult` message pair. The compiled validator is cached, invalidated by the `previewFilesVersion` counter introduced in `docs/superpowers/specs/2026-08-06-codegen-worker-document-cache-design.md` — that spec is a **dependency** of this one, not duplicated here.

**Tech Stack:** TypeScript, Zod, the existing Web Worker (`codegen-worker.ts`) sandbox infrastructure, zustand stores.

## Background

CLAUDE.md documents `preview-validator.ts` as the incident that established this repo's "never build a parallel implementation" rule: a hand-rolled Zod validator approximating the real generated schema's semantics, which drifted from that real behavior across five separate bot-review rounds on PR #391 (`.strict()` handling, optional-array handling, choice exactly-one-arm, required-arm-payload, nested choice arms).

`emitStandaloneZodSchema(documents, targetId)` (`packages/codegen/src/emit/standalone-schema.ts`, merged via PR #470) removed the blocker: it computes a target type's transitive closure and runs the real, unmodified `emitNamespace()` (zod target) against a synthetic single-namespace view, producing one self-contained script (real TypeScript, with a genuine `import { z } from 'zod';` header, cross-namespace imports stripped, `runeExtendChoice` inlined when needed). It is not yet wired into Studio anywhere.

Separately, `codegen-worker.ts`'s `buildDocuments()` (used by `validateInstance`, `runInstanceSchema`, and `runPreview` alike) re-parses and re-links `currentPreviewFiles` from scratch on every call, with no caching at all — including on every keystroke-triggered `instance:validate` today. This design's new `compileStandaloneValidator` step (closure walk + real emit + TS strip + `new Function` compile) would stack meaningfully more per-call work on top of that same already-uncached path. Rather than fold that fix in here, it's split into its own spec (`docs/superpowers/specs/2026-08-06-codegen-worker-document-cache-design.md`) since it's independently useful — every existing `buildDocuments()` consumer benefits, not just this work — and independently shippable. This design **depends on** that spec's `previewFilesVersion` counter existing; `compileStandaloneValidator`'s own cache (below) is keyed against that same counter.

## Scope

**In scope:** retiring `validatePreviewSample` (and its private helpers `buildFieldValidator`/`buildSchemaValidator`/`formatIssuePath`) at both of its call sites:

1. `codegen-worker.ts`'s `validateInstance()` — the Prototype Workspace `instance:validate` handler.
2. `FormPreviewPanel.tsx`'s per-keystroke live validation for the plain Form Preview panel.

**Out of scope / non-goals:**

- `preview-validator.ts`'s default-value/path helpers (`fieldRootKey`, `fieldLeafKey`, `resolveArmPaths`, `splitChoiceArmFields`, `buildDefaultValue`, `buildDefaultObjectValue`, `buildArmValue`, `buildDefaultFieldsObject`, `buildDefaultValues`). These derive sensible blank form values from the `PreviewField` tree and don't approximate Zod semantics — not part of the incident, left unchanged.
- The `@zod-to-form`/`useZodForm` integration and retiring `FormPreviewPanel.tsx`'s hand-rolled *rendering* (`emitStandaloneZodSchema`'s own design doc flagged this as a separate future sub-project; this design is validation-only).
- Robust general-purpose TypeScript-to-JS erasure (see Decisions below — deliberately deferred in favor of extending the existing regex stripper).
- Caching `buildDocuments()` itself — covered by the dependency spec (`2026-08-06-codegen-worker-document-cache-design.md`), not this one.
- Caching `currentCodegenFiles`-driven state (`codegen:setFiles`/`codegen:generate`, `cachedFuncCode`) — unrelated to `currentPreviewFiles`, unaffected by this change.

## Architecture

### Worker-side compilation

Assumes `docs/superpowers/specs/2026-08-06-codegen-worker-document-cache-design.md` has already landed — this design reuses its `previewFilesVersion` counter for its own cache invalidation rather than introducing a second, independent one.

New in `codegen-worker.ts`:

```ts
function compileStandaloneValidator(
  documents: LangiumDocument[],
  typeFqn: string
): { validator: z.ZodTypeAny; diagnostics: GeneratorDiagnostic[] } | { validator: undefined; diagnostics: GeneratorDiagnostic[] }
```

Steps:

1. Call `emitStandaloneZodSchema(documents, typeFqn)`.
2. If any returned diagnostic has `severity: 'error'`, return `{ validator: undefined, diagnostics }` — no schema can be built.
3. Otherwise, strip the returned TypeScript module down to runnable JS via `stripModuleTypeAnnotations` (new — see "TS erasure" below), prepend `RUNTIME_HELPER_JS_SOURCE`, and evaluate it in a `new Function` sandbox that binds `z` as an explicit parameter (mirroring how `runInWorkerSandbox` already shadows `fetch`/`WebSocket`/etc.), returning the compiled `<TargetName>Schema` value.
4. Wrap step 3 in a `try/catch`; a thrown compile/eval error is treated the same as an error-severity diagnostic (`{ validator: undefined, diagnostics: [...closureDiagnostics, { severity: 'error', code: 'compile-error', message: ... }] }`).

**Result caching:** a `Map<string, { version: number; validator: z.ZodTypeAny | undefined; diagnostics: GeneratorDiagnostic[] }>` keyed by `typeFqn`, checked/replaced against `previewFilesVersion` the same way `documentsCache` is — a stale-version entry (or missing entry) triggers recompilation; a fresh one is returned as-is. One entry per distinct `typeFqn` validated since the last file change, which for Form Preview / Prototype Workspace's actual usage (one active target at a time per panel) is a small, bounded map.

`validateInstance()` calls `compileStandaloneValidator`, then:

- If `validator` is `undefined`: post a single diagnostic at `path: ''` — `Structural validation unavailable: <first error diagnostic's message>` — mirroring the existing "Unknown type" convention for an unresolvable target.
- Otherwise: `validator.safeParse(data)`. On failure, translate each Zod issue into `ValidationDiagnostic`:
  - An issue whose `path` has length ≥ 1 and matches an active condition's name (from `getActiveConditionPredicates(dataNode)`) → `{ path: name, message: issue.message, conditionName: name }` (the multi-condition `.superRefine()` case; `zod-emitter.ts`'s `emitOneOf`/`emitChoice`/etc. already set `path: [conditionName]` on every `ctx.addIssue`).
  - An issue with empty `path` when the Data type has exactly one active condition → attribute it to that condition's name (the single-condition `.refine()` case, whose message is always prefixed with the condition name but carries no `path`).
  - Everything else → an ordinary field-structural diagnostic, `path` formatted the same way `formatIssuePath` used to (dotted, bracketed array indices) — this formatting alone is presentation logic, not a parallel validator, and survives as a small private helper.

This single `.safeParse()` call **replaces both** the old `validatePreviewSample(...)` call and the separately-run `conditionDiagnostics` loop (`getActiveConditionPredicates` + `runInWorkerSandbox` per condition) — the real schema already embeds every active condition as a `.refine()`/`.superRefine()`, so running it once validates structure and conditions together.

### TS erasure

`emitStandaloneZodSchema`'s output is a full module: an `import { z } from 'zod';` header, one or more `export const <Name>Schema = ...` declarations, and — only for cyclic-type targets — an `export interface <Name> { ... }` predeclaration block. The existing `stripTypeAnnotations` (used today for `executeFunction`'s isolated single-function bodies) doesn't handle `import` lines or `interface` blocks at all.

**Decision:** extend the existing regex-based approach rather than introduce a real TypeScript compiler:

- New `stripModuleTypeAnnotations(tsCode)`: first removes any `export interface <Name> { ... }` block via balanced-brace scanning (not regex — brace bodies can nest), and drops the `import { z } from 'zod';` line entirely (since `z` is bound as a sandbox parameter, not an ES import — `new Function` bodies cannot contain `import` statements). It then delegates to the existing per-line regex passes (refactored out of `stripTypeAnnotations` into a shared helper both functions call) for the remaining type annotations (`const x: Type =`, arrow/function return types, `as` casts).
- Rejected: promoting `typescript` from devDependency to a real runtime dependency of the studio worker bundle for `ts.transpileModule`. More robust, but a non-trivial bundle-size cost, and `emitStandaloneZodSchema`'s output is a constrained, self-controlled input shape (we own both the emitter and the stripper) rather than arbitrary TypeScript — narrowing the regex-fragility risk this approach would otherwise carry.

### Routing both consumers through one path

`FormPreviewPanel.tsx` runs in two modes:

- **Controlled** (used by `InstanceFormPanel` for Prototype Workspace instances): already round-trips through the worker today — `onValuesChange` → `instance-store.ts`'s `updateInstanceData` → `dispatchValidate` → `instance:validate` → `receiveValidateResult`. It *also*, redundantly, currently runs `validatePreviewSample` locally and sets `controlledMeta` from that local result. Fix: delete the local call; rely purely on the existing worker round trip (no new plumbing needed).
- **Uncontrolled** (the plain Form Preview panel): today calls `validatePreviewSample` synchronously in `applyValidation`. Fix: `preview-store.ts` gains `dispatchValidate`/`receiveValidateResult`, mirroring `instance-store.ts`'s existing pair exactly — same `instance:validate`/`instance:validateResult` message type (with `typeFqn = schema.targetId`), same **no-debounce, `requestId`-staleness-guard** pattern (`instance-store.ts`'s `dispatchValidate` already fires unconditionally on every data change with no debounce, relying on `latestValidateRequestForInstance` to discard stale out-of-order responses — proven and simplest, so reused as-is rather than inventing new debounce logic). `CodegenProvider.tsx` routes `instance:validateResult` to both stores; each store's own `pendingRequests` map ignores requestIds that aren't theirs, so no coordination logic is needed beyond one extra dispatch line.

The existing `validated`-gate in `FormPreviewPanel.tsx` (only validate once a field has been blurred once — `applyValidation(nextValues, activeSample.validated)`) is preserved unchanged: `dispatchValidate` is only called when that flag is `true`, exactly matching current UX (no validation noise before first blur).

### Data flow (uncontrolled Form Preview panel — the new path)

```
handleFieldChange
  → applyValidation(nextValues, validated)
  → (if validated) usePreviewStore.dispatchValidate(schema.targetId, nextValues)
  → postMessage 'instance:validate' { typeFqn, data, requestId }
  → codegen-worker.ts validateInstance()
      → buildDocuments()                                  // cached — see the document-cache spec
      → compileStandaloneValidator(documents, typeFqn)     // cache hit unless files changed
      → validator.safeParse(data)
      → translate issues → ValidationDiagnostic[]
  → postMessage 'instance:validateResult' { requestId, diagnostics }
  → CodegenProvider routes to usePreviewStore.receiveValidateResult (+ useInstanceStore's, ignored if not theirs)
  → staleness guard (latestValidateRequestForPreviewSample) → store state updates
  → FormPreviewPanel re-renders from store state
```

The controlled-mode (Prototype Workspace) flow is identical except it already existed end-to-end before this change; only the redundant local `validatePreviewSample` call is removed.

## Files touched

- `apps/studio/src/workers/codegen-worker.ts` — `stripModuleTypeAnnotations`, `compileStandaloneValidator` (+ its own cache map, keyed against the `previewFilesVersion` counter from the document-cache spec), rewritten `validateInstance`.
- `apps/studio/src/store/preview-store.ts` — new `dispatchValidate`/`receiveValidateResult` + `pendingRequests`/staleness-guard state, mirroring `instance-store.ts`.
- `apps/studio/src/shell/providers/CodegenProvider.tsx` — route `instance:validateResult` to `usePreviewStore` as well as `useInstanceStore`.
- `apps/studio/src/components/FormPreviewPanel.tsx` — `applyValidation` drops its local `validatePreviewSample` call in both branches; uncontrolled mode reads `errors`/`valid` from `usePreviewStore` instead of computing them inline.
- `apps/studio/src/services/preview-validator.ts` — delete `buildFieldValidator`, `buildSchemaValidator`, `validatePreviewSample`, `formatIssuePath`. Keep every other export unchanged.
- `apps/studio/test/services/preview-validator.test.ts` — delete test cases for the removed functions; keep coverage for the retained default-value helpers.
- New/extended worker tests (`apps/studio/test/workers/codegen-worker.test.ts` or a sibling file) — see Testing below.

## Error handling

- **Unresolvable target** (unknown/ambiguous): unchanged — `validateInstance` already handles this before calling into structural validation.
- **Closure has an error-severity diagnostic** (`name-collision`) or the stripped script throws on compile/eval: `compileStandaloneValidator` returns `{ validator: undefined, diagnostics }`; `validateInstance` posts one diagnostic at `path: ''` reading `Structural validation unavailable: <message>`, reusing the "Unknown type" precedent rather than crashing or silently reporting valid. This failure result is itself cached (same as a success) so a permanently-broken target doesn't recompute on every keystroke either.
- **Warning-severity diagnostics** (`unresolved-ref` on a field, missing supertype): don't block validation — the schema still compiles (with `z.unknown()` for the affected field or omitted inherited attributes), matching how the real per-namespace `.zod.ts` output already behaves for the same cases.

## Testing

- **Worker-level** (new): structural validation via the real schema for a plain Data type, a Data-extends-Choice type, and a Choice type (covering `.strict()`, optional-array, exactly-one-arm — the exact five drift categories from PR #391's history — now correct by construction since they run the real schema).
- **Condition attribution**: a Data type with exactly one active condition (message-prefix attribution) and a Data type with two+ active conditions (`path`-based attribution) — both must produce diagnostics matching today's `{ path, message, conditionName }` shape.
- **Cyclic-type target**: exercises the `interface`-block stripping path end-to-end (compile + eval + safeParse succeeds).
- **Diagnostic fallback**: a target whose closure has a real `name-collision`, and a target with an `unresolved-ref` warning (validation still succeeds for the rest of the schema).
- **Cache invalidation**: `compileStandaloneValidator`'s cache returns the same compiled validator on a second call for the same `typeFqn` with no intervening `preview:setFiles`; recompiles after one (`buildDocuments()`'s own cache behavior is covered by the document-cache spec's tests, not repeated here).
- **Store-level**: `preview-store.ts`'s `dispatchValidate`/`receiveValidateResult` staleness guard (out-of-order response for a stale requestId is dropped), mirroring `instance-store.ts`'s existing test coverage for the same pattern.
- **Component-level**: `FormPreviewPanel.test.tsx` — uncontrolled mode's validation now flows through a mocked `usePreviewStore` dispatch instead of asserting on `validatePreviewSample` output directly; controlled mode's redundant local-validation assertions are removed.
- Full `apps/studio` suite run after the change (per this repo's standing "run the whole package suite" practice) to catch any other caller of the deleted exports.

## Decisions made during design

1. **Scope: both call sites**, not just the worker-side one — confirmed with the project owner rather than splitting into two follow-on PRs.
2. **Main-thread eval was rejected** in favor of routing the plain Form Preview panel's validation through the worker (like Prototype Workspace's instance editor already does), reusing `instance-store.ts`'s proven no-debounce/staleness-guard pattern instead of adding a new main-thread `new Function` sandbox or new debounce logic.
3. **TS erasure extends the existing regex stripper** rather than adding `typescript`'s `transpileModule` as a runtime dependency — narrower risk than a general-purpose stripper since both the emitter and the stripper are ours to control, and it avoids a real bundle-size cost.
4. **`buildDocuments()` caching was split into its own spec** (`2026-08-06-codegen-worker-document-cache-design.md`) rather than folded in here, after recognizing the uncached-parse-per-keystroke cost predates this change and every `buildDocuments()` consumer in the worker benefits from fixing it at that root — it's independently useful and independently shippable. This design depends on that spec's `previewFilesVersion` counter for its own compiled-validator cache.
