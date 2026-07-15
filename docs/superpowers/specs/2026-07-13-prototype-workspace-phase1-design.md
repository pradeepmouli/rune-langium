# Prototype Workspace — Phase 1 Design (Instance Authoring + JSON I/O)

**Renumbered spec**: `023-studio-prototype-workspace` (the originally-drafted `021` collides with the merged/closed `specs/021-codegen-inbound`, and a remote `021-codegen-curated-bundles` branch also exists; `022` is likewise taken by `022-curated-form-preview`).

**Scope of this design**: Phase 1 only — **US1** (create/edit a persistent instance) and **US2** (JSON import/export, including bundles). US3 (references), US4 (instance graph), and the persistent-instance-binding half of US5 (function execution) are deferred to a follow-on Phase 2 spec, written once Phase 1 has landed. US6 (synonym-source import/export) stays gated on `019-codegen-inbound` (already merged) and is added later as a second `ImportCodec`, not part of this design.

The full original feature spec (all 6 user stories, all 3 phases) is preserved as the source document this design was scoped down from; nothing in that document is superseded except the phase-1/phase-2 boundary decisions recorded below.

## 1. Prior art actually verified against code

Before designing anything new, the following claims from the original spec were checked against the real codebase (not assumed):

- **`perspective-registry.ts`** (`apps/studio/src/shell/perspectives/perspective-registry.ts:8-50`) confirmed: a flat `PERSPECTIVES` array of 5 entries (`explore`, `workspaces`, `git`, `export`, `settings`), each `{ id, label, icon, group, requiresWorkspace, ... }`. Adding `prototype` is a 6th entry in the same shape.
- **`generatePreviewSchemas()`** (`packages/codegen/src/preview-schema.ts:77-130`) confirmed to walk namespaces and dispatch to `buildDataSchema`/`buildTypeAliasSchema`/`buildChoiceSchema`/`buildFunctionSchema`.
- **The actual depth-limited recursion** lives in `buildField` (487-509) → `buildBaseField` (511-552) → `objectField` (589-619), threading a `FieldContext` carrying `{ maxDepth, depth, seenTypes, path, ... }`. At the depth ceiling, `objectField` (line 590) currently emits a `{ kind: 'unknown', description: 'Recursive reference to X is not expanded...' }` stub. This is the exact mechanism Phase 1's lazy resolver reuses (see §3).
- **`preview-store.ts`** confirmed: zustand store with `dispatchExecute` (480-492) and per-target ephemeral samples — untouched by this design.
- **OPFS layout**: `specs/012-studio-workspace-ux/data-model.md:138-155` confirms every workspace has a reserved `.studio/` directory (siblings today: `scratch.json`, `dirty/`) explicitly outside the git-tracked `files/` working tree. This is where Phase 1 instance data belongs — the original spec's proposal of a top-level `instances/` directory is corrected to `.studio/instances/` (see §4).
- **Fingerprint precedent**: `sha256Hex()` in `apps/curated-mirror-worker/src/manifest.ts:68-75` hashes bytes via `crypto.subtle.digest('SHA-256', ...)` — a Web Crypto API call that runs identically in the browser, no Node dependency. Reused (ported into MIT `codegen`) rather than inventing a new hashing approach.

## 2. Package placement

| Concern | Package | License |
|---|---|---|
| Lazy field resolver (`resolveFields`) | `@rune-langium/codegen` | MIT |
| Bundle format types, manifest (de)serialization, fingerprint helper | `@rune-langium/codegen` | MIT |
| Plain-JSON `ImportCodec` | `@rune-langium/codegen` | MIT |
| Instance store, OPFS persistence, panels, pickers | `apps/studio` | FSL |

Rationale unchanged from the original spec: the MIT pieces are what a firm building its own CDM tooling would want independent of the studio UI (e.g. CI validation of payload bundles).

## 3. Lazy field resolver

**Decision**: extend the existing `FieldContext` walk (`buildField`/`buildBaseField`/`objectField`) rather than write a second, standalone attribute-walking implementation.

