# Feature Specification: Studio Production Readiness

**Feature Branch**: `014-studio-prod-ready`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Make 012's shipped functionality actually work in production. The 012 PR (now merged at master commit 22ca17c) shipped a Studio bundle that's materially broken: curated-model loads fail, dock chrome renders unstyled, workspace persistence does not restore, the LSP fallback is a no-op stub, the three new Workers are unrouted, and the GitHub Device-Flow auth UI is missing. Full diagnosis at specs/_deferred/012-production-gaps.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time visitor loads a curated model and sees a working editor (Priority: P1)

A first-time visitor lands on the deployed Studio at `www.daikonic.dev/rune-studio/studio/`, picks one of the three reference models (CDM, FpML, rune-DSL), and within a minute sees an interactive editor with the model's source files loaded, syntax-highlighted, and ready to navigate.

**Why this priority**: This is the single primary acceptance test for the entire 012 feature. Today it is the most visibly broken path — every reference model click ends in an `archive_decode` or `network` error after 30–90 seconds, and even when the load completes the editor surface has no chrome and no language services. Until this works end-to-end, none of the other 012 surfaces (telemetry, GitHub workspaces, persistence, dockable layout) can be experienced or measured.

**Independent Test**: Open a fresh Chrome profile against the production URL, click the CDM card, and verify the workspace becomes interactive in under 60 seconds with at least one Rosetta source file open in the editor.

**Acceptance Scenarios**:

1. **Given** the deployed Studio with no prior workspace and a working network, **When** the visitor clicks the CDM curated card, **Then** within 60 seconds the workspace shows the CDM source tree on the left, an open `.rosetta` file in the editor, and no error banner.
2. **Given** the curated load is in progress, **When** the visitor clicks Cancel or navigates away, **Then** the load stops without leaving partial archives in storage and the start page returns to a usable state.
3. **Given** the curated mirror is unreachable (network outage), **When** the visitor clicks a curated card, **Then** the visitor sees a distinct, user-actionable error message ("We couldn't reach the model archive — check your connection") within 10 seconds, not an indefinite spinner.

---

### User Story 2 - Returning visitor finds their previous workspace ready (Priority: P1)

A visitor who loaded a model yesterday returns the next day in the same browser. The Studio remembers their workspace, restores their open tabs and active file, and is interactive within 5 seconds.

**Why this priority**: Workspace persistence is what differentiates Studio from a stateless playground; spec SC-002 puts the cached-load budget at 5 s and SC-004 at ≥95% restore success. Today reload returns the visitor to the empty start page — there is no recents list, no switcher UI, no auto-restore. This is a regression from the user's expectation set by the 012 README.

**Independent Test**: Load any curated model, reload the tab, and verify the editor reopens without re-fetching the archive from the mirror.

**Acceptance Scenarios**:

1. **Given** a workspace with a curated model loaded and a file open, **When** the visitor reloads the page, **Then** within 5 seconds the editor restores the same active file at the same scroll position with no network round-trip to the curated mirror.
2. **Given** a fresh browser profile with no prior visit, **When** the visitor opens the Studio, **Then** the empty start page is shown and no error is logged about missing recents.
3. **Given** a visitor with multiple recent workspaces, **When** they open the Studio, **Then** their workspaces are listed with the most-recently-used at the top, each with a name and last-opened date.

---

### User Story 3 - Editor offers live language assistance (Priority: P1)

A visitor with a model loaded types in the editor. As they type, syntax errors appear inline within a second, hovering over a type name shows its definition, and Tab/Ctrl-Space surfaces autocomplete suggestions for valid type and attribute names.

**Why this priority**: A visual editor without language services is just a syntax-highlighted text area — the spec's `Three-Panel IDE` claim and the entire Visual Preview / diagnostics-bridge architecture depend on a live LSP transport. Today the production bundle reports "LSP server unavailable — start the external server on ws://localhost:3001," which is dev-only copy AND points at a transport that no public user can reach.

**Independent Test**: With CDM loaded, type a deliberate typo into a `.rosetta` file (e.g. `tradse Trade:` for `type Trade:`); within 2 seconds, an error squiggle appears under the typo and the Problems panel shows the error.

**Acceptance Scenarios**:

1. **Given** a workspace with a model loaded and an editor open, **When** the visitor types a syntactically invalid token, **Then** an error squiggle appears under the offending text and a matching entry is added to the Problems panel within 2 seconds.
2. **Given** a syntactically valid model, **When** the visitor hovers over a known type name, **Then** a tooltip shows the type's namespace and source location within 1 second.
3. **Given** the visitor positions the cursor where a type name is expected, **When** they trigger autocomplete (Ctrl-Space or auto-trigger), **Then** the available type names appear in a list within 1 second and selecting one inserts it.
4. **Given** the editor's language service is temporarily unavailable, **When** the visitor types, **Then** the editor remains usable as a syntax-highlighted text area, the status bar shows a clear "language services offline" message (NOT a developer instruction referencing localhost), and a retry control is offered.
5. **Given** the LSP-host architecture decision is pending (server-hosted on Cloudflare vs. accept read-only Studio), **When** the team evaluates the language-services path, **Then** a time-boxed (≤1 working day) feasibility spike MUST run BEFORE planning commits to a single architecture; the spike's pass/fail outcome is a load-bearing input that determines whether US3 ships with live diagnostics or with read-only fallback copy + a documentation rewrite.

---

### User Story 4 - Studio surface is visually consistent and chrome is intact (Priority: P2)

A visitor opens the Studio and sees an IDE-style dockable layout with visible tab strips, panel separators, drag handles, and user-readable panel titles ("Files", "Editor", "Problems", "Output", "Preview", "Inspector"). Reset Layout is discoverable, panel resizing works by drag, and panels collapse via their tab.

**Why this priority**: Dock chrome is a release-blocker for usability — without it, panels render as raw text labels stacking on the page (`workspace.fileTree`, `workspace.editor`, etc.). This is one CSS-import fix away. P2 because it's behind getting the editor functional (P1) but ahead of "open from GitHub" (P3) since every visitor sees the dock chrome and only some open GitHub workspaces.

**Independent Test**: Open the Studio at 1280×800 and 1440×900, click Reset Layout, drag a sash between two panels, click a tab in the bottom group, and verify each interaction produces the expected visual response.

**Acceptance Scenarios**:

1. **Given** the Studio is loaded at any supported viewport, **When** the visitor inspects the dock, **Then** every panel has a visible tab strip, the active tab is visually distinguishable, and sash handles are draggable between panels.
2. **Given** the dock is visible, **When** the visitor reads the panel titles, **Then** the titles are user-readable English strings ("Files", "Editor", "Problems", "Output", "Preview", "Inspector"), not internal identifiers.
3. **Given** the dock is in any layout, **When** the visitor clicks Reset Layout, **Then** the dock returns to its default arrangement and that change persists across reload.

---

### User Story 5 - Open a GitHub repository as a workspace (Priority: P3)

A visitor with a public or private GitHub repo containing `.rosetta` files clicks "Open from GitHub" on the start page, authorises Studio via GitHub's Device Flow, and within ~30 seconds has the repo cloned into a workspace they can edit, commit, and push.

**Why this priority**: The Phase-4 GitHub-backed workspaces are a documented 012 feature, but the start-page UI affordance was never built. P3 because the curated path (P1) covers the demo + onboarding flow; GitHub workspaces are for users with their own models, a smaller audience, and they can be added without disturbing the P1/P2 paths.

**Independent Test**: Click the "Open from GitHub" affordance, paste a GitHub repo URL, complete the Device-Flow code on github.com/login/device, return to Studio, and verify the repo's `.rosetta` files appear in the file tree within 30 seconds.

**Acceptance Scenarios**:

1. **Given** the empty start page, **When** the visitor clicks "Open from GitHub", **Then** a dialog asks for a repository URL and shows the Device-Flow user code with a link to github.com/login/device.
2. **Given** the visitor has authorised Studio, **When** they return to the dialog, **Then** Studio polls for the access token and, on success, clones the repo and opens it as a new workspace.
3. **Given** a private repo the user has access to, **When** the clone completes, **Then** the file tree shows the repo's `.rosetta` files and the visitor can edit, save, commit, and push without further auth prompts.
4. **Given** the visitor declined the Device-Flow authorisation, **When** Studio polls and learns of the decline, **Then** the dialog surfaces a clear "Authorisation declined — try again or close" message and the workspace is not created.

