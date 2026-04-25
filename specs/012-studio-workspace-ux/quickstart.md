# Phase 1 — Quickstart

**Feature**: 012-studio-workspace-ux

This walks an end-to-end flow once the feature is implemented. It's the
"happy path" that the integration tests will mirror.

---

## 1. Open Studio fresh, load CDM

1. Visit `https://www.daikonic.dev/rune-studio/`.
2. The empty-workspace start page (delivered earlier in `enhance/012-new-start-page`) shows three options. Click **Curated model → CDM**.
3. Studio:
   - `GET /curated/cdm/manifest.json` — returns the latest version (cached after first hit).
   - `GET /curated/cdm/latest.tar.gz` — streamed, progress UI shown.
   - Untar in-browser with `pako` + small tar parser.
   - Files written to OPFS at `/<workspace-id>/files/...`.
   - Workspace metadata persisted to IndexedDB.
4. Editor opens at the entry-point file. Time-to-interactive ≤ 60s on a 50 Mbps line (SC-001).
5. Telemetry: `curated_load_attempt` and `curated_load_success` posted to `POST /rune-studio/api/telemetry/v1/event`.

## 2. Edit, close, reopen

1. Open three more files into tabs.
2. Edit two of them.
3. Close the browser tab.
4. Reopen Studio. The recent-workspaces list shows the workspace at the top.
5. Click it. All four tabs reopen, the active tab is the same one as before, the two dirty edits are restored, scroll/cursor positions match. Restore time ≤ 5s (SC-002, SC-004).
6. Telemetry: `workspace_restore_success`.

## 3. Customise the layout

1. Drag the file-tree splitter to make it narrower.
2. Drag the inspector tab from the right panel down into the bottom group.
3. Hide the bottom group with `Ctrl+Alt+B`.
4. Reload the page.
5. The customised layout is restored exactly. Editor area uses ≥ 70% of horizontal space at 1280×800 (SC-005).

## 4. Connect a GitHub repo as a workspace backing

1. From the workspace switcher, click **New workspace → From GitHub**.
2. Studio: `POST /rune-studio/api/github-auth/device-init` — gets a user code.
3. Studio shows the user code and a "Open GitHub" button.
4. User clicks through, authorises on `github.com/login/device`.
5. Studio polls `device-poll` until token returns (typically <30s after authorisation).
6. Token written to `/<new-workspace-id>/.studio/token` in OPFS.
7. Studio runs an `isomorphic-git` clone of the chosen repo into OPFS at `/<new-workspace-id>/.git/...` and `/files/...`.
8. The workspace opens, editor lands in `README.md`.

## 5. Edit and push

1. Edit a file.
2. From the status bar, click "Commit & push".
3. Modal: commit message + branch picker (current + new).
4. On submit:
   - `isomorphic-git` `add` + `commit` (using token's GitHub identity).
   - `push` against the same `cors.isomorphic-git.org` proxy the existing read flow uses.
5. Status bar updates from `ahead` → `clean`. Editor markers cleared.

## 6. Verify cross-app design coherence

1. From Studio's app switcher (top-right, in the activity bar), click **Docs**.
2. The VitePress docs load. Compare the heading typography, button style, and link colour to Studio. They match — same tokens.
3. From the docs nav, click **Home**. The landing site loads. Same primary-button treatment as Studio.
4. Open the same primary CTA on all three surfaces side-by-side and screenshot. Outside reviewer identifies them as one product (SC-007).

## 7. Verify the form codegen migration (US5)

1. From a clean checkout: `pnpm install && pnpm dev:studio`.
2. `git status` is clean — no `forms/generated/*` files exist.
3. Open `packages/visual-editor/src/schemas/data.schema.ts`. Add a field. Save.
4. Within ~1s, the inspector form re-renders with the new field. No CLI invocation required (SC-011).
5. Run `pnpm build`. Studio builds with no codegen step.

## 8. Verify telemetry can be turned off

1. Open Studio → Settings.
2. Find the "Anonymous diagnostics" toggle. Disable it.
3. Reload Studio. Repeat steps 1–2 of this quickstart.
4. Inspect network: no `POST /api/telemetry/v1/event` is sent (FR-T03).

---

## Known caveats (documented, not fixed in this feature)

- Monaco's a11y caveats (FR-A04): we run `axe-core` against the host shell only; violations inside the Monaco iframe are tracked as known caveats.
- Multi-tab same-workspace: second tab is read-only with a banner. Live multi-tab sync is out of scope.
- Mobile portrait: shows "use a larger screen" instead of attempting a layout.
