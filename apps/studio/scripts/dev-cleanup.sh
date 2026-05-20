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

# -----------------------------------------------------------------------------
# Chrome-MCP orphan reap
# -----------------------------------------------------------------------------
# When a Claude Code MCP session dies abnormally (parent killed, sleep/wake,
# Claude UI quit mid-trace) the chrome processes it spawned for
# @playwright/mcp and chrome-devtools-mcp can survive as orphans. They hold a
# user-data-dir SingletonLock, which prevents the NEXT MCP session from
# launching chrome against the same profile — Playwright then refuses to
# navigate. A prod-smoke pass had to manually `kill` 7 such orphans plus
# their lock symlinks before chrome would relaunch.
#
# Ownership scoping (mirrors the port loop's CWD guard, but adapted):
# chrome inherits CWD `/` from its MCP parent, so a literal CWD-under-repo
# check would skip every chrome process. Instead, we scope by --user-data-dir
# path — only chrome instances whose user-data-dir lives under one of these
# MCP-owned cache roots are considered. The user's daily-driver Chrome
# (~/Library/Application Support/Google/Chrome on macOS,
#  ~/.config/google-chrome on Linux) is never matched.
#
# Liveness check: chrome writes its own PID into a SingletonLock symlink
# (target format: "hostname-PID"). If that PID is alive, the user-data-dir
# belongs to a live MCP session — skip every chrome process pointing at it.
# If the PID is dead OR the lock is missing entirely, every chrome process
# claiming that dir is an orphan and gets TERM'd; the stale lock is removed
# so the next session can bind cleanly.
#
# Idempotent: if there are no orphans and no stale locks, the section is a
# silent no-op (no log spam on every `pnpm dev:full`).

# Newline-delimited so paths containing spaces (e.g. a `$HOME` like
# `/Users/Some Name/...`) survive iteration intact; consumer loops below
# use `while IFS= read -r` to honor the boundaries instead of relying on
# shell word-splitting (Copilot review on PR #213). Allow-list covers
# macOS Playwright (Library/Caches/ms-playwright) AND Linux Playwright
# (~/.cache/ms-playwright — Codex P2 review on PR #213) PLUS
# chrome-devtools-mcp which uses ~/.cache on both platforms.
MCP_USER_DATA_DIR_ROOTS="$HOME/Library/Caches/ms-playwright
$HOME/.cache/ms-playwright
$HOME/.cache/chrome-devtools-mcp"

mcp_killed=0
mcp_skipped_live=0
mcp_locks_removed=0

# Read a SingletonLock symlink's target and extract the PID (last "-"
# segment). Returns empty if the file isn't a symlink or doesn't parse.
read_singleton_lock_pid() {
  lock_path="$1"
  [ -L "$lock_path" ] || return 0
  target=$(readlink "$lock_path" 2>/dev/null) || return 0
  # Target shape: "<hostname>-<PID>" — strip everything through the last "-".
  pid=$(printf '%s\n' "$target" | sed 's/.*-//')
  case "$pid" in
    ''|*[!0-9]*) return 0 ;;
    *) printf '%s\n' "$pid" ;;
  esac
}

# Print every chrome process PID whose --user-data-dir= flag exactly equals
# the given directory. `ps -ax -o pid,command` works on macOS + Linux
# (Copilot review on PR #213 — the prior comment overpromised POSIX
# portability; `-ax` is BSD-style and `-o command=` isn't in POSIX-1).
# The awk match anchors on the exact flag value to avoid prefix collisions
# (mcp-chrome-abc vs mcp-chrome-abc123).
pids_for_user_data_dir() {
  target_dir="$1"
  ps -ax -o pid=,command= 2>/dev/null | awk -v dir="$target_dir" '
    {
      for (i = 1; i <= NF; i++) {
        if ($i == "--user-data-dir=" dir) {
          print $1
          next
        }
      }
    }
  '
}

