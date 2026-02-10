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

describe('External Source Parsing (T093)', () => {
  it('should parse a synonym source', async () => {
    const result = await parseOk(`
      namespace test.external
      version "1.0.0"

      synonym source FpML
    `);
    expect(result.hasErrors).toBe(false);
  });

  it('should parse a synonym source that extends another', async () => {
    const result = await parseOk(`
      namespace test.external
      version "1.0.0"

      synonym source FpML
      synonym source FpML_5_10 extends FpML {
      }
    `);
    expect(result.hasErrors).toBe(false);
  });

  it('should parse an external rule source', async () => {
    const result = await parseOk(`
      namespace test.external
      version "1.0.0"

      type Trade:
        amount number (1..1)

      rule source ESMA_EMIR {
      }
    `);
    expect(result.hasErrors).toBe(false);
  });
});
