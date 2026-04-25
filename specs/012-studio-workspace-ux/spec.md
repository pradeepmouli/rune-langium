# Feature Specification: Studio Workspace + IDE-Style UX Polish

**Feature Branch**: `012-studio-workspace-ux`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "add workspace support for studio. align ux design between landing/docs/studio - general ux polish (implement ide-link dockable panes/panels/tabs throughout) optimize screen real estate - fix Glitches with downloading CDM corpus on CF"

## Clarifications

### Session 2026-04-24

- Q: How should curated models (CDM, FpML, rune-dsl) be loaded on the deployed app? → A: C — mirror archives to a CF R2 bucket, refreshed nightly via Cron Trigger; Studio fetches one archive per model, unpacks client-side. The mirror is for the *curated* set only — Studio MUST still support loading any user-supplied git URL (existing custom-source flow), and a GitHub repository is also a valid persistent storage backend for a user's workspace, not just a read-only model source.
- Q: What is the primary in-browser storage layer for workspaces? → A: B — OPFS (Origin Private File System) for file content and git object stores, with IndexedDB used only for small metadata indexes (workspace list, recent-workspaces, panel layouts). The decision strengthens given the GitHub-backing flow (FR-008), since `isomorphic-git` has a first-class OPFS adapter and OPFS handles random-access filesystem semantics far better than IndexedDB key/value at corpus scale. A migration path from the existing `LightningFS` cache MUST be provided so existing users do not lose work on upgrade.
- Q: How should returning users get fresh curated-model content when the R2 archive advances? → A: C — stale-while-revalidate. Studio uses the local cached copy immediately on load; checks the R2 archive's freshness in the background; if newer, surfaces a non-blocking "Update available" affordance the user can accept on their schedule. Edits are never auto-clobbered.
- Q: What is the accessibility target for this feature? → A: B — WCAG 2.1 AA as a hard acceptance gate for all *new* UI introduced by this feature (workspace shell, dockable panels, tabs, design-system primitives, panel-resize / tab-reorder / collapse interactions). Automated `axe-core` checks in CI plus a documented manual keyboard pass per panel. The Monaco editor surface and any third-party widgets inherit their upstream a11y posture and are explicitly out of scope for our AA promise; their gaps are documented as known caveats rather than blocking this feature.
- Q: How is SC-009 (≥95% curated-model load success on prod) measured? → A: C — lightweight, anonymised, opt-out client telemetry sent to a CF Worker we control. Reports event counters and FR-002 error categories plus anonymous browser/version. NO workspace content, NO file paths, NO IP / user identifiers. Disabled in dev. Controllable from a Studio settings toggle. Replaces dependence on a third-party telemetry vendor or hand-collected smoke tests.
- Q: User-added scope — upgrade `@zod-to-form/*` to latest and migrate from CLI-driven codegen (committed `forms/generated/*`) to its Vite-plugin codegen. → Captured as User Story 5 + FR-Z01–Z05. Bundled into this feature because (a) the dockable inspector pane (US3) hosts these forms and (b) the design-system/design-token alignment (US4) will restyle them; doing the upgrade and the visual rework together avoids reskinning code we're about to regenerate. Opportunistic, not architecturally coupled.
- Q: LightningFS migration — one-release transitional read-only period, or cut clean? → Cut clean. The one-shot migration (FR-017) runs on first launch of the new Studio, copies legacy content into a default workspace, and deletes the legacy IndexedDB databases in the same pass. No LightningFS code path survives into the release. If the migration can't be guaranteed safe for a given user, Studio surfaces an "Export legacy data" path before it discards anything — but nothing is kept alongside OPFS once the new version ships.
- Plan-phase research note for US5: the latest `@zod-to-form/*` versions and the Vite-plugin API surface MUST be sourced directly from the local source-of-truth checkout at `/Users/pmouli/GitHub.nosync/active/ts/zod-to-form` (read its `packages/*/package.json`, `CHANGELOG.md`, and Vite-plugin module exports) rather than from npm metadata or training data. The repo contains the canonical version, breaking-change notes, and example wiring for the plugin migration; the plan phase MUST reference it before committing to the migration approach.
- Plan-phase caveat for US5: assume our current usage of `@zod-to-form/*` in `packages/visual-editor` may be incomplete, idiomatically-wrong, or out of date relative to what the library actually expects. The plan phase MUST audit current consumption against the canonical examples in the local checkout (and the README / docs / example apps under `apps/`) and call out divergence explicitly. Do NOT treat the existing wiring as the reference shape; the upstream repo is the reference shape. If a feature in our code was a workaround for an old version's gap, that workaround MUST be identified and removed during the migration rather than carried forward.