- New entry point `resolveFields(typeFqn: string, path: string[]): PreviewField[]` starts the same walk at an arbitrary type/path with `maxDepth = depth + 1` (i.e., resolve exactly one more level).
- `objectField`'s depth-ceiling branch gains a lazy mode: instead of always emitting `{ kind: 'unknown', ... }`, it emits `{ kind: 'object', expandable: true }` when called from the lazy entry point, so the UI can request another level on demand. The bounded `generatePreviewSchemas()` path keeps its current eager behavior — this is a mode flag on the shared walk, not a behavior change to the existing bounded output.
- Memoization is per `typeFqn`, so re-collapsing/re-expanding a section in the form doesn't re-walk the Rosetta AST.
- Recursive types cannot hang the UI: expansion is user-driven (one click = one level), which is a stronger guarantee than the old `seenTypes` cycle check even needed to provide.
- Result: **zero duplicated type-dispatch logic** (`isRosettaBasicType`/`isData`/`isRosettaEnumeration`/cardinality handling all stay in one place), and the existing `016-studio-form-preview`/`017-codegen-complete-types` test suites continue exercising the same code path, so a regression in the shared walk is caught by both old and new tests.

Field kinds gain `polymorphic` (parent type with subtypes, or a `choice`) per US1 AS4 — the user picks the concrete subtype/option first, then the form renders that subtype's fields, and the stored value records `concreteTypeFqn`. Per OQ4, **choice types are creatable as top-level instances**, not just as attribute values, consistent with US1 AS1's wording ("data types and choices; not functions, aliases, or enums").

No `reference` field kind in Phase 1 — reference-metadata detection is Phase 2 scope. Attributes that will eventually be reference-capable are simply embedded fields for now.

## 4. Instance model & persistence

```ts
interface InstanceRecord {
  id: string;                 // ulid
  name: string;               // user-assigned, unique per workspace (auto-suffixed)
  typeFqn: string;             // e.g. 'cdm.base.staticdata.party.Party'
  concreteTypeFqn?: string;    // when created against a parent/choice
  data: unknown;               // model-shaped JSON, unknown fields preserved
  provenance?: { codec: 'json' | 'function' | string; source?: string; inputs?: string[]; importedAt: number };
  createdAt: number;
  modifiedAt: number;
  stale?: { reason: string; diagnostics: ValidationDiagnostic[] };
}
```

`ValidationDiagnostic` is the same path-keyed diagnostic shape the Zod validation pipeline already produces for form errors (§7) — staleness reuses it rather than inventing a parallel diagnostic type.

**OPFS layout** (corrected per §1 — nested under the reserved `.studio/` namespace, not top-level):

```
.studio/
├── scratch.json
├── dirty/
└── instances/
    ├── index.json          # id → {name, typeFqn, modifiedAt, valid} for the explorer list
    └── <ulid>.json         # one InstanceRecord per file
```

