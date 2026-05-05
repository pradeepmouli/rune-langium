# ADR-006: Procxy Is Not Suitable for the Studio LSP Transport

**Date**: 2026-05-01
**Status**: Accepted

## Context

The Studio runs its LSP server (Rune DSL) inside a **browser Worker** —
SharedWorker (preferred) or dedicated Worker (fallback) — communicating via
`MessagePort`. The `createTransportProvider` service in
`apps/studio/src/services/transport-provider.ts` has three connection paths:

1. Embedded browser worker (`createWorkerTransport()`) — primary
2. WebSocket to external dev server — fallback
3. Cloudflare Worker LSP via session token — final fallback

The question arose whether `procxy` (a sibling portfolio package) could
simplify LSP server lifecycle management in rune-langium or in `lspeasy`.

`procxy` provides a transparent proxy for class instances running in isolated
**Node.js child processes**, forwarding typed method calls over the Node.js
`process.send()` / `ChildProcess` IPC channel.

## Decision

**Do not use procxy for the Studio LSP transport path.**

The transport boundary in the Studio is a browser `MessagePort`, not a
Node.js IPC channel. Procxy's runtime is strictly Node.js (`ChildProcess`,
`process.send()`) and has no browser equivalent. The two mechanisms are
incompatible at the platform level.

Additionally, the LSP protocol is a JSON-RPC message stream — the server
does not expose a class API with typed methods. Procxy's value proposition
(transparent method proxy across a process boundary) does not map to the
JSON-RPC request/notification model.

## Considered Alternatives

### procxy in lspeasy Node.js path

`lspeasy`'s `IpcTransport` (`packages/core/src/transport/ipc.ts`) and
`StdioTransport` are used when a Node.js process spawns an external LSP
server (e.g. `typescript-language-server --stdio`). procxy's IPC mechanism
duplicates some of this wiring. However:

- The transport layer sends raw JSON-RPC messages, not method calls
- Wrapping JSON-RPC dispatch as typed methods adds complexity without benefit
- lspeasy libraries target zero runtime dependencies; procxy would be a
  runtime dep unless bundled

### procxy in lspeasy test harness

procxy as a **devDependency** in lspeasy's e2e test suite is a viable fit:
managing test LSP server process lifecycle (spawn, health, dispose). This
does not affect production bundle size or the runtime dependency footprint.

## Consequences

- Studio LSP transport continues to use browser Worker + MessagePort via
  `@lspeasy/core`'s `SharedWorkerTransport` / `DedicatedWorkerTransport`.
- procxy dogfood opportunity in this repo: none currently.
- procxy dogfood opportunity in lspeasy: e2e test harness only (devDep).
- Revisit if a future Node.js CLI client for rune-langium needs to spawn and
  manage a local LSP server process.
