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
  `  values.filter(v => v !== undefined && v !== null).length === 1;\n` +
  `\n` +
  `const runeCount = (arr: unknown[] | undefined | null): number =>\n` +
  `  arr?.length ?? 0;\n` +
  `\n` +
  `const runeAttrExists = (v: unknown): boolean =>\n` +
  `  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);\n` +
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