---

### User Story 7 - The three surfaces look like one product (Priority: P2)

A reviewer comparing screenshots of equivalent UI primitives (button, link, body text, heading, code block, surface, focus ring) across the landing site (`www.daikonic.dev/`), the docs (`/rune-studio/`), and the Studio (`/rune-studio/studio/`) at 1280×800 cannot identify them as different products. The Studio specifically presents a clean, intentional layout — no muddled empty state, no orange-shouting secondary buttons, no navigation links rendered touching, no internal-identifier strings leaking into chrome.

**Why this priority**: This is the still-open SC-007 from feature 012. A post-merge audit found that the Studio body font diverges (`Inter` vs landing/docs `Outfit`), the `secondary` Button variant ships solid amber making empty-state CTAs visually outrank the actual primary, three different primary-button shapes coexist (rect 8px / pill 20px / rect 6px), and ~30 hand-rolled CSS rules in Studio reference custom properties (`--space-1`…`--space-10`, `--text-md`, `--sidebar-width`) that are never defined — so paddings collapse to zero and entire panels look cramped. P2 because dock chrome and editor functionality (P1) outrank visual consistency, and the GitHub flow (P3) is for a smaller audience; but this is what every visitor sees on every page.

**Independent Test**: Open the three surfaces side-by-side at 1280×800 and verify a primary button on each renders with the same height, radius, font, and weight; verify Studio body text is `Outfit`; verify the Studio empty state has visually-balanced spacing with one solid CTA; verify a fresh `pnpm --filter @rune-langium/studio exec vitest run test/visual` passes the visual-consistency suite.

**Acceptance Scenarios**:

1. **Given** any of the three production surfaces, **When** the reviewer measures `getComputedStyle(body).fontFamily`, **Then** the value matches across all three surfaces (chosen at clarify time; default `Outfit`).
2. **Given** the Studio at 1280×800 with no workspace, **When** the reviewer inspects the empty state, **Then** the row of CTAs has exactly one solid-coloured primary button ("New") and the others ("Select Files", "Select Folder", "Open from GitHub") render with transparent backgrounds + visible borders.
3. **Given** any production surface, **When** the reviewer measures a primary button's `border-radius`, `height`, and `font-weight`, **Then** all three surfaces produce the same values (chosen at clarify time; default 8px / 40px / 600).
4. **Given** the Studio, **When** the reviewer inspects the live computed `padding` / `gap` of any chrome region (header, panel headers, status bar), **Then** no value resolves to `0px` or `normal` due to an undefined custom property; every spacing reference has a definition in the design-system's `theme.css`.
5. **Given** any of the three surfaces, **When** a focus-visible element is keyboard-focused, **Then** the focus ring has consistent width (2px), offset (2px), and colour family across all three surfaces.

---

### User Story 6 - Operator can verify production health in seconds (Priority: P2)

An operator (the developer running deploys, or anyone with shell access) can run a single command and learn within 30 seconds whether each of the three new Workers is reachable, whether the curated-mirror has archives, and whether the production catch-all is eating Worker requests.

**Why this priority**: Without operational verification, every redeploy is a coin flip and every "it's not working" report from a user requires a manual investigation. P2 because the script `scripts/verify-production.sh` already exists from the 012 review pass — what's missing is making it accurate (i.e. the things it checks for must actually be true post-deploy) and making it part of the post-deploy ritual.

**Independent Test**: After any production deploy, run `pnpm run verify:prod` and confirm all checks pass.

**Acceptance Scenarios**:

1. **Given** all three Workers are deployed and the curated cron has run, **When** the operator runs `pnpm run verify:prod`, **Then** every check reports PASS and the script exits 0.
2. **Given** a Worker is misconfigured (wrong allowed origin, missing secret), **When** the operator runs the script, **Then** the relevant check FAILs with a specific reason that points at the misconfiguration.
3. **Given** the script is run from a fresh shell with only `curl` on the PATH, **When** there are no environmental dependencies, **Then** the script runs and produces interpretable output.

---

### Edge Cases

