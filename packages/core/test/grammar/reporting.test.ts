import { describe, it, expect } from 'vitest';
import { parse } from '../../src/index.js';
import type { RosettaModel } from '../../src/index.js';

/**
 * Helper: parse and assert no errors.
 */
async function parseOk(input: string) {
  const result = await parse(input);
  const allErrors = [
    ...result.lexerErrors.map((e) => `Lexer: ${e.message}`),
    ...result.parserErrors.map((e) => `Parser: ${e.message}`)
  ];
  expect(allErrors, allErrors.join('\n')).toHaveLength(0);
  return result;
}

describe('Reporting Parsing (T091)', () => {
  it('should parse a report definition', async () => {
    const result = await parseOk(`
      namespace test.reports
      version "1.0.0"

      type Trade:
        tradeDate date (1..1)

      type TradeReport:
        date date (1..1)
    `);
    expect(result.hasErrors).toBe(false);
  });

  it('should parse a rule definition', async () => {
    const result = await parseOk(`
      namespace test.reports
      version "1.0.0"

      type Trade:
        tradeDate date (1..1)

      reporting rule DateRule from Trade:
        Trade -> tradeDate
    `);
    expect(result.hasErrors).toBe(false);
  });

  it('should parse eligibility rule', async () => {
    const result = await parseOk(`
      namespace test.reports
      version "1.0.0"

      type Trade:
        notional number (1..1)

      eligibility rule BigTrade from Trade:
        Trade -> notional > 1000000
    `);
    expect(result.hasErrors).toBe(false);
  });
});
