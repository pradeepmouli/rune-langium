/**
 * langium-zod configuration for @rune-langium/core
 *
 * This file is picked up automatically by `langium-zod generate`.
 * See: https://github.com/pradeepmouli/langium-zod#configuration
 */

/** @type {import('langium-zod').LangiumZodConfig} */
export default {
  outputPath: 'src/generated/zod-schemas.ts',

  /**
   * Override the generated schema for parser-based datatype rules whose
   * multi-element structure cannot be expressed as a terminal regex.
   *
   * BigDecimal: `BigDecimal returns string: ('+' | '-')? ('.' INT | INT '.' INT?) ...`
   * Langium resolves multi-element groups to `z.string()`; we supply the regex manually.
   */
  regexOverrides: {
    BigDecimal: String.raw`^[+-]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][+-]?[0-9]+)?$`
  }
};
