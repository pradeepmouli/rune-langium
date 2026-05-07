#!/bin/bash
set -e

# Ensure pnpm is available (matches the version used by the Studio workflow).
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10.32.0 --quiet
fi

# Sync workspace dependencies after a task merge that may have touched
# package.json or pnpm-lock.yaml. The Studio Dev Server workflow rebuilds
# all workspace packages on restart, so we only need deps in place here.
pnpm install --frozen-lockfile