## Overview

This feature has four strands, ordered by user impact:

1. **Bug fix** — restore reliable downloading of the CDM corpus (and other curated git-backed models) when Studio is served from the deployed Cloudflare site, where users are currently blocked from loading the demo content.
2. **Workspace** — turn Studio's single-file editor into a real workspace where multiple `.rosetta` files (and the loaded curated models) live side-by-side with persistent state across sessions.
3. **IDE-style dockable layout** — replace the current fixed two-panel layout with resizable, dockable panes/tabs (file tree, editor tabs, inspector, problems/output) so users can shape Studio for their own workflow and recover screen real estate on small laptops.
4. **Cross-app UX alignment** — make the landing site, docs, and Studio feel like one product by sharing typography, colour, spacing, and chrome, with Studio specifically reclaiming chrome space lost to redundant headers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Demo content actually loads on the deployed site (Priority: P1)

A first-time visitor lands on `www.daikonic.dev/rune-studio/`, opens Studio, picks "CDM (Common Domain Model)" from the curated model picker, and watches it clone and parse. Today this either hangs, fails partway with a generic error, or appears to succeed but leaves the workspace empty.

**Why this priority**: this is the demo path the landing-page CTA points at. If it doesn't work, every other feature in this spec is decoration on a broken foundation. It's also the smallest, most contained deliverable.

**Independent Test**: From a clean browser profile, open the deployed Studio, choose "CDM" from the registry, wait, and confirm the workspace populates with the expected `.rosetta` files and the editor opens at least one of them with no errors. Repeat the same with "FpML" and "Rune DSL".

**Acceptance Scenarios**:

1. **Given** a clean browser, **When** the user picks a curated model from the registry, **Then** files appear in the workspace within a bounded time and the editor opens the entry-point file ready to edit.
2. **Given** the curated model has been loaded once before, **When** the user picks the same model again in a later session, **Then** it loads from local cache and the workspace is interactive almost immediately.
3. **Given** the network or upstream repository is unavailable, **When** the user attempts a load, **Then** Studio surfaces a clear, actionable error with a retry affordance — never an indefinite spinner or a silent empty workspace.
4. **Given** a load is in progress, **When** the user cancels or navigates away, **Then** the in-flight clone is aborted and no half-loaded state is persisted.

---

### User Story 2 — Workspace with persistent multi-file projects (Priority: P2)

A user opens Studio, loads a curated model, edits a few files, closes the tab, comes back tomorrow, and finds their workspace exactly as they left it: same open tabs, same active file, same dirty edits, same scroll position.

**Why this priority**: Studio's job is to help people *understand* and *modify* a multi-file model. A single-file editor that forgets state between sessions makes that infeasible for any non-trivial work. This is the architectural backbone the dockable UI (US3) hosts.

**Independent Test**: Open Studio, load a curated model, edit two files, close the tab, reopen, and confirm both edits are preserved with the correct dirty markers and the previously-active tab is still focused.

**Acceptance Scenarios**:

1. **Given** an empty Studio, **When** the user creates a new workspace and adds files, **Then** the workspace is named, listed in a recent-workspaces menu, and persists across browser restarts.
2. **Given** a workspace with multiple files open as tabs, **When** the user reopens Studio, **Then** the same tab order, active tab, and modified-but-unsaved content are restored.
3. **Given** a workspace, **When** the user wants to start fresh, **Then** they can either close the workspace (keeping it in history) or delete it (removing all of its persisted state) with a clear distinction between the two.
4. **Given** multiple curated models loaded into one workspace, **When** the user opens a file, **Then** cross-file references resolve correctly across all loaded models.
5. **Given** Studio is opened on a device that already supports direct filesystem access, **When** the user creates a workspace from a local folder, **Then** edits round-trip to disk and Studio behaves as a real folder-backed editor.

---

### User Story 3 — IDE-style dockable layout (Priority: P3)

