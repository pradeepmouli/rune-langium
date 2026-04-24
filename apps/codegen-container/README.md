# @rune-langium/codegen-container

Container image for the hosted codegen service used by the CF deployment of Rune Studio.
See `specs/011-export-code-cf/` for full context.

## What's inside

- **Java 21 JRE** (eclipse-temurin base)
- **`rosetta-code-generators`** cloned + Maven-built at a pinned commit (see `ARG ROSETTA_COMMIT` in the Dockerfile)
- **`CodegenCli.java`** (from `packages/codegen/server/`) compiled against the above classpath
- **Node 20** runtime hosting a thin HTTP wrapper (`dist/server.js`) that spawns the CLI per request
- JSON-over-HTTP contract identical to the local `pnpm codegen:start` service — see `specs/011-export-code-cf/contracts/http-generate.md` and `http-health.md`

## Build

The container expects the **repo root** as the Docker build context (not this subfolder) so the Dockerfile can `COPY packages/codegen/server/src` into the builder stage.

```bash
# One time, or whenever packages/codegen/server/src changes:
pnpm --filter @rune-langium/codegen-container build:ts

# Build the image (run from repo root):
docker build -f apps/codegen-container/Dockerfile -t rune-codegen .
# Or via the package script (which runs from the subfolder but sets the context correctly):
pnpm --filter @rune-langium/codegen-container build
```

## Pinning `rosetta-code-generators`

Reproducibility requires pinning upstream. **Before the first real deploy**, update the `ROSETTA_COMMIT` build arg to a verified tag or SHA:

```dockerfile
ARG ROSETTA_COMMIT=<verified-sha>   # not 'main' in production
```

Procedure to bump:
1. Verify upstream compiles and the local `packages/codegen/server/build.sh` flow still works against the target revision.
2. Update `ROSETTA_COMMIT` in `Dockerfile`.
3. Rebuild + run `apps/codegen-container/test/container-parity.test.ts` (requires Docker) to confirm byte-equivalent output against `pnpm codegen:start`.
4. Publish the image via `pnpm --filter @rune-langium/codegen-container publish` and redeploy the Worker (which references it by tag).

## Local run

```bash
docker run --rm -p 8080:8080 rune-codegen
curl -s http://localhost:8080/api/generate/health | jq
```

## Deploy

See `specs/011-export-code-cf/quickstart.md` for the one-time CF Container Registry push and Worker binding setup.
