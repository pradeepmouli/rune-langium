# Follow-up audit — 2026-10-02

Reviewed the LSP, Form Preview, Prototype, codegen and Inspector migration plans
against current master (`c8654321`), implementation and tests. A plan's unchecked
boxes alone are not evidence that its code is missing.

## Confirmed gaps

| Follow-up | Current evidence | Assessment |
| --- | --- | --- |
| Large-workspace cross-file LSP | August 8 LSP plan deliberately restricts source sync to one file and leaves closure sync as a fast-follow. | #559; compact semantic closure synchronization implemented on this branch. |
| Recursive and arbitrarily deep form authoring | July 13 Prototype plan promises unbounded-depth authoring, then its July 14 correction reverts the lazy resolver and reuses the preview generator. `preview-schema.ts` still emits `recursive-reference`/unknown fields for repeated types and at `maxDepth`; its tests explicitly assert unsupported status. `FormPreviewPanel` reports skipped references. | [#560](https://github.com/pradeepmouli/rune-langium/issues/560). A real incomplete follow-through. Original feature 016 allowed this limitation, but the later Prototype promise remains unmet. Shared Preview/Prototype support must be restored through one authoritative schema pipeline. Invalid recursive aliases are a separate language error. |
| Publish-time codegen and output caches | #447 and design PR #446 remain open. That PR has never merged; its referenced design file is absent on master. Current emitters still operate on hydrated ASTs. Existing document caches/closure loading are partial improvements, not the planned type-shape and emitted-output cache. | Approved work remains in design/review. Reconcile #446 with current caching and cross-bundle architecture before execution. |
| CDM function execution/parity battery | `packages/codegen/test/func-fidelity-matrix.test.ts` has four output-text assertions and one `it.todo` for the promised 100-case compile/execute/Python comparison. The newer corpus check compiles real generated modules; it does not provide that execution oracle. | [#561](https://github.com/pradeepmouli/rune-langium/issues/561). A validation gap, not proof that 96 functions are broken. The old fixture blocker is now actionable because real CDM sources exist in `.resources/`. |
| Inspector migration completion checks and DRY cleanup | Feature 013's LOC report explicitly misses its reduction target and defers removal of imperative section calls. `DataTypeForm` still invokes those sections. The promised `dataform-roundtrip` parity fixture and `z2f-hmr` end-to-end checks are absent. | [#562](https://github.com/pradeepmouli/rune-langium/issues/562). Runtime migration shipped; completion/verification and cleanup did not. Avoid treating the entire migration as unimplemented. |

## Stale records, with implemented code

- `_deferred/inspector-z2f-migration.md` was superseded by feature 013. Current
  editors use canonical AST schemas with `useZodForm`/`useExternalSync`.
- #492's no-op global search description is obsolete: `AppHeader` mounts
  `GlobalSearch`, with click and Cmd/Ctrl-K activation and four passing tests.
- The May 22 manifest-closure deferral is implemented by the shared curated
  workspace loader and namespace graph, including cross-bundle closure.
- The old TypeScript erasure follow-up is implemented with Sucrase in the
  preview worker; generated modules and imports use the shared execution path.
- The LSP feature-parity checklist is stale for DO wiring, initialize replay,
  close eviction, persistence, shutdown and multi-tab session isolation. These
  have implementation and integration tests; #559 concerns dependency context,
  not an absent hosted server.

## Suggested order

Finish #559 first, then recursive/deep Preview and Prototype forms. Refresh #446
and #447's performance design next. Restore the CDM execution oracle and the
Inspector parity checks alongside changes to those surfaces. Keep the existing
production regressions (#525/#526) separately tracked; this audit does not claim
those journeys now pass.
