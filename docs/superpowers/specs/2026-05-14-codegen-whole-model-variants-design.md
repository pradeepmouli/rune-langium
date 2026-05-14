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
  /** Default: 'per-namespace' (library); '/api/codegen' Pages Function defaults to 'barrel'. */
  layout?: 'per-namespace' | 'barrel' | 'single-file';
}

export interface TypescriptOptions {
  layout?: 'per-namespace' | 'barrel' | 'single-file';
}

export interface JsonSchemaOptions {
  /** Default: 'single-file' (preferred — `$defs` is JSON Schema's idiomatic bundling). */
  layout?: 'per-namespace' | 'single-file';
}

export interface SqlOptions {
  dialect?: 'postgres' | 'sqlserver';
  inheritance?: 'single-table' | 'table-per-type';
  enumStrategy?: 'check' | 'table';
  /** Default: 'single-file' (cross-table FK semantics make per-namespace splits brittle). */
  layout?: 'per-namespace' | 'single-file';
}

export interface MarkdownOptions {
  /** Default: 'barrel' (per-namespace + index.md TOC). */
  layout?: 'per-namespace' | 'barrel';
}
```

**Dispatch is a one-bit decision** based on the resolved layout: `'per-namespace'` routes to that target's `NamespaceEmitter`; **any other value** routes to that target's `WholeModelEmitter`. The whole-model emitter reads the same `layout` value internally to pick its rendering style (e.g., for Zod: `'barrel'` vs `'single-file'`).

**Why per-target option blocks** rather than a single top-level `layout: 'bundle' | 'split'`:

- The Phase 0 spec already established `options.sql.dialect` as the right shape for target-specific knobs. Layout is just another knob.
- Different emitters have different *values* — JSON Schema doesn't have a `'barrel'` (its bundle *is* `$defs`); SQL has no barrel concept. Per-target enums let each target expose only its valid values.
- TypeScript narrows `options.zod.layout` against the declared union, so IDE autocomplete is target-specific.

### 3.2 Contract architecture — `NamespaceEmitter` + `LanguageProfile`, wrapped by `GenericModelEmitter`

The existing `NamespaceEmitter` / `WholeModelEmitter` contracts (from Phase 0 Task 0.2) stay as they are. Phase 0.5 adds two new pieces:

1. **`LanguageProfile<T>`** — declarative target-level metadata for packaging: file extension, how to make a barrel/index output, how to concatenate per-namespace outputs into one single-file artifact, and any shared sidecar files (runtime helpers, manifest, README) the target wants to ship alongside its core outputs. **Profiles exist independently of `NamespaceEmitter`** — Excel and GraphQL can ship a Profile to describe their packaging conventions (e.g., an Excel workbook plus a `manifest.json` sidecar) even though they have no per-namespace mode.
2. **`GenericModelEmitter<T extends Target>`** — a parameterized `WholeModelEmitter` implementation that wraps any `NamespaceEmitter` plus its `LanguageProfile`. It runs the inner emitter per-namespace with `suppressBoilerplate: true`, then uses the Profile to assemble the whole-model artifact set (barrel + per-namespace + runtime sidecar; or single-file concat; etc.). This collapses the "barrel" / "single-file" pattern into one place for all targets that can be expressed as "per-namespace plus shared aggregation."

```ts
// packages/codegen/src/emit/namespace-emitter.ts (additions)

export interface NamespaceEmitterOptions extends GeneratorOptions {
  /**
   * When true, the emitter must skip emitting shared runtime helpers
   * inline in each per-namespace file. The wrapping `GenericModelEmitter`
   * emits them once via the Profile's runtime sidecar instead. Default false.
   */
  suppressBoilerplate?: boolean;
}

export interface NamespaceEmitter {
  emit(
    walk: NamespaceWalkResult,
    options: NamespaceEmitterOptions,
    registry: NamespaceRegistry
  ): GeneratorOutput;
}
```

```ts
// packages/codegen/src/emit/language-profile.ts (new)

