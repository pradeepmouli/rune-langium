// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { metadataRuntimeSource } from './expr/metadata-runtime.js';
import { valueEqualitySource } from './expr/value-equality.js';
import { binaryRuntimeSource } from './expr/binary-runtime.js';
import { temporalRuntimeSource } from './expr/temporal-runtime.js';
import { functionDataRuntimeSource } from './expr/function-data-runtime.js';
import { collectionRuntimeSource } from './expr/collection-runtime.js';

/**
 * Source text of the runtime helper functions that are
 * inlined at the top of every emitted file (Zod and TypeScript targets).
 *
 * Per contracts/runtime-helpers.md §Inlined source text.
 * FR-021 (inlined helpers), SC-003 (Python parity).
 */
export const RUNTIME_HELPER_SOURCE: string =
  `// --- rune-codegen runtime helpers (inlined) ---\n` +
  temporalRuntimeSource(true) +
  '\n' +
  functionDataRuntimeSource(true) +
  '\n' +
  binaryRuntimeSource(true) +
  '\n' +
  collectionRuntimeSource(true) +
  '\n\n' +
  valueEqualitySource(true) +
  '\n\n' +
  `const runeCheckOneOf = (values: unknown[]): boolean =>\n` +
  `  values.filter((v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)).length === 1;\n` +
  `\n` +
  `const runeCount = (value: unknown): number => Array.isArray(value) ? value.length : value == null ? 0 : 1;\n` +
  `\n` +
  `const runeAttrExists = <T>(v: T): v is NonNullable<T> & (T extends readonly (infer I)[] ? readonly [I, ...I[]] : unknown) =>\n` +
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
  temporalRuntimeSource(false) +
  '\n' +
  functionDataRuntimeSource(false) +
  '\n' +
  binaryRuntimeSource(false) +
  '\n' +
  collectionRuntimeSource(false) +
  '\n\n' +
  metadataRuntimeSource(false) +
  '\n\n' +
  `// --- rune-codegen runtime helpers (inlined) ---\n` +
  valueEqualitySource(false) +
  '\n\n' +
  `const runeCheckOneOf = (values) =>\n` +
  `  values.filter((v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)).length === 1;\n` +
  `\n` +
  `const runeCount = (value) => Array.isArray(value) ? value.length : value == null ? 0 : 1;\n` +
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
export const runeCheckOneOf = (values: unknown[]): boolean =>
  values.filter((v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)).length === 1;

/**
 * Counts collection items or a present scalar, treating null/undefined as 0.
 *
 * Parity: matches Python rune_count(collection) semantics.
 * Used for: count expressions, (1..*) condition assertions.
 * FR-021, SC-003.
 */
export const runeCount = (value: unknown): number => (Array.isArray(value) ? value.length : value == null ? 0 : 1);

/**
 * Returns true iff the value is "present" in the Rune sense:
 * not undefined, not null, and not an empty array.
 *
 * Parity: matches Python rune_attr_exists(v) semantics.
 * Used for: exists, is absent conditions.
 * FR-021, SC-003.
 */
export const runeAttrExists = <T>(
  v: T
): v is NonNullable<T> & (T extends readonly (infer I)[] ? readonly [I, ...I[]] : unknown) =>
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

/**
 * The z-free runtime helper names, in the fixed order they're
 * declared/imported everywhere (inlined source, sidecar exports, and the
 * `import { ... } from './runtime(.zod).js'` line emitted by both
 * `ts-emitter.ts` and `zod-emitter.ts` when `suppressBoilerplate: true`).
 *
 * Single source of truth for that ordering — used to build the import
 * line's name list and to recognize the header/body boundary when
 * concatenating per-namespace files into a single-file bundle.
 */
export const RUNE_HELPER_NAMES = [
  'runeList',
  'runeSingle',
  'runeBinary',
  'runeCompare',
  'runeOrder',
  'runeDateField',
  'runeDateConstruct',
  'runeToFuncData',
  'runeCheckOneOf',
  'runeCount',
  'runeValueEquals',
  'runeValueKey',
  'runeAttrExists',
  'runeToDate',
  'runeToTime',
  'runeToDateTime',
  'runeToZonedDateTime'
] as const;

/**
 * The z-free helpers' bodies as `export const` declarations, one blank
 * line between each — the shape shared by the TypeScript and Zod runtime
 * sidecars (`runtime.ts` / `runtime.zod.ts`). Each language profile
 * appends its own target-specific tail (TS: `isLeapYear`; Zod: the
 * `z`-dependent `runeExtendChoice`, from `zod-runtime-helpers.ts`).
 *
 * Kept as literal template lines (not derived from the plain-const
 * declarations above via reflection) so the emitted formatting stays
 * exact and independent of how this module's own source is written.
 */
export const RUNTIME_SIDECAR_HELPER_LINES: readonly string[] = [
  temporalRuntimeSource(true, true),
  functionDataRuntimeSource(true, true),
  binaryRuntimeSource(true, true),
  collectionRuntimeSource(true, true),
  valueEqualitySource(true, true),
  '',
  `export const runeCheckOneOf = (values: unknown[]): boolean =>`,
  `  values.filter((v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)).length === 1;`,
  ``,
  `export const runeCount = (value: unknown): number => Array.isArray(value) ? value.length : value == null ? 0 : 1;`,
  ``,
  `export const runeAttrExists = <T>(v: T): v is NonNullable<T> & (T extends readonly (infer I)[] ? readonly [I, ...I[]] : unknown) =>`,
  `  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);`,
  ``,
  `export const runeToDate = (v: unknown): string | undefined =>`,
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : undefined;`,
  ``,
  `export const runeToTime = (v: unknown): string | undefined =>`,
  `  typeof v === 'string' && /^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/.test(v) ? v : undefined;`,
  ``,
  `export const runeToDateTime = (v: unknown): string | undefined =>`,
  `  typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/.test(v) ? v : undefined;`,
  ``,
  `export const runeToZonedDateTime = (v: unknown): string | undefined =>`,
  `  typeof v === 'string' &&`,
  `  /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})(\\[[^\\]]+\\])?$/.test(v)`,
  `    ? v`,
  `    : undefined;`
];

/**
 * The `import { runeCheckOneOf, ..., runeToZonedDateTime } from '<from>';`
 * line emitted at the top of per-namespace files when
 * `suppressBoilerplate: true` (bundled layouts import the sidecar
 * instead of inlining `RUNTIME_HELPER_SOURCE`). `extra` appends further
 * names (Zod also imports `runeExtendChoice`).
 */
export function buildRuntimeHelperImportLine(from: string, extra: readonly string[] = []): string {
  return `import { ${[...RUNE_HELPER_NAMES, 'type RuneFuncData', ...extra].join(', ')} } from '${from}';`;
}
