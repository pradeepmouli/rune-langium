// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TEST-ONLY bare-rule parse helper for the three synonym grammar rules
 * (`RosettaSynonym` / `RosettaClassSynonym` / `RosettaEnumSynonym`).
 *
 * Mirrors core's `parseExpression` (`packages/core/src/api/parse-expression.ts`)
 * — `LangiumParser.parse(text, { rule })` against a shared services instance,
 * no document, no linking. Langium registers every parser rule, so this works
 * for any named rule, not just `ExpressionWithAsKey`.
 *
 * Deliberately NOT promoted to a public core API (YAGNI per the P5 design doc
 * — "No public `parseSynonym` core API (test-internal helper only)"). Shared
 * by synonym-roundtrip.test.ts and synonym-corpus-sweep.test.ts.
 */

import { createRuneDslServices } from '@rune-langium/core';

/**
 * Bare-rule names for the synonym grammar family. `RosettaExternalEnumSynonym`
 * is included because it `infers RosettaEnumSynonym` (grammar: same output
 * `$type`, different — `synonym`-keyword-less, sources-less — surface syntax,
 * used inside `RosettaExternalEnumValue.externalEnumSynonyms`). Extraction
 * must pick the matching rule NAME (not just the shared `$type`) to reparse
 * correctly — see synonym-corpus-sweep.test.ts's corpus finding.
 */
export type SynonymRuleName =
  | 'RosettaSynonym'
  | 'RosettaClassSynonym'
  | 'RosettaEnumSynonym'
  | 'RosettaExternalEnumSynonym';

export interface SynonymParseResult<T = unknown> {
  value: T;
  hasErrors: boolean;
  parserErrors: unknown[];
  lexerErrors: unknown[];
}

let _services: ReturnType<typeof createRuneDslServices> | undefined;

function services(): ReturnType<typeof createRuneDslServices> {
  if (!_services) _services = createRuneDslServices();
  return _services;
}

/** Parse a bare `[synonym ...]` snippet against one of the three synonym rules. */
export function parseSynonymRule<T = unknown>(text: string, rule: SynonymRuleName): SynonymParseResult<T> {
  const result = services().RuneDsl.parser.LangiumParser.parse<T>(text, { rule });
  const lexerErrors = result.lexerErrors ?? [];
  const parserErrors = result.parserErrors ?? [];
  return {
    value: result.value,
    lexerErrors,
    parserErrors,
    hasErrors: lexerErrors.length > 0 || parserErrors.length > 0
  };
}
