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
- `WorkbenchHost` owns Dockview mounting, stable panel bridges, native-layout restore, serialization subscriptions, and disposal. Each perspective supplies a `WorkbenchDefinition` with its panels, titles, and default builder. `DockShell` remains Explore's adapter: it owns migration of `PanelLayoutRecord`, the Explore factory layout, toolbar/shortcuts, center-pane policy, and utility-tray collapse behavior. Per-workspace perspective preferences use versioned workbench settings; they must contain UI state only, never model payloads or generated artifacts.
- **Studio LSP is network-only.** `apps/studio/src/services/transport-provider.ts` defaults to session-token minting followed by a token-gated WebSocket to the hosted LSP. Only an explicit `wsUri` opts into direct WebSocket, with token-gated fallback after failure. Configured endpoints can differ between local, preview, and production environments.
- Parser and codegen browser workers handle local model operations; they do not provide an LSP fallback.
- `LspProvider` synchronizes only the active editable file, excluding bundle markers and `refOnly` files. Cross-file hover/definition into documents outside that set is not guaranteed. Preserve this boundary unless deliberately changing the server document lifecycle.
- Curated/reference-only models have distinct hydration and editing capabilities. Check deferred hydration, diagnostics, inheritance, and bare/qualified references when changing them; do not equate visibility with editability.
- Curated namespace artifacts carry original file `content` alongside the serialized AST. Both artifact builders preserve upstream comments and formatting. The parse response and model cache retain that content for read-only source browsing; list-only namespaces remain deferred. Legacy artifacts without content still hydrate, but displaying their original source requires rebuilding and publishing the artifacts.
- Center panes stack vertically when their container becomes too narrow for the selected pane count; the wide layout retains draggable horizontal splits.
- Close transports during reconnect/disposal so server-side sessions and documents can be released.

## Shared Semantics