- **Curated archive corruption**: an archive's SHA does not match its manifest. The visitor sees a distinct `archive_decode` error referencing the corrupt mirror, NOT a generic failure.
- **Tab close mid-load**: a curated load is in flight when the user closes the tab. Partial OPFS writes are cleaned up on next launch; the workspace appears uncreated rather than half-created.
- **Network drops mid-clone**: a GitHub clone is interrupted. The dialog surfaces the failure with a retry option; OPFS does not retain the partial clone.
- **Two tabs of the same workspace**: a visitor opens the same workspace in two tabs. The second tab acquires read-only mode via the existing multi-tab broadcast layer; this is unchanged from 012 but must keep working.
- **CF Worker cold-start**: a visitor is the first user of the day. The LSP DO has to load langium + parse the workspace; the first diagnostic round-trip may take 2–3 seconds. The status bar shows a "warming up" indicator instead of an error during this window.
- **GitHub App not yet configured for production**: the github-auth Worker still has the placeholder client ID. The "Open from GitHub" dialog surfaces "GitHub authorisation is not yet available — please come back later" rather than a generic 502.
- **CDN cache holds a stale manifest**: the curated mirror is updated but visitor still gets yesterday's manifest. The stale-while-revalidate path tolerates this (FR-005b); a freshness probe reveals the new version on the next session.

## Requirements *(mandatory)*

### Functional Requirements

#### Curated-mirror load path

- **FR-001**: When a visitor clicks a curated-model card, the system MUST fetch the model's manifest from the production curated mirror, verify the archive against the manifest's recorded digest, and unpack the archive into the workspace's storage. The legacy git-clone path MUST NOT be invoked when the curated-mirror path is available.
- **FR-002**: The system MUST distinguish each documented load-failure category (network, archive_not_found, archive_decode, storage_quota, permission_denied, cancelled, unknown) and surface a corresponding user-actionable message; no "unknown error" or indefinite spinner is acceptable.
- **FR-003**: The system MUST verify the curated archive's SHA-256 against the manifest BEFORE unpacking; mismatched bytes MUST never be passed to the archive parser.

#### Worker availability

- **FR-004**: The curated-mirror Worker MUST be deployed and serving manifests + archives at the production curated route. The R2 bucket MUST contain at least one nightly snapshot for each of the three reference models before a public release announcement.
- **FR-005**: The telemetry Worker MUST be deployed and accept valid `workspace_*` and `curated_load_*` events with a 204 response, while rejecting unknown fields with a 400. The telemetry counter Durable Object MUST reflect each accepted event.
- **FR-006**: The github-auth Worker MUST be deployed with a real GitHub App's client ID, accept device-flow init requests, and proxy the polling exchange.
- **FR-007**: The system MUST ensure the three Worker routes are matched in precedence — a request for `/rune-studio/api/telemetry/v1/event` MUST reach the telemetry Worker, not a catch-all from a sibling Worker that returns 405.

#### IDE shell + dock chrome

- **FR-008**: Every dock panel MUST render with visible chrome (tab strip, sash handles, group separators) at every supported viewport, and panel titles MUST display as user-readable English ("Files", "Editor", "Problems", "Output", "Preview", "Inspector"), not as internal identifiers.
- **FR-009**: The dock layout MUST persist across reload — Reset Layout MUST return to defaults, and a user's customisations MUST survive a tab close.

#### Workspace persistence + start-page flows

- **FR-010**: After any workspace is created (curated, blank, GitHub), reloading the Studio in the same browser MUST restore that workspace including the active file, scroll position, and dirty buffers, ≥95% of the time on the same browser/device.
- **FR-011**: The start page MUST list recently-used workspaces with their kind (browser-only, folder-backed, github-backed) and last-opened date, sorted most-recent-first.
- **FR-012**: The start page MUST expose a clear "Open from GitHub" affordance that initiates the Device-Flow workspace creation path.

#### Editor language services

- **FR-013**: The editor MUST provide live syntax diagnostics, hover information, and autocomplete for `.rosetta` source files in production, with diagnostics latency under 2 seconds and hover/autocomplete latency under 1 second from the user's input.
- **FR-014**: When language services are temporarily unavailable, the editor MUST remain usable for syntax-highlighting and editing; the user-facing status MUST be a non-developer message and offer a retry control. No version of the production status bar MUST reference a localhost host:port unless the user has explicitly enabled developer mode.
- **FR-015**: The system MUST run the LSP server on infrastructure that does not require the visitor to run any external process or local server.