export interface LanguageProfile<T extends Target> {
  readonly target: T;
  /** Output extension for this target's primary files (also in TARGET_DESCRIPTORS — duplicated here for emitter convenience). */
  readonly extension: string;
  /**
   * Render an index/barrel that references every per-namespace output.
   * Examples: Zod re-export module, TypeScript barrel, Markdown TOC.
   * Return `undefined` to signal the target has no meaningful barrel
   * (e.g., JSON Schema treats single-file as the canonical bundling).
   */
  makeBarrel(
    perNamespaceOutputs: ReadonlyArray<GeneratorOutput>,
    registry: NamespaceRegistry
  ): GeneratorOutput | undefined;
  /**
   * Concatenate per-namespace outputs into a single artifact. Used when
   * the resolved layout is `'single-file'`.
   */
  concatenate(
    perNamespaceOutputs: ReadonlyArray<GeneratorOutput>,
    registry: NamespaceRegistry
  ): GeneratorOutput;
  /**
   * Shared sidecar artifacts — runtime helpers (Zod's `runeCheckOneOf`
   * et al.), manifests, READMEs, etc. Returned alongside core outputs
   * in every whole-model emission. Empty array if none.
   */
  makeSharedArtifacts(
    perNamespaceOutputs: ReadonlyArray<GeneratorOutput>,
    registry: NamespaceRegistry
  ): GeneratorOutput[];
}
```

```ts
// packages/codegen/src/emit/generic-model-emitter.ts (new)

export class GenericModelEmitter<T extends Target> implements WholeModelEmitter {
  constructor(
    private readonly inner: NamespaceEmitter,
    private readonly profile: LanguageProfile<T>
  ) {}

  async emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    registry: NamespaceRegistry,
    options: GeneratorOptions
  ): Promise<GeneratorOutput[]> {
    const targetOptions = (options as Record<string, unknown>)[this.profile.target] as
      | { layout?: string }
      | undefined;
    const layout = targetOptions?.layout ?? 'barrel';

    const perNs = [...walks.values()].map((walk) =>
      this.inner.emit(walk, { ...options, suppressBoilerplate: true }, registry)
    );

    if (layout === 'single-file') {
      return [this.profile.concatenate(perNs, registry)];
    }

    // 'barrel' (and any future per-namespace+aggregation layout).
    const barrel = this.profile.makeBarrel(perNs, registry);
    const sidecars = this.profile.makeSharedArtifacts(perNs, registry);
    return [...perNs, ...(barrel ? [barrel] : []), ...sidecars];
  }
}
```

**Dispatch in `runGenerate`** (replaces the EMITTER_CLASSES lookup):

```ts
const NAMESPACE_EMITTERS: Partial<Record<Target, NamespaceEmitterConstructor>> = {
  zod: ZodNamespaceEmitter,
  typescript: TsNamespaceEmitter,
  'json-schema': JsonSchemaNamespaceEmitter,
  // Phase 2: sql, markdown
};

const PROFILES: Partial<Record<Target, LanguageProfile<Target>>> = {
  zod: zodProfile,
  typescript: typescriptProfile,
  'json-schema': jsonSchemaProfile,
  // Phase 1: excel; Phase 2: sql, markdown; Phase 3: graphql
};

// Hand-rolled WholeModelEmitter classes for targets that aren't
// per-namespace-then-aggregate (Excel, GraphQL).
const WHOLE_MODEL_EMITTERS: Partial<Record<Target, WholeModelEmitterConstructor>> = {
  // excel: ExcelWholeModelEmitter,   // Phase 1
  // graphql: GraphqlSdlEmitter,      // Phase 3
};

