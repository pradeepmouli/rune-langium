import { describe, expect, it } from 'vitest';
import { jsonCodec } from '../../src/instances/json-codec.js';

describe('jsonCodec', () => {
  it('parses valid JSON and returns no diagnostics', () => {
    const result = jsonCodec.import('{"name":"Acme"}', 'test.Party');
    expect(result.data).toEqual({ name: 'Acme' });
    expect(result.diagnostics).toEqual([]);
  });

  it('reports a parse-error diagnostic for malformed JSON, distinctly from schema errors', () => {
    const result = jsonCodec.import('{not valid json', 'test.Party');
    expect(result.data).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.kind).toBe('parse-error');
  });

  it('canTarget accepts any type FQN (plain-JSON codec has no schema of its own to match against)', () => {
    expect(jsonCodec.canTarget('anything.At.All')).toBe(true);
  });
});