#### Operational verification

- **FR-016**: The repository MUST provide a single-command production verification (`pnpm run verify:prod`) that probes every Worker and route described above, surfaces specific failures with actionable messages, and exits non-zero on any failure.

#### Privacy + safety invariants (carried from 012)

- **FR-017**: The telemetry surface MUST continue to enforce its closed schema, daily-rotating salted IP-hash, no-PII, opt-out posture; nothing in this feature relaxes those guarantees.
- **FR-018**: The github-auth Worker MUST remain stateless; it MUST NOT persist tokens, MUST NOT log device codes or access tokens, and MUST refuse cross-origin requests outside its allowlist.

#### Legacy paths + test coverage + dev ergonomics

- **FR-019**: The legacy isomorphic-git clone path through `cors.isomorphic-git.org` MUST be either retired entirely (preferred) or explicitly opted-into via a developer-mode toggle; it MUST NOT remain as an unconditional fallback that public visitors can reach. The decision (retire vs. dev-only) is a clarify-time decision, but doing nothing is not in scope.
- **FR-020**: The curated-load happy path MUST be covered by an automated end-to-end test that fails CI on regression. SC-001's latency budget cannot rely on manual verification once the curated path lands.
- **FR-021**: The local-development LSP host MUST be configurable via an environment variable (e.g. `VITE_LSP_WS_URL`) with a sensible default. Hard-coding `ws://localhost:3001` blocks contributors who run a remote LSP host or use a different port.

#### Cross-surface UX consistency (US7)

- **FR-022**: All three production surfaces (landing, docs, Studio) MUST consume their typography (`font-family-display`, `font-family-mono`, font sizes, weights) from the shared `@rune-langium/design-tokens` package; no surface MAY redeclare its own font-family value.
- **FR-023**: The Studio's `Button variant="secondary"` MUST render as a transparent button with a visible border, matching the landing's `.btn-secondary` and the docs' `.VPButton.alt` patterns. Solid amber MUST NOT render on any non-warning button surface.
- **FR-024**: The primary button across all three surfaces MUST have identical visual dimensions (border-radius, height, font-weight). The canonical values are decided at clarify time; default 8px / 40px / 600.
- **FR-025**: The Studio's design-system `theme.css` MUST define every custom property referenced by `apps/studio/src/styles.css` (the spacing scale `--space-1`…`--space-10`, text scale `--text-md`, sidebar widths, secondary-text alias). A CI guard MUST fail the build if `apps/studio/src/styles.css` introduces a new `var(--…)` reference whose definition does not exist.
- **FR-026**: The focus-visible ring MUST be consistent across all three surfaces (single width, single offset, single colour family). The Studio's existing two-style mix (`focus-visible:ring-[3px]` on the design-system Button vs. `outline: 2px` on hand-rolled inputs) MUST be reconciled to a single rule.
- **FR-027**: The Studio's chrome (toolbar, status bar) MUST visually group related controls. Panel-toggle buttons, layout-action buttons, and filter controls MUST be separated by visible separators, AND panel-toggle buttons MUST carry `aria-pressed` matching their `data-variant`.
- **FR-028**: The empty-state layout MUST present a clear hierarchy: one primary CTA ("New" workspace), a row of equally-weighted secondary entry points (Select Files / Select Folder / Open from GitHub), and the curated-models section as a discoverable but visually subordinate row. The empty state MUST be vertically centred at viewports ≥ 1280×800.
- **FR-029**: Brand identity elements (the brand mark) MUST share dimensions across landing and Studio (28×28, 6px radius). The 120×120 hero variant on the docs page is a separate, explicitly-sized variant.
- **FR-030**: Diagnostic colours (`error` / `warning` / `info`) MUST consume design-system tokens, NOT hard-coded hex literals; a regression test MUST assert no hard-coded hex `error`/`warning`/`info` colour appears in `apps/studio/src/styles.css`.

### Key Entities

