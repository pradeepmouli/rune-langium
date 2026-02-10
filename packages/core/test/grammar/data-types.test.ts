import { describe, it, expect } from 'vitest';
import { parse } from '../../src/api/parse.js';
import type { RosettaModel } from '../../src/generated/ast.js';

/**
 * Assert no parse errors and return the model value.
 */
function expectNoErrors(result: {
  hasErrors: boolean;
  value: RosettaModel;
  parserErrors: unknown[];
  lexerErrors: unknown[];
}) {
  if (result.hasErrors) {
    const messages = [
      ...result.parserErrors.map((e) => (e as { message?: string }).message),
      ...result.lexerErrors.map((e) => (e as { message?: string }).message)
    ];
    expect.fail(`Parse errors: ${messages.join('; ')}`);
  }
  return result.value;
}

// ──────────────────────────────────────────────
// T045: Data type parsing tests
// ──────────────────────────────────────────────
describe('Data Type Parsing Tests', () => {
  it('should parse a simple data type', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (1..1)
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(1);
  });

  it('should parse a data type with extends', async () => {
    const result = await parse(`namespace test.model
type Bar:
  name string (1..1)

type Foo extends Bar:
  age int (0..1)
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(2);
  });

  it('should parse a data type with multiple attributes', async () => {
    const result = await parse(`namespace test.model
type Person:
  name string (1..1)
  age int (0..1)
  active boolean (1..1)
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(1);
  });

  it('should parse a data type with a condition', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (1..1)
  condition Check:
    bar exists
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(1);
  });

  it('should parse a data type with description', async () => {
    const result = await parse(`namespace test.model
type Foo:
  <"A foo data type">
  bar string (1..1)
`);
    expectNoErrors(result);
  });

  it('should parse a basic type', async () => {
    const result = await parse(`namespace test.model
basicType string
`);
    expectNoErrors(result);
  });

  it('should parse a type alias', async () => {
    const result = await parse(`namespace test.model
typeAlias MyString:
  string
`);
    expectNoErrors(result);
  });
});

// ──────────────────────────────────────────────
// T046: Choice parsing tests
// ──────────────────────────────────────────────
describe('Choice Parsing Tests', () => {
  it('should parse a simple choice type', async () => {
    const result = await parse(`namespace test.model
type Foo:
  name string (1..1)

type Bar:
  value int (1..1)

choice Baz:
  Foo
  Bar
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(3);
  });

  it('should parse a choice with description', async () => {
    const result = await parse(`namespace test.model
type Foo:
  name string (1..1)

type Bar:
  value int (1..1)

choice Baz:
  <"A choice between Foo and Bar">
  Foo
  Bar
`);
    expectNoErrors(result);
  });
});

// ──────────────────────────────────────────────
// T047: Enum parsing tests
// ──────────────────────────────────────────────
describe('Enum Parsing Tests', () => {
  it('should parse a simple enum', async () => {
    const result = await parse(`namespace test.model
enum Direction:
  North
  South
  East
  West
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(1);
  });

  it('should parse an enum with display names', async () => {
    const result = await parse(`namespace test.model
enum Status:
  Active displayName "Active Status"
  Inactive displayName "Inactive Status"
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(1);
  });

  it('should parse an enum with definitions', async () => {
    const result = await parse(`namespace test.model
enum Currency:
  <"Currency codes">
  USD <"US Dollar">
  EUR <"Euro">
  GBP <"British Pound">
`);
    expectNoErrors(result);
  });
});

// ──────────────────────────────────────────────
// T049: Cardinality parsing tests
// ──────────────────────────────────────────────
describe('Cardinality Parsing Tests', () => {
  it('should parse (1..1) single required', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (1..1)
`);
    expectNoErrors(result);
  });

  it('should parse (0..1) optional', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (0..1)
`);
    expectNoErrors(result);
  });

  it('should parse (0..*) optional list', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (0..*)
`);
    expectNoErrors(result);
  });

  it('should parse (1..*) required list', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (1..*)
`);
    expectNoErrors(result);
  });

  it('should parse (2..5) bounded range', async () => {
    const result = await parse(`namespace test.model
type Foo:
  bar string (2..5)
`);
    expectNoErrors(result);
  });
});

// ──────────────────────────────────────────────
// T051: Namespace and import parsing tests
// ──────────────────────────────────────────────
describe('Namespace and Import Parsing Tests', () => {
  it('should parse namespace declaration', async () => {
    const result = await parse(`namespace foo.bar
`);
    const model = expectNoErrors(result);
    expect(model.name).toBe('foo.bar');
  });

  it('should parse namespace with version', async () => {
    const result = await parse(`namespace foo.bar version "1.0.0"
`);
    const model = expectNoErrors(result);
    expect(model.name).toBe('foo.bar');
    expect(model.version).toBe('1.0.0');
  });

  it('should parse import statement', async () => {
    const result = await parse(`namespace test.model
import foo.bar.*
`);
    const model = expectNoErrors(result);
    expect(model.imports).toHaveLength(1);
  });

  it('should parse multiple imports', async () => {
    const result = await parse(`namespace test.model
import foo.bar.*
import baz.qux.*
`);
    const model = expectNoErrors(result);
    expect(model.imports).toHaveLength(2);
  });

  it('should parse namespace with scope', async () => {
    const result = await parse(`namespace test.model
scope MyScope
`);
    expectNoErrors(result);
  });
});
