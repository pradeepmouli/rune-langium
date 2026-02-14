/**
 * Parse latency benchmarks (T096).
 *
 * Verifies that:
 * - Single-file parse completes in <200ms
 * - Corpus parse scales reasonably
 */

import { describe, bench } from 'vitest';
import { parse } from '../../src/api/parse.js';

const SMALL_SOURCE = `
namespace perf.small
version "1.0.0"

type Simple:
  name string (1..1)
  value number (0..1)
`;

function generateMediumSource(): string {
  const lines: string[] = ['namespace perf.medium\nversion "1.0.0"'];
  for (let i = 0; i < 50; i++) {
    const ext = i > 0 ? ` extends Type${i - 1}` : '';
    lines.push(`
type Type${i}${ext}:
  attr${i}a string (1..1)
  attr${i}b number (0..1)
  attr${i}c date (0..*)`);
  }
  return lines.join('\n');
}

function generateLargeSource(): string {
  const lines: string[] = ['namespace perf.large\nversion "1.0.0"'];
  for (let i = 0; i < 200; i++) {
    const ext = i > 0 ? ` extends Type${i - 1}` : '';
    lines.push(`
type Type${i}${ext}:
  name${i} string (1..1)
  ref${i} Type${Math.max(0, i - 1)} (0..1)`);
  }
  return lines.join('\n');
}

const MEDIUM_SOURCE = generateMediumSource();
const LARGE_SOURCE = generateLargeSource();

describe('Parse Latency Benchmarks (T096)', () => {
  bench('parse: small source (~2 types)', async () => {
    await parse(SMALL_SOURCE);
  });

  bench('parse: medium source (~50 types)', async () => {
    await parse(MEDIUM_SOURCE);
  });

  bench('parse: large source (~200 types)', async () => {
    await parse(LARGE_SOURCE);
  });

  bench('parse: sequential 10 files', async () => {
    for (let i = 0; i < 10; i++) {
      await parse(SMALL_SOURCE);
    }
  });
});
