# Feature Specification: Hosted codegen service for the public Studio

**Feature Branch**: `011-export-code-cf`
**Created**: 2026-04-24
**Status**: Draft (clarified 2026-04-24)
**Input**: User description: "get export code working on CF"

## Context

The Studio IDE deployed at `www.daikonic.dev/rune-studio/studio/` exposes an **Export Code** toolbar button. On the deployed site today, clicking it fails silently because the dialog probes `http://localhost:8377` — a developer-only codegen service that only exists when someone runs `pnpm codegen:start`. This feature adds a **hosted codegen service** (living on the same Cloudflare account as the Studio itself) so visitors to the live site can generate code in every language the local CLI currently supports, with abuse protection appropriate for a free public endpoint.

The architecture targeted by this spec:

- **Cloudflare Container** runs the existing `codegen-cli.sh` (Java 21 + `rosetta-code-generators` JVM) behind a minimal HTTP wrapper exposing the same JSON contract as the local `/api/generate` endpoint.
- **Cloudflare Worker** at `www.daikonic.dev/rune-studio/api/generate/*` proxies into the container, enforces CF Turnstile on the first generation per session, and applies per-IP rate-limiting.
- **Studio client** keeps the existing `BrowserCodegenProxy` contract; only its base URL differs between local dev (`http://localhost:8377`) and the deployed build (`/rune-studio/api/generate` — same-origin).
- **Local dev flow** (`pnpm codegen:start`) remains authoritative and unchanged; the hosted service is additive.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Generate code for any supported language from the deployed Studio (Priority: P1)

A visitor on `www.daikonic.dev/rune-studio/studio/` has loaded or authored a Rune model and wants generated code in one of the languages the Studio advertises. They click **Export Code**, pick any language from the list (same languages as local dev), solve a one-off CF Turnstile challenge the first time, and receive their generated files.

**Why this priority**: This is the feature as stated — the button exists on the live site and currently does nothing useful. Restoring language parity with local dev is the whole point of hosting the JVM.

**Independent Test**: On the live URL, load a known-good model, click **Export Code**, pick *any* language from the full matrix (Java, TypeScript, JSON Schema, etc.), complete the Turnstile challenge once, confirm files appear in the preview, and download them. Files must compile / validate in that language's standard tooling.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on the live Studio with a model loaded, **When** they click **Export Code** and pick a language, **Then** a one-off Turnstile challenge appears, and on successful challenge the generation completes and files are downloadable.
2. **Given** a returning visitor in the same browser session, **When** they generate code, **Then** the Turnstile challenge does NOT appear again — generation runs directly.
3. **Given** the service has been idle (no traffic for >15 minutes), **When** the first visitor generates, **Then** total time from click to preview is ≤15 seconds (includes container cold-start).
4. **Given** the service is warm, **When** a visitor generates for a model of ≤100 types, **Then** total time is ≤5 seconds.
5. **Given** a visitor has completed 10 generations in the last hour from their IP, **When** they trigger an 11th, **Then** the response is a clear "rate limited" message with a retry-after time, and the service does NOT spawn the JVM.

---

### User Story 2 — Helpful failure modes when the hosted service is degraded (Priority: P2)

The hosted container can be cold, overloaded, rate-limiting the caller, or (rarely) down entirely. The dialog must distinguish these cases and show the user what to do.

**Why this priority**: A broken-looking export dialog on a public site is worse than no export button at all. We control the UX even when the infrastructure isn't perfect.

**Independent Test**: Simulate each degraded mode and verify the dialog shows the right message without a generic spinner.

**Acceptance Scenarios**:

1. **Given** the container is cold, **When** a visitor clicks Generate, **Then** the dialog shows a "warming up…" indicator with an elapsed-time counter rather than a blank spinner.
2. **Given** the service returns a rate-limit (HTTP 429), **When** the visitor sees the error, **Then** the dialog shows "You've hit the free-tier limit (10/hour). Try again in N minutes, or run Studio locally for unlimited generation" with the retry-after value.
3. **Given** the service is fully unavailable (HTTP 5xx, timeout, DNS failure), **When** the visitor tries to generate, **Then** the dialog shows a specific error with a link to the status check and a local-dev fallback instruction.
4. **Given** the visitor is viewing the Export dialog when the service goes down, **When** they attempt a generation, **Then** the failure is surfaced within 10 seconds (no indefinite hang).