A power user resizes the file tree narrower, drags the problems pane out of the bottom into a side tab group, hides the model-registry panel they aren't using right now, and ends up with a dense editor occupying most of their 13" laptop screen. Their layout is preserved next time they open Studio.

**Why this priority**: turns Studio from a fixed-frame demo into a real working environment. Critical for credibility against tools like VS Code / IntelliJ that this audience already uses, but only meaningful once US2 has given the workspace something to host.

**Independent Test**: Resize and rearrange panels into a non-default configuration, reload the page, and confirm the layout is restored exactly. Verify on a 1280×800 viewport that the editor reclaims at least 60% of the visible area when ancillary panels are collapsed.

**Acceptance Scenarios**:

1. **Given** Studio is open, **When** the user drags a panel divider, **Then** the panel resizes smoothly and the new size persists across reloads.
2. **Given** Studio is open, **When** the user collapses a side panel, **Then** the editor expands to use the freed space and a thin reopen affordance remains visible.
3. **Given** multiple files are open, **When** the user reorders editor tabs by drag, **Then** the new order is preserved on reload.
4. **Given** Studio is opened on a small viewport (≤1280px wide), **When** the default layout loads, **Then** non-essential panels start collapsed and the editor is at least 70% of the visible width.
5. **Given** a file has unsaved changes, **When** the user looks at its tab, **Then** there is an unambiguous unsaved-state indicator distinct from the tab close button.
6. **Given** a layout has been customised, **When** the user invokes "Reset layout", **Then** the default configuration is restored without affecting workspace files.

---

### User Story 4 — One product, three surfaces (Priority: P4)

A visitor moves from the landing page, into the docs, into Studio, and back. Typography, colour, spacing, button styling, and link behaviour feel continuous. Crucially, navigating between them does not feel like crossing a brand boundary, and Studio no longer wastes a full row of pixels on chrome that duplicates the site header.

**Why this priority**: the inconsistency exists today but isn't blocking any individual task — it's a credibility tax that compounds with every new visitor. Lowest priority because it's primarily polish, but worth scoping as part of this work because the workspace UI changes (US3) will touch the same surfaces.

**Independent Test**: Take screenshots of equivalent UI elements (primary button, body text, code block, navigation link) from the landing site, the docs, and Studio. Compare side-by-side and verify they share visual properties. Measure Studio's vertical chrome budget on a 1280×800 viewport before and after.

**Acceptance Scenarios**:

1. **Given** the three surfaces side-by-side, **When** an outside reviewer compares them, **Then** they identify them as "the same product" without prompting.
2. **Given** Studio at 1280×800, **When** measuring vertical pixels consumed by non-content chrome, **Then** the total is reduced compared to the previous baseline by a meaningful margin.
3. **Given** any of the three surfaces, **When** the user clicks a primary CTA / button, **Then** the visual treatment, hover state, and focus ring are visually identical.
4. **Given** any link from the docs into Studio (or vice versa), **When** the user clicks, **Then** the destination loads without an intermediate "leaving site" flash and the user remains oriented.

---

### User Story 5 — Modernised form codegen via the Vite plugin (Priority: P5)

A developer working on Studio runs `pnpm dev:studio`, edits a Zod schema for a model node type, and sees the inspector form regenerate automatically without restarting the dev server, without running a separate CLI step, and without a generated file appearing in source control.

**Why this priority**: lowest priority and the only purely-internal user story — there is no end-user behaviour change. It earns its place in this feature only because the dockable inspector pane (US3) and the cross-app design system (US4) will touch the same form components, and it's cheaper to upgrade and restyle once than twice. If timeline pressure forces a cut, this story can be deferred to a follow-up without breaking US1–US4.

**Independent Test**: After the migration, change a Zod schema field's metadata, observe the inspector form update on dev-server hot-reload with no committed file change, and confirm `git status` shows no generated form artifacts. CI builds Studio without ever running a separate codegen step.

**Acceptance Scenarios**:

1. **Given** a fresh checkout, **When** a developer runs `pnpm dev:studio`, **Then** form components are produced by the Vite plugin during dev startup; no `forms/generated/*` files exist in source control or in the working tree.
2. **Given** a developer edits a Zod schema, **When** they save, **Then** the inspector form re-renders with the change without a manual codegen invocation and without restarting the dev server.
3. **Given** a CI run, **When** Studio is built, **Then** form generation happens as part of the build with no separate `pnpm codegen:forms` step required.
4. **Given** the upgraded `@zod-to-form` packages, **When** Studio is exercised, **Then** all form behaviours that worked before the upgrade still work, and no regression is introduced into the visual editor.

