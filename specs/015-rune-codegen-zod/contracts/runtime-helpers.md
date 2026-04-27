# Contract — Inlined Runtime Helpers

**Spec hooks**: FR-021, SC-003, Q3/A.

These three helper functions are inlined as `const` declarations at
the top of every emitted file (Zod target and TypeScript target).
They are NOT imported from a package; there is no `@rune-langium/runtime`
package. Inlining adds roughly 30 lines per emitted module — a
deliberate trade-off for zero install-time dependencies and no
version-skew risk (Q3/A rationale).

The helpers are tree-shakeable: TypeScript's `tsc` and bundlers
(Vite, esbuild) treat them as dead code if no condition in the emitted
module references them.

---

## Exact TypeScript signatures

```ts
/**
 * Returns true iff exactly one value in the array is non-null
 * and non-undefined.
 *
 * Parity: matches Python rune_check_one_of(values) semantics.
 * Used for: one-of, choice conditions.
 */
const runeCheckOneOf = (
  values: (unknown | undefined | null)[]
): boolean => values.filter(
  (v): v is NonNullable<typeof v> => v !== undefined && v !== null
).length === 1;

/**
 * Returns the length of an array attribute, treating null/undefined
 * as 0.
 *
 * Parity: matches Python rune_count(collection) semantics.
 * Used for: count expressions, (1..*) condition assertions.
 */
const runeCount = (arr: unknown[] | undefined | null): number =>
  arr?.length ?? 0;

/**
 * Returns true iff the value is "present" in the Rune sense:
 * not undefined, not null, and not an empty array.
 *
 * Parity: matches Python rune_attr_exists(v) semantics.
 * Used for: exists, is absent conditions.
 *
 * @remarks
 * The empty-array case covers (0..*) attributes initialized to []
 * rather than null: Rune's "exists" predicate treats [] as absent.
 */
const runeAttrExists = (v: unknown): boolean =>
  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
```

---

## Semantics

### `runeCheckOneOf`

| Input | Result | Notes |
|-------|--------|-------|
| `[undefined, undefined, undefined]` | `false` | Zero present → rejected |
| `[undefined, 'foo', undefined]` | `true` | Exactly one present → accepted |
| `['foo', 'bar', undefined]` | `false` | Two present → rejected |
| `[null, null, 42]` | `true` | `null` counts as absent |
| `[]` | `false` | Empty array → zero present |

**Parity contract with Python `rune_check_one_of`**: The Python
reference implementation filters `None` and returns
`len(filtered) == 1`. This TypeScript version filters `undefined`
and `null` and checks `.length === 1` — identical semantics on
serialized JSON payloads where Python `None` maps to JSON `null`,
which Zod/JSON parses as `null` in TypeScript (not `undefined`).
The `undefined` filter handles keys that are absent from the JSON
object entirely (Zod's `optional()` produces `undefined` for missing
keys).

### `runeCount`

| Input | Result |
|-------|--------|
| `['a', 'b', 'c']` | `3` |
| `[]` | `0` |
| `undefined` | `0` |
| `null` | `0` |

**Parity contract with Python `rune_count`**: Python's
`rune_count(collection)` returns `len(collection) if collection else 0`.
This TypeScript version uses optional chaining (`?.length ?? 0`) for
the same behavior.

### `runeAttrExists`

| Input | Result | Notes |
|-------|--------|-------|
| `"hello"` | `true` | String value present |
| `42` | `true` | Numeric value present |
| `[]` | `false` | Empty array = absent in Rune semantics |
| `['a']` | `true` | Non-empty array = present |
| `null` | `false` | Null = absent |
| `undefined` | `false` | Undefined = absent |

**Parity contract with Python `rune_attr_exists`**: Python returns
`v is not None and (not isinstance(v, list) or len(v) > 0)`.
This TypeScript version handles `undefined` in addition to `null`
(no distinction in JSON-deserialized data, but TypeScript's `optional()`
attributes produce `undefined`).

---

## Null vs. missing distinction (spec edge case)

Zod treats `undefined` and missing keys identically by default
(an `optional()` field is `undefined` whether the key is absent or
explicitly `undefined`). JSON payload behavior:

```json
{"a": null}  // a is null  → runeAttrExists(a) = false
{}           // a is undefined → runeAttrExists(a) = false
{"a": "x"}  // a is "x"   → runeAttrExists(a) = true
```

This matches the Python generator's semantics: `null`, `None`, and
absent are all treated as "not present" by `rune_attr_exists`. The
`exists` condition in Rune has the same semantics in both generators
(SC-003: ≥99% behavioral parity on the 200-case condition-fidelity
matrix).

---

## Inlined source text (canonical)

The exact source injected into each emitted file:

```ts
// --- rune-codegen runtime helpers (inlined) ---
const runeCheckOneOf = (values: (unknown | undefined | null)[]): boolean =>
  values.filter(v => v !== undefined && v !== null).length === 1;

const runeCount = (arr: unknown[] | undefined | null): number =>
  arr?.length ?? 0;

const runeAttrExists = (v: unknown): boolean =>
  v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
// --- end runtime helpers ---
```

This text is stored in `packages/codegen/src/helpers.ts` as the
`RUNTIME_HELPER_SOURCE` constant and injected by all emitters
(Zod and TypeScript targets) that may emit conditions. JSON Schema
target does not inline helpers (JSON Schema has no runtime predicate
layer).

---

## Where helpers appear in emitted files

```
emitted_file.zod.ts
├── // generated by rune-codegen 0.1.0 — DO NOT EDIT
├── import { z } from 'zod';     ← cross-namespace imports
├── [blank line]
├── // --- rune-codegen runtime helpers (inlined) ---
├── const runeCheckOneOf = ...
├── const runeCount = ...
├── const runeAttrExists = ...
├── // --- end runtime helpers ---
├── [blank line]
├── export const MyEnum = z.enum([...])
└── export const MySchema = z.object({...}).superRefine(...)
```

Helpers always appear between the imports block and the first type
export. This ordering ensures that when `superRefine` closures
reference `runeCheckOneOf`, the helper is already declared in the
module scope (no hoisting required for `const`).
