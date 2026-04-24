# Research: Hosted codegen service

**Feature**: `011-export-code-cf`
**Date**: 2026-04-24
**Purpose**: Resolve technical unknowns for the Cloudflare-hosted JVM codegen service before Phase 1 design.

---

## R1 — Cloudflare Containers deployment model

**Decision**: Deploy the codegen container as a `wrangler deploy`-managed Container referenced from the Worker. Use Cloudflare's **Container Registry** (pushed via `wrangler containers push`) as the image source; build the image locally or in CI from `apps/codegen-container/Dockerfile`.

**Rationale**:
- Keeps everything on one CF account, consistent with the `daikonic-dev` Pages project already there.
- CF Containers bind directly to Workers through a `[[containers]]` block in `wrangler.toml`, so the Worker calls the container via a typed binding rather than a public URL — no public egress, no extra auth.
- Scale-to-zero is native: the container spins up only when the Worker dispatches a request, matches the "no idle cost" requirement (FR-007).

**Alternatives considered**:
- **Docker Hub + CF Worker pulling by URL**: possible but creates a split-brain auth story (CF needs a credential to pull a third-party registry). Rejected.
- **Fly.io / AWS ECR**: requires a second cloud account, negates the "CF-native" reason we picked this approach. Rejected.
- **Self-hosted registry**: ops overhead with no payoff at this scale. Rejected.

**References**: Cloudflare Containers docs (beta) — `https://developers.cloudflare.com/containers/` (verify during impl).

---

## R2 — Container image: base + reproducible build from `build.sh`

**Decision**: Multi-stage Dockerfile:
- **Stage 1 (`builder`)**: `openjdk:21-slim` + `maven` + clone `rosetta-code-generators` at a pinned tag → run the existing `packages/codegen/server/build.sh` workflow to produce the CLI + classpath.
- **Stage 2 (`runtime`)**: `openjdk:21-slim` + Node 20 + copy JARs + `codegen-cli.sh` wrapper from Stage 1 + the TypeScript HTTP wrapper compiled to JS.
- ENTRYPOINT: `node /app/server.js` which serves HTTP on `$PORT` (default 8080) and spawns `codegen-cli.sh` per request.

**Rationale**:
- Reuses the existing, already-tested build script — no re-invention of the Maven build.
- `openjdk:21-slim` is ~230 MB compressed; final image ~450 MB including JARs. Within CF Container limits (docs indicate 2 GB hard cap; aim for <1 GB warm cache).
- Node 20 in the runtime stage is cheap (~45 MB) and gives us a familiar HTTP server instead of writing it in shell.

**Alternatives considered**:
- **Single-stage with all build tools**: image size doubles (Maven + .m2 cache); wasteful. Rejected.
- **GraalVM native-image for the JVM**: reduces cold start from ~10s to ~1s, but Xtext-heavy codebases (`rosetta-code-generators`) routinely fail native-image due to reflection. Rejected; noted as future work.
- **Alpine base**: smaller but Java on Alpine (musl) has subtle bugs with some third-party libs. Rejected — `-slim` (Debian) is the safer default.

**Open risk**: `rosetta-code-generators` needs the `../rosetta-code-generators` sibling repo per `build.sh`. The Dockerfile must `git clone` that repo at a pinned commit during Stage 1. **Action**: pin the commit in `Dockerfile` ENV and document update procedure in `apps/codegen-container/README.md` during Phase 2.

---

## R3 — Worker ↔ Container transport

**Decision**: Use Cloudflare's typed `Container` binding from the Worker. In `wrangler.toml`:

```toml
[[containers]]
name = "codegen"
image = "codegen-cli"   # references the registry image
instances = 1            # single instance at a time; scale-to-zero between requests
```

The Worker calls `env.CODEGEN.fetch(request)` — CF routes to the running (or cold-start) container, no network round-trip config needed.

**Rationale**:
- Simplest transport. No public container URL to leak, no DNS to manage.
- Container output streams back as a standard `Response` body so the Worker can pipe it to the client unchanged.

