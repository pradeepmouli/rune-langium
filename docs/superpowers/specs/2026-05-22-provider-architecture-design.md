# Provider architecture refactor — design

Status: **APPROVED design (brainstorm output)** · 2026-05-22 · follow-up to PR #238 (side-bar perspectives)

## 1. Problem

`EditorPage` is overloaded. It is simultaneously:

1. the **outer app shell** (header, footer, `ActivityBar`, `PerspectiveHost`);
2. the **Explore content** (the `DockShell` workbench it passes as the `explore` prop); and
3. the **owner of the codegen/preview Worker** (the single `Worker` plus its `preview:*` and `codegen:*` message channels and five effects).

On top of that, `App.tsx` owns the whole current-model state machine — 13 `useState` + 9 refs (files, models, parsedModels, deferredExports, transport/LSP, parse-debounce, workspace-manager persistence, curated sync) — and renders `EditorPage` **twice** (no-workspace start shell and restored shell), threading **~16 workspace-state props** down through `PerspectiveHost`.

This coupling has already produced real defects:

- The **P2 double-worker bug**: worker ownership lived inside a display component, so the worker-subscribing `CodePreviewPanel` ran in both the Explore dock and `ExportPerspective`, doubling listeners and `codegen:generate` posts under keep-alive. Fixed by making `EditorPage` the single owner — but that fix put even more lifecycle weight on `EditorPage`.
- The **two-shells bug** on #238: because `EditorPage` is both shell and content, the no-workspace and restored branches each rendered their own `PerspectiveHost`, which overlapped the legacy restore surface.
- Workspace state is **threaded as props** instead of read where needed, so every consumer (perspective screens, the worker effects, `DockShell`) depends on `EditorPage`'s prop surface.

## 2. Goal / Non-goals

**Goal:** Introduce a single composition root (`StudioProviders`) and decouple **worker ownership** and **current-model state** from `EditorPage`'s component lifecycle, exposing them through context providers. Shrink `EditorPage` to `ExplorePerspective` (just the Explore content). Establish a two-tier provider structure (app-global vs current-model) with documented insertion slots for future app-global providers.

**Non-goals**