File-per-instance was chosen over a single JSON blob: partial writes stay cheap (editing one instance doesn't rewrite the whole store), and — the load-bearing reason — **the on-disk layout is the bundle layout**. `apps/studio/src/opfs/tar-untar.ts` currently only implements extraction (`extractTarGz`, 56-108, gunzip via `pako.inflate` + a purpose-built ustar reader) — there is no create-side counterpart today, so this design adds one (`createTarGz`, symmetric ustar writer + `pako.gzip`) rather than assuming it already exists. The new function is tested by round-tripping its own output back through the existing `extractTarGz`.

**Bundle format**: `manifest.json` (format version, `modelFingerprint`, per-instance index) + `instances/*.json`, tarred.

**Model fingerprinting** (resolves the spec's Open Question #2, previously blocking):
- `modelFingerprint` = `sha256Hex()` (ported from the curated-mirror-worker pattern) over the serialized parsed documents of the currently-loaded model. Content hashing is the only signal that's universally available — workspaces aren't always git-backed (plain-folder and blank workspaces exist per `012-studio-workspace-ux`), so a git-SHA-only or git-SHA-preferred approach would leave the common authoring case (uncommitted, in-progress edits) unable to fingerprint at all.
- When the workspace *is* git-backed, the current commit SHA is additionally stamped into the manifest as **non-gating provenance** (a human-readable "exported from `<sha>`" label) — it never drives the staleness check, only the content hash does.
- Bundle import compares the manifest's `modelFingerprint` against a freshly computed hash of the currently-loaded model. Mismatch → every recreated instance is flagged `stale` and immediately revalidated against the *live* schemas, surfacing per-field diagnostics (unknown field, type mismatch) rather than crashing or dropping data. The same staleness pass runs whenever the loaded model changes underneath existing (non-imported) instances (US1 AS7).

## 5. Perspective & panel composition (Phase 1 — trimmed)

Registry entry:

```ts
{ id: 'prototype', label: 'Prototype', icon: Boxes, group: 'main', requiresWorkspace: true }
```

- **Left** — `InstanceExplorerPanel`: instance list, search/filter, "New instance" (type picker: data types + choices grouped by namespace), import entry point.
- **Center — two tabs** (not three; Graph is Phase 2):
  - **Form** — `InstanceFormPanel`, driven by `resolveFields()`.
  - **Function** — the existing `FormPreviewPanel` function-execution UI (function picker + `dispatchExecute` + read-only output viewer) mounted **as-is**, unchanged. No instance-binding, no drag-and-drop, no "save as instance" — that richness is the Phase 2 upgrade to US5. This gives users a working function-execution surface in the Prototype perspective from day one at effectively zero incremental implementation cost, since the mechanism already exists.
- **Right** — `InstanceInspectorPanel`: validation summary, provenance (imported-from/codec), raw JSON view with copy/export. No "referenced by" section (no references exist yet in Phase 1).

## 6. Import/export codec

```ts
interface ImportCodec {
  id: string;                                  // 'json' for Phase 1
  label: string;
  canTarget(typeFqn: string): boolean;
  import(input: Uint8Array | string, targetTypeFqn: string): {
    data: unknown;
    diagnostics: ImportDiagnostic[];           // unmapped fields, coercions, parse errors
  };
}
```

Phase 1 ships only the `json` codec (parse + pass-through; validation diagnostics come from the normal Zod pipeline, not the codec itself). The codec interface is designed so a synonym-source codec (Phase 3 / US6) is additive later.

**"Suggest type" (US2 AS5)** — deferred to a Phase 1 follow-up. It's pure UX sugar with no dependency from anything else in the design; the core loop assumes the user already knows/picks the target type.

**Unknown-field export policy**: opt-in stripping (default: keep unknown fields). Matches the import side's "preserve and warn" default — a consistent non-destructive posture end-to-end, and it never silently drops data.

## 7. Data flow

**Create/edit (US1)**: `InstanceExplorerPanel` "New instance" → type picker → `InstanceFormPanel` calls `resolveFields(typeFqn, [])` for the top level; expanding a nested field calls it again for that subtree. Every edit updates `InstanceRecord.data` in the new `instance-store` (zustand, mirroring `preview-store.ts` conventions). Saving writes `.studio/instances/<ulid>.json` and updates `index.json`.

**Validation (corrected from the original draft)** — checked against real code rather than assumed: `FormPreviewPanel.validatePreviewSample` (874-891) builds a purely *structural* Zod validator from the `PreviewField[]` tree (types/cardinality/enum) and never executes the real generated schema; `specs/016-studio-form-preview/research.md` explicitly rejected eval'ing a full generated Zod module in-browser (import/bundling/security risk), so that limitation is deliberate, not an oversight. But US1 AS5 requires condition-name-anchored violations, which the structural validator cannot produce. Resolution: two collaborating pieces, neither of which eval's a full generated module —
1. **Structural check**: extend the `buildSchemaValidator` approach to operate over `resolveFields`' lazy tree, recursing into currently-unexpanded subtrees as needed so the *whole* instance is checked, not just what the UI happens to have expanded.
2. **Condition check**: `emitConditionBlock` (zod-emitter.ts:865-903) already calls `transpileCondition(cond, ctx)` to get a plain JS boolean-predicate string (no imports) for each active condition — the exact same expression-transpiler `dispatchExecute` already runs safely in the codegen worker for function bodies. Phase 1 reuses that: run each type's condition predicates in the worker against the instance data, attach violations by condition name.

Errors from both pieces are merged and keyed by field path.

Manual form entry (blank instance, filled in by hand from the type picker) and JSON import are **both primary Phase 1 entry points** — neither is secondary to the other. Both converge on the same `InstanceRecord`/`InstanceFormPanel`/validation machinery once the instance exists, so a user can import a payload and keep hand-editing it, or author entirely from scratch.

**Import (US2)**: file picked → target type chosen → `json` codec parses (parse errors reported distinctly from schema errors) → new `InstanceRecord` with raw parsed data, unknown fields preserved → validation runs immediately through the same pipeline as manual authoring.

**Export (US2)**: single-instance export serializes `InstanceRecord.data` alone (no studio metadata), honoring the strip-unknown-fields opt-in. Bundle export walks `.studio/instances/`, computes `modelFingerprint`, writes `manifest.json` + `instances/*.json`, tars the directory.

**Bundle import + staleness**: see §4.

**Function execution**: unchanged from today's `FormPreviewPanel` (§5) — no new data flow.

## 8. Error handling

- Parse errors (malformed JSON) vs. schema errors (valid JSON, invalid instance) are distinct diagnostic categories, never conflated.
- Unknown fields are diagnostics, not failures — import is non-destructive by construction.
- Model-mismatch on bundle import becomes a `stale` diagnostic on the instance, never a thrown exception or a silently dropped instance.
- Recursive/cyclic types can't hang the UI: expansion is user-driven, one level per click.

## 9. Testing

- **Codegen (MIT)**: fixture tests for `resolveFields` — a type with attributes nested past depth 3, a `(1..*)` attribute, an enum, a `condition` block, and a self-referential type (recursion doesn't hang, doesn't eagerly expand past one level).
- **Studio (FSL)**: `instance-store` persistence round-trip (create → reload → identical data/validity/timestamps); OPFS `.studio/instances/` read/write mirroring existing `opfs-fs.test.ts` patterns; bundle export→import round-trip including the fingerprint-mismatch/staleness path.
- **Import/export**: fixture JSON with one wrong-typed field, one missing required field, one extraneous field — assert all three are reported with correct paths; fixed-and-exported output diffed against a hand-built expectation (the spec's own Independent Test for US2).
- **CDM smoke test**: author an instance of a real deep CDM type from `.resources/` (gated/skipped when the corpus is absent, per repo convention); import one known-good and one known-bad real CDM JSON sample, verify diagnostics.

## 10. Explicitly deferred (not in this design)

- References, reverse-reference index, dangling-reference diagnostics, reference field editor (US3) — Phase 2.
- `InstanceGraphAdapter` over `visual-editor`, shared selection with the graph (US4) — Phase 2.
- Instance-binding for function execution: drag-and-drop from the explorer, `RunConfig` persistence, "save output as instance", derivation provenance (the persistent-instance half of US5) — Phase 2. The ephemeral function-runner UI itself ships in Phase 1 (§5), unchanged.
- Synonym-source `ImportCodec` (US6) — Phase 3, gated on `019-codegen-inbound` (merged; codec interface designed to accept it additively).
- "Suggest type" ranking (US2 AS5) — Phase 1 follow-up.
- Preview-vs-Prototype convergence (retiring `preview-store` in favor of the lazy resolver) — non-blocking, revisit after Phase 1 ships based on how much the two form pipelines actually diverge in practice.
