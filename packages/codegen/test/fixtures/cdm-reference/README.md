# Pinned CDM reference battery

These fixtures retain selected upstream declarations from CDM 7.0.0 and its
matched Rune 10.2.2 / FpML 3.2.0 dependency workspace. `sources.json` records
commits, source paths and fixture SHA-256 digests. The parser inserts optional
functional brackets before CST extraction; no function bodies are authored by
the fixture builder. Upstream CDM/Rune sources retain their Apache-2.0 ownership
and licensing; see the pinned repositories' LICENSE and NOTICE files.

`cases.json` records 117 cases across 12 functions evaluated by the unmodified
published `finos-cdm==7.0.0` Python bindings. `coverage.json` records exact
coverage, representation rules and known oracle defects. This does not establish
parity for every CDM function or native implementation. Of the 117 cases, 116
match Python; `StringEquals-07` asserts Rune’s null-safe Java contract and
records the differing Python result with its pinned upstream source link.

`func-fidelity-matrix.test.ts` links and strictly compiles all generated modules.
Studio's `cdm-reference-parity.test.ts` executes every case through the production
codegen worker, including its real input adapters and generated module loader.
Neither test requires Python, network access or a staged `.resources` directory.

Regenerate from the repository root:

```sh
pnpm --filter @rune-langium/core run build
pnpm --filter @rune-langium/codegen run build
node --max-old-space-size=4096 scripts/build-serialized-artifacts.mjs --sources scripts/fixtures/cdm-reference/sources.json --out-dir dist/cdm-reference-artifacts --cache-dir dist/cdm-reference-cache
node scripts/build-cdm-reference-fixtures.mjs
uv venv --python 3.13 .venv-cdm-reference
uv pip install --python .venv-cdm-reference/bin/python -r scripts/fixtures/cdm-reference/requirements.txt
.venv-cdm-reference/bin/python scripts/cdm-reference-oracle.py
pnpm exec oxfmt packages/codegen/test/fixtures/cdm-reference/*.json
pnpm --filter @rune-langium/codegen exec vitest run test/func-fidelity-matrix.test.ts
pnpm --filter @rune-langium/studio exec vitest run test/workers/cdm-reference-parity.test.ts
```

The oracle regeneration fails on unexpected exceptions or missing named
precondition errors. It checks every installed requirement version before
recording outputs. The TypeScript tests fail each mismatch individually.