- **Moving zustand stores into the root.** `useModelStore`, `useCodegenStore`, `usePreviewStore`, `usePerspectiveStore` stay **module singletons**. They are not mounted in `StudioProviders`.
- **Hoisting dockview / visual-editor-local contexts** (`UtilityTrayContext`, `NavigationContext`, center-pane contexts). They stay local to the Explore workbench.
- **Moving App's workspace *selection / boot / persistence*** out of `App.tsx`. This is **Approach B** (see §5): App keeps the launcher; the provider owns the loaded model.
- **Implementing `GithubProvider`, `SettingsProvider`, `CuratedModelProvider`.** They are **reserved slots** with an insertion contract (§10), not built here.
- A router / URL-addressable views (rejected in #238; unchanged).

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Composition root | A single `StudioProviders` component, mounted once in `App`, hosting all app-level React providers. |
| WorkspaceProvider scope | **Approach B** — App keeps workspace *selection + boot + persistence*; `WorkspaceProvider` owns the *loaded model* (data + parse pipeline) and publishes it. |
| Workspace state mechanism | **React context** (not a new zustand store). The provider's *value* swaps per model; the provider never remounts. |
| State vs actions | **Two contexts** — existing `WorkspaceActionsContext` untouched (1 consumer); new `WorkspaceStateContext` for the data. Re-render isolation preserved. |
| Codegen/preview worker | A dedicated `CodegenProvider`, **child of `WorkspaceProvider`**, owns the one Worker + both channels. Stable for the app lifetime; **not** torn down on workspace switch — re-posts `setFiles`/`generate` on model change. |
| LSP transport | A dedicated `LspProvider`, **child of `WorkspaceProvider`**, **peer of `CodegenProvider`**. Owns the language transport (worker \| ws \| CF), `transportState`, reconnect. Stable; a workspace switch is a document-set re-sync, not a transport rebuild. |
| Nesting rule | **Nest only on context-consumption; otherwise be siblings.** `Lsp`/`Codegen` nest under `Workspace` (they consume `useWorkspace()`); they are peers of each other. |
| `GithubProvider` | **Sibling** of `WorkspaceProvider` (token sourced from the existing `github-auth` service singleton; no context dependency forces nesting). **Reserved slot — not built here.** |
| `SettingsProvider` | Reserved sibling slot; lands with the `.runestudio/config.json` feature. Not built here (today: one `localStorage` font-scale toggle, no shared state). |
| `CuratedModelProvider` | **Not warranted** — the catalog is a static registry (`CURATED_MODEL_IDS`) + `curated-loader` service; the synced set already lives in `useModelStore` + App. Documented, not built. |
| `EditorPage` | Split: the **outer shell** moves up next to `StudioProviders`; the **Explore content** becomes `ExplorePerspective`. The name `EditorPage` disappears. |

## 4. Composition root & component tree

```
<StudioProviders>                       one root, mounted once in App
  ── app-global tier (siblings; outlive workspaces) ─────────────
  [ GithubProvider ]                    RESERVED slot — sibling; auth state from github-auth service
  [ SettingsProvider ]                  RESERVED slot — sibling; lands with .runestudio config
  [ CuratedModelProvider ]              NOT warranted — registry + service + useModelStore already own it
  ── current-model tier ────────────────────────────────────────
  <WorkspaceProvider>                   React context; owns loaded-model DATA + actions
       provides: WorkspaceStateContext  (files, models, parsedModels, deferredExports,
                                          workspaceId, workspaceKind, workspaceName, fileCount)
                 WorkspaceActionsContext (existing — files + the 6 handlers)
       value SWAPS on workspace switch; the component never remounts
    ├─ <LspProvider>                    peer; owns lspClient, transportState, reconnect (worker|ws|CF)
    │                                   useWorkspace() → re-sync doc set on model change
    └─ <CodegenProvider>                peer; owns the one compute Worker + preview:* & codegen:* channels
       │                                useWorkspace() → re-post setFiles/generate on model change
       └─ {app shell}                   header + ActivityBar + PerspectiveHost + footer (mounted once)
              PerspectiveHost keeps ExplorePerspective alive (display:none),
              mounts WorkspacesPerspective / GitSyncPerspective / ExportPerspective / SettingsPerspective on demand
```

`LspProvider` and `CodegenProvider` are JSX-nested under `WorkspaceProvider` (a provider stack) because each calls `useWorkspace()`; their order in the stack is immaterial (neither consumes the other). The app shell is innermost so every shell descendant can read `useWorkspace()`.

## 5. The selection/boot ↔ loaded-model seam (Approach B)

App stays the **launcher**; `WorkspaceProvider` owns the **loaded model**.

| Stays in `App.tsx` (selection + boot + persistence) | Moves into `WorkspaceProvider` (the current model) |
|---|---|
| `bootState`; `restoredWorkspace` (active-workspace identity) | `files`, `models`, `parsedModels`, `deferredExports` |
| `workspaceManagerRef` (OPFS/IDB persistence) | `lspClientRef` / `providerRef`, `transportState`, `onReconnect` → owned by `LspProvider` (a child) |
| curated-sync orchestration (`curatedSyncedWorkspaceId`) | the parse-debounce reparse effect (`reparseTimerRef`) + `filesRef` / `loadedModelsRef` |
| the 6 action handlers (load/switch/create/delete/git) → moved into `WorkspaceActionsContext` value, behavior unchanged | derived: `workspaceId`, `workspaceKind`, `workspaceName`, `fileCount` |

**Data flow:** App restores/selects a workspace (its existing manager flow) → passes the active workspace record + its initial files into `WorkspaceProvider` as input props → the provider owns the loaded-model state from there (parse pipeline → `parsedModels`/`deferredExports`; hands files to `LspProvider`/`CodegenProvider` children via `useWorkspace()`). App's persistence-mutating handlers move into the actions context value unchanged.

> **Note:** `lspClient`/`transportState`/`onReconnect` are *owned by* `LspProvider`, not `WorkspaceProvider` — but `LspProvider` is a child of `WorkspaceProvider`, so they remain inside the current-model tier. `WorkspaceStateContext` therefore does **not** carry `lspClient`; consumers that need it (e.g. `DockShell`'s editor binding) read `useLsp()`.

## 6. WorkspaceProvider (two contexts)

- **`WorkspaceActionsContext`** — *unchanged shape*: `{ files, onFilesLoaded, createGitBackedWorkspace, onGitHubWorkspaceCreated, onOpenWorkspace, onCreateWorkspace, onDeleteWorkspace }`. Single consumer (`WorkspacesPerspective`). Stable callback identities. The git-backed handlers read the GitHub token from the `github-auth` service singleton (no `GithubProvider` dependency).
- **`WorkspaceStateContext`** (new) — `{ workspaceId?, workspaceKind?, workspaceName?, fileCount, files, models, parsedModels, deferredExports }`. Read by `ExplorePerspective`→`DockShell`, `GitSyncPerspective` (workspaceId/kind), `ExportPerspective` (files), `CodePreviewPanel` (files), and the two child providers.
- Hooks: `useWorkspace()` (state), `useWorkspaceActions()` (actions). The split keeps action-only consumers from re-rendering on state churn.
- The provider component is mounted once; on a workspace switch it recomputes its context value(s) from the new active workspace. It does **not** remount (which would tear down the children and Explore's `DockShell`).

## 7. LspProvider

Owns the language transport — *multi-modal*: embedded browser LSP worker first, else direct WebSocket (selected by an explicit `wsUri`), else CF Worker. Owns `lspClient`, `transportState` (the connection FSM), and `reconnect`.

- Created **once** on mount; subscribes to `useWorkspace()` files.
- **Workspace switch = document-set re-sync**, not a transport rebuild: diff the open document set and emit `didClose`/`didOpen`/`didChange` over the live connection. A fresh LSP `initialize` happens only on transport failure/reconnect, never on a workspace switch.
- Exposes `useLsp()` → `{ lspClient, transportState, reconnect }`. `DockShell` reads it for editor LSP binding.

## 8. CodegenProvider

Owns the single compute `Worker` plus **both** channels (`preview:*` → `usePreviewStore`; `codegen:*` → `useCodegenStore`). Lifts **all five worker effects out of the former `EditorPage`**:

1. `preview:setFiles` + `codegen:setFiles` (on `files` change, filtered for read-only / bundle markers);
2. `preview:generate` (on `previewSelectedTargetId` change);
3. the `preview:*` listener → `receivePreviewResult` / `receivePreviewStale` / `receiveExecutionResult` / `receiveExecutionError` + `setWorkerRef`;
4. the `codegen:*` listener → `receiveCodePreviewResult` / `markCodePreviewStale` / `markCodePreviewUnavailable`;
5. the `codegen:generate` trigger (on `codegenActiveTarget` / `codegenPreviewTarget` change).

- Worker instance lives in a ref, **created once** (empty-dep effect), **terminated on unmount**. Never recreated on a workspace switch — only fed new input (`setFiles` re-post).
- Reads `files` from `useWorkspace()`; reads selected targets from `usePreviewStore` / `useCodegenStore` (already singletons). Same dependency arrays as today, relocated.
- Exposes nothing new to render-consumers (results flow through the stores). An optional thin `useStudioWorker()` may expose imperative posts (e.g. form `dispatchExecute`) **only if** a current caller needs direct access; default is store-driven with no exposed hook.

## 9. EditorPage → ExplorePerspective + shell extraction

`EditorPage` splits in two:

- **App shell** (header / footer / `ActivityBar` / `PerspectiveHost`) → moves up to sit just inside the provider stack, mounted once. The no-workspace vs restored branching stays in `App`, but both branches sit inside `StudioProviders` and read context — eliminating the duplicate-`PerspectiveHost` duality.
- **`ExplorePerspective`** (the `DockShell` workbench + its `useWorkspace()` / `useLsp()` reads) → a true peer of `WorkspacesPerspective` / `GitSyncPerspective` / `ExportPerspective` / `SettingsPerspective`, kept alive by `PerspectiveHost` via `display:none` exactly as the perspectives feature requires.

`EditorPageProps` (~16 fields) is deleted: workspace-state props are read from `useWorkspace()`, `lspClient` from `useLsp()`, and the worker is gone (owned by `CodegenProvider`).

## 10. Reserved app-global slots (insertion contract)

Future app-global providers slot into `StudioProviders` as **siblings** of `WorkspaceProvider`, following the nesting rule (§3). The contract:

- **A provider is a sibling** (not nested above `WorkspaceProvider`) **iff** the current-model tier consumes it via a **service singleton or store**, not via React context. If a future provider must be consumed by `WorkspaceProvider`/children *through context*, it must wrap them (becoming an ancestor) — flag that explicitly when adding it.
- **`GithubProvider`** — sibling. Wraps the `github-auth` service to expose reactive auth state (`{ status, user, token? }`) to `FileLoader` and `GitSyncPerspective`. Workspace git-backed actions continue to read the token from the service, so no nesting is required.
- **`SettingsProvider`** — sibling. Lands with `.runestudio/config.json`. Today settings is one `localStorage`-backed font-scale toggle in `FontScaleButton` with no shared state, so there is nothing to centralize yet.
- **`CuratedModelProvider`** — documented as *not warranted*: the available-bundle catalog is `CURATED_MODEL_IDS` (a static registry) + the `curated-loader` service; the per-workspace synced set is already owned by `useModelStore` (`setCuratedFiles`) + App's `curatedSyncedWorkspaceId`. A provider would wrap a constant + a service + an existing singleton.

## 11. Lifecycle & workspace-switch semantics

The invariant across the whole tree: **only `WorkspaceProvider`'s context *value* changes per model — no provider component remounts.**

| On workspace switch | Behavior |
|---|---|
| `WorkspaceProvider` | recomputes context value(s) from the new active workspace (atomic swap of files/models/parsedModels/deferredExports). No remount. |
| `LspProvider` | reacts: document-set diff → `didClose` old / `didOpen` new over the live transport. No `initialize`, no reconnect. |
| `CodegenProvider` | reacts: re-post `setFiles`; the existing target-change effect re-posts `generate`. Worker instance unchanged. |
| Explore `DockShell` | not remounted (it's inside the stable shell + `PerspectiveHost` keep-alive). Layout/open files preserved as today. |
| zustand singletons | `usePreviewStore` / `useCodegenStore` reset paths (already triggered by `useModelStore.unload()` / the worker reset effects) continue to fire on workspace teardown. |

## 12. Edge cases

| Situation | Behavior |
|---|---|
| No workspace loaded | App renders the no-workspace branch inside `StudioProviders`; `WorkspaceProvider` publishes an empty/`undefined` model; `PerspectiveHost` defaults to `workspaces` (unchanged from #238). |
| LSP transport failure | `LspProvider` owns reconnect; `transportState` reflects it; a reconnect runs `initialize` — distinct from a workspace switch (which never does). |
| Workspace switch with in-flight codegen | `CodegenProvider`'s `setFiles` re-post + `currentRequestId` discipline in `useCodegenStore` supersede the stale request (existing requestId mechanism). |
| Action-only consumer (`WorkspacesPerspective`) during heavy editing | does not re-render on `files`/`models` churn — it reads only `WorkspaceActionsContext` (stable). |
| Git-backed action without a `GithubProvider` (reserved) | handlers read the token from the `github-auth` service singleton; unaffected by the slot being empty. |

## 13. Testing

- **`WorkspaceProvider`**: publishes state from input props; a workspace switch swaps the published model atomically (assert no stale `parsedModels`/`deferredExports` bleed across a switch). The provider component identity is stable across a switch (no remount).
- **Two-context isolation**: an actions-only consumer does **not** re-render when `files`/`models` change (render-count spy).
- **`LspProvider`**: single transport instance across a workspace switch (not re-created); a switch emits document-set `didClose`/`didOpen` (spy the transport), **not** `initialize`; a simulated transport failure does run reconnect/`initialize`.
- **`CodegenProvider`**: single worker instance across a workspace switch; `setFiles` re-posted on `files` change; both channels' listeners dispatch to the correct store; worker terminated on app unmount. **Regression guard for the P2 bug**: exactly one `codegen:generate` per target change (no double listeners).
- **`ExplorePerspective`**: renders from context with no workspace-state props; Explore keep-alive across a perspective switch still holds (mount-count spy, as in #238).
- **Composition / migration**: existing App boot / restore / switch / delete flows still pass; the no-workspace and restored branches each mount exactly one `PerspectiveHost`.

## 14. Build sequence (for the plan)

0. **Read-only survey** — confirm exact line ranges in `App.tsx` (state machine), `EditorPage.tsx` (props, the 5 worker effects, the shell vs `DockShell` boundary), and the worker creation site. Confirm `github-auth` service token accessor signature for the actions handlers.
1. **`WorkspaceStateContext` + `WorkspaceProvider`** (state half): define the context + `useWorkspace()`; provider takes the active-workspace input props and publishes derived state; keep `WorkspaceActionsContext` as-is, supplied by the same provider. Tests: publish + atomic swap + re-render isolation.
2. **`LspProvider`**: lift `lspClient` / `providerRef` / `transportState` / `onReconnect` out of App; subscribe to `useWorkspace()` files; implement workspace-switch = doc-set re-sync. Expose `useLsp()`. Tests: single instance, doc-set diff vs reconnect.
3. **`CodegenProvider`**: lift the five worker effects + the `codegenWorker` ref out of `EditorPage`; create-once/terminate-on-unmount; subscribe to `useWorkspace()` + the stores. Tests: single worker, re-post on change, both channels, P2 regression guard.
4. **`StudioProviders` composition root**: assemble the tree (§4) with the reserved app-global slots as comments + the insertion contract; mount once in `App`.
5. **Shell extraction + `EditorPage` → `ExplorePerspective`**: move the app shell up; convert the `DockShell` content into `ExplorePerspective`; delete `EditorPageProps`; switch consumers to `useWorkspace()`/`useLsp()`; remove the duplicate `PerspectiveHost`.
6. **App.tsx slimming**: remove the threaded props + the moved state/effects; keep selection/boot/persistence + the action handlers (now feeding the contexts). Verify both render branches.
7. **Tests per §13** + full `pnpm test` / `type-check` / `lint`.

## 15. Open questions / deferred

- **`useStudioWorker()` imperative hook** — build only if a concrete caller needs direct posts (e.g. form `dispatchExecute`); otherwise omit (store-driven). Decide in Task 3 against the real call sites.
- **`GithubProvider` / `SettingsProvider`** — separate follow-up specs; `SettingsProvider` should follow the `.runestudio/config.json` feature.
- **Per-workspace last-active perspective persistence** (carried over from #238 §6) — still nice-to-have; orthogonal to this refactor.
- **Implementation branch** — fork off `master` *after* #238 merges (this refactor depends on the perspectives architecture); avoid building on the unmerged branch and avoid shared-worktree races with parallel sessions.
