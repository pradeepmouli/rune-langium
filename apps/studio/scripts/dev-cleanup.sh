#!/usr/bin/env sh
# Kill any process listening on the dev:full ports so a fresh `pnpm dev:full`
# doesn't fight zombie wranglers/vites from prior sessions.
#
# Background: long-running sessions (and especially `concurrently -k` racing
# with crashed children) sometimes leave detached vite/wrangler/workerd
# processes behind. When the next `dev:full` boots, wrangler errors with
# "Address already in use" on 8788/8789/8790 or vite silently falls back to
# 5174. This hook clears the field before the predev build runs.
#
# Scope is intentionally narrow — we only touch processes on these four
# ports (the canonical dev:full surface). PIDs from `lsof -t` are sent
# SIGTERM. `vitest-vscode` and IDE-owned node processes are unaffected
# because they don't bind to these ports.
#
# Idempotent: silently no-ops if a port is already free. Safe to run when
# nothing is broken.

set -u

PORTS="5173 8788 8789 8790"
killed=0

for p in $PORTS; do
  # lsof -t prints only PIDs; -nP skips name+port resolution; -sTCP:LISTEN
  # filters to listeners (excludes ephemeral inbound connections).
  pids=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    echo "[dev-cleanup] killing PID(s) on :$p — $pids"
    # shellcheck disable=SC2086
    kill -TERM $pids 2>/dev/null || true
    killed=1
  fi
done

if [ "$killed" -eq 1 ]; then
  # Brief settle window so the next bind doesn't race the kernel releasing
  # the socket. macOS releases nearly instantly; this is for slow CI/Linux.
  sleep 1
fi

echo "[dev-cleanup] dev ports clear (5173, 8788, 8789, 8790)"
