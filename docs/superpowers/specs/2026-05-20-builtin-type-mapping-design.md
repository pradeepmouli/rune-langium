# Builtin type / record / library-function mapping — design

Status: **DRAFT for discussion** · 2026-05-20 · Task #276

## 1. Problem

Each emitter hardcodes its own map from `com.rosetta.model` builtin names to
the target representation. Today there are **four** copies, already drifting:

| Source | Keys | Notes |
|---|---|---|
| `BUILTIN_TYPE_MAP` (zod-emitter.ts) | string, int, number, boolean, date, dateTime, zonedDateTime, time, productType, eventType | dates/times flatten to `z.string()` |
| `TS_TYPE_MAP` (ts-emitter.ts) | *(same 10)* | everything non-numeric → `string` |
| `BUILTIN_JSON_TYPE_MAP` (json-schema-emitter.ts) | *(same 10)* | richer: `date`→`{type:string,format:date}`, etc. |
| `BUILTIN_TYPES` (visual-editor/types.ts) | string, int, number, boolean, date, time, dateTime, zonedDateTime | **missing** productType, eventType — already drifted |

Three problems:

1. **Duplication** — the same key set is repeated in 3 emitters + 1 UI list.
2. **Incompleteness** — the actual builtin surface is larger than the maps.
3. **Silent fallback** — an unmapped builtin resolves to `z.unknown()` /
   `unknown` with no diagnostic, so gaps are invisible until someone reads
   generated output.

### 1.1 The real builtin surface (`com.rosetta.model`)

Authoritative source: `apps/studio/src/resources/base-types.ts`
(`BASICTYPES_ROSETTA`). The complete surface:

- **Basic types (5):** `boolean`, `number`, `string`, `time`, `pattern`
- **Record types (3):** `date` {day, month, year: int}, `dateTime` {date, time},
  `zonedDateTime` {date, time, timezone: string}
- **Type aliases (4):** `int` (→`number(fractionalDigits: 0, …)`),
  `productType` (→`string`), `eventType` (→`string`),
  `calculation` (→**`string`**)
- **Library functions (6):** `Min(x number, y number) number`,
  `Max(x number, y number) number`, `IsLeapYear(year number) boolean`,
  `DateRanges() date`, `Adjust() date`, `Within() boolean`
- **Annotations (9):** codeImplementation, deprecated, enrich, ingest,
  metadata, projection, qualification, rootType, suppressWarnings
  *(annotations are not types — out of scope)*

**Coverage gaps in every emitter map today:**

- `pattern` (basic type) — **unmapped** → silent `z.unknown()` / `unknown`
- `calculation` (type alias) — **unmapped** → silent fallback
- All 6 library functions — no mapping; today emitted as signatures via
  `emitExternalFunction` (TS) with no host binding.

> Note: `calculation` resolves to **`string`** in the builtin module — not
> `number` as one might guess from the name. This is exactly why §4.2 resolves
> aliases to their declared base rather than hardcoding by name.

## 2. Goal

One declarative source of truth per target, hung off the existing
`LanguageProfile<T>` abstraction (`packages/codegen/src/emit/language-profile.ts`),
with a parity test that fails if any profile omits a builtin. Emitters read
from the profile instead of module-level consts. The studio's `BUILTIN_TYPES`
list derives from the same source rather than being a hand-kept copy.

Naming follows the grammar's own vocabulary (`basicType` keyword in
`rune-dsl.langium`): `basicTypeMap`, `recordTypeMap`, plus `typeAliasMap` and
`libraryFuncMap` (names TBD in §4).

## 3. Proposed `LanguageProfile` additions (shape — values are §4's job)

```ts
export interface LanguageProfile<T extends Target = Target> {
  // … existing makeBarrel / concatenate / makeSharedArtifacts / singleFileLimits …

  /** Basic types → target representation. boolean/number/pattern/string/time. */
  readonly basicTypeMap: Readonly<Record<string, BuiltinMapping>>;
  /** Record types → target representation. date/dateTime/zonedDateTime. */
  readonly recordTypeMap: Readonly<Record<string, BuiltinMapping>>;
  /** Builtin type aliases → target representation. calculation/eventType/int/productType. */
  readonly typeAliasMap: Readonly<Record<string, BuiltinMapping>>;
  /** Builtin library functions → target binding. (shape TBD — see §4.4) */
  readonly libraryFuncMap: Readonly<Record<string, LibraryFuncMapping>>;
}
```

`BuiltinMapping` is target-shaped: Zod/TS want a code string (`'z.string()'`,
`'string'`); JSON Schema wants an object (`{type:'string',format:'date'}`).
Either we keep them as `string | object` (loose) or parameterize the profile
on a mapping type. Decision in §4.5.

## 4. Resolved decisions (2026-05-20)

1. **Records → rich, not flat.** Idiomatic temporal type per target (NOT the
   structural {day,month,year} record, NOT a flat string).
2. **TS uses the Temporal API** (`Temporal.PlainDate`/`PlainTime`/
   `PlainDateTime`/`ZonedDateTime`) — see caveat §4b.
3. **Type aliases resolve to their declared base** in the builtin module, not
   guessed by name (`calculation` → `string`, confirmed from source).
