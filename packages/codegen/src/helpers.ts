// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The exact source text of the three runtime helper functions that are
 * inlined at the top of every emitted file (Zod and TypeScript targets).
 *
 * Per contracts/runtime-helpers.md §Inlined source text.
 * FR-021 (inlined helpers), SC-003 (Python parity).
 */
export const RUNTIME_HELPER_SOURCE: string =
  `// --- rune-codegen runtime helpers (inlined) ---\n` +
  `const runeCheckOneOf = (values: (unknown | undefined | null)[]): boolean =>\n` +
  `  values.filter((v) => v !== undefined && v !== null).length === 1;\n` +
  `\n` +
  `const runeCount = (arr: unknown[] | undefined | null): number => arr?.length ?? 0;\n` +
  `\n` +
  `const runeAttrExists = (v: unknown): boolean =>\n` +
  `  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);\n` +
  `\n` +
  `const runeToDate = (v: unknown): string | undefined =>\n` +
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : undefined;\n` +
  `\n` +
  `const runeToTime = (v: unknown): string | undefined =>\n` +
  `  typeof v === 'string' && /^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/.test(v) ? v : undefined;\n` +
  `\n` +
  `const runeToDateTime = (v: unknown): string | undefined =>\n` +
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/.test(v) ? v : undefined;\n` +
  `\n` +
  `const runeToZonedDateTime = (v: unknown): string | undefined =>\n` +
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})(\\[[^\\]]+\\])?$/.test(v)\n` +
  `    ? v\n` +
  `    : undefined;\n` +
  `// --- end runtime helpers ---`;

/**
 * Plain JavaScript equivalent of `RUNTIME_HELPER_SOURCE` — no type annotations.
 *
 * Used by the Studio codegen worker when executing generated functions in a
 * sandboxed Function constructor. Since the worker strips TypeScript annotations
 * from the isolated function body (`GeneratedFunc.fileContents`), the helpers
 * also need to be annotation-free so no TypeScript constructs reach the JS engine.
 */
export const RUNTIME_HELPER_JS_SOURCE: string =
  `// --- rune-codegen runtime helpers (inlined) ---\n` +
  `const runeCheckOneOf = (values) =>\n` +
  `  values.filter((v) => v !== undefined && v !== null).length === 1;\n` +
  `\n` +
  `const runeCount = (arr) => arr?.length ?? 0;\n` +
  `\n` +
  `const runeAttrExists = (v) =>\n` +
  `  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);\n` +
  `\n` +
  `const runeToDate = (v) =>\n` +
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : undefined;\n` +
  `\n` +
  `const runeToTime = (v) =>\n` +
  `  typeof v === 'string' && /^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/.test(v) ? v : undefined;\n` +
  `\n` +
  `const runeToDateTime = (v) =>\n` +
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/.test(v) ? v : undefined;\n` +
  `\n` +
  `const runeToZonedDateTime = (v) =>\n` +
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})(\\[[^\\]]+\\])?$/.test(v)\n` +
  `    ? v\n` +
  `    : undefined;\n` +
  `// --- end runtime helpers ---`;

/**
 * Returns true iff exactly one value in the array is non-null and non-undefined.
 *
 * Parity: matches Python rune_check_one_of(values) semantics.
 * Used for: one-of, choice conditions.
 * FR-021, SC-003.
 */
export const runeCheckOneOf = (values: (unknown | undefined | null)[]): boolean =>
  values.filter((v) => v !== undefined && v !== null).length === 1;

/**
 * Returns the length of an array attribute, treating null/undefined as 0.
 *
 * Parity: matches Python rune_count(collection) semantics.
 * Used for: count expressions, (1..*) condition assertions.
 * FR-021, SC-003.
 */
export const runeCount = (arr: unknown[] | undefined | null): number => arr?.length ?? 0;

/**
 * Returns true iff the value is "present" in the Rune sense:
 * not undefined, not null, and not an empty array.
 *
 * Parity: matches Python rune_attr_exists(v) semantics.
 * Used for: exists, is absent conditions.
 * FR-021, SC-003.
 */
export const runeAttrExists = (v: unknown): boolean =>
  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);

/**
 * Validate-shape-and-passthrough for Rune `to-date`: returns the string
 * unchanged when it matches `YYYY-MM-DD`, else undefined.
 *
 * Runtime representation of `date` is a plain ISO string (see ts-emitter's
 * builtin type map); Tier 3 `ToDateOperation` semantics per the parity spec.
 */
export const runeToDate = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

/**
 * Validate-shape-and-passthrough for Rune `to-time`: `HH:MM:SS` with an
 * optional fractional-seconds suffix.
 */
export const runeToTime = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v) ? v : undefined;

/**
 * Validate-shape-and-passthrough for Rune `to-date-time`: local ISO-8601
 * `YYYY-MM-DDTHH:MM:SS` with optional fractional seconds, no zone offset.
 */
export const runeToDateTime = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v) ? v : undefined;

/**
 * Validate-shape-and-passthrough for Rune `to-zoned-date-time`: ISO-8601
 * datetime with a required zone offset (`Z` or `+HH:MM`), optional IANA
 * zone-id suffix (`[Region/City]`).
 */
export const runeToZonedDateTime = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})(\[[^\]]+\])?$/.test(v)
    ? v
    : undefined;