---

### User Story 3 — Keep the local-dev experience intact (Priority: P3)

A developer running Studio locally with `pnpm codegen:start` must see zero change to their flow. Turnstile must not trigger locally, rate limits must not apply, and all currently-supported languages must generate exactly as they do today.

**Why this priority**: The hosted service is additive. Any regression to the existing developer loop breaks everyone who's already productive.

**Independent Test**: With a local codegen server running and the Studio dev build pointed at `http://localhost:8377`, generate code in every supported language. Verify no Turnstile challenge appears, no rate-limit errors occur, and output matches today's behavior byte-for-byte.

**Acceptance Scenarios**:

1. **Given** the Studio dev build with `VITE_CODEGEN_URL` set to `http://localhost:8377`, **When** the developer opens Export Code, **Then** no Turnstile widget is injected into the dialog.
2. **Given** the same dev build, **When** the developer runs 100 generations in an hour, **Then** no rate-limiting kicks in.
3. **Given** the hosted service also exists on CF for a production smoke-test, **When** the dev flow runs locally, **Then** the local service takes precedence and no network calls cross the dev loop.

### Edge Cases

- **No files loaded**: dialog blocks generation with a message pointing at the "New" start-page option or the file picker.
- **Model has parse errors**: dialog surfaces the specific parse errors and blocks generation (parse errors are different from warnings — see FR-010).
- **Generation warnings (non-fatal)**: warnings render inline in the dialog; Generate remains enabled; the user can ship imperfect output knowingly.
- **User changes language mid-run**: any in-flight request is aborted; the dialog resets and starts the new language fresh.
- **Very large model** (>1000 types): generation may exceed the 5s warm SLA but must stream progress to the dialog and remain cancellable; total cap at 60s before the container kills the request.
- **Repeated identical generations** in the same session: no caching in v1 (every click re-runs the JVM); future enhancement may add idempotent caching keyed on model hash.
- **Visitor from a country where Turnstile is blocked**: the dialog falls back to a "contact us for access" message; they can still run Studio locally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deployed Studio MUST list every language the local `codegen-cli --list-languages` emits — full parity, no curated subset.
- **FR-002**: The Export dialog MUST complete its "service available" probe against `/rune-studio/api/generate/health` within 2 seconds on the deployed site. No probe to `localhost:*` in the deployed build.
- **FR-003**: Generation requests from the deployed Studio MUST hit only the user's own origin (`www.daikonic.dev`) — zero third-party calls.
- **FR-004**: The first generation per browser session on the deployed site MUST require a CF Turnstile challenge. Subsequent generations in the same session MUST NOT re-challenge.
- **FR-005**: The Worker MUST rate-limit generation requests to **10 per hour per IP** and **100 per day per IP**. Responses over the limit MUST return HTTP 429 with a `Retry-After` header and a JSON body explaining the limit.
- **FR-006**: The local-dev path (`VITE_CODEGEN_URL=http://localhost:8377`) MUST bypass both Turnstile and rate-limiting — those are applied only by the hosted Worker, not by the local server.
- **FR-007**: The hosted container MUST scale to zero when idle and MUST NOT incur compute cost during idle periods. Cold-start to first response MUST be ≤15 seconds.
- **FR-008**: The container MUST NOT persist user-submitted Rune source to disk or logs. Logs MAY record generation time, language, and output size, but MUST NOT record request or response bodies.
- **FR-009**: The Worker MUST proxy the existing `POST /api/generate` JSON contract verbatim — no schema changes to the request or response envelope used by `BrowserCodegenProxy`.
- **FR-010**: Pre-export validation warnings MUST render inline in the dialog and MUST NOT block generation. Parse errors (distinct from warnings) MUST block generation and display the specific error list.
- **FR-011**: When the hosted service returns an error (429, 5xx, or timeout), the dialog MUST render a specific, actionable message — never a generic "something went wrong".
- **FR-012**: The deployed build MUST include the Turnstile site key as a build-time public variable; the secret key stays in the Worker's secret store and is never shipped to the browser.
- **FR-013**: The container image MUST be built in this repository (reproducible from `packages/codegen/server/build.sh` output + a thin HTTP wrapper) and published to a Cloudflare-accessible container registry. No mystery base images.

### Key Entities

