# GithubProvider — app-global GitHub identity — design

Status: **APPROVED design (brainstorm output)** · 2026-05-26 · reframes the reserved `GithubProvider` slot from the provider-architecture spec (`2026-05-22-provider-architecture-design.md` §10)

## 1. Problem

GitHub auth in the studio is **per-workspace and re-prompted every time**. `services/github-auth.ts` is a set of stateless functions; the device-flow lives entirely inside `GitHubConnectDialog`'s local `useState`; the resulting token is stored **per-workspace in OPFS** (`/{workspaceId}/.studio/token`) by `workspace-manager`, and the git-sync engine lazily reads that per-workspace token on each git op. Consequences:

- Creating a second git-backed workspace re-runs the whole device flow — no "connect once."
- There is no notion of *who you are* on GitHub anywhere in the UI (no identity, no connection status).
- The reserved `GithubProvider` slot (provider-arch spec §10) assumed app-global auth state to centralize — but **none exists today**, so as-is the slot is not warranted (same as `CuratedModelProvider`).

This spec **reframes** the slot into a real feature: an **app-global GitHub identity** ("connect once, reuse across workspaces"), which creates genuine shared state worth a provider.

## 2. Goal / Non-goals

**Goal:** A single app-global GitHub connection (token + identity) the user manages once, reused by all git-backed workspaces, surfaced in Settings. Backed by a `GithubProvider` exposing reactive connection state via `useGithub()`.

