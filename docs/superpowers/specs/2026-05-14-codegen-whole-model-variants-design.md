# Codegen Whole-Model Variants — Design Spec

**Feature Branch**: `019-codegen-whole-model-variants` (proposed)
**Status**: Draft — design review
**Created**: 2026-05-14
**Author**: Pradeep Mouli (with Claude Code)
**Depends on**: spec 018 Phase 0 (PR #165, merged)

---

## 1. Goal

Every emitter that currently produces **per-namespace output** should also be able to produce a **whole-model output** — a single, idiomatic, bundled artifact (or per-namespace plus index/barrel/runtime sidecars) that a downstream consumer can drop into a project as a unit.

Concretely:

- A library author who runs codegen against a 12-namespace model wants **one barrel `index.zod.ts`** they can `import { Trade } from './my-zod-schemas'` against.
- A data engineer downloading the JSON Schema artifact wants **one `model.schema.json` with `$defs`** rather than 12 separate files they have to wire via `$ref`s.
- A docs author wants **per-namespace `<ns>.md` plus an `index.md` TOC** that links to each.

These shapes are emitter-specific — "whole-model" doesn't mean "concatenated into one file" universally. Each emitter has the opinionated default that makes sense for its target ecosystem, plus options for variants.

This spec covers the three currently-implemented targets (Zod, TypeScript, JSON Schema) and pre-stages the same treatment for the Phase 2 targets (SQL, Markdown). It does **not** cover the Phase 1+ already-whole-model emitters (Excel, GraphQL); those don't need this work.

---

## 2. Non-Goals

- **No replacement of per-namespace emission.** Whole-model is **additive**. Callers (the CLI, the studio Preview path, downstream codegen pipelines) that want per-namespace output keep getting it unchanged.
- **No new download UI affordances.** The current `[Download]` button in the targets table fires server-side `/api/codegen` with the existing payload shape; spec §6 below extends that payload with one optional field, and the row's behavior depends on per-target defaults set on the server. No new "Download bundle" button.
- **No change to Excel / GraphQL.** Already whole-model; nothing to add.
- **No retroactive changes to PR #165.** This is Phase 0.5, landing after Phase 0 is merged.

---

## 3. Architecture

### 3.1 Selection mechanism — extend `GeneratorOptions`

Add an optional per-target options block on `GeneratorOptions`. This generalizes the SQL-specific `options.sql.{dialect,...}` slot the Phase-0 spec already reserved (§7.6 of spec 018):

```ts
// packages/codegen/src/types.ts

export interface GeneratorOptions {
  target?: Target;
  strict?: boolean;
  headerComment?: string;

  // 0.5 — per-target option blocks. Each emitter reads its own slot.
  zod?: ZodOptions;
  typescript?: TypescriptOptions;
  'json-schema'?: JsonSchemaOptions;
  sql?: SqlOptions;             // Phase 2
  markdown?: MarkdownOptions;   // Phase 2
}

export interface ZodOptions {
  /** Default: 'per-namespace+barrel'. */
  layout?: 'per-namespace' | 'per-namespace+barrel' | 'single-file';
}

export interface TypescriptOptions {
  /** Default: 'per-namespace+barrel'. */
  layout?: 'per-namespace' | 'per-namespace+barrel' | 'single-file';
}

export interface JsonSchemaOptions {
  /** Default: 'single-file' (preferred — JSON Schema's $defs is the idiomatic bundling). */
  layout?: 'per-namespace' | 'single-file';
}

export interface SqlOptions {
  dialect?: 'postgres' | 'sqlserver';
  inheritance?: 'single-table' | 'table-per-type';
  enumStrategy?: 'check' | 'table';
  /** Default: 'single-file' (one DDL file; the cross-table FK semantics make per-namespace splits brittle). */
  layout?: 'per-namespace' | 'single-file';
}

export interface MarkdownOptions {
  /** Default: 'per-namespace+index'. */
  layout?: 'per-namespace' | 'per-namespace+index';
}
```

**Why per-target options blocks** rather than a single top-level `layout: 'bundle' | 'split'`:

- The Phase 0 spec already established `options.sql.dialect` as the right shape for target-specific knobs. Whole-model is just another knob.
- Different emitters have different *names* for their bundling strategies. JSON Schema's options are about `$defs` placement; Markdown's are about TOC vs. flat. A shared enum across emitters either gets too abstract (`'bundle'`, ugh) or too coupled to one target's lingo.
- TypeScript's structural type system narrows `options.zod.layout` to the right values when `target: 'zod'` — IDE autocomplete points users to the relevant choices.

**Defaults are emitter-chosen**, listed in §4 below.

### 3.2 Contract changes — promote `NamespaceEmitter` to optionally see the registry

The current `NamespaceEmitter.emit` only sees one namespace at a time. Whole-model variants need cross-namespace information: barrel files reference every namespace's exports, JSON Schema `$defs` keys are `namespace.Type`, Markdown TOC links each namespace doc.

Two ways to thread this:

**Option A (chosen): augment `NamespaceEmitter` with a finalize step.**

```ts
// packages/codegen/src/emit/namespace-emitter.ts

export interface NamespaceEmitter {
  emit(
    walk: NamespaceWalkResult,
    options: GeneratorOptions,
    registry: NamespaceRegistry
  ): GeneratorOutput;

  /**
   * Optional finalize step called once after every per-namespace
   * `emit()` returns. Allows the emitter to append cross-cutting
   * outputs (barrel files, TOCs, master `$defs` schemas, runtime
   * helper sidecars) using the accumulated per-namespace outputs
   * plus the full registry.
   *
   * If omitted, `runGenerate` skips the finalize step entirely —
   * keeping the existing per-namespace-only behavior.
   */
  finalize?(
    perNamespaceOutputs: ReadonlyArray<GeneratorOutput>,
    registry: NamespaceRegistry,
    options: GeneratorOptions
  ): GeneratorOutput[];
}
```

`runGenerate` dispatch:

```ts
// Existing per-namespace loop produces N outputs.
const perNs = [...walks.values()].map((w) =>
  emitNamespaceWithContract(w, options, registry, EmitterCtor)
);

// New finalize call — if the emitter implements it, append its outputs.
const emitterInstance = new EmitterCtor();
const finalized = emitterInstance.finalize?.(perNs, registry, options) ?? [];
const outputs = [...perNs, ...finalized];
```

**Why not Option B (have every namespace emitter implement `WholeModelEmitter` instead)?**

- Forces every emitter to manage its own per-namespace iteration (boilerplate duplicated 5x).
- Loses the existing `emitNamespaceWithContract` adapter (which handles ordering, source-map merge, diagnostic aggregation).
- Conflates "I want cross-namespace context" with "I want to bypass per-namespace iteration."

`finalize` keeps the per-namespace fast path untouched and adds the cross-cutting hook only where it's needed.

The `isWholeModelEmitter` discriminator from Task 0.2 keeps working — `finalize` is just a NamespaceEmitter extension. Excel / GraphQL still come in via the `WholeModelEmitter` path and don't gain a `finalize`.

### 3.3 Discriminator update

`isWholeModelEmitter` from Task 0.2 currently uses `typeof proto.finalize !== 'function'` as a *negative* test for whole-model. Adding `finalize` to `NamespaceEmitter` breaks that heuristic.

Fix: switch to a positive marker. Either:

- Add a static `__contract: 'whole-model'` field on `WholeModelEmitterConstructor` (third-party emitters opt in by setting this).
- Or check `typeof proto.emit === 'function' && proto.emit.length === 3` (whole-model `emit` takes `(walks, registry, options)`, namespace `emit` takes `(walk, options, registry)`).

The static field is more robust to future signature drift. We add it during this work and update the three Phase 0 namespace emitters (which don't have it) implicitly via the negation.

---

## 4. Per-emitter bundle shapes

Each emitter defines its own opinionated default. Users override via `options.<target>.layout`.

### 4.1 Zod (`options.zod.layout`)

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace` (today)      | `<ns>.zod.ts` per namespace                                                                          |
| `per-namespace+barrel` (**default**) | `<ns>.zod.ts` per namespace **plus** `index.zod.ts` that re-exports every schema **plus** `runtime.zod.ts` with the shared helper functions extracted from per-file inlines |
| `single-file`                | One `model.zod.ts` with all schemas inlined and dependencies topologically ordered                   |

The barrel + runtime extraction matters because today every per-namespace file inlines the same `runeCheckOneOf`, `runeCount`, `runeAttrExists` helpers. In a multi-namespace bundle that's 3 × N duplicated lines. The barrel layout pulls them into one `runtime.zod.ts` and has each namespace file `import { runeCheckOneOf } from './runtime.zod.js'`. The single-file layout collapses the whole thing into one module.

### 4.2 TypeScript (`options.typescript.layout`)

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace` (today)      | `<ns>.ts` per namespace                                                                              |
| `per-namespace+barrel` (**default**) | `<ns>.ts` per namespace **plus** `index.ts` that re-exports every interface, type alias, and func   |
| `single-file`                | One `model.ts` with all interfaces inlined                                                            |

Same rationale as Zod. Func emission is already separated from interface emission (see `packages/codegen/src/emit/ts-emitter.ts`); the barrel pattern works naturally.

### 4.3 JSON Schema (`options.json-schema.layout`)

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace` (today)      | `<ns>.schema.json` per namespace, cross-namespace refs use `$ref` to sibling files                   |
| `single-file` (**default**)  | One `model.schema.json` with every type in `$defs` keyed by `<namespace>.<Type>`, cross-references via internal `$ref: "#/$defs/<ns>.<Type>"` |

JSON Schema's `$defs` is the idiomatic bundling mechanism — that's why the default flips here vs. Zod/TS. Per-namespace stays available for users whose ingest pipelines expect file-per-schema.

### 4.4 SQL (Phase 2, `options.sql.layout`)

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.sql` per namespace                                                                             |
| `single-file` (**default**)  | One `model.sql` with all `CREATE TABLE` / `CREATE TYPE` statements ordered to satisfy FK constraints |

SQL's cross-namespace foreign keys make per-namespace files brittle (you'd need to manually order them when running). Default to a single bundled DDL.

### 4.5 Markdown (Phase 2, `options.markdown.layout`)

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.md` per namespace                                                                              |
| `per-namespace+index` (**default**) | `<ns>.md` per namespace **plus** `index.md` table of contents linking each                       |

---

## 5. Studio UX

**No visible change to the targets table.** The current `[Download]` button on each row continues to fire one POST to `/api/codegen`. The server applies the per-emitter default layout (from §4) when the request omits `options.<target>.layout`. Power users hitting `/api/codegen` programmatically can override.

**Optional: a settings sub-menu** on each row (deferred to a follow-up if users ask for it). For now, the per-emitter defaults are designed to match the expected use case (downloaded artifact = self-contained drop-in).

The Preview path (`[View]` button + in-browser codegen-worker) **always uses `layout: 'per-namespace'`**, because Preview's whole UX is per-file: the file dropdown lets users navigate one namespace at a time. Bundled views would defeat that affordance. This is enforced in the codegen-worker, not the emitter.

---

## 6. Server-side `/api/codegen` contract additions

§7.6 of spec 018 already defined `body.options`, which Phase 0 left ignored. The PR #165 review patch threaded it through. This spec just extends the documented option shapes per §3.1 above. No new endpoints, no new headers.

A multi-namespace `layout: 'per-namespace+barrel'` Zod request still returns a zip — barrel + per-namespace files + runtime sidecar all bundled. The `downloadFilename` helper already names multi-output responses `<target>-output.zip` (PR #165 round-2 fix); the contents differ based on layout.

A `layout: 'single-file'` request always returns a single artifact regardless of namespace count, named per the emitter (`model.zod.ts`, `model.schema.json`, etc.).

---

## 7. Testing strategy

### 7.1 Per-emitter unit tests

Each existing emitter test suite (`packages/codegen/test/us5b-typescript.test.ts`, etc.) gains a new section:

- One fixture model with 2+ namespaces.
- One test per layout option asserts the expected file set.
- Snapshot tests on the barrel / index content to catch regressions in re-export ordering.

### 7.2 Cross-emitter dispatch tests

In `packages/codegen/test/dispatch.test.ts`:

- `runGenerate` calls `emitter.finalize?(...)` when the emitter defines it, doesn't when it doesn't.
- Per-namespace outputs are still ordered by `relativePath` regardless of `finalize`'s additions.
- `finalize` runs after every per-namespace `emit` (not interleaved).
- Strict-mode diagnostics from `finalize` outputs propagate to the `GeneratorError` check.

### 7.3 Studio Pages Function tests

`apps/studio/functions/test/codegen.test.ts` extensions:

- `layout: 'per-namespace+barrel'` for Zod with 2 namespaces → zip with `a.zod.ts`, `b.zod.ts`, `index.zod.ts`, `runtime.zod.ts`.
- `layout: 'single-file'` for JSON Schema → 200 with single body (no zip) named `model.schema.json`.

### 7.4 E2E

No new Playwright spec needed for v1 since UX is unchanged. Phase 1 (Excel) will exercise the multi-output whole-model path via real `wrangler pages dev`.

---

## 8. Implementation phases

| Phase | Scope                                                                                                                                                       |
|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0.5.1 | Contract additions: per-target options interfaces in `types.ts`, `NamespaceEmitter.finalize?` hook, `runGenerate` dispatch, discriminator update. Tests.    |
| 0.5.2 | Zod: extract runtime helpers to a shared module, implement `finalize` for `per-namespace+barrel` (default) and `single-file`. Tests.                        |
| 0.5.3 | TypeScript: barrel finalize, single-file layout. Tests.                                                                                                     |
| 0.5.4 | JSON Schema: single-file `$defs` layout (default), per-namespace fallback. Tests.                                                                           |
| 0.5.5 | Studio Pages Function: surface `options.<target>.layout` end-to-end, extend unit tests, update spec §7.6 of spec 018 to point at this file for option shapes. |

Phases 0.5.2 / 0.5.3 / 0.5.4 are independent and can ship as separate PRs against the 019 feature branch, or all together — depending on review-cycle preference.

Phase 2's SQL/Markdown work in spec 018 plugs into the same `finalize` hook; that scope is unchanged by this spec.

---

## 9. Migration & risks

- **Existing per-namespace callers see no behavior change.** Default for Zod / TS flips from "per-namespace only" → "per-namespace + barrel" for `/api/codegen` Download, but the CLI's default-omitted-options path still calls per-namespace if `layout` is unset. Concretely: `runGenerate(docs, { target: 'zod' })` returns just per-namespace outputs unless `options.zod.layout` is set.
  - **Decision point**: should the CLI / library default to barrel mode too, or keep per-namespace as the library default? Lean toward **library default = per-namespace, Pages Function default = barrel** so the studio's Download is opinionated while library consumers don't get surprise extra files. This needs explicit confirmation.
- **`finalize` discriminator regression risk**: Codegen tests in `packages/codegen/test/emit/whole-model-emitter.test.ts` need updating; `isWholeModelEmitter` switches from prototype-shape sniffing to a static marker.
- **Runtime helper extraction is a byte-identity break for Zod** (SC-007 is about determinism, not specifically byte-identity — but verify fixture tests are still meaningful after refactor). Mitigation: bump fixture snapshots in the same PR that extracts helpers; CI catches drift.
- **JSON Schema `$defs` key collisions**: model namespaces could in principle share short type names. The key `<ns>.<Type>` should always be unique since namespace names are globally unique in Rune. Add a test that asserts uniqueness of `$defs` keys.

---

## 10. Open questions

1. **Library default — per-namespace or barrel?** (See §9 above.) My lean: keep library at per-namespace (least-surprise for existing CLI users), make `/api/codegen` opinionated. Decision needed before implementation.
2. **Should `single-file` Zod / TS layouts produce a single `.ts` file even for 30-namespace models?** Practically the output would be enormous (CDM has ~80 namespaces). The layout option is documented but `single-file` for large models is "use at your own risk." No size enforcement.
3. **Markdown `index.md` shape** — flat list of namespaces, or nested table per type-kind? Defer to Phase 2 spec when Markdown emitter ships.
4. **GraphQL SDL needs whole-model already (it's `WholeModelEmitter` from day one).** Should we add a `per-namespace` option for GraphQL too, for users who want one `.graphql` file per namespace? Probably not — GraphQL schemas are typically one-file-per-service. Defer until requested.

---

## 11. References

- Spec 018 design: `docs/superpowers/specs/2026-05-12-codegen-additional-targets-design.md`
- Spec 018 Phase 0 PR: https://github.com/pradeepmouli/rune-langium/pull/165 (merged as `d226996c`)
- `WholeModelEmitter` contract (introduced in spec 018 Task 0.2): `packages/codegen/src/emit/namespace-emitter.ts`
- `TARGET_DESCRIPTORS` registry: `packages/codegen/src/types.ts`
- `IMPLEMENTED_TARGETS` export: `packages/codegen/src/generator.ts`
