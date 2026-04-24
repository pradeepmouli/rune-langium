---
description: "Task list for 011-export-code-cf"
---

# Tasks: Hosted codegen service for the public Studio

**Input**: Design documents from `/specs/011-export-code-cf/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Included — the spec's acceptance scenarios and SC-008 (no user source in logs) require automated verification. TDD is enforced by the repo's `speckit.superb.tdd` hook on `/speckit.implement`.

**Organization**: Tasks are grouped by user story (US1 = P1 / US2 = P2 / US3 = P3) so each slice can ship independently.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Safe to run in parallel (touches a different file from other [P] tasks in the same phase; no unsatisfied dependencies).
- **[Story]**: Applies only to user-story phases (US1 / US2 / US3).

## Path Conventions

Monorepo with pnpm workspaces under `apps/*` and `packages/*`. New packages for this feature live at:

- `apps/codegen-worker/` — CF Worker + Durable Object
- `apps/codegen-container/` — container image + HTTP wrapper around `codegen-cli.sh`

Studio edits land in existing `apps/studio/src/**` paths; build-time env wiring lands in `apps/docs/scripts/build-combined.mjs`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the two new workspace packages, wire them into pnpm, install shared dev tooling.

- [ ] T001 Create `apps/codegen-worker/` scaffolding with `package.json` (name `@rune-langium/codegen-worker`, scripts: `dev`, `deploy`, `test`, `type-check`), `tsconfig.json` extending `../../tsconfig.json`, `.gitignore`, and SPDX FSL-1.1-ALv2 header on all new files (per `CLAUDE.md` licensing boundary).
- [ ] T002 Create `apps/codegen-container/` scaffolding with `package.json` (name `@rune-langium/codegen-container`, scripts: `build`, `publish`, `test`), `tsconfig.json`, `.gitignore`, and SPDX FSL-1.1-ALv2 header on TypeScript sources.
- [ ] T003 [P] Add root-level dev dependencies: `wrangler@^4`, `@cloudflare/workers-types@latest`, `miniflare@latest` to `apps/codegen-worker/package.json`. Add `@marsidev/react-turnstile@latest` to `apps/studio/package.json`.
- [ ] T004 [P] Add a `build:worker` and `deploy:worker` script to root `package.json` that forwards to `pnpm --filter @rune-langium/codegen-worker ...`, mirroring the existing `build:studio` / `docs:build` pattern.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Container image + Worker skeleton — every user story depends on these existing and being reachable from each other.

**⚠️ CRITICAL**: No US1/US2/US3 task can start until this phase is complete.

- [ ] T005 Container Dockerfile stage 1 (builder) in `apps/codegen-container/Dockerfile` — `openjdk:21-slim` + `maven`, clone `rosetta-code-generators` at a pinned commit from `ENV ROSETTA_COMMIT`, run the existing `packages/codegen/server/build.sh` flow, produce `/build/codegen-cli/` with JARs + `codegen-cli.sh`. Pinned commit documented in `apps/codegen-container/README.md`.
- [ ] T006 Container Dockerfile stage 2 (runtime) in `apps/codegen-container/Dockerfile` — `openjdk:21-slim` + Node 20, copy `/build/codegen-cli/` from stage 1, copy compiled HTTP wrapper from `apps/codegen-container/dist/`, `ENTRYPOINT ["node","/app/server.js"]`, `EXPOSE 8080`.
- [ ] T007 [P] Container HTTP wrapper server in `apps/codegen-container/src/server.ts` — tiny Node http server bound to `process.env.PORT || 8080`. Routes: `GET /api/generate/health` and `POST /api/generate`. Spawns `codegen-cli.sh` via the helper in T008.
- [ ] T008 [P] Container CLI proxy in `apps/codegen-container/src/cli-proxy.ts` — wraps `child_process.spawn('/app/codegen-cli/codegen-cli.sh', [...args])`, streams stdin with the request JSON, reads stdout JSON response, handles non-zero exit codes as upstream errors. No disk writes.
- [ ] T009 Worker entry in `apps/codegen-worker/src/index.ts` — routes `GET /api/generate/health`, `POST /api/generate`, and `GET /api/generate/diag` (internal). Wires Turnstile → DO → Container pipeline (stubs at this stage; real logic in US1).
- [ ] T010 `apps/codegen-worker/wrangler.toml` — Worker name `rune-codegen-worker`, route `www.daikonic.dev/rune-studio/api/generate/*`, `[[containers]]` binding named `CODEGEN` referencing the pushed image, `[[durable_objects.bindings]]` for `RATE_LIMITER` (class `RateLimiter`), KV namespace binding `LANG_CACHE` for health-list caching, compatibility date `2026-04-24`.
- [ ] T011 Contract smoke test script at `apps/codegen-container/test/container-parity.test.ts` — requires Docker; spins up the container, POSTs a canned `CodeGenerationRequest` from a fixture, asserts the response matches byte-for-byte what `pnpm codegen:start` emits for the same input (Constitution II — deterministic fixtures).

**Checkpoint**: Container builds locally, Worker skeleton responds with stub payloads, parity test passes. User-story phases can now begin in parallel.

---

## Phase 3: User Story 1 — Generate code for any supported language (Priority: P1) 🎯 MVP

**Goal**: Visitor on `www.daikonic.dev/rune-studio/studio/` clicks Export Code, picks any language, completes one Turnstile challenge (first time per session), and gets generated files downloaded. Full parity with local `codegen-cli --list-languages`.

**Independent Test**: With Worker deployed against a preview CF environment and Studio built pointing at it, load a model, click Export Code, pick Java (or any JVM-backed language), complete Turnstile, confirm generated files appear and download.

- [ ] T012 [US1] DO `RateLimiter` class in `apps/codegen-worker/src/rate-limit.ts` — implements `POST /check` and `POST /check-health` per `contracts/rate-limit.md`. Atomic counter increments; returns `{allowed, remaining_hour, remaining_day, retry_after_s, scope_tripped}`.
- [ ] T013 [P] [US1] DO unit tests in `apps/codegen-worker/test/rate-limit.test.ts` — Miniflare DO harness; 11 sequential requests → 11th returns `allowed=false` with correct `retry_after_s`; health-check bucket is independent of generate bucket.
- [ ] T014 [P] [US1] Turnstile server-side verify in `apps/codegen-worker/src/turnstile.ts` — POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` per `contracts/turnstile-flow.md`. Validates `hostname` matches origin. Never logs the token.
- [ ] T015 [P] [US1] Turnstile verify unit tests in `apps/codegen-worker/test/turnstile.test.ts` — stubbed `fetch` returning both success and failure payloads; asserts hostname mismatch is rejected.
- [ ] T016 [P] [US1] Session cookie helpers in `apps/codegen-worker/src/session.ts` — JWT sign/verify with `env.SESSION_SIGNING_KEY`; embeds `iat/exp/action/iph`; `iph` is SHA-256 of `cf-connecting-ip + daily-salt`. Rotates daily.
- [ ] T017 [P] [US1] Session-cookie unit tests in `apps/codegen-worker/test/session.test.ts` — valid cookie verifies; expired, wrong-signature, and rotated-IP cases all fail.
- [ ] T018 [US1] Worker orchestration in `apps/codegen-worker/src/index.ts` for `POST /api/generate` — order: (1) parse body, (2) check session cookie OR verify Turnstile token, (3) DO rate-limit check, (4) Container dispatch, (5) return response + `Set-Cookie` on first-gen. Depends on T012/T014/T016.
- [ ] T019 [P] [US1] Worker integration test `apps/codegen-worker/test/proxy.test.ts` — Miniflare end-to-end: Turnstile dummy key, DO, stubbed Container binding returning canned response. Assert happy-path 200 + `Set-Cookie`.
- [ ] T020 [US1] Studio: add Turnstile widget to `apps/studio/src/components/ExportDialog.tsx` — render `<Turnstile>` from `@marsidev/react-turnstile` only when `import.meta.env.VITE_TURNSTILE_SITE_KEY` is set AND the configured codegen URL is a relative/cross-origin hosted URL (not `localhost:*`). Stash the token in local component state; include as `X-Turnstile-Token` header on the first generation request.
- [ ] T021 [US1] Studio: extend `BrowserCodegenProxy` in `apps/studio/src/services/codegen-service.ts` to forward the Turnstile token header on first request and omit it on subsequent requests in the same session.
- [ ] T022 [US1] Build-time env wiring in `apps/docs/scripts/build-combined.mjs` — inject `VITE_CODEGEN_URL=/rune-studio/api/generate` and `VITE_TURNSTILE_SITE_KEY=${process.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}` into the studio sub-build. Local dev unchanged (no script wrapper → default env).
- [ ] T023 [US1] E2E test `apps/studio/test/e2e/export-code-cf.spec.ts` — Playwright against local Miniflare+studio stack with Turnstile dummy keys. Asserts click → challenge passes invisibly → files render → download button works. Uses the port helper from `apps/studio/scripts/check-env.mjs`.

**Checkpoint**: Clicking Export Code on the deployed Studio produces a downloadable file for every language in `codegen-cli --list-languages`. SC-001, SC-003, SC-004, SC-007 verifiable.

---

## Phase 4: User Story 2 — Helpful failure modes (Priority: P2)

**Goal**: Every degraded state (cold start, rate-limited, upstream 5xx) produces a specific, actionable message in the dialog — never a blank spinner or generic error.

**Independent Test**: Force each degraded mode (kill container, exceed rate limit, disconnect Worker) and verify the dialog shows the correct copy + retry behavior.

- [ ] T024 [US2] Worker `GET /api/generate/health` handler in `apps/codegen-worker/src/index.ts` — probes the container binding; on success returns `{status, cold_start_likely, languages}`. Caches the `languages` list in KV (`LANG_CACHE`) with 1-hour TTL. On container unreachable within 3s, returns cached languages with `cold_start_likely: true`.
- [ ] T025 [P] [US2] Worker 429 response envelope — `apps/codegen-worker/src/index.ts` returns `{error: "rate_limited", scope, limit, remaining_hour, remaining_day, retry_after_s, message}` with `Retry-After` header, per `contracts/http-generate.md`.
- [ ] T026 [P] [US2] Worker upstream-failure response — retries container dispatch once with exponential backoff; on persistent failure returns `{error: "upstream_failure", message, retryable: true}` with HTTP 502.
- [ ] T027 [P] [US2] Worker integration tests in `apps/codegen-worker/test/error-cases.test.ts` — assert 429 shape, `Retry-After`, cached-language fallback on cold health, and 502 retry behavior.
- [ ] T028 [US2] Studio ExportDialog degraded-state UX in `apps/studio/src/components/ExportDialog.tsx` — add three new states: `warmingUp` (shows elapsed-time counter next to spinner when container is cold), `rateLimited` (renders the `Retry-After` message with the "run Studio locally" fallback hint), `upstreamFailure` (renders the specific error + status-check link).
- [ ] T029 [P] [US2] Studio e2e extension in `apps/studio/test/e2e/export-code-cf.spec.ts` — add test cases for each degraded state, driving the Worker into the failure mode via a debug endpoint and asserting dialog copy.
- [ ] T030 [US2] Update `apps/studio/src/components/ExportDialog.tsx` copy for the "no languages available at all" case (FR-011, US2 acceptance 2) — suggests local-dev fallback.

**Checkpoint**: SC-002 (warm/cold latency surfaced in UX), SC-005 (rate-limit observable by users) verifiable. No generic error messages remain in the dialog's failure paths.

---

## Phase 5: User Story 3 — Local-dev experience unchanged (Priority: P3)

**Goal**: Running Studio locally with `pnpm codegen:start` sees zero changes — no Turnstile widget, no rate-limit errors, byte-identical output vs. today.

**Independent Test**: Start `pnpm codegen:start` + `pnpm --filter @rune-langium/studio dev`; run Export Code across every language; confirm no Turnstile appears, no rate-limit error occurs, and output matches pre-feature baseline.

- [ ] T031 [US3] Guard Turnstile render in `apps/studio/src/components/ExportDialog.tsx` — only instantiate the widget when `VITE_CODEGEN_URL` starts with `/` or a non-localhost host. Add a unit test asserting the widget is absent when `VITE_CODEGEN_URL=http://localhost:8377`.
- [ ] T032 [US3] Regression e2e test `apps/studio/test/e2e/export-code-local-regression.spec.ts` — runs against local `pnpm codegen:start` harness; asserts (a) no Turnstile DOM node rendered, (b) rate-limit 429 never returned, (c) generated output for a canned fixture matches the pre-feature snapshot byte-for-byte.
- [ ] T033 [US3] Update `README.md` and `apps/studio/README.md` with a "local vs hosted codegen" callout explaining the two paths and when each applies.

**Checkpoint**: SC-007 (local-dev parity) verified. Developers can ignore everything about Turnstile + Worker + Container while working locally.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Observability, ops, docs, and the one-time CF infra pieces that don't belong to a single user story.

- [ ] T034 [P] Worker structured logging to CF Tail — add a log-emit helper in `apps/codegen-worker/src/log.ts` writing `WorkerLogEntry` per `data-model.md`. Explicitly excludes `request.files` and `response.files` content from every log line.
- [ ] T035 [P] Log-sanitization test `apps/codegen-worker/test/log-redaction.test.ts` — asserts that a request containing a known sensitive string (e.g. `namespace secret; type Password`) produces zero log lines containing that string. Satisfies SC-008.
- [ ] T036 [P] Container-side log sanitization — the HTTP wrapper in `apps/codegen-container/src/server.ts` MUST NOT `console.log` request or response bodies; only status + duration. Test in `apps/codegen-container/test/log-redaction.test.ts`.
- [ ] T037 [P] Update `apps/studio/README.md` with an "Export Code" user-facing section — screenshot of the Turnstile challenge, description of rate-limits, link to run Studio locally for heavy use.
- [ ] T038 Finalize `specs/011-export-code-cf/quickstart.md` deploy steps — verify `wrangler deploy` + container push commands against a live dry-run, capture the actual image-tag format, and update the doc with any corrections.
- [ ] T039 One-time CF dashboard action (manual, documented in quickstart.md §6) — create the $25/month billing notification alert on the Pmouli@mac.com account. Not automatable; note alert ID in an ops doc outside VCS.
- [ ] T040 Rollback rehearsal — run `wrangler rollback` on the Worker in a preview environment to confirm the published rollback plan in `quickstart.md` actually works. Document any surprises.

---

## Dependencies

```
Phase 1 (Setup) ─→ Phase 2 (Foundational) ─→ ┬─→ Phase 3 (US1 / P1 / MVP)
                                              ├─→ Phase 4 (US2 / P2)
                                              └─→ Phase 5 (US3 / P3)
                                                         │
                                                         └─→ Phase 6 (Polish)
```

- **Phase 2 blocks all user stories.** Container + Worker skeleton must respond before any story-specific task is meaningful.
- **US1 is the MVP.** Complete Phase 3 alone and the primary success criterion (SC-001, SC-003, SC-004) is satisfiable.
- **US2 and US3 can run in parallel** after Phase 3 lands. US2 hardens the happy path; US3 is regression-verification and docs, touching mostly different files.
- **Phase 6 can overlap** with Phase 4/5 — T034/T035/T036/T037 are [P] against any story-phase work because they touch different files.

## Parallel opportunities

Within each phase, `[P]` tasks touch distinct files:

- **Phase 1**: T003 + T004 after T001/T002 create the packages.
- **Phase 2**: T007 + T008 after T005/T006 have the image scaffold.
- **Phase 3**: T013 + T014 + T015 + T016 + T017 + T019 all parallelize once T012 (DO class) lands.
- **Phase 4**: T025 + T026 + T027 + T029 parallelize after T024 (health).
- **Phase 6**: T034 + T035 + T036 + T037 all [P] (different files, no cross-deps).

## MVP scope

**Phase 1 + Phase 2 + Phase 3** (T001–T023) = 23 tasks.

After MVP:
- SC-001 (full language parity) — ✓
- SC-003 (zero cross-origin calls) — ✓
- SC-004 (≤90s page-load-to-download) — ✓
- SC-006 ($10/mo at demo scale) — provisional pending Phase 6 budget alert
- SC-007 (local-dev regression-free) — provisional pending Phase 5 regression test

Shipping MVP alone gives visitors a working Export Code flow. The remaining phases harden the edges (friendly errors, local-dev regression proof, observability/ops/docs).

## Suggested implementation order

1. T001 → T002 → T003 → T004 (Phase 1, sequential due to scaffolding creation)
2. T005 → T006 (Dockerfile stages; T006 depends on T005)
3. T007 + T008 in parallel (both touch `apps/codegen-container/src/*` but different files)
4. T009 → T010 (Worker entry + wrangler.toml)
5. T011 (container parity test — gate for Phase 3 start)
6. T012 (DO) → T013/T014/T015/T016/T017/T019 parallel batch → T018 → T020 → T021 → T022 → T023
7. Phase 4 and Phase 5 in parallel by two people / one person round-robin
8. Phase 6 mixed with the tail end of Phase 4/5

## Validation

- All 40 tasks follow `- [ ] [TaskID] [P?] [Story?] Description` format ✓
- Setup + Foundational + Polish phases carry **no** `[Story]` label ✓
- Every US1/US2/US3 task has its story label ✓
- Every task references an exact file path or a specific external action ✓
- TDD ordering within US1: unit tests (T013/T015/T017/T019) are co-located with their implementations; `speckit.superb.tdd` gate will drive the actual RED→GREEN sequencing during `/speckit.implement` ✓