**Non-goals**
- Replacing per-workspace tokens (they remain, as an *override* — see §4). This is **not** a security-posture teardown.
- Multi-account management / org switching UI (one connected account; per-workspace override covers the rare second-account case).
- Storing any token in `.runestudio` or anywhere committed — tokens stay browser-local (IDB / OPFS), origin-isolated.
- Changing the device-flow protocol or the auth worker's exchange model (browser ↔ auth worker only; never browser ↔ GitHub directly).

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Warranted? | Yes — *reframed*. App-global identity is real shared state (unlike the original "thin wrapper" premise, which traced to nothing). |
| Token model | **Global connection seeds + backstops per-workspace tokens.** New git-backed workspaces still write a per-workspace OPFS token copy (as today) — seeded from the global connection at creation (skipping the device-flow prompt). `onAuth` resolves the per-workspace OPFS token first, else the global token. Existing workspaces unchanged. |
| Provider placement | App-global **sibling of `WorkspaceProvider`** in `StudioProviders` (doesn't consume `useWorkspace`). |
| Provider scope | Owns the **device-flow lifecycle** (`connect`/`disconnect`) + connection state + cached identity. `GitHubConnectDialog` becomes a thin view of provider state. |
| Global token storage | **IndexedDB** (the studio's app-global persistence layer). Never `.runestudio`. Per-workspace OPFS tokens untouched. |
| Identity display | **Yes** — `@login` + avatar, via a new **`/user` proxy on the github-auth worker** (honors the no-direct-GitHub boundary). |
| Entry point | A **GitHub account section in `SettingsPerspective`** (Connect/Disconnect + identity). Workspace creation reuses the global connection. |

## 4. Token resolution — the override model

The git-sync engine's auth resolver (`services/git-sync.ts`, the `onAuth` / password callback) changes from:

> load the per-workspace OPFS token

to:

> per-workspace OPFS token **if present**, else the **global IDB token**.

This is the only behavioral change to the git path. Existing git-backed workspaces (which carry a per-workspace token) behave identically.

The global token plays **two** roles:
1. **Seed at creation** — when a git-backed workspace is created while globally connected, `createGitBacked` still writes a per-workspace OPFS token copy (status quo storage), but sourced from the global connection instead of a fresh device-flow prompt. So the per-workspace token remains the *primary* credential for that workspace.
2. **Backstop fallback** — `onAuth` uses the global token only when a workspace has no per-workspace token (e.g. a token-less git workspace, a failed/cleared copy, or a future flow).

Because each workspace keeps its own token copy, **disconnecting or rotating the global connection does not disturb existing workspaces** — they keep working with their pinned copy until it is revoked server-side. A workspace can still be pinned to a different account by storing a different per-workspace token (the override) — preserving the current isolation as an opt-in.

## 5. New unit: `GithubProvider` + `useGithub()`

`apps/studio/src/shell/providers/github-context.ts` + `GithubProvider.tsx`.

```ts
export interface GithubIdentity { login: string; avatarUrl: string; }
export interface GithubContextValue {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  user?: GithubIdentity;
  /** Surfaced while status === 'connecting' so the dialog can show the code. */
  deviceFlow?: { userCode: string; verificationUri: string };
  error?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
export const GithubContext = createContext<GithubContextValue | null>(null);
export function useGithub(): GithubContextValue; // throws outside provider
```

- **Mounted once** in `StudioProviders` as a sibling of `WorkspaceProvider`. On mount it **hydrates** from IDB: if a global token exists, `status='connected'` + cached identity (no network needed); else `disconnected`.
- **`connect()`** orchestrates the device flow (moved out of `GitHubConnectDialog`): `initDeviceFlow(authBase)` → expose `deviceFlow` + `status='connecting'` → poll via `pollDeviceFlow` until token → persist token to IDB → fetch identity via the worker `/user` proxy → cache identity to IDB → `status='connected'`. Maps structured worker failures to `status='error'` + plain-English `error`.
- **`disconnect()`** clears the global token + cached identity from IDB → `status='disconnected'`. Idempotent. Does **not** touch per-workspace tokens.
- `authBase` is the existing `${origin}/rune-studio/api/github-auth` (extract the duplicated helper from `FileLoader`/`GitHubConnectDialog` into one place the provider uses).

## 6. Storage layer

A small app-global store for the global GitHub connection in IndexedDB (alongside the studio's existing settings/metadata IDB usage):

```ts
// e.g. apps/studio/src/workspace/github-global-store.ts (or extend the settings IDB module)
saveGlobalGithub(token: string, identity: GithubIdentity): Promise<void>;
loadGlobalGithub(): Promise<{ token: string; identity?: GithubIdentity } | null>;
clearGlobalGithub(): Promise<void>;
loadGlobalGithubToken(): Promise<string | null>;  // used by git-sync onAuth fallback (no React)
```

The token is **only** read by (a) the provider (for status/identity) and (b) the git-sync `onAuth` fallback via `loadGlobalGithubToken()`. Never serialized into a workspace record or `.runestudio`.

## 7. Worker `/user` proxy (identity)

Add a `/user` endpoint to the github-auth worker (mirror of the existing device-flow endpoints): accepts the access token (Authorization header), calls GitHub `GET /user` server-side, returns `{ login, avatarUrl }` (from `login` + `avatar_url`), and maps GitHub failures to the same structured error categories the device-flow endpoints use. A new client fn `fetchGitHubUser(authBase, token): Promise<GithubIdentity | { kind: 'error', ... }>` in `services/github-auth.ts`.

## 8. UI

- **`SettingsPerspective`** — new **GitHub** section consuming `useGithub()`:
  - disconnected → "Connect GitHub" button (runs `connect()`, shows the device code/verification URL inline or via the existing dialog).
  - connected → avatar + `@login` + "Disconnect".
  - error → the plain-English message + retry.
- **`GitHubConnectDialog`** — refactored to render `useGithub()` state (`deviceFlow`/`status`/`error`) instead of owning local device-flow state. Its existing English copy for error categories is reused by the provider.
- **`FileLoader` GitHub flow** — if `useGithub().status === 'connected'`, git-backed workspace creation **reuses the global token to seed the per-workspace copy** (`createGitBacked` writes the per-workspace token as today, sourced from the global connection — no device-flow prompt). If not connected, it triggers `connect()` (now global) and then seeds from the result. The per-workspace copy stays the primary credential; the global token is the seed source + backstop.

## 9. Architecture / data flow

```
StudioProviders
  ├─ <GithubProvider/>            sibling; hydrates from IDB on mount; owns connect/disconnect
  │     connect(): initDeviceFlow → poll → IDB(token) → worker /user → IDB(identity) → 'connected'
  └─ <WorkspaceProvider> … <Lsp> <Codegen> … {shell}
        SettingsPerspective ── useGithub() ──▶ Connect/Disconnect + identity
        FileLoader (git flow) ─ useGithub() ─▶ reuse global token or connect()
        git-sync onAuth ──────────────────────▶ perWorkspaceToken ?? loadGlobalGithubToken()
```

## 10. Edge cases

| Situation | Behavior |
|---|---|
| No global connection, workspace has its own token | Per-workspace token used (override) — unchanged from today. |
| Global connected, creating a new git-backed workspace | `createGitBacked` writes a per-workspace token copy seeded from the global connection (no device-flow prompt) — connect-once achieved; the copy is the primary credential. |
| Workspace with no per-workspace token (token-less / cleared) | `onAuth` falls back to the global token (backstop). |
| `disconnect()` / global token rotated while a per-workspace-token workspace is open | That workspace keeps working with its pinned copy (unaffected); copies are not auto-updated when the global token rotates — re-pin to refresh (deferred, §13). |
| `/user` fetch fails but token is valid | `status='connected'` with no `user` (identity hidden); git ops still work. |
| Token revoked on GitHub | git op fails with the engine's existing auth error; user re-connects from Settings. No silent retry. |
| IDB unavailable (privacy mode) | `connect()` still completes for the session (token in memory), but won't persist; degrades like the OPFS privacy-mode fallback. (Document; minimal handling.) |
| Reload with global token in IDB | Provider hydrates `connected` + identity from IDB; no device-flow, no network on boot (identity from cache). |

## 11. Testing

- **`GithubProvider` unit** (mock `initDeviceFlow`/`pollDeviceFlow`/`fetchGitHubUser` + the IDB store): hydrate-from-IDB on mount → `connected`; `connect()` happy path → persists token+identity, `status='connected'`; device-flow error → `status='error'` + message; `/user` failure → `connected` without `user`; `disconnect()` clears IDB + `disconnected`, idempotent; `useGithub()` throws outside provider.
- **Token resolution** (`git-sync` onAuth): per-workspace token present → used; absent + global present → global used; both absent → empty (existing behavior).
- **Worker `/user`**: returns `{login,avatarUrl}` on 200; maps GitHub 401/403/5xx to structured categories.
- **`SettingsPerspective`**: renders disconnected/connecting/connected/error states from a mocked `useGithub()`.
- **Regression**: existing per-workspace git-backed workspaces still authenticate via their own token (no behavior change); `GitHubConnectDialog` still drives a successful connect (now through the provider).

## 12. Build sequence (for the plan)

0. Read `services/github-auth.ts`, `git-sync.ts` (onAuth), `GitHubConnectDialog.tsx`, `FileLoader.tsx` GitHub flow, `workspace-manager` token write, and the studio IDB/settings module — confirm exact signatures + the onAuth seam.
1. `github-global-store` IDB module (+ unit tests).
2. Worker `/user` endpoint + `fetchGitHubUser` client fn (+ tests).
3. `github-context.ts` + `GithubProvider` (hydrate / connect / disconnect) (+ unit tests).
4. Mount `GithubProvider` as a sibling in `StudioProviders`.
5. `git-sync` onAuth fallback: per-workspace token ?? global token (+ resolution test).
6. `GitHubConnectDialog` → render provider state; extract the `authBase` helper.
7. `SettingsPerspective` GitHub section (+ render tests).
8. `FileLoader` git flow + `workspace-manager.createGitBacked`: when globally connected, seed the per-workspace token copy from the global token (skip the device-flow prompt) instead of running a fresh device flow; keep writing the per-workspace copy.
9. Full studio suite + type-check + lint green.

## 13. Open questions / deferred

- **Per-workspace pin UI** (explicitly storing a different token for one workspace) — deferred; the override path exists at the storage layer, no UI yet.
- **Refreshing per-workspace token copies on global rotation** — since each workspace pins a copy seeded at creation, rotating/reconnecting the global token does not propagate to existing workspaces. A "re-sync credentials" action (or seeding copies lazily from the global token when a workspace's copy is rejected) is deferred — the backstop fallback covers token-less workspaces, and revoked copies surface the engine's existing auth error.
- **Token encryption at rest** — not done (consistent with the current unencrypted per-workspace OPFS tokens; same origin-isolated threat model). Revisit only if the threat model changes.
- **Scopes / fine-grained tokens** — out of scope; uses whatever scope the device flow grants today.