**Alternatives considered**:
- **Public container URL + Worker `fetch(containerUrl)`**: doable but requires managing a second hostname + TLS + firewalling. Rejected.

---

## R4 — CF Turnstile integration

**Decision**:
- **Client (studio)**: render Turnstile widget on-demand (first click of *Generate* per session). Use `@marsidev/react-turnstile` (maintained, small, React 18/19 compatible). Site key is injected at build time via `VITE_TURNSTILE_SITE_KEY`.
- **Server (Worker)**: verify the token by POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret from Worker secrets. Cache a successful verification in a short-lived (15-minute) Worker KV entry keyed on the token's response so identical tokens don't re-burn quota.
- **Session heuristic**: treat "session" as "the lifetime of the React component in one tab". After a successful verify, the Worker issues a signed cookie (`hcsession=<JWT>`, 1-hour TTL, `HttpOnly; Secure; SameSite=Strict`) that subsequent requests present. Each valid cookie skips Turnstile but still counts against the rate-limit.

**Rationale**:
- Only prompting once per session matches Q3-combined spec semantics (A+B).
- Cookie gives us a durable "already verified" signal without re-challenging, while still letting rate-limit enforce load caps.
- `@marsidev/react-turnstile` keeps our React code declarative; we can test with Turnstile's dummy keys in CI.

**Alternatives considered**:
- **Every request requires Turnstile**: too much friction. Rejected.
- **localStorage flag instead of cookie**: client can forge; cookie is signed by the Worker. Rejected.
- **Store verification in a Durable Object instead of a cookie**: adds a lookup round-trip per generation. Rejected — cookie is stateless and fast.

---

## R5 — Per-IP rate limiting: Durable Object vs KV

**Decision**: **Durable Object** with two counters per IP (hour bucket + day bucket), keyed on the IP address from `cf-connecting-ip`. Single DO namespace; IP-keyed instances.

**Rationale**:
- Strongly consistent: two requests from the same IP landing on different edge PoPs within the same second still see consistent counts. KV is eventually-consistent (~60s), which is too loose for a 10/hr/IP limit.
- DO execution cost is negligible at <10k requests/day.
- Counter reset is time-window-based (integer division on hour/day epoch), no cron needed.

**Alternatives considered**:
- **KV**: simpler API but eventual consistency breaks the tight limit. Rejected.
- **D1 (SQLite)**: overkill for two integers per IP; read/write latency worse than a DO in steady state. Rejected.
- **Worker analytics engine**: write-only; can't enforce limits at request time. Rejected (used for logging instead).

**DO contract** (specified in `contracts/rate-limit.md`):
- `POST /check?ip=<ip>` → `{allowed: boolean, remaining_hour: number, remaining_day: number, retry_after_s: number}`
- Side effect: on `allowed: true`, increments both counters atomically.

---

## R6 — Routing: `/rune-studio/api/generate/*` on CF Pages

**Decision**: Add the Worker as a **Pages Function** *route binding* — specifically, deploy the Worker as a Pages Function at `/api/generate/*` inside the `daikonic-dev` Pages project via a `functions/` directory, or as a separate Worker with a **Route** rule matching `www.daikonic.dev/rune-studio/api/generate/*`.

**Preferred**: Separate Worker with Route rule. The Pages project stays a pure static site; the Worker owns the dynamic surface independently. This matches zod-to-form's `shadcn-proxy` pattern (Worker with route `zod.toform.dev/api/shadcn/*`).

**Rationale**:
- Independent deploy cadence — we can roll the Worker back without touching the static site.
- Clear ownership boundary — `apps/codegen-worker/` is its own deploy.
- Same-origin from the browser's perspective (`www.daikonic.dev/rune-studio/api/generate` → Worker → Container); no CORS needed.

**Alternatives considered**:
- **Pages Functions (`functions/api/generate/*`)**: tightly couples the static-site deploy and the Worker code. Rejected.
- **Subdomain (`codegen.daikonic.dev`)**: introduces CORS, needs a DNS record, and loses the clean "same-origin" guarantee in FR-003. Rejected.

---

## R7 — Studio client: build-time URL override