function resolveEmitter(target: Target, options: GeneratorOptions): EmitterConstructor | undefined {
  const layout = (options as Record<string, unknown>)[target] as { layout?: string } | undefined;
  const NsCtor = NAMESPACE_EMITTERS[target];
  const profile = PROFILES[target];
  const WmCtor = WHOLE_MODEL_EMITTERS[target];

  // Per-namespace request → namespace emitter if we have one, else fall through.
  if (layout?.layout === 'per-namespace' && NsCtor) return NsCtor;

  // Hand-rolled whole-model emitter takes priority over the generic wrapper.
  if (WmCtor) return WmCtor;

  // Generic wrapping of NamespaceEmitter + Profile.
  if (NsCtor && profile) {
    return class extends GenericModelEmitter<Target> {
      constructor() { super(new NsCtor(), profile); }
    };
  }

  return undefined;
}
```

**Two-registry separation eliminates the discriminator question.** Each emitter constructor is in exactly one of (NAMESPACE_EMITTERS, WHOLE_MODEL_EMITTERS, GenericModelEmitter-wrapped); the dispatch knows the contract from the registry, not from runtime introspection. Section 3.3 below details the cleanup.

### 3.3 Discriminator cleanup

The `isWholeModelEmitter` discriminator from Task 0.2 was a runtime sniff (`typeof proto.finalize !== 'function'`) used inside `runGenerate` to pick the dispatch path. With the two-registry approach above, dispatch knows the contract at lookup time, so the runtime discriminator is no longer load-bearing.

**Action**: `isWholeModelEmitter` stays exported (third-party callers may have integrated against it), but it's no longer called from `runGenerate`. The internals switch to the two-registry lookup. A small follow-up Phase 1 commit can deprecate `isWholeModelEmitter` in a JSDoc note and remove it in a later major.

---

## 4. Per-emitter bundle shapes

Every target's `options.<target>.layout` resolves to one of: `'per-namespace'`, `'barrel'`, or `'single-file'` (some targets expose only a subset). The dispatch (§3.2) picks `NamespaceEmitter` for `'per-namespace'` and `WholeModelEmitter` (via `GenericModelEmitter` for most targets) for the rest.

Each target's `LanguageProfile` decides how `'barrel'` and `'single-file'` render. The tables below describe each profile's behavior.

### 4.1 Zod — `options.zod.layout`

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.zod.ts` per namespace (today's behavior, with `suppressBoilerplate: false` so runtime helpers stay inlined) |
| `barrel`                     | `<ns>.zod.ts` per namespace (with `suppressBoilerplate: true`) **+** `index.zod.ts` (re-exports) **+** `runtime.zod.ts` (shared helpers as a sidecar) |
| `single-file`                | One `model.zod.ts` with all schemas, runtime helpers, and exports inlined; dependencies topologically ordered |

The runtime extraction matters because today every per-namespace file inlines the same `runeCheckOneOf`, `runeCount`, `runeAttrExists` helpers. In a multi-namespace bundle that's 3×N duplicated lines. The `barrel` layout extracts them once into `runtime.zod.ts` via `LanguageProfile.makeSharedArtifacts`; the `single-file` layout concatenates everything via `LanguageProfile.concatenate`.

### 4.2 TypeScript — `options.typescript.layout`

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.ts` per namespace (today's behavior)                                                           |
| `barrel`                     | `<ns>.ts` per namespace **+** `index.ts` re-exporting every interface, type alias, and func          |
| `single-file`                | One `model.ts` with all interfaces inlined                                                            |

Func emission already separated from interface emission (`packages/codegen/src/emit/ts-emitter.ts`); the barrel pattern works naturally. No runtime sidecar needed — TS interfaces erase, no shared helpers.

### 4.3 JSON Schema — `options.json-schema.layout`

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.schema.json` per namespace; cross-namespace refs use `$ref` to sibling files                   |
| `single-file`                | One `model.schema.json` with every type in `$defs` keyed by `<namespace>.<Type>`; cross-refs via internal `$ref: "#/$defs/<ns>.<Type>"` |

JSON Schema has **no `'barrel'` value** — its bundle *is* `$defs`, which is the `'single-file'` shape. The profile's `makeBarrel` returns `undefined`; the dispatch (§3.2) routes `'barrel'` requests to `'single-file'` behavior implicitly, or the option type narrows it out entirely.

### 4.4 SQL (Phase 2) — `options.sql.layout`

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.sql` per namespace                                                                             |
| `single-file`                | One `model.sql` with all `CREATE TABLE` / `CREATE TYPE` statements ordered to satisfy FK constraints |

Same shape as JSON Schema (no `'barrel'`). Cross-namespace FKs make per-namespace runs brittle anyway; `single-file` is the natural artifact.

### 4.5 Markdown (Phase 2) — `options.markdown.layout`

| Layout                       | Outputs                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `per-namespace`              | `<ns>.md` per namespace                                                                              |
| `barrel`                     | `<ns>.md` per namespace **+** `index.md` table of contents linking each                              |

No `'single-file'` value for Markdown — concatenating multi-namespace docs into one giant Markdown file isn't a use case anyone has asked for, and the per-page navigation pattern is the point of Markdown docs. The Phase 2 Markdown spec can revisit if needed.

### 4.6 Excel (Phase 1) — no `layout` option

Excel ships only as `WholeModelEmitter` (hand-rolled). The `LanguageProfile` for Excel still ships, because the profile's `makeSharedArtifacts` can produce sidecars (e.g., a `manifest.json` describing the workbook structure, a `README.md` with usage notes) that ride alongside the workbook in the response zip. Profile's `makeBarrel` and `concatenate` return `undefined` / no-op for Excel since they're meaningless.

### 4.7 GraphQL (Phase 3) — no `layout` option

GraphQL SDL ships only as `WholeModelEmitter`. Single `schema.graphql` file plus any Profile-defined sidecars.

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
| 0.5.1 | Contract foundation: per-target option interfaces in `types.ts`; `NamespaceEmitter` gains `suppressBoilerplate`; new `LanguageProfile<T>` interface; new `GenericModelEmitter<T>` class; new two-registry dispatch in `runGenerate`. Discriminator cleanup (§3.3). Tests for the wrapper + dispatch in isolation. |
| 0.5.2 | Zod: extract runtime helpers to a sidecar via the Zod Profile (`makeSharedArtifacts`); have `ZodNamespaceEmitter` respect `suppressBoilerplate`; ship `zodProfile` with `makeBarrel` + `concatenate`. Fixture coverage for `per-namespace`, `barrel`, `single-file`. |
| 0.5.3 | TypeScript: `tsProfile` with `makeBarrel` (re-exports) + `concatenate`; respect `suppressBoilerplate` (no-op for TS since there are no shared helpers, but the option must be accepted). Fixture coverage. |
| 0.5.4 | JSON Schema: `jsonSchemaProfile` with `concatenate` producing the `$defs` document; `makeBarrel` returns `undefined`. Fixture coverage for `per-namespace` and `single-file`. |
| 0.5.5 | Studio Pages Function: thread `options.<target>.layout` end-to-end (already wired in PR #165 via the post-review fix, just exercise it); pick the per-target default for `/api/codegen` separately from the library default (§9 open question). Extend unit tests for the option contract. |

Phases 0.5.2 / 0.5.3 / 0.5.4 are independent and can ship as separate PRs against the `019-codegen-whole-model-variants` feature branch, or all together — depending on review cadence.

**Phase 2** of spec 018 (SQL, Markdown) plugs straight into this architecture: each target ships its own NamespaceEmitter + Profile and inherits whole-model behavior via `GenericModelEmitter` for free.

**Phase 1** (Excel) and **Phase 3** (GraphQL) ship hand-rolled `WholeModelEmitter` classes registered in `WHOLE_MODEL_EMITTERS`. Their Profiles still exist (for sidecars), but `GenericModelEmitter` doesn't wrap them — the dispatch picks the hand-rolled emitter directly.

---

## 9. Migration & risks

- **Existing per-namespace callers see no behavior change** as long as the library default for `layout` stays `'per-namespace'`. The CLI's `pnpm rune-codegen --target zod` keeps producing the same files. (See open question 1 below for the default-policy decision.)
- **Runtime helper extraction is a byte-identity break for Zod's barrel layout** (per-namespace files no longer include the inlined helpers when `suppressBoilerplate: true`). SC-007 (determinism) is preserved — output is still byte-stable for any fixed `(target, layout, model)` triple, just different from today's per-namespace bytes. Mitigation: fixture snapshots gain new entries per layout; the existing per-namespace snapshots are unchanged.
- **JSON Schema `$defs` key collisions** are impossible *if* namespace names are globally unique (which they are in Rune — namespace declarations are top-level and unique-keyed). Add a test that asserts uniqueness of `$defs` keys anyway, as defense in depth.
- **The two-registry dispatch (§3.2) removes the `isWholeModelEmitter` runtime sniff** as a load-bearing call. The export stays for third-party callers but is no longer used internally. Marked for deprecation in a later major.

---

## 10. Open questions

1. **Library default for Zod / TypeScript `layout`** — `'per-namespace'` (today's behavior; least-surprise for CLI users) or `'barrel'` (opinionated; matches the studio's Download default)? My lean: keep library default at `'per-namespace'`, make `/api/codegen` send `layout: 'barrel'` explicitly. Then `runGenerate(docs, { target: 'zod' })` from the CLI is unchanged, and the studio's bundled download is an opt-in by the Pages Function. **Decision needed.**
2. **Large-model `single-file` Zod / TS guardrails** — CDM has ~80 namespaces; a `single-file` Zod artifact for that model is ~1MB and slow to type-check. Options: document as "use at your own risk" (simplest), emit a warning diagnostic above a threshold, or emit a fatal diagnostic. **Decision needed.**
3. **Markdown `index.md` shape** — flat namespace list vs nested by type-kind. Defer to the Phase 2 Markdown spec; for now reserve `options.markdown.layout: 'barrel'` as the default with the rendering details TBD.
4. **GraphQL `per-namespace` option** — should GraphQL SDL get a per-namespace variant? GraphQL schemas are typically one-file-per-service; per-namespace splits don't match how SDLs are consumed. Skip unless requested.

---

## 11. References

- Spec 018 design: `docs/superpowers/specs/2026-05-12-codegen-additional-targets-design.md`
- Spec 018 Phase 0 PR: https://github.com/pradeepmouli/rune-langium/pull/165 (merged as `d226996c`)
- `WholeModelEmitter` contract (introduced in spec 018 Task 0.2): `packages/codegen/src/emit/namespace-emitter.ts`
- `TARGET_DESCRIPTORS` registry: `packages/codegen/src/types.ts`
- `IMPLEMENTED_TARGETS` export: `packages/codegen/src/generator.ts`
