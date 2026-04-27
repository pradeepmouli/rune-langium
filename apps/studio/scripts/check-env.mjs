#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Preflight environment check for the studio dev/e2e stack.
 *
 *   pnpm --filter @rune-langium/studio check-env
 *
 * - Verifies Node is ≥20.
 * - Probes the port range the dev server uses (STUDIO_DEV_PORT, then 5173..5180)
 *   and emits `STUDIO_DEV_PORT=<n>` on stdout so callers can `eval $(...)` it.
 * - Probes the LSP server port (3001) and reports whether it's reachable.
 * - Exits non-zero only if NO free port could be found in the candidate range.
 *
 * Designed to be sourced before `pnpm run dev` / `pnpm run test:e2e` so that
 * both vite.config.ts and playwright.config.ts can read the same env var and
 * avoid the classic "dev starts on 5000, Playwright waits on 5173" mismatch
 * (and the macOS AirPlay Receiver owning :5000 by default).
 */

import net from 'node:net';

const CANDIDATE_PORTS = [
  ...(process.env.STUDIO_DEV_PORT ? [Number(process.env.STUDIO_DEV_PORT)] : []),
  5173,
  5174,
  5175,
  5176,
  5177,
  5178,
  5179,
  5180
];

const LSP_PORT = Number(process.env.RUNE_LSP_PORT ?? 3001);
const MIN_NODE = 20;

const stderr = (...msg) => console.error('[check-env]', ...msg);

/**
 * Attempt to bind a TCP server to `127.0.0.1:port`. Resolves to true if the
 * port is free, false if in use. A bind failure for any reason is treated as
 * "taken" — conservative and safe.
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Try to connect to `127.0.0.1:port`. Resolves to true if something is
 * listening, false otherwise.
 */
function isPortListening(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1', timeout: 500 });
    sock.once('connect', () => {
      sock.end();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < MIN_NODE) {
    stderr(`Node ${process.versions.node} is below required ${MIN_NODE}.x`);
    process.exit(1);
  }
  stderr(`Node ${process.versions.node} ✓`);

  let chosen;
  for (const port of CANDIDATE_PORTS) {
    if (!Number.isFinite(port) || port < 1024 || port > 65535) continue;
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) {
      chosen = port;
      break;
    }
    stderr(`port ${port} is in use — trying next…`);
  }

  if (chosen === undefined) {
    stderr(`no free port found in the candidate range (${CANDIDATE_PORTS.join(', ')}).`);
    stderr('set STUDIO_DEV_PORT to an explicit free port and retry.');
    process.exit(1);
  }

  stderr(`studio dev port: ${chosen} ✓`);

  const lspUp = await isPortListening(LSP_PORT);
  stderr(
    `LSP server (:${LSP_PORT}): ${
      lspUp
        ? 'listening ✓'
        : 'not running — start with `pnpm --filter @rune-langium/lsp-server start` if you need full e2e coverage.'
    }`
  );

  // Emit the shell-eval'able assignment on stdout so callers can:
  //   eval "$(node scripts/check-env.mjs)"
  //   pnpm run dev
  console.log(`export STUDIO_DEV_PORT=${chosen}`);
}

main().catch((err) => {
  stderr('unexpected failure:', err);
  process.exit(1);
});
