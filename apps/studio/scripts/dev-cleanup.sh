#!/usr/bin/env sh
# Kill dev:full-port listeners that BELONG TO THIS PROJECT, leaving external
# processes (other repos' Vite servers, IDE-owned node, etc.) alone.
#
# Codex review on PR #210 flagged the prior blanket `kill PID` as a
# blast-radius hazard: with predev:full running this script automatically,
# a stale :5173 listener from another local project would be silently
# terminated mid-task. Scoping by CWD avoids that without requiring
# pidfile coordination between dev:full's spawn and this cleanup —
# spawning processes (vite, wrangler, lsp-worker, curated-mirror-worker)
# all inherit their CWD from `pnpm --filter` which runs inside the
# package directory, so their CWD reliably falls under this repo root.
#
# Idempotent: silently no-ops if a port is already free. Safe to run when
# nothing is broken. External-process listeners produce a warning rather
# than being killed; if you really want them dead, kill them yourself.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# scripts/ → studio/ → apps/ → <repo root>
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PORTS="5173 8788 8789 8790"
killed=0
skipped=0

# Resolve a PID's current working directory via lsof. Works on macOS + Linux
# (Linux lsof reads /proc/PID/cwd; macOS uses its own kernel calls). Returns
# empty if the PID is gone or its CWD isn't readable.
get_pid_cwd() {
  lsof -p "$1" -a -d cwd -F n 2>/dev/null | awk '/^n/ {sub(/^n/, ""); print; exit}'
}

for p in $PORTS; do
  # lsof -t prints only PIDs; -nP skips name+port resolution; -sTCP:LISTEN
  # filters to listeners (excludes ephemeral inbound connections).
  pids=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null || true)
  [ -z "$pids" ] && continue

  for pid in $pids; do
    [ -z "$pid" ] && continue
    cwd=$(get_pid_cwd "$pid")
    if [ -z "$cwd" ]; then
      echo "[dev-cleanup] skipping PID $pid on :$p — cwd unreadable (process may have exited)"
      continue
    fi
    case "$cwd" in
      "$PROJECT_ROOT"|"$PROJECT_ROOT"/*)
        echo "[dev-cleanup] killing PID $pid on :$p"
        kill -TERM "$pid" 2>/dev/null || true
        killed=1
        ;;
      *)
        echo "[dev-cleanup] skipping PID $pid on :$p — held by external project ($cwd)"
        skipped=1
        ;;
    esac
  done
done

if [ "$killed" -eq 1 ]; then
  # Brief settle window so the next bind doesn't race the kernel releasing
  # the socket. macOS releases nearly instantly; this is for slow CI/Linux.
  sleep 1
fi

if [ "$skipped" -eq 1 ]; then
  echo "[dev-cleanup] warning: one or more dev ports held by external processes; pnpm dev:full may fail to bind. Kill them manually if needed."
fi

echo "[dev-cleanup] dev ports clear (5173, 8788, 8789, 8790)"
