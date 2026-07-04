// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CDM smoke test for the JSON Schema importer (specs/021-codegen-inbound
 * Phase 1 item 8).
 *
 * Expected location (NOT downloaded by this test or by CI — the same
 * "skip cleanly when the fixture isn't present" convention as the
 * outbound `cdm-smoke.test.ts`'s CDM-fixture `it.todo`s, which likewise
 * document an expected `packages/curated-schema/fixtures/cdm/` path
 * without downloading it):
 *
 *   .resources/cdm-json-schema/cdm.schema.json
 *
 * A FINOS CDM JSON Schema distribution (or a hand-assembled subset of one)
 * placed at that path activates this suite. Neither `.resources/cdm/`
 * (the existing CDM *Rosetta source* corpus, `.rosetta` files, unrelated —
 * used by the outbound `us12-cdm-corpus.test.ts` and friends) nor
 * `packages/curated-schema/` currently contains a JSON Schema distribution
 * of CDM, so this suite is expected to be SKIPPED in this environment —
 * that is the correct, documented behavior, not a failure.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { importModel } from '../../src/import/index.js';

const CDM_JSON_SCHEMA_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../../../.resources/cdm-json-schema/cdm.schema.json'
);

// `describe.skipIf`/`it.skipIf` evaluate their condition at COLLECTION time
// (before any `beforeAll` hook runs) — an async `access()` check inside
// `beforeAll` never resolves in time to gate `skipIf`, silently making the
// gate a no-op (verified empirically: a `beforeAll`-set flag is still its
// PRE-hook initial value when `skipIf` reads it). `existsSync` at module
// scope is synchronous and evaluates before collection completes, so it
// actually gates correctly.
const fixturePresent = existsSync(CDM_JSON_SCHEMA_PATH);

describe.skipIf(!fixturePresent)('CDM smoke — JSON Schema importer', () => {
  it(`imports the FINOS CDM JSON Schema distribution at ${CDM_JSON_SCHEMA_PATH} and produces zero-parse-error .rune output`, async () => {
    const schemaText = await readFile(CDM_JSON_SCHEMA_PATH, 'utf-8');
    const result = importModel(schemaText, { from: 'json-schema' });

    expect(result.model.types.length + result.model.enums.length).toBeGreaterThan(0);

    const parseResult = await parse(result.text);
    if (parseResult.hasErrors) {
      throw new Error(
        `CDM import produced .rune text with parse errors:\n${JSON.stringify([...parseResult.lexerErrors, ...parseResult.parserErrors], null, 2)}`
      );
    }
    expect(parseResult.hasErrors).toBe(false);
  }, 60_000);
});

// Always-runs marker so `pnpm test` output makes the skip reason visible
// even when the fixture is absent (vitest silently omits `describe.skipIf`
// blocks from the summary otherwise).
it.skipIf(fixturePresent)(
  `CDM smoke test SKIPPED — no JSON Schema distribution at ${CDM_JSON_SCHEMA_PATH} (expected in this environment; see module doc)`,
  () => {
    expect(fixturePresent).toBe(false);
  }
);
