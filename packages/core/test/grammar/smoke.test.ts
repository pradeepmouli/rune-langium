import { describe, it, expect } from 'vitest';
import { parse } from '../../src/api/parse.js';

describe('Grammar Smoke Tests', () => {
  it('should parse an empty RosettaModel', async () => {
    const result = await parse('namespace test.model');
    expect(result.hasErrors).toBe(false);
    expect(result.value.name).toBe('test.model');
  });

  it('should parse a namespace with version', async () => {
    const result = await parse('namespace com.example version "1.0.0"');
    expect(result.hasErrors).toBe(false);
    expect(result.value.name).toBe('com.example');
    expect(result.value.version).toBe('1.0.0');
  });

  it('should parse a simple data type', async () => {
    const input = `namespace test.types
type Foo:
  bar string (1..1)
`;
    const result = await parse(input);
    expect(result.hasErrors).toBe(false);
    expect(result.value.elements).toHaveLength(1);
  });

  it('should parse an enum', async () => {
    const input = `namespace test.direction
enum Direction:
  North
  South
  East
  West
`;
    const result = await parse(input);
    expect(result.hasErrors).toBe(false);
    expect(result.value.elements).toHaveLength(1);
  });

  it('should report errors for invalid input', async () => {
    const result = await parse('this is not valid rosetta');
    expect(result.hasErrors).toBe(true);
  });
});