- Core `BASE_TYPE_FILES` owns the standard Rune types and annotations. Studio re-exports it; the shared `RuneWorkspaceManager` loads it during LSP initialization, including reconnects. Core and LSP factories install `RuneDslSharedModule`.
- `hydrateModelDocuments` registers every parsed root before `RuneJsonSerializer` invokes Langium's reference revival. Keep one object graph: repeated deserialize rounds retain stale generations and cannot resolve arbitrary cycles. Batch tests must verify target identity across long chains and cycles.
- Curated downloads use a disposable browser worker; user-file-only downloads use `/api/codegen`. Both call `src/services/codegen-download-handler.ts` for validation, namespace closure, generation, and packaging. Hydration closes the documents that may be resolved; `ExportSelection` then chooses dependency-closed declaration roots for emission; `generateSelected` returns that exact receipt with the outputs, including a kind-aware `requiredBy` provenance map. Artifact envelopes record the receipt, immutable curated manifest cohorts when available, and generated files, so Studio previews and downloads use the same captured ZIP. Preserve fatal diagnostics and terminate the browser worker on completion, error, or timeout.
- Curated mirror CORS uses the shared worker origin matcher and the explicit `ALLOWED_ORIGIN` list in its Wrangler config, including this project’s Pages previews and local Studio ports.
- Curated manifests record bundle dependencies as well as namespace dependencies. Parsing and downloads use `loadCuratedWorkspace` to close the namespace graph across those bundles before hydration. Parsing keeps unrelated namespaces as deferred explorer entries; downloads hydrate all selected documents together before generation. `packages/curated-schema` owns production-source selection and the publisher's namespace graph; CI parses CDM, FpML, and Rune runtime sources in one workspace so serialized cross-bundle references retain their targets. Before serialization, `assertValidDocuments` requires completed linking and rejects syntax or reference errors even when semantic validation is disabled. Worker artifact builds use isolated services with the shared standard library so a previous build cannot supply missing declarations. The uploader hashes the prepared manifest set into a cohort, pins dependency manifests to that cohort, and uploads all versioned blobs and immutable cohort manifests before advancing latest pointers. Consumers resolve floating bundle selections through one cohort, so a partial pointer update cannot mix generations. Legacy date versions still select the current manifest; `cohort-<sha256>` versions select immutable manifests and must match the returned cohort. The mirror cron preserves cohort and dependency metadata alongside the serialized namespace graph. Cohort manifests and content-hashed artifacts remain outside daily archive pruning; any future garbage collector must retain the full dependency closure of live cohorts.
- Derive UI previews and validation from authoritative codegen output. A sample awaiting a worker validation result must remain visibly pending; editing alone never establishes validity.
- Explorer navigation always uses the graph node ID. Optional controlled inclusion uses the caller-provided canonical selection ID instead; filtering, virtualized rows, and collapsed namespace descendants must not discard explicit selections.
- `walkNamespace` gathers declarations and computes the type-reference graph, cycles, and emission order once per namespace. Emitters consume the readonly `NamespaceWalkResult` and own their diagnostics/source maps.
- `getTargetRelativePath` centralizes output paths. Keep TypeScript-only function extraction in `ts-emitter.ts` unless intentionally changing other targets.
- Studio function forms use resolved inherited/dispatch signatures. Codegen `normalizePreviewInputs` adapts plain form values using the shared type resolver and metadata runtime helpers, traversing actual input values independently of form expansion depth.
- Studio function preview transpiles complete generated modules with Sucrase and resolves imports among generated outputs plus the explicit `@js-temporal/polyfill` runtime dependency. Keep private evaluator binding names outside the Rune identifier alphabet (use `$`). Keep the worker execution restrictions and test real parsed/emitted functions when changing this path.
- Core `getFunctionSignature` resolves dispatch bases from namespace declarations and linked selectors. Language-service scopes and codegen share it, including overloads split across files.
- Function expression helpers live in `packages/codegen/src/expr/`; preserve cardinality and metadata across call and assignment boundaries. Validate changed semantics with parsed Rune, strict compilation of generated modules, and runtime assertions. Function calls, exported entry points, nested set/add targets, and function outputs share runtime cardinality checks; appends check the combined collection before mutating it. Nested Temporal fields use strings at function boundaries through the shared `RuneFuncData` structural mapping. See the codegen README.
- Core scopes and codegen share `resolveOperationType` and `getOperationArgument` for operator result types and headless pipeline inputs. Keep symbol lookup in its owning context; add operator propagation rules to the shared core utility. Conversion operators expose intrinsic result names: scopes resolve the corresponding workspace record declarations, while codegen retains the semantic type for comparisons without inventing AST declarations. Calendar field reads, including implicit pipeline fields, use the shared `renderCalendarField` emitter because their runtime values are ISO strings.
- Switch guards retain Rune's target restrictions: basic, record, enumeration and alias types can select declared Choice arms, but are not standalone type guards. The broad AST target union accommodates those Choice arm declarations; scope resolution enforces the distinction. `getChoiceTypeScope` shares qualified-name and import-alias handling between `as` and Choice switches.
- Core `getEnumValues` supplies inherited enum members to scopes and emitters. Constructor fields precede metadata keywords; Choice switch guards prefer declared option types over same-named imports.
- Core also owns alias resolution, declared choice-option paths, and choice field names. `as` selects an exact declared choice arm (including nested arms and distinct aliases) or narrows data to a subtype; collection narrowing filters unmatched values. TypeScript retains selected metadata wrappers. When several Choice paths reach the same target, retain each path’s declared wrapper kind and normalize present terminal selections before combining them; never infer wrappers from a payload’s `value` property. Data narrowing uses structural guards because plain JSON inputs have no nominal runtime type tag.
- TypeScript declaration names and callable bindings use `packages/codegen/src/emit/callable-names.ts` across imports, type signatures, expressions, and bundled exports. Resolve calls from declaration identity; preserve original Rune names in function metadata used by Studio and carry the actual export in `GeneratedFunc.exportName` when a function collides with a type.
- Reuse `@rune-langium/worker-core/log` (`createWorkerLogger`, `REDACT_PATHS_BASELINE`) in Cloudflare Workers. Send raw structured objects to `console.log` for field indexing. The shared logger implements redaction explicitly because `pino/browser` does not apply its `redact` option. Pages Functions and the Node container are distinct runtime surfaces.

## Deployment and Verification

`pnpm run build:cloudflare` combines the landing page, docs, and Studio under
`apps/docs/.vitepress/dist/`. Source Pages Functions live in
`apps/studio/functions/`; root `functions/` and `wrangler.toml` are generated
build artifacts. Consult [the testing guide](../TESTING.md) for endpoint,
production smoke, and full UX verification commands. Keep evidence from those
checks separate from local unit-test results.