---

### Edge Cases

- A curated model load is in progress when the user closes the browser tab — does the next session resume, abort cleanly, or leave a corrupt cache?
- The user's local cache for a curated model has gone stale relative to the R2 mirror — surfaced as a non-blocking "Update available" affordance (see FR-005a). Refresh is user-initiated; never automatic for content with edits.
- The browser denies persistent storage / quota — what does the workspace do, and does the user understand they're in a degraded mode?
- A workspace contains files from a folder the user has since revoked filesystem access to — the workspace must remain openable in read-only / disconnected mode without data loss.
- A panel layout from an older Studio version is restored against a newer Studio that has renamed or removed a panel — must degrade to defaults gracefully.
- Two browser tabs with the same Studio workspace open simultaneously — the spec must commit to a behaviour (last-write-wins, single-writer warning, or full multi-tab sync).
- A user is on a viewport too small to render any sensible IDE layout (e.g. mobile portrait) — Studio must show a clear "open on a larger screen" message rather than attempt a broken layout.
- The workspace contains a file with the same name in two loaded models — disambiguation in the file tree and tab titles must not collide.

## Requirements *(mandatory)*

### Functional Requirements

**Bug fix — curated model loading on the deployed app (US1)**:

- **FR-001**: Studio MUST successfully load each of the curated models (CDM, FpML, Rune DSL) when served from the production Cloudflare deployment, in a clean browser profile, end-to-end (fetch archive → unpack → parse → workspace populated → editor interactive).
- **FR-002**: Studio MUST surface a distinct, user-readable error for each of: network failure, archive-not-found, archive-decode-failure, parse error, and storage-quota-exceeded — never a generic "something went wrong" or an indefinite spinner.
- **FR-003**: Curated model loads MUST be cancellable, and a cancel MUST leave no half-loaded files visible to the workspace.
- **FR-004**: A repeat load of a curated model that has been successfully loaded before MUST hit local cache and become interactive substantially faster than the first load (target: see SC-002).
- **FR-005**: The system MUST detect and recover from a corrupted local cache for a curated model by offering the user a one-click re-download.
- **FR-005a**: When a user opens a curated model that has a newer archive available on the R2 mirror than the local cached copy, Studio MUST: (1) open the workspace with the cached copy immediately so SC-002 still holds; (2) check archive freshness in the background; (3) surface a non-blocking "Update available" indicator that the user can dismiss or accept; (4) never auto-replace cached files that contain unsaved user edits.
- **FR-005b**: Freshness checks MUST be cheap (a HEAD or version-stamp call against the R2 archive, not a full re-download) so they are safe to perform on every workspace open.
- **FR-006**: Curated model archives MUST be served from a Cloudflare R2 bucket that is refreshed on a nightly schedule from the upstream repositories, so that Studio's load path has no hard runtime dependency on any third-party CORS proxy or the GitHub git protocol.
- **FR-007**: Studio MUST continue to support loading models from arbitrary user-supplied git repository URLs (the existing custom-source flow), independent of the curated-archive path. Failure of the curated-archive path MUST NOT degrade the custom-URL flow.
- **FR-008**: A GitHub repository MUST be supportable as a persistent storage backend for a user-created workspace — not just as a read-only source — so that a user can load a repo, edit files, and round-trip changes back via the same git identity (push, branch, PR). Detailed UX flow for this belongs in the plan.

**Workspace (US2)**:

- **FR-010**: Studio MUST support workspaces containing multiple `.rosetta` files plus zero or more loaded curated models.
- **FR-011**: A workspace MUST persist across browser restarts: file contents, dirty-but-unsaved edits, open tabs, active tab, and per-file scroll/cursor position.
- **FR-012**: Users MUST be able to create, name, switch between, and delete workspaces, and MUST be able to see a list of recent workspaces.
- **FR-013**: When a workspace is created from a local folder (where the platform supports direct filesystem access), edits MUST round-trip to that folder, and Studio MUST clearly distinguish folder-backed files from in-browser-only files.
- **FR-014**: Cross-file references in the editor (jump-to-definition, find-references) MUST resolve across every file in the active workspace, regardless of which curated model the file came from.
- **FR-015**: The system MUST prevent silent data loss: closing or reloading the tab with unsaved changes MUST trigger an explicit warning, and crashes MUST recover the most recent unsaved content.
- **FR-016**: Workspace file content and any in-browser git object stores MUST be persisted to OPFS (Origin Private File System). Small metadata indexes (the workspace list, recent-workspaces, layout state) MAY use IndexedDB.
- **FR-017**: On first launch of the new Studio, the system MUST migrate any legacy `LightningFS` / IndexedDB-backed workspace content to OPFS in a single one-shot pass and then DELETE the legacy stores. LightningFS MUST NOT survive into the release as a co-existing or read-only fallback. If a specific user's migration cannot be guaranteed safe, Studio MUST surface an explicit "Export legacy data" path and require explicit user confirmation before discarding — but once confirmed or successfully migrated, the legacy stores are removed in the same session. No Studio release ships with both storage layers live.
- **FR-018**: Studio MUST detect when persistent storage has been denied or evicted by the browser and inform the user that they are operating in a degraded (non-persistent) mode, including what would be lost on tab close.

**IDE-style dockable layout (US3)**:

- **FR-020**: The editor area MUST host multiple files as tabs that the user can switch between, reorder, and close individually.
- **FR-021**: Side and bottom panels (file tree, model registry, problems/diagnostics, preview/output) MUST be resizable along their shared dividers, with the new size persisted per-workspace and across reloads.
- **FR-022**: Each panel MUST be collapsible to a minimal-affordance state and reopenable without losing its prior size.
- **FR-023**: The user MUST be able to invoke a "Reset layout" action that restores defaults without touching workspace contents.
- **FR-024**: The default layout on viewports ≤1280px wide MUST start with non-essential panels collapsed so the editor has the majority of horizontal space.
- **FR-025**: Layouts saved by an older Studio version MUST be restored gracefully when the panel set changes — unknown panels are dropped, new panels appear in their default position.
- **FR-026**: An unsaved-changes indicator on each editor tab MUST be visually distinct from the close affordance.

**Accessibility (cross-cutting, gates US2–US4)**:

- **FR-A01**: All *new* UI introduced by this feature (workspace shell, dockable panels, file tree, tab bar, panel splitters, design-system primitives) MUST meet WCAG 2.1 AA.
- **FR-A02**: Every mouse-initiated interaction in the dockable layout (resize, drag-to-reorder, collapse, dock-undock if introduced) MUST have a keyboard-accessible equivalent with visible focus state and a documented shortcut.
- **FR-A03**: Tab bars, side rails, and dockable panel groups MUST expose appropriate landmark / tablist semantics so a screen-reader user can navigate them as structured regions, not as flat divs.
- **FR-A04**: Automated accessibility checks (`axe-core` or equivalent) MUST run in CI against representative pages and MUST gate merge on zero serious/critical violations in code we own. Violations attributable to the Monaco editor or other third-party widgets are tracked as known caveats and do not gate merge.
- **FR-A05**: Each new panel MUST be exercised by a documented manual keyboard-only pass before the feature is declared complete.

**Telemetry & observability (cross-cutting, gates SC-009 verification)**:

- **FR-T01**: Studio MUST emit a small, fixed set of anonymised events (curated-model load attempt, load success, load failure with FR-002 error category, workspace open / restore success or failure) to a Cloudflare Worker that this project controls. The event payload MUST contain only: event name, error category (where applicable), Studio build/version, anonymous user-agent class (e.g. "Chromium 130", not full UA), and a coarse timestamp.
- **FR-T02**: The telemetry payload MUST NOT contain workspace contents, file paths, file names, repository URLs, the user's IP address, persistent client identifiers, or any free-form text.
- **FR-T03**: Telemetry MUST be off in local development and on by default in production. Users MUST have a clearly-labelled settings toggle to disable it; the disabled state MUST persist across sessions on the same device.
- **FR-T04**: The receiving Worker MUST NOT log raw IPs (apply the same daily-rotating hash treatment as the existing codegen Worker) and MUST NOT log any field beyond the documented schema in FR-T01.
- **FR-T05**: The privacy-relevant claims in FR-T01–FR-T04 MUST be reflected in a user-readable privacy note linked from the settings toggle.

**Form codegen modernisation (US5)**:

- **FR-Z01**: The `@zod-to-form/{core,react,cli}` dependencies MUST be upgraded to their current latest versions. The authoritative source for "latest version" and breaking-change notes is the local checkout at `/Users/pmouli/GitHub.nosync/active/ts/zod-to-form` (its `packages/*/package.json` and `CHANGELOG.md`); the plan phase MUST resolve concrete version numbers from there, not from npm metadata or training data. Any breaking-change migration MUST be applied so that existing inspector forms continue to work.
- **FR-Z02**: Form generation MUST move from the CLI workflow that produces committed files in `packages/visual-editor/src/components/forms/generated/` to the Vite-plugin workflow that generates form modules at dev/build time. The previous committed `forms/generated/*` directory MUST be deleted from source control as part of the migration.
- **FR-Z03**: Editing a Zod schema in dev MUST trigger a hot-reload of the affected inspector form without requiring a manual codegen invocation or a dev-server restart.
- **FR-Z04**: CI MUST build Studio successfully with no standalone codegen step in the pipeline; form modules are produced as part of the standard Vite build.
- **FR-Z05**: All visual editor behaviours that depended on the CLI-generated forms MUST continue to work after migration; this is a refactor, not a feature change. Any regression versus the pre-migration baseline is a blocker.
- **FR-Z06**: The plan phase MUST include an audit of current `@zod-to-form/*` consumption in `packages/visual-editor` against the canonical patterns documented in the local upstream checkout. Any divergence — places where we are not using the library as intended, are working around an issue that has since been fixed, or are missing capabilities the library now offers — MUST be enumerated. Where the divergence is a legacy workaround, the workaround MUST be removed during the migration; where the divergence reflects a deliberate Studio-specific need, the rationale MUST be recorded so a future reader does not "fix" it back.

**Cross-app UX (US4)**:

- **FR-030**: The landing site, docs, and Studio MUST share a single design language: typography scale, colour palette, button and link treatments, focus rings, and spacing rhythm.
- **FR-031**: Navigation between the three surfaces MUST be visually continuous — no visible re-skin during transition, and a consistent way to move between them from each surface.
- **FR-032**: Studio's chrome MUST NOT duplicate the site-level header on viewports where both could appear; the chrome budget for Studio MUST measurably decrease.
- **FR-033**: Primary interactive elements (buttons, links, form controls) MUST be implementation-shared rather than visually-similar copies, so future style changes propagate to all three surfaces in a single change.

### Key Entities *(include if feature involves data)*

- **Workspace**: A named, persistent container for a user's session. Holds an ordered list of files, the set of loaded curated models, the layout configuration, the open tabs, and the active tab. A user may have many workspaces; one is active at a time.
- **WorkspaceFile**: A single file within a workspace. Has a path, content, dirty state, read-only flag, and optional binding to a folder-backed source. May originate from a curated model load, a folder mount, or a user "new file" action.
- **CuratedModel** (existing): Bundle of upstream files mirrored as a single archive in a Cloudflare R2 bucket (refreshed nightly from CDM / FpML / Rune DSL). Has a freshness state (in-cache / refresh-pending / refresh-failed). Loading is the operation that brings a curated model's files into a workspace.
- **GitWorkspaceBacking**: An optional binding that ties a workspace to a git repository (GitHub, primarily) so the workspace's files are persisted to that repo via the standard git operations (commit, push, pull, branch). Distinct from a CuratedModel: a CuratedModel is a read-only library brought *into* a workspace; a GitWorkspaceBacking is a read-write storage location *for* a workspace.
- **PanelLayout**: The user's per-workspace arrangement of dockable panels — sizes, collapsed/expanded states, tab order, and which panel hosts which content. Versioned so that future panel sets can degrade older saved layouts.
- **DesignTokens** (cross-cutting): The single source of truth for typography, colour, spacing, radii, shadows, and motion that the landing site, docs, and Studio all consume so that they remain visually coherent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor to the deployed Studio can load any curated model and reach an interactive editor in under 60 seconds on a 50 Mbps connection. Today this often fails outright.
- **SC-002**: A returning visitor (same browser, same device) reaches an interactive editor for a previously-loaded curated model in under 5 seconds — i.e. cached load is at least 10× faster than the first load.
- **SC-003**: 100% of failure modes from FR-002 produce a distinct, user-actionable error message (verified by introducing each failure mode and observing the result). No "unknown error" or indefinite spinner is acceptable.
- **SC-004**: A user can leave Studio mid-edit, close the browser, return the next day, and resume in the exact same state — same active file, same scroll position, same unsaved buffer — at least 95% of the time.
- **SC-005**: On a 1280×800 viewport with a non-trivial workspace open, the editor occupies at least 70% of the horizontal area in the default layout (vs. the current baseline, which is to be measured before changes).
- **SC-006**: The vertical pixel budget for Studio chrome at 1280×800 is reduced by at least 25% relative to the current baseline.
- **SC-007**: An outside reviewer comparing screenshots of equivalent UI primitives (button, link, body text, heading, code block) across the landing site, docs, and Studio identifies them as "the same product" without prompting.
- **SC-008**: At least 90% of users (validated by hallway test or analytics on the equivalent flow) find their previous workspace in the recent-workspaces list within 10 seconds of opening Studio in a new session.
- **SC-009**: On the production deployment, the curated-model load success rate for first attempts (clean cache) is at least 95% over a representative sample, measured via the FR-T01 telemetry stream.
- **SC-010**: Automated accessibility checks (`axe-core` or equivalent) report zero serious/critical violations against new UI surfaces in CI. The dockable layout passes a documented manual keyboard-only walkthrough — every panel reachable, every panel resizable, every tab switchable, with no keyboard trap — without using the mouse.
- **SC-011**: After the form-codegen migration, `git status` on a fresh checkout shows no committed `forms/generated/*` files; editing a Zod schema field updates the inspector form on dev-server hot-reload within 2 seconds; CI builds Studio without invoking a standalone codegen step.

