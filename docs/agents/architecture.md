# Architecture and Invariants

Current source and package manifests take precedence over historical specs.

## Package Map

| Area | Responsibility and entry points |
| --- | --- |
| `packages/core` | Rune grammar, generated AST/domain/Zod surfaces, parsing, linking, validation, and serialization. `src/services/rune-dsl-module.ts` exposes `createRuneDslServices`, which composes generated and custom Langium services and registers validation. |
| `packages/lsp-server` | Language-server integration over the core language services. |
| `packages/codegen` | Native generation, imports, Rosetta rendering, and instance utilities. `src/generator.ts` orchestrates namespace generation; `src/emit/namespace-walker.ts` supplies shared normalization. |
| `packages/visual-editor` | React Flow graphs, forms, adapters, and editor state; consumes core and codegen. |
| `packages/design-system` | Shared theme, tokens, and UI primitives. |
| `apps/studio` | React IDE, workspace persistence, browser workers, provider composition, and Pages Functions. |
| `packages/git-sync-engine`, `packages/curated-schema` | Shared Git synchronization and curated-model contracts. |
| `packages/instrumentation-core`, `packages/worker-core` | Shared instrumentation and Worker infrastructure; Worker logging lives in `worker-core/log`. |
| `apps/lsp-worker` | Hosted LSP sessions in `RuneLspSession` Durable Objects. |
| Other worker apps | Curated-model mirror, GitHub authentication, codegen gateway, and telemetry. |
| `packages/codegen-legacy`, `apps/codegen-container` | Legacy JVM/Rosetta bridge and container path; Java 21 and `rosetta-code-generators` still apply here. |
| `apps/docs`, `site` | Documentation and landing page, combined with Studio into the Pages artifact. |

The main dependencies are Studio → visual-editor/codegen/LSP/core,
and CLI/codegen/LSP → core.

## Studio Runtime

- Studio uses React 19, React Flow 12, Dockview, zustand 5/zundo 2, Tailwind CSS 4, Radix UI, and CodeMirror 6. Manifests currently use TypeScript 7 and Langium 4.3; check manifests before changing versions.
- OPFS stores workspace files; IndexedDB stores metadata, caches, settings, and layouts.
- `apps/studio/src/shell/providers/StudioProviders.tsx` composes provider responsibilities; `LspProvider.tsx` owns the LSP client and transport lifecycle.
- **Studio LSP is network-only.** `apps/studio/src/services/transport-provider.ts` defaults to session-token minting followed by a token-gated WebSocket to the hosted LSP. Only an explicit `wsUri` opts into direct WebSocket, with token-gated fallback after failure. Configured endpoints can differ between local, preview, and production environments.
- Parser and codegen browser workers handle local model operations; they do not provide an LSP fallback.
- `LspProvider` synchronizes only the active editable file, excluding bundle markers and `refOnly` files. Cross-file hover/definition into documents outside that set is not guaranteed. Preserve this boundary unless deliberately changing the server document lifecycle.
- Curated/reference-only models have distinct hydration and editing capabilities. Check deferred hydration, diagnostics, inheritance, and bare/qualified references when changing them; do not equate visibility with editability.
- Center panes stack vertically when their container becomes too narrow for the selected pane count; the wide layout retains draggable horizontal splits.
- Close transports during reconnect/disposal so server-side sessions and documents can be released.

## Shared Semantics

- Core `BASE_TYPE_FILES` owns the standard Rune types and annotations. Studio re-exports it; the shared `RuneWorkspaceManager` loads it during LSP initialization, including reconnects. Core and LSP factories install `RuneDslSharedModule`.
- `hydrateModelDocuments` registers every parsed root before `RuneJsonSerializer` invokes Langium's reference revival. Keep one object graph: repeated deserialize rounds retain stale generations and cannot resolve arbitrary cycles. Batch tests must verify target identity across long chains and cycles.
- Curated downloads use a disposable browser worker; user-file-only downloads use `/api/codegen`. Both call `src/services/codegen-download-handler.ts` for validation, namespace closure, generation, and packaging. Preserve fatal diagnostics and terminate the browser worker on completion, error, or timeout.
- Derive UI previews and validation from authoritative codegen output.
- `walkNamespace` gathers declarations and computes the type-reference graph, cycles, and emission order once per namespace. Emitters consume the readonly `NamespaceWalkResult` and own their diagnostics/source maps.
- `getTargetRelativePath` centralizes output paths. Keep TypeScript-only function extraction in `ts-emitter.ts` unless intentionally changing other targets.
- Studio function forms use resolved inherited/dispatch signatures. Codegen `normalizePreviewInputs` adapts plain form values using the shared type resolver and metadata runtime helpers, traversing actual input values independently of form expansion depth.
- Studio function preview transpiles complete generated modules with Sucrase and resolves imports only among generated outputs. Keep private evaluator binding names outside the Rune identifier alphabet (use `$`). Keep the worker execution restrictions and test real parsed/emitted functions when changing this path.
- Core `getFunctionSignature` resolves dispatch bases from namespace declarations and linked selectors. Language-service scopes and codegen share it, including overloads split across files.
- Function expression helpers live in `packages/codegen/src/expr/`; preserve cardinality and metadata across call and assignment boundaries. Validate changed semantics with parsed Rune, strict compilation of generated modules, and runtime assertions. Function calls, exported entry points, nested set/add targets, and function outputs share runtime cardinality checks; appends check the combined collection before mutating it. Nested Temporal fields use strings at function boundaries through the shared `RuneFuncData` structural mapping. See the codegen README.
- Core scopes and codegen share `resolveOperationType` and `getOperationArgument` for operator result types and headless pipeline inputs. Keep symbol lookup in its owning context; add operator propagation rules to the shared core utility.
- TypeScript declaration names and callable bindings use `packages/codegen/src/emit/callable-names.ts` across imports, type signatures, expressions, and bundled exports. Resolve calls from declaration identity; preserve original Rune names in function metadata used by Studio.
- Reuse `@rune-langium/worker-core/log` (`createWorkerLogger`, `REDACT_PATHS_BASELINE`) in Cloudflare Workers. Send raw structured objects to `console.log` for field indexing. The shared logger implements redaction explicitly because `pino/browser` does not apply its `redact` option. Pages Functions and the Node container are distinct runtime surfaces.

## Deployment and Verification

`pnpm run build:cloudflare` combines the landing page, docs, and Studio under
`apps/docs/.vitepress/dist/`. Source Pages Functions live in
`apps/studio/functions/`; root `functions/` and `wrangler.toml` are generated
build artifacts. Consult [the testing guide](../TESTING.md) for endpoint,
production smoke, and full UX verification commands. Keep evidence from those
checks separate from local unit-test results.
