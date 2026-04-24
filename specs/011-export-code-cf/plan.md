# Implementation Plan: Hosted codegen service for the public Studio

**Branch**: `011-export-code-cf` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-export-code-cf/spec.md`

## Summary

Expose the existing `rosetta-code-generators` JVM toolchain to visitors of `www.daikonic.dev/rune-studio/studio/` by hosting it as a Cloudflare Container, fronted by a Cloudflare Worker that enforces CF Turnstile (once per session) and per-IP rate-limiting via a Durable Object. Studio's existing `BrowserCodegenProxy` keeps its JSON-over-HTTP contract; only the base URL changes between local dev (`http://localhost:8377`) and the deployed build (`/rune-studio/api/generate`, same-origin). The local `pnpm codegen:start` path is untouched.

## Technical Context

**Language/Version**: TypeScript 5.9+ (studio, worker, container HTTP wrapper) / Java 21 (codegen CLI, already in use via `rosetta-code-generators`)
**Primary Dependencies**: `@rune-langium/codegen` (existing), Cloudflare Workers, Cloudflare Containers (beta), `@cloudflare/workers-types`, `wrangler` 4, CF Turnstile (`@marsidev/react-turnstile` or equivalent), CF Durable Objects, `rosetta-code-generators` (existing Maven build)
**Storage**: CF Durable Object for per-IP rate-limit counters (hour + day buckets); container is stateless (no disk writes beyond `/tmp`)
**Testing**: vitest for Worker unit tests and Durable Object logic; Playwright e2e against the studio client; `curl`-based contract smoke tests against a locally-running Miniflare instance of the Worker; Java unit tests existing in `rosetta-code-generators` cover the CLI
**Target Platform**: Cloudflare edge (Worker + Container) for the hosted path; modern browsers (ES2022) for the studio client; Node 20+ / Java 21 for local dev
**Project Type**: Web service (Worker) + container service + existing web app (studio)
**Performance Goals**: Warm generation ≤5s for ≤100-type models (SC-002); cold generation ≤15s end-to-end (SC-002); health probe ≤2s (FR-002)
**Constraints**: Scale-to-zero when idle (FR-007); monthly CF cost <$10 at demo scale (SC-006); no user source in logs (FR-008); same-origin only for deployed build (FR-003); no schema changes to `POST /api/generate` contract (FR-009)
**Scale/Scope**: <1000 generations/month target; rate-limit of 10/hr/IP and 100/day/IP (FR-005); full parity with local `codegen-cli --list-languages` (FR-001, SC-001)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevance | Status |
|---|---|---|
| **I. DSL Fidelity & Typed AST** | No grammar/AST changes; the Worker is a thin JSON proxy. | PASS (not applicable) |
| **II. Deterministic Fixtures** | Worker and container tests MUST use vendored fixtures; no external network in the test loop. Live-service smoke tests run separately. | PASS — planned below |
| **III. Validation Parity** | No validation-rule changes; pre-export warnings flow through unchanged. | PASS (not applicable) |
| **IV. Performance & Workers** | New perf budgets (cold ≤15s, warm ≤5s) are declared in the spec and will be benchmarked in Phase 2. | PASS with measurement plan |
| **V. Reversibility & Compatibility** | Hosted service is purely additive. Local dev flow unchanged. Feature is reversible by rolling back the Worker + Container deployments. | PASS |

**General gates**:
- Lint/test SHOULD pass before completion — enforced via existing CI (`lint-and-test`, `check-headers`, `check-generated`).
- Performance benchmarks — not applicable to parser; perf is measured as Worker/Container latency instead.

**Complexity Tracking**: No constitution violations. No entry in the complexity table.

## Project Structure

### Documentation (this feature)

```text
specs/011-export-code-cf/
├── plan.md                 # This file
├── research.md             # Phase 0 output
├── data-model.md           # Phase 1 output
├── quickstart.md           # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── http-generate.md    # POST /api/generate request/response (reused from local)
│   ├── http-health.md      # GET /api/generate/health
│   ├── turnstile-flow.md   # Client → Worker verification handshake
│   └── rate-limit.md       # Durable Object contract
├── checklists/
│   └── requirements.md     # Spec quality checklist (already green)
└── tasks.md                # /speckit.tasks output (not created here)
```

### Source Code (repository root)

```text
apps/
├── codegen-worker/                    # NEW — Cloudflare Worker (proxy + Turnstile verify + rate-limit)
│   ├── src/
│   │   ├── index.ts                   # Worker entry; routes /api/generate[/health|/*]
│   │   ├── turnstile.ts               # Server-side Turnstile verification
│   │   ├── rate-limit.ts              # Durable Object: per-IP hour + day counters
│   │   ├── proxy.ts                   # Container fetch + header forwarding
│   │   └── types.ts                   # Shared types (CodeGenerationRequest/Result re-export)
│   ├── test/
│   │   ├── turnstile.test.ts
│   │   ├── rate-limit.test.ts
│   │   └── proxy.test.ts
│   ├── wrangler.toml                  # Worker + DO + Container binding config
│   ├── package.json                   # @rune-langium/codegen-worker
│   └── tsconfig.json
│
├── codegen-container/                 # NEW — Container image (Java 21 + rosetta-code-generators + HTTP wrapper)
│   ├── Dockerfile                     # openjdk:21-slim + build artifacts + wrapper
│   ├── src/                           # TypeScript HTTP wrapper around codegen-cli.sh
│   │   ├── server.ts                  # Express-like HTTP server bound to $PORT
│   │   └── cli-proxy.ts               # Spawns codegen-cli.sh, streams JSON
│   ├── build.sh                       # Wraps packages/codegen/server/build.sh + copies JARs
│   ├── package.json                   # @rune-langium/codegen-container
│   └── tsconfig.json
│
└── studio/
    └── src/
        ├── services/
        │   └── codegen-service.ts     # EDIT — add Turnstile hook, point to /rune-studio/api/generate on CF
        └── components/
            └── ExportDialog.tsx       # EDIT — handle 429, cold-start progress, Turnstile widget

packages/codegen/server/                # EXISTING — build.sh unchanged; its output feeds apps/codegen-container/Dockerfile

apps/docs/scripts/build-combined.mjs    # EDIT (minor) — inject VITE_CODEGEN_URL=/rune-studio/api/generate for CF studio build
```

**Structure Decision**: Two new apps (`codegen-worker`, `codegen-container`) under `apps/*` — monorepo-consistent with the existing pattern (studio, docs, site). Worker is owned in-repo so Turnstile + rate-limit logic evolves with the Studio client. Container is split out so its Docker build and Java tooling don't pollute the TypeScript monorepo root. Studio gets small edits to its existing service client and dialog; no architectural change there.

## Complexity Tracking

*No constitution violations to justify.*
