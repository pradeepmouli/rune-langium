---
name: Studio dev:full local setup
description: Config required for all four dev:full services to connect in the Replit environment; these edits live only in this workspace, not on origin.
---

# Studio dev:full in Replit

Upstream assumes vite on :5173; Replit preview needs :5000. Five local-only config changes make the full stack (vite + lsp-worker + curated-mirror + pages functions) work:

1. `apps/studio/wrangler.toml` — `ALLOWED_ORIGIN` must include `http://localhost:5000`, `http://127.0.0.1:5000`, AND `https://*.replit.dev` (webview/canvas iframe sends the replit.dev origin; the matcher in functions/lib/lsp-auth.ts supports `scheme://*.suffix` wildcards, so the wildcard survives domain rotation). Missing → 403 `origin_not_allowed` on `/api/lsp/session`.
2. `apps/studio/.dev.vars` + `apps/lsp-worker/.dev.vars` — matching `SESSION_SIGNING_KEY` (any hex string, must be identical in both). Missing → 500 `signing_key_not_configured`.
3. `apps/studio/vite.config.ts` — `server.proxy` forwarding `/api` → `http://localhost:8788` (the wrangler pages dev server) with `ws: true` (LSP uses WebSocket upgrade on `/api/lsp/ws`). Missing proxy → 404/502 on session mint; missing `ws: true` → session mints OK but WS connect fails ("Pages Function LSP step failed" in ws-transport).
4. `apps/studio/package.json` — `predev:full` without `pnpm build` (workflow already builds), `dev:full` with `--kill-others-on-fail` instead of `-k`.
5. Root `package.json` — remove `"packageManager"` field (corepack under Replit nix causes OOM); workflow installs pnpm globally via npm instead.
6. Workflow must end with `dev:full`, not `dev` (vite alone → no pages functions → 502).

**Why:** origin doesn't carry these (macOS devs use 5173); any `git reset --hard origin/master` wipes items 1, 3, 4, 5 and the workflow build list. `.dev.vars` files are gitignored and survive.

**How to apply:** after pulling/resetting, re-apply the edits, add any new workspace packages (e.g. `instrumentation-core`) to the workflow's build chain in `.replit`, run `CI=true pnpm install` in the shell first (workflow's interactive pnpm prompt hangs otherwise), then restart the workflow.

## Styling gotchas (Aug 2026)
- dock-theme.css sash rules are DUPLICATED (layered + unlayered copies) — edit both. Never apply `top/bottom:0 !important` to all sashes; it overrides dockview's inline `top:Npx` on vertical-split sashes and makes the bottom tray non-resizable.
- Studio app.css `@layer components` rules lose to Tailwind's `@layer utilities` (button variant hover/active classes). Interaction-state overrides for chrome buttons must be unlayered (see `.studio-chrome-button:active`).