- **Workspace record**: the persisted summary of an open project (id, kind, files-on-disk path, last-opened, recent tabs, dock layout). Already defined by 012; this feature ensures restore-on-reload actually engages.
- **LSP session**: a live language-service binding tied to a workspace. Currently absent in production; this feature creates it (server-hosted on Cloudflare).
- **Curated manifest**: the JSON descriptor for a curated archive (modelId, version, sha256, size, generatedAt). Already defined by 012; this feature ensures the production mirror serves it.
- **Worker route binding**: the mapping from `www.daikonic.dev/...` to a specific Worker. Already configured per-Worker in 012; this feature corrects the precedence so requests reach the intended Worker.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor on a 50 Mbps connection can load any curated model and reach an interactive editor in under 60 seconds, ≥95% of the time. (Today: 0% — every load fails.)
- **SC-002**: A returning visitor in the same browser reaches an interactive editor for a previously-loaded model in under 5 seconds, ≥95% of the time. (Today: 0% — reload returns to the empty start page.)
- **SC-003**: The production verification script reports zero failures against the production deploy. (Today: 6 failures.)
- **SC-004**: 100% of the documented `ErrorCategory` values surface a distinct, user-actionable message; no production load failure presents the visitor with a generic "Unknown error" or an indefinite spinner.
- **SC-005**: Live diagnostics on a typical edit appear within 2 seconds of the keystroke, ≥95% of the time. Hover and autocomplete responses appear within 1 second, ≥95% of the time.
- **SC-006**: The Studio status bar in production NEVER references a localhost host:port for non-developer visitors. Verified by automated copy-string scan in CI.
- **SC-007**: A visitor on the production deploy can complete the GitHub Device-Flow path from "click Open from GitHub" to "first commit pushed" in under 5 minutes, given a public repository they own.
- **SC-008**: 90% of visitors who load a curated model on day 1 find their workspace intact on day 2 (browser cache + IndexedDB intact).
- **SC-009**: Curated-load success is observable post-fact via the telemetry stats endpoint; a sustained success rate of ≥95% is achieved across a 48-hour rolling window after launch.
- **SC-010**: The dock shell renders with visible chrome at 1280×800 and 1440×900 viewports — verified by an automated visual regression test that fails if panel titles render as raw identifiers or if tab strips are absent.
- **SC-011**: A side-by-side screenshot review of equivalent UI primitives across the three production surfaces — landing, docs, Studio — does not allow a designer to identify them as different products. Carried from feature 012's SC-007.
- **SC-012**: 100% of `var(--…)` references in `apps/studio/src/styles.css` resolve to a definition in the design-system theme; verified by a CI guard test that fails on undefined-property regressions.

## Assumptions

- The Cloudflare account `8327a4da4660eab7d78695268282da09` already holds the curated-mirror R2 bucket (verified empty, ready for first cron run) and is reachable by `wrangler` for the deploy steps.
- The production GitHub App will use `repo` and `metadata` scopes; if a finer-grained scope set is preferred, the feature can adapt without reshaping the spec.
- The Studio bundle currently shipping at `www.daikonic.dev/rune-studio/studio/` is built from master HEAD post-105 merge; no preview-environment overrides are in scope.
- Paid Cloudflare Workers plan (with the 30-second CPU budget per request) is available for the LSP DO. The free-plan 50ms budget is insufficient and out of scope.
- "Public visitor" means a desktop browser at ≥1280×800; mobile and tablet are explicitly out of scope for this feature.
- The codegen-worker continues to own `/rune-studio/api/codegen/*` only; route precedence corrections in scope here mean tightening the codegen-worker's pattern if needed, not redesigning its surface.
- The user-facing copy in `apps/studio/README.md` and the spec language describing the LSP transport is under the same author's editorial control and can be reworked freely.

## Dependencies

- Production Cloudflare Pages + Workers deployment access (`wrangler whoami` against the right account).
- A GitHub App registration owned by the project owner, with a callback URL pointing at the production github-auth Worker's `/device-flow/poll` route.
- The existing 012 source tree at master HEAD as the starting point — no other in-flight branches need to land first.
- The existing telemetry / curated-mirror / github-auth Worker source code (already on master) — this feature corrects deployment + wiring rather than reauthoring those Workers.
