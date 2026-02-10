import { describe, it, expect } from 'vitest';
import { parse } from '../../src/index.js';
import type {
  Data,
  RosettaFunction,
  RosettaEnumeration,
  Choice,
  RosettaModel
} from '../../src/index.js';
import { createRuneDslServices } from '../../src/index.js';
import { URI } from 'langium';
import type { LangiumDocument } from 'langium';

/**
 * Helper: parse, run validation, and return diagnostics.
 */
async function parseAndValidate(input: string) {
  const { RuneDsl } = createRuneDslServices();
  const document: LangiumDocument<RosettaModel> =
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      input,
      URI.parse('inmemory:///test.rosetta')
    );

  await RuneDsl.shared.workspace.DocumentBuilder.build([document], {
    validation: true
  });

  const diagnostics = document.diagnostics ?? [];
  return {
    value: document.parseResult.value as RosettaModel,
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === 1),
    warnings: diagnostics.filter((d) => d.severity === 2),
    hasErrors:
      document.parseResult.lexerErrors.length > 0 || document.parseResult.parserErrors.length > 0
  };
}

describe('Validation', () => {
  describe('Structural validations (T073, T084)', () => {
    it('should detect duplicate attribute names', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type Foo:
          bar int (1..1)
          bar string (1..1)
      `);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('Duplicate attribute'))).toBe(true);
    });

    it('should accept valid data type', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type Foo:
          bar int (1..1)
          baz string (0..1)
      `);
      // Only linker errors (unresolved int/string) are acceptable,
      // no structural validation errors should be present.
      const structuralErrors = result.errors.filter(
        (e) =>
          e.message.includes('Duplicate') ||
          e.message.includes('Lower bound') ||
          e.message.includes('Circular')
      );
      expect(structuralErrors).toHaveLength(0);
    });

    it('should detect invalid cardinality (lower > upper)', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type Foo:
          bar int (5..2)
      `);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('Lower bound'))).toBe(true);
    });

    it('should detect duplicate function inputs', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        func Bad:
          inputs:
            x int (1..1)
            x string (1..1)
          output:
            result int (1..1)
          set result:
            x
      `);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('Duplicate input'))).toBe(true);
    });

    it('should detect duplicate enum values', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        enum Status:
          Active
          Inactive
          Active
      `);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('Duplicate enum value'))).toBe(true);
    });

    it('should detect duplicate top-level elements', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type Foo:
          bar int (1..1)

        type Foo:
          baz string (1..1)
      `);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('Duplicate element'))).toBe(true);
    });
  });

  describe('Naming validations (T074, T086)', () => {
    it('should warn if data type starts with lowercase', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type foo:
          bar int (1..1)
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((e) => e.message.includes('should start with an uppercase letter'))
      ).toBe(true);
    });

    it('should warn if attribute starts with uppercase', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type Foo:
          Bar int (1..1)
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((e) => e.message.includes('should start with a lowercase letter'))
      ).toBe(true);
    });

    it('should warn if function starts with lowercase', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        func myFunc:
          output:
            result int (1..1)
          set result:
            42
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((e) => e.message.includes('should start with an uppercase letter'))
      ).toBe(true);
    });

    it('should warn if enum starts with lowercase', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        enum myEnum:
          A
          B
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((e) => e.message.includes('should start with an uppercase letter'))
      ).toBe(true);
    });

    it('should not warn for properly named elements', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type ProperType:
          properAttr int (1..1)

        enum ProperEnum:
          A

        func ProperFunc:
          output:
            result int (1..1)
          set result:
            42
      `);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Function validations (T075, T085)', () => {
    it('should warn if function has no output', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        func NoOutput:
          inputs:
            x int (1..1)
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((e) => e.message.includes('has no output'))).toBe(true);
    });

    it('should accept function with output', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        func WithOutput:
          inputs:
            x int (1..1)
          output:
            result int (1..1)
          set result:
            x
      `);
      // No "has no output" warning
      expect(result.warnings.filter((e) => e.message.includes('has no output'))).toHaveLength(0);
    });
  });

  describe('Condition naming (T076)', () => {
    it('should warn if condition starts with lowercase', async () => {
      const result = await parseAndValidate(`
        namespace test.validate
        version "1.0.0"

        type Foo:
          bar int (1..1)

          condition myCondition:
            bar > 0
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((e) => e.message.includes('should start with an uppercase letter'))
      ).toBe(true);
    });
  });
});
