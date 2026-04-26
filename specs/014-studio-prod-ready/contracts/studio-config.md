# Contract — Studio Build-Time Config

**Spec hooks**: FR-014, FR-015, FR-021, FR-022.

The Studio is a Vite-built browser app; its build-time configuration
flows through `import.meta.env.*` with the `VITE_` prefix. This
contract enumerates the new env vars introduced by feature 014, their
purpose, defaults, and the runtime gate they drive.

---

## New / changed env vars

| Var | Default | Purpose |
|---|---|---|
| `VITE_LSP_WS_URL` | `ws://localhost:3001` (dev) / `wss://www.daikonic.dev/rune-studio/api/lsp` (prod) | FR-021 — LSP host base URL. The studio appends `/ws/<sessionToken>` at runtime. Lets a contributor with a remote LSP host point at it. |
| `VITE_LSP_SESSION_URL` | derived from `VITE_LSP_WS_URL` | Endpoint for `POST /lsp/session`. Same host, http(s) scheme. |
| `VITE_TELEMETRY_ENDPOINT` | derived from `location.origin` (existing) | Already shipped in 012. Listed here for completeness; FR-021's "make hosts configurable" applies. |
| `VITE_DEV_MODE` | `true` if `import.meta.env.DEV`, else `false` | FR-014 — gates dev-only copy. The status bar's `ws://localhost:3001` instruction text is shown ONLY when this is true. |
| `VITE_LEGACY_GIT_PATH` | `false` | FR-019 — when `true`, re-enables the legacy `cors.isomorphic-git.org` clone fallback. Production builds default to `false`; only contributors testing the legacy path locally flip it on. |

---

## Validation

Vite imports the env at build time. Studio's `apps/studio/src/config.ts`
(new file) reads + validates them:

```ts
const Config = z.object({
  lspWsUrl: z.string().url().refine(u => u.startsWith('ws://') || u.startsWith('wss://')),
  lspSessionUrl: z.string().url(),
  telemetryEndpoint: z.string().url(),
  devMode: z.boolean(),
  legacyGitPathEnabled: z.boolean()
}).strict();
```

Build fails if any var is missing or fails validation; a typo in an
env name fails fast rather than silently degrading at runtime.

---

## Runtime gates

```ts
import { config } from './config.js';

// FR-014: dev-only copy
if (config.devMode) {
  setStatusError('LSP server unavailable — start with: pnpm dev:lsp');
} else {
  setStatusError('Editor running offline — language services unavailable');
}

// FR-019: legacy git fallback opt-in
if (source.archiveUrl) {
  return loadCuratedModel({...}); // primary path
}
if (config.legacyGitPathEnabled) {
  return cloneViaIsomorphicGit({...}); // dev-only fallback
}
throw new ModelLoadError('unknown', 'No archive URL and legacy fallback disabled');
```

---

## Build matrices

| Build target | `pnpm build` cmd | Resulting env defaults |
|---|---|---|
| Local dev | `pnpm dev` | `devMode=true`, `legacyGitPathEnabled=false`, `lspWsUrl=ws://localhost:3001` |
| Production (CF Pages) | `pnpm --filter @rune-langium/studio build` (with CF env injection) | `devMode=false`, `legacyGitPathEnabled=false`, `lspWsUrl=wss://www.daikonic.dev/rune-studio/api/lsp` |
| Storybook / fixtures | `pnpm test` | `devMode=true`, `legacyGitPathEnabled=true` (matches today's test fixtures) |

---

## Migration notes

Existing 012 callers that hard-coded `ws://localhost:3001` (one
known site: `apps/studio/src/services/transport-provider.ts:90`-ish)
MUST switch to `config.lspWsUrl`. A grep for `ws://localhost:3001`
in `apps/studio/src/` MUST return zero hits before Phase 4 ships.