**Decision**: Extend `apps/docs/scripts/build-combined.mjs` to set `VITE_CODEGEN_URL=/rune-studio/api/generate` when assembling the CF bundle, and inject `VITE_TURNSTILE_SITE_KEY` from an env var the build script reads (falls back to Turnstile's documented "always-pass" dummy key if unset, so dev builds never fail for lack of a key).

**Rationale**:
- Zero runtime detection needed — `BrowserCodegenProxy` already reads `import.meta.env.VITE_CODEGEN_URL`. The build just needs to set it.
- Turnstile widget only renders when a site key is present and `VITE_CODEGEN_URL` is an absolute-or-cross-origin value indicating the hosted service; locally it's a no-op.

**Alternatives considered**:
- **Runtime detection** (`if (window.location.host === 'www.daikonic.dev')`): brittle; hard to test in preview deploys. Rejected.
- **Separate studio build variants**: over-engineered. Rejected.

---

## R8 — Budget guardrails

**Decision**:
- Set a Cloudflare **notification alert** at **$25/month** on the daikonic.dev account (one-time dashboard action; documented in `quickstart.md`).
- The Worker logs per-request: timestamp, language, output bytes, duration, IP-hash (SHA-256 of IP + daily salt), client error code if any. No request or response bodies (FR-008). Logs go to CF Logpush or Tail — pick Tail for beta traffic scale.
- Durable Object itself emits a counter for generations/day accessible via CF analytics, so spend projections are always one query away.

**Rationale**:
- $25 is ~5× the spec's $10/mo target (SC-006) — enough headroom to avoid false alarms while still catching a real cost spike.
- IP-hash retains rate-limit observability without storing raw IPs.

**Alternatives considered**:
- **Hard cap via Worker-side counter that kills traffic at $X spent**: not implementable from inside the Worker (no spend-to-count translation). Rejected.
- **No logging**: makes incident response harder. Rejected.

---

## R9 — Testing strategy

**Decision**:
- **Worker unit tests** (`apps/codegen-worker/test/`): vitest with Miniflare; mock Turnstile verify; mock Container binding with a stub that returns canned fixtures from `packages/codegen/server/test/fixtures/`.
- **Durable Object test** (`rate-limit.test.ts`): use Miniflare's DO harness; simulate 11 requests in an hour, assert the 11th returns `allowed: false` with correct `retry_after_s`.
- **Container HTTP wrapper test** (`apps/codegen-container/test/`): spawn the container locally (Docker must be running), curl the `/health` endpoint, curl a known-good `/generate` request, assert parity with local `pnpm codegen:start` output for the same input.
- **Studio e2e** (`apps/studio/test/e2e/export-code-cf.spec.ts`): extends the existing Playwright harness; uses Turnstile's dummy keys to auto-pass; asserts the click-to-download flow against a locally-running Worker (not the live deployment).
- **Live-service smoke test** (manual, documented in `quickstart.md`): after deploy, run a `curl` against `https://www.daikonic.dev/rune-studio/api/generate/health` and confirm 200. Not part of CI.

**Rationale**:
- Keeps CI deterministic (Constitution II): no network calls to live CF.
- Miniflare gives us high-fidelity simulation of Workers + DOs + Containers bindings.
- Java-side tests already exist in `rosetta-code-generators`; we don't duplicate them here.

**Alternatives considered**:
- **CI deploys to a preview CF environment and runs live tests**: expensive, flaky, and requires secrets in CI. Rejected for v1.

---

## Outstanding items (verified during implementation, not blockers)

1. **Cloudflare Containers pricing at scale** — confirm $0–10/month hits at <1000 generations/month actually matches CF's billing model. Action in Phase 2: run a dry-run deploy + one week of real traffic before announcing.
2. **Turnstile free-tier limits** — confirm Turnstile is free up to the usage we expect (most sources say 1M challenges/month free). Action: read the latest pricing page before launch.
3. **`rosetta-code-generators` upstream pinning** — verify we can pin to a stable tag. If upstream only ships `main`, we vendor the JARs instead. Action: confirm in Phase 2; fallback documented.