# Collect every MCP-owned user-data-dir we should consider — both from
# processes currently advertising one, and from on-disk SingletonLocks
# (which may outlive the chrome process that wrote them).
collect_mcp_user_data_dirs() {
  {
    # From running processes.
    ps -ax -o command= 2>/dev/null | tr ' ' '\n' | \
      awk -F= '/^--user-data-dir=/ { print $2 }'
    # From on-disk locks under each known root. Set IFS to newline so the
    # `for root` loop splits $MCP_USER_DATA_DIR_ROOTS on newlines only —
    # paths containing spaces (e.g. `$HOME` like `/Users/Some Name/...`)
    # iterate intact (Copilot review on PR #213).
    OLDIFS=$IFS
    IFS='
'
    for root in $MCP_USER_DATA_DIR_ROOTS; do
      [ -d "$root" ] || continue
      # -maxdepth 3 covers ms-playwright/<dir>/SingletonLock and
      # chrome-devtools-mcp/<dir>/SingletonLock. SingletonLock IS a
      # symlink — we want the lock's own path, not its target, so we do
      # NOT pass -L to find (Copilot review on PR #213 — earlier comment
      # incorrectly claimed `-L` was used).
      find "$root" -maxdepth 3 -name SingletonLock 2>/dev/null | \
        while IFS= read -r lock; do
          dirname "$lock"
        done
    done
    IFS=$OLDIFS
  } | sort -u
}

# IFS-to-newline so the outer `for udd` and inner `for root` both split on
# newline only — handles paths with spaces correctly (Copilot review on
# PR #213). Restored at the end of the section to avoid leaking IFS into
# the rest of the script.
OLDIFS=$IFS
IFS='
'
for udd in $(collect_mcp_user_data_dirs); do
  [ -n "$udd" ] || continue
  # Path allow-list: must live under a known MCP cache root. Anything else
  # (the user's regular Chrome profile, a Playwright test run from another
  # project, an Arc/Brave profile) is silently ignored.
  match=0
  for root in $MCP_USER_DATA_DIR_ROOTS; do
    case "$udd" in
      "$root"/*) match=1; break ;;
    esac
  done
  [ "$match" -eq 1 ] || continue

  lock_pid=""
  if [ -L "$udd/SingletonLock" ]; then
    lock_pid=$(read_singleton_lock_pid "$udd/SingletonLock")
  fi

  chrome_pids=$(pids_for_user_data_dir "$udd")

  # Liveness: the profile is live iff the lock points at a PID that is
  # alive AND that PID currently appears in the chrome processes pinned to
  # this user-data-dir. Just `kill -0` on the lock PID is insufficient —
  # macOS recycles PIDs, and a recycled non-chrome PID would otherwise
  # cause us to preserve an actually-orphan profile forever.
  if [ -n "$lock_pid" ] && [ -n "$chrome_pids" ] && kill -0 "$lock_pid" 2>/dev/null; then
    for cpid in $chrome_pids; do
      if [ "$cpid" = "$lock_pid" ]; then
        echo "[dev-cleanup] skipping live chrome-mcp profile $udd (owner PID $lock_pid)"
        mcp_skipped_live=1
        # Set a flag so the outer loop knows we already handled this dir.
        lock_pid="__live__"
        break
      fi
    done
    [ "$lock_pid" = "__live__" ] && continue
  fi

  # Orphan: lock is stale (or absent) — TERM every chrome process pinned to
  # this user-data-dir, then drop the lock so the next session binds cleanly.
  if [ -n "$chrome_pids" ]; then
    for cpid in $chrome_pids; do
      [ -z "$cpid" ] && continue
      echo "[dev-cleanup] killing orphan chrome-mcp PID $cpid (profile $udd)"
      kill -TERM "$cpid" 2>/dev/null || true
      mcp_killed=1
    done
  fi

  if [ -L "$udd/SingletonLock" ]; then
    echo "[dev-cleanup] removing stale SingletonLock at $udd/SingletonLock"
    rm -f "$udd/SingletonLock" 2>/dev/null || true
    mcp_locks_removed=1
  fi
done
# Restore IFS so the trailing summary echoes below don't inherit our
# newline-only splitting (Copilot review on PR #213 — paired with the
# `OLDIFS=$IFS; IFS=$'\n'` block above the loop).
IFS=$OLDIFS

if [ "$mcp_killed" -eq 1 ]; then
  # Same settle pause rationale as the port loop: give chrome's exit-handler
  # a beat to release the SingletonSocket before the next launch.
  sleep 1
fi

if [ "$mcp_killed" -eq 1 ] || [ "$mcp_locks_removed" -eq 1 ]; then
  echo "[dev-cleanup] chrome-mcp orphans reaped"
fi

if [ "$mcp_skipped_live" -eq 1 ]; then
  echo "[dev-cleanup] note: live chrome-mcp session(s) preserved; an active Claude Code MCP connection is using them."
fi