- **Target language**: Named generator exposed by `codegen-cli` (e.g. "Java", "TypeScript", "JSON Schema"). Has attributes: display name, description, file extension, example output.
- **Generated file**: Single artifact produced by running a generator against the model. Has attributes: path, content, language, size.
- **Generation request**: User-triggered operation scoped to one language and the current workspace files. Carries a Turnstile token (first request per session) and is subject to rate-limiting.
- **Rate-limit record**: Per-IP counter persisted in a CF Durable Object or KV, keyed on IP + time bucket (hour and day). Resets on rolling window boundaries.
- **Pre-export warning**: Non-fatal validator finding shown inline in the dialog without blocking generation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The deployed Studio supports 100% of the languages that `codegen-cli --list-languages` returns locally (full matrix parity).
- **SC-002**: 90% of warm generations for models ≤100 types complete in ≤5 seconds end-to-end; cold generations (after >15 minutes idle) complete in ≤15 seconds.
- **SC-003**: Zero cross-origin network calls from the deployed Studio's export flow (verified by DevTools Network tab during a generation).
- **SC-004**: A new visitor can go from "page load" to "downloaded generated file" in under 90 seconds without reading documentation, including one Turnstile challenge.
- **SC-005**: Rate-limiting works: the 11th generation from the same IP within an hour returns HTTP 429 with `Retry-After`, and the container is NOT invoked (verified in Worker analytics).
- **SC-006**: Monthly CF infrastructure cost stays under **$10/month** at demo-scale traffic (<1000 generations/month). A CF billing alert triggers at **$25/month** as a safety net.
- **SC-007**: Local-dev regression-free: developers running `pnpm codegen:start` see byte-identical output vs. today for every currently-supported language.
- **SC-008**: No user-submitted source appears in any Worker or container log line (verified via log inspection during load-testing).

## Assumptions

- The existing `rosetta-code-generators` JVM toolchain builds successfully inside a Docker image based on `openjdk:21-slim` with no platform-specific dependencies. Reproducing the local `build.sh` flow in Dockerfile form is mechanical.
- Cloudflare Containers billing + cold-start behavior matches published docs (usage-based pricing, scale-to-zero, 5–10s cold start for ~500MB JVM images).
- CF Turnstile is available in all regions the deployed Studio currently reaches. Regions where Turnstile is blocked will be handled by a graceful fallback message (not automated bypass).
- CF Durable Objects or KV are adequate for per-IP rate-limiting at the target scale (<10k requests/day). At higher scale a migration to a different store may be needed (out of scope).
- The existing `BrowserCodegenProxy` JSON contract is stable; the hosted Worker reuses it verbatim without versioning changes.
- The Studio's `VITE_CODEGEN_URL` env var mechanism already supports build-time overrides, so pointing production builds at `/rune-studio/api/generate` is a one-line change.

## Out of Scope

- **Serverless / containerless alternatives** (AWS Lambda + SnapStart, CheerpJ in-browser, TypeScript port of the generators). Each is credible but either introduces cross-cloud complexity (Lambda) or unknown feasibility risk (CheerpJ with Xtext). A follow-up spec may explore CheerpJ specifically if infrastructure cost becomes a concern.
- **Authenticated / paid tier** (API keys, per-user quotas, billing). The free public endpoint with rate-limiting is sufficient for v1.
- **Caching of previous generations** (keyed on model hash + language). Every click re-runs the JVM in v1. Caching is a v2 optimization once real usage patterns are visible.
- **Generation history / saved sessions** on the user side.
- **Multi-region container deployment.** Single region at launch; CF edge routing handles global latency.
- **Replacing the local `pnpm codegen:start` path.** Local dev keeps its own server; the hosted service is purely additive.
- **New target languages** beyond what `rosetta-code-generators` already emits upstream.
- **Redesign of the Export dialog UI or file preview pane.** Only the transport layer and the error-state copy change.

## Open Questions (resolved)

- **Container image provenance**: **Resolved** — built in this repo from `packages/codegen/server/build.sh` output + thin HTTP wrapper, published to a CF-accessible registry (exact registry TBD in plan.md).
- **Data retention**: **Resolved** — stateless; logs record only generation time, language, and output size; no source or output bodies in logs.
- **Budget safeguard**: **Resolved** — CF billing alert at **$25/month** set as a safety net; escalate to a plan review if repeatedly triggered.