## Assumptions

- **Curated models load from a CF R2 mirror, not from GitHub at runtime.** The third-party CORS proxy and the git-protocol round-trip are removed from the deployed load path. Diagnosing the remaining failure modes (IndexedDB quota, cache corruption, partial unpack) still belongs to this feature, but the headline architecture decision is "stop cloning at runtime."
- **Arbitrary-URL loading and git-backed workspaces still use a git client in the browser.** R2 is the bulk path for the curated set; the existing isomorphic-git path remains for user-supplied URLs and for the new "GitHub-as-workspace-backing" feature. We accept that the third-party CORS proxy stays in the picture for those paths in v1.
- **Workspaces are stored locally, not server-side.** This is a browser-first product with no user accounts; persistence uses local browser storage. Sync across devices is explicitly out of scope for v1. (Cloud-backed workspaces are a future feature, not this one — see Out of Scope.)
- **OPFS is treated as a hard requirement, not a progressive enhancement.** Every modern target browser supports it. We do not maintain a non-OPFS fallback for the storage layer; we maintain a clear "your browser is not supported" path instead.
- **Folder-backed workspaces are a Chromium-class browser feature.** On browsers without direct filesystem access support, workspace files live in browser storage only, and the UI clearly communicates this.
- **Multi-tab same-workspace behaviour is "first writer wins, others read-only with a warning"** unless explicitly clarified otherwise. We do not promise live multi-tab sync for v1.
- **The dockable layout uses the standard IDE conventions** (drag dividers, collapsible side rails, tabbed editor with reorder, close-on-middle-click) rather than inventing a new metaphor.
- **The CDM corpus repository is the contractual source of demo content.** If the upstream repo's structure changes, the curated-model registry entry must be updated; we do not fork or vendor the corpus.
- **The cross-app design system is implemented as a shared package or shared tokens** that all three surfaces consume, not as parallel CSS that "looks the same".
- **Mobile portrait is out of scope.** Studio is targeted at laptops and larger; on smaller viewports we show a "use a larger screen" message rather than attempting a degraded layout.
- **Production deployment baseline.** "Studio" in this spec refers to the deployed app at `www.daikonic.dev/rune-studio/`. Local dev (`pnpm dev:studio`) is expected to behave the same, but production is the success bar.

## Out of Scope

- Real-time collaboration (multiple users editing the same workspace simultaneously).
- Cross-device workspace sync (a workspace created on one device is not expected to appear on another).
- Authentication, user accounts, or any server-side persistence of user data.
- A custom Rune-specific layout metaphor (we adopt IDE conventions, we do not invent).
- Mobile portrait experience.
- Changes to the rosetta-code-generators upstream repository.