4. **Library functions** use `{ importFrom?: string; expr?: string } | null`
   (`null` = intentionally not emitted). Implement the tractable ones
   (Min/Max → host `Math.*`; IsLeapYear → runtime import); the empty-signature
   ones (DateRanges/Adjust/Within) start as `null`.
5. **Unmapped builtin → non-fatal `unmapped-builtin` diagnostic** (was silent).
6. **Key list:** curated maps; the parity test (§5) derives the expected set
   from the builtin module so drift fails CI without runtime coupling.

## 4a. Concrete mapping table

### basicTypeMap
| builtin | Zod | TS | JSON Schema |
|---|---|---|---|
| boolean | `z.boolean()` | `boolean` | `{type:'boolean'}` |
| number | `z.number()` | `number` | `{type:'number'}` |
| string | `z.string()` | `string` | `{type:'string'}` |
| time | `z.iso.time()` | `Temporal.PlainTime` | `{type:'string',format:'time'}` |
| pattern | `z.string()` | `string` | `{type:'string'}` |

### recordTypeMap (temporal)
| builtin | Zod | TS | JSON Schema |
|---|---|---|---|
| date | `z.iso.date()` | `Temporal.PlainDate` | `{type:'string',format:'date'}` |
| dateTime | `z.iso.datetime()` | `Temporal.PlainDateTime` | `{type:'string',format:'date-time'}` |
| zonedDateTime | `z.iso.datetime({offset:true})` | `Temporal.ZonedDateTime` | `{type:'string',format:'date-time'}` |

### typeAliasMap (resolved to declared base)
| builtin | base | Zod | TS | JSON Schema |
|---|---|---|---|---|
| int | number, fractionalDigits 0 | `z.number().int()` | `number` | `{type:'integer'}` |
| productType | string | `z.string()` | `string` | `{type:'string'}` |
| eventType | string | `z.string()` | `string` | `{type:'string'}` |
| calculation | string | `z.string()` | `string` | `{type:'string'}` |

### libraryFuncMap (TS emits funcs; JSON Schema map is empty)
| builtin | TS mapping | rationale |
|---|---|---|
| Min(x,y)→number | `{ expr: 'Math.min' }` | host equivalent |
| Max(x,y)→number | `{ expr: 'Math.max' }` | host equivalent |
| IsLeapYear(year)→boolean | `{ importFrom: '<runtime>' }` | custom impl in runtime sidecar |
| DateRanges()→date | `null` | empty signature; semantics unclear |
| Adjust()→date | `null` | empty signature; semantics unclear |
| Within()→boolean | `null` | empty signature; semantics unclear |

## 4b. Value type & caveats (all resolved 2026-05-20)

- **Mapping value type:** `BuiltinMapping = string | Record<string, unknown>`
  (loose). Each profile populates one shape (string for Zod/TS, object for JSON
  Schema); emitters know their own shape at the read site. Avoids threading an
  `M` generic through `GenericModelEmitter`.
- **Temporal:** **accepted** — generated TS uses `Temporal.*` and requires the
  consumer to have the Temporal global (polyfill or `lib: esnext`). Emit a note
  in the generated TS file header.
- **`IsLeapYear` runtime home:** a **TS runtime sidecar** (`runtime.ts`),
  produced via the profile's `makeSharedArtifacts` — same mechanism as Zod's
  `runtime.zod.ts`. `importFrom` points at the sidecar's relative path.
- **`zonedDateTime` asymmetry:** **accepted as looser** — TS gets the precise
  `Temporal.ZonedDateTime`; Zod validates `z.iso.datetime({offset:true})` (offset
  only, not a named zone). Acceptable.
- **Zod caveat:** confirm `z.iso.date/time/datetime` exist in the pinned
  Zod 4.4.3 before relying on them (verify in impl; fall back to
  `z.string().date()` etc. if the `z.iso` namespace differs).
- **Byte churn:** records moving from `z.string()`/`string` to temporal forms
  updates SC-007 snapshots — expected, call out in the PR.

## 5. Parity test

`packages/codegen/test/builtin-type-parity.test.ts`: for every implemented
target's profile, assert `basicTypeMap ∪ recordTypeMap ∪ typeAliasMap` covers
the full builtin type surface (derived from the builtin module per §4.6b).
Today this would fail on `pattern` + `calculation`.

## 6. Related UX (out of scope, noted)

A pure-builtin namespace (`com.rosetta.model`) emits nothing — basic types
inline at use sites. The Download modal (#247) should mark such namespaces
"no output" / hide them rather than letting selection look like a no-op.
Surfaced during PR #223 browser verification.

## 7. Migration

- Add the maps to `LanguageProfile`; populate `zodProfile` / `typescriptProfile`
  / `jsonSchemaProfile`.
- Replace `BUILTIN_TYPE_MAP` / `TS_TYPE_MAP` / `BUILTIN_JSON_TYPE_MAP` reads
  with profile lookups; delete the consts.
- Point studio's `BUILTIN_TYPES` at the shared key list (or a core export).
- Snapshot churn expected only if §4.1(b) / §4.2(a) change emitted bytes —
  call that out in the PR.
