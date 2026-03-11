/**
 * Generate Zod schemas from the Rune DSL grammar.
 *
 * Runs after `langium generate` to produce `src/generated/zod-schemas.ts`.
 * Invoked via `pnpm generate` (chained) or `pnpm generate:zod` (standalone).
 *
 * Usage:
 *   pnpm --filter @rune-langium/core generate:zod
 */

import { generateZodSchemas } from 'langium-zod';
import { createRuneDslServices } from '../src/services/rune-dsl-module.js';
import { RuneDslGrammar } from '../src/generated/grammar.js';

const OUTPUT_PATH = 'src/generated/zod-schemas.ts';

const { RuneDsl: services } = createRuneDslServices();

generateZodSchemas({
  grammar: RuneDslGrammar(),
  services,
  outputPath: OUTPUT_PATH,
  // BigDecimal is a parser-based datatype rule composed of INT + literal tokens.
  // Langium cannot auto-derive a regex for multi-element parser sequences, so we
  // provide it manually.
  //   Grammar: ('+' | '-')? ('.' INT | INT '.' INT?) (('e' | 'E') ('+' | '-')? INT)?
  //   INT = /[0-9]+/
  regexOverrides: {
    BigDecimal: String.raw`^[+-]?(\.[0-9]+|[0-9]+\.[0-9]*)([eE][+-]?[0-9]+)?$`
  }
});

console.log(`✓ Generated ${OUTPUT_PATH}`);
