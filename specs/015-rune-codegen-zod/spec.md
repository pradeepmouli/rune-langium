# Feature Specification: Rune-Langium Native Code Generators

**Feature Branch**: `015-rune-codegen-zod`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: Rune-Langium native code generators (Zod, JSON Schema, TypeScript interfaces) replacing the Xtend/Ecore Rosetta generators with browser-native TypeScript visitors over the Langium AST.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Structural Zod schemas from a `.rune` file (Priority: P1)

A TypeScript developer working with CDM-derived models writes or imports Rune DSL files
(`.rune`) and runs a CLI command that emits TypeScript files containing Zod schemas for
every type, faithfully encoded with cardinality (required vs. optional vs. array, with
min/max bounds), enumerations (with display-name companion lookups), and inheritance
chains. The developer then `import`s those schemas into a web app to validate JSON
payloads at runtime and to derive TypeScript types via `z.infer<>`.

**Why this priority**: This is the MVP. It delivers type-safe parsing of CDM JSON in
the browser without a JVM build step — the single most-requested capability that
the existing Xtend-based Rosetta TypeScript generator does not provide (it emits
`?:`-everything interfaces with no cardinality and no runtime validation). Without
P1 the rest of the feature is academic; with P1 alone, downstream teams can already
build forms, validate API responses, and infer types.

**Independent Test**: A developer can clone the repo, write a small Rune model
covering scalars / enums / a 1..* array / a single inheritance chain, run
`pnpm rune-codegen <input> -o <out>`, then `tsc --noEmit` the output and call
`PartySchema.parse(json)` against a hand-crafted JSON instance to confirm
acceptance of valid payloads and rejection of invalid ones (wrong type, missing
required field, array shorter than min). No conditions, no studio, no other
targets are required.

**Acceptance Scenarios**:

1. **Given** a Rune type with 5 attributes spanning every cardinality form
   (`(1..1)`, `(0..1)`, `(0..*)`, `(1..*)`, `(2..5)`),
   **When** the generator runs,
   **Then** the emitted Zod schema marks `(1..1)` as required scalar,
   `(0..1)` as `.optional()`, `(0..*)` as plain `z.array(…)`,
   `(1..*)` as `z.array(…).min(1)`, and `(2..5)` as `z.array(…).min(2).max(5)`.
2. **Given** a Rune enum with `displayName` strings,
   **When** the generator runs,
   **Then** the emitted file contains a `z.enum([...])` schema AND a sibling
   `Record<EnumType, string>` mapping member → display name.
3. **Given** a Rune type that `extends` a parent type,
   **When** the generator runs,
   **Then** the child schema uses `<ParentSchema>.extend({...})` and inherits
   the parent's attributes without re-declaring them.
4. **Given** a model that contains a circular type reference (type A holds B,
   type B holds A),
   **When** the generator runs,
   **Then** at least one of the two emitted schemas uses `z.lazy(() => …)`
   and the resulting file passes `tsc --noEmit`.
5. **Given** a Rune model with attribute names that collide with TypeScript
   reserved words (`class`, `default`, `enum`),
   **When** the generator runs,
   **Then** the emitted property names are quoted or renamed deterministically
   so the output compiles.

---

### User Story 2 — Constraint conditions surface as runtime validation (Priority: P2)

The same developer adds Rune `condition` blocks that express `one-of`, `choice`,
`exists`, `is absent`, and `only exists` rules. After regenerating, the emitted
Zod schemas reject JSON payloads that violate these constraints with diagnostic
messages naming the failing condition.

**Why this priority**: These four condition forms cover the bulk of validation
rules in CDM that JSON Schema cannot express. Without them, downstream
validation has gaps that must be hand-coded. Once P1 ships, P2 is the next-most-
visible value because users can SEE their condition annotations turning into
real validator behavior.

**Independent Test**: With a Rune model of the form
`type UnitType: a (0..1), b (0..1), c (0..1), condition: one-of`, run the generator,
then exercise the emitted schema with three JSON inputs: zero present (rejected),
exactly one present (accepted), two present (rejected). Each rejection's error
message includes the type name and the constraint kind.

**Acceptance Scenarios**:

1. **Given** a `one-of` condition over three optional attributes,
   **When** parsed JSON has zero, one, or two of them present,
   **Then** the schema accepts only the exactly-one case; the rejection messages
   include the offending attribute names.
2. **Given** a `choice` condition,
   **When** the schema is exercised,
   **Then** behavior matches the corresponding `rune_check_one_of` semantics from
   the Python generator's runtime helper for the same input data.
3. **Given** a condition `attr exists` on a type,
   **When** the attribute is `null`, `undefined`, missing, or the empty array,
   **Then** the schema rejects all four cases and accepts a non-empty value;
   the message names the condition.
4. **Given** an `only exists` condition over `[a, b]` on a type that also has
   attribute `c`,
   **When** the input has `a` and `b` set and `c` set,
   **Then** the schema rejects (because `c` violates the only-these-fields rule).

---

### User Story 3 — Full Rune expression language transpiles to validators (Priority: P2)

A Rune model author writes arbitrary `condition` blocks using the full expression
language: arithmetic (`+`, `-`, `*`, `/`), comparison (`=`, `<>`, `<`, `<=`, `>`,
`>=`), boolean (`and`, `or`), set membership (`contains`, `disjoint`), path
navigation (`a -> b -> c`), `count`, aggregations (`sum`, `min`, `max`, `sort`,
`distinct`, `first`, `last`, `flatten`, `reverse`), higher-order (`filter`, `map`),
and conditional (`if … then … else`). The generator transpiles each into a
JavaScript predicate that mirrors the Python generator's semantics for the same
input.

**Why this priority**: This is the differentiating capability that no current
Rosetta TypeScript or JSON Schema generator provides. Combined with P2 it makes
the codegen package strictly more capable than the existing TypeScript generator
for runtime validation. P2 priority because once P1 ships there is no other
feature with comparable user value; the only reason it isn't P1 itself is that
P1 alone is already a viable MVP.

**Independent Test**: For each expression category (literals, navigation,
existence, arithmetic/comparison, aggregation, higher-order, control flow), a
corresponding fixture pair (`.rune` source, expected `.zod.ts` output, JSON
test cases) lives under `test/fixtures/`. Running the generator against the
fixture inputs produces output that (a) compiles, (b) accepts the
documented-as-valid JSON cases, (c) rejects the documented-as-invalid cases,
(d) yields an error message naming the condition.

**Acceptance Scenarios**:

1. **Given** a condition `party -> partyId count >= 1`,
   **When** the generator transpiles it,
   **Then** the emitted predicate handles `null` and `undefined` at every level
   of the path (does not throw), and returns the same boolean as
   `(data.party?.partyId?.length ?? 0) >= 1`.
2. **Given** a condition that uses `if X = EnumA -> Foo then Y exists`,
   **When** validated,
   **Then** the predicate runs inside `.superRefine()` and only flags `Y`'s
   absence when the antecedent (`X = Foo`) holds; when X = EnumA -> Bar, the
   predicate is silent regardless of Y.
3. **Given** a type with three independent conditions,
   **When** the generator runs,
   **Then** the conditions are emitted inside a single `.superRefine()` call
   (not three chained `.refine()` calls) for runtime efficiency.
4. **Given** a `disjoint` operator used between two array attributes,
   **When** validated against inputs with no overlap, partial overlap, or
   identical contents,
   **Then** the predicate returns true / false / false respectively.

---

### User Story 4 — Live multi-target preview inside Studio (Priority: P3)

A user editing a `.rune` file in the Studio sees a side-by-side panel that
displays the live-generated output. A target switcher at the top of the
panel toggles between three views: **Zod** (default), **JSON Schema**, and
**TypeScript**. The active target re-renders within one debounce cycle on
every successful build phase. Clicking on any generated region in any
target navigates the editor cursor back to the corresponding `.rune`
source location — source mapping is implemented for all three targets,
not just Zod.

**Why this priority**: The Studio integration is what makes this generator a
visible feature of the product. Without P4 the codegen is invisible to non-CLI
users; with P4 it becomes a first-class editing surface. Lower priority than
P1–P3 because it depends on having a generator that already works correctly,
and it's primarily UX over capability.

**Independent Test**: Open the Studio against a curated CDM fixture, type a
character into a Rune type definition, and confirm the right-hand panel
re-renders within 500ms. Switch the target dropdown to "JSON Schema" and
confirm the panel re-renders to show the `$schema` block and `properties`
object for the same type. Switch to "TypeScript" and confirm the panel
shows the class declaration. In each target, click on a generated region
and confirm the editor cursor moves to the originating Rune source line.

**Acceptance Scenarios**:

1. **Given** a Rune file open in the Studio with the live preview panel
   visible AND target = Zod, **When** the user inserts a new attribute,
   **Then** the panel updates within 500ms and shows the new attribute as
   a Zod field with the cardinality the user typed.
2. **Given** the live preview panel with target = Zod,
   **When** the user clicks on a generated `z.array(…)` line,
   **Then** the source editor scrolls to and highlights the exact attribute
   declaration that produced that line.
3. **Given** the live preview panel,
   **When** the user changes the target switcher from Zod → JSON Schema,
   **Then** the panel re-renders within 500ms with a JSON Schema document;
   the source-mapping-on-click affordance still works (clicking a
   `properties.foo` block navigates to the `foo` attribute in source).
4. **Given** the live preview panel with target = TypeScript,
   **When** the user clicks on a `class Party implements …` line,
   **Then** the source editor scrolls to and highlights the originating
   `type Party:` declaration.
5. **Given** a Rune model that fails validation (parser errors),
   **When** the live preview is rendered,
   **Then** the panel shows the last successful generation for the active
   target (not garbled output), and a status indicator surfaces
   "outdated — fix errors to refresh".

---

### User Story 5 — JSON Schema and full TypeScript class targets (Priority: P3)

A developer who needs a JSON Schema (e.g., for OpenAPI documentation or a
schema registry) or a full TypeScript module (no Zod runtime dependency,
but with classes, type guards, and runtime validation methods) selects an
alternate generator target via the CLI.

The JSON Schema target emits standards-compliant JSON Schema (2020-12)
with cardinality and enums encoded. The TypeScript target emits **full
`.ts` modules** with class-style declarations — `class Party implements …`
— including:

- Plain interface / type declarations for every Rune type
- Runtime classes with constructor methods (e.g., `Party.from(json)`)
- Type guards (`isParty(x): x is Party`)
- Discriminator predicates for inheritance hierarchies
- Condition logic surfaced as instance methods (e.g.,
  `party.validateNonNegative(): ValidationResult`), mirroring how the
  Java and C# generators expose conditions on generated types

The TS target ships with NO Zod dependency and is the bundle-size-conscious
alternative for consumers who want types + checks + behavior without the
Zod runtime.

**Why this priority**: Additive once P1 exists. JSON Schema can be derived
mechanically from Zod via `zod-to-json-schema`, so the marginal effort is
small. The class-style TS target is heavier — comparable scope to the Java
and C# Rosetta generators — but delivers a TypeScript story that mirrors
Java/C# parity rather than today's everything-optional `.d.ts` shim. P3
because it depends on the Zod target's expression transpiler being correct
first (the TS target reuses the same predicate logic, just emits it as
instance-method bodies instead of `.refine()` closures).

**Independent Test**: Run `rune-codegen --target json-schema input.rune -o out/`
and confirm the output validates against the JSON Schema 2020-12 meta-schema
AND matches the cardinality / enums of the equivalent Zod output. Run
`--target typescript` and confirm: (a) the output has zero references to
the `zod` package, (b) `tsc --noEmit` passes, (c) `Party.from({...valid...})`
returns a `Party` instance, (d) `isParty(plainObject)` returns `true` for a
matching instance, (e) `party.validateNonNegative()` returns the same
accept/reject decision as the equivalent Zod schema's `.parse()`.

**Acceptance Scenarios**:

1. **Given** a Rune model with `(1..*)` cardinality on `account`,
   **When** generated as JSON Schema,
   **Then** the output has `"type": "array", "minItems": 1` and the field
   is listed in the parent type's `"required"`.
2. **Given** a Rune type with two attributes,
   **When** generated as full TypeScript,
   **Then** the output contains a `class` declaration with both attributes
   as fields, an `isType(x): x is TypeName` guard, and a static
   `from(json)` constructor; the generated module imports nothing from
   `zod`.
3. **Given** a Rune type with one `condition NonNegative` constraint,
   **When** generated as full TypeScript,
   **Then** the output's class has a `validateNonNegative()` instance
   method that returns `{ valid: true }` for valid inputs and a
   `{ valid: false, errors: [...] }` shape for invalid inputs, with
   error messages naming the condition.
4. **Given** a Rune type hierarchy with a parent `MeasureBase` and a
   child `Quantity extends MeasureBase`, **When** generated as full
   TypeScript, **Then** the output has `class Quantity extends MeasureBase`
   plus an `isQuantity(x: MeasureBase): x is Quantity` discriminator
   predicate.
5. **Given** the same Rune input,
   **When** generated as Zod and as full TypeScript,
   **Then** the structural types of `z.infer<typeof PartySchema>` and
   `Party` (the TS-target class instance type) are assignment-compatible
   for plain-data fields (methods on the TS target are additive).

---

### User Story 6 — Rune `func` declarations transpile to TypeScript functions (Priority: P3)

A CDM author writes Rune `func` declarations with `inputs:`, `output:`,
optional pre/post `condition` blocks, and a body of `set`, `add`, and
`alias` statements that compute the output from the inputs. When the
TypeScript target runs, every `func` emits as a module-level TypeScript
function in the output module: typed inputs, typed return value, body
transpiled from the same expression-language pipeline US3 builds, and
its pre/post conditions surfaced as runtime checks at function entry
and exit. The Zod and JSON Schema targets remain silent on `func`
declarations — they are schema languages, not behaviour runtimes.

**Why this priority**: Without `func` support, the TS target ships
typed shapes + condition methods but cannot actually *compute*
CDM-defined values (DCF, payoff math, date adjustments). The existing
Rosetta TypeScript generator emits nothing for funcs — replicating
that gap with prettier output would miss the most-requested capability
TS consumers want from a CDM toolchain. P3 because it depends on US3
(the expression transpiler is the load-bearing piece) and US5B (the
class-style TS module is the host for emitted functions); shipping it
as part of US5B's emission pipeline rather than a separate target.

**Independent Test**: With a Rune model containing a small `func`
(e.g., `func AddTwo: inputs: a int (1..1), b int (1..1), output: r int (1..1), set r: a + b`),
run `rune-codegen --target typescript`, then `import { AddTwo } from
'./generated'` and confirm `AddTwo({a: 2, b: 3}) === 5`. For a
condition-bearing func (e.g., `func DivSafe` with a pre-condition that
the divisor is non-zero), confirm valid inputs return a value and
invalid inputs throw a diagnostic naming the failed condition.

**Acceptance Scenarios**:

1. **Given** a `func AddTwo` with two scalar inputs and one scalar
   output, **When** generated as TypeScript,
   **Then** the emitted module contains
   `export function AddTwo(input: { a: number; b: number }): number`
   with a body that returns the transpiled `set r: a + b` expression.
2. **Given** a `func` whose body uses `alias x: input -> nested -> field`,
   **When** generated, **Then** the emitted body contains a `const x = …`
   binding scoped to the function and the `alias`'s definition uses the
   same path-navigation transpilation as US3 conditions.
3. **Given** a `func` with a `(0..*)` output and `add` statements that
   accumulate items, **When** generated, **Then** the emitted body
   declares `const result: T[] = []` and each `add` becomes
   `result.push(...)`; the function returns `result`.
4. **Given** a `func` with a `condition` block (precondition on inputs
   or postcondition on output), **When** generated, **Then** the emitted
   function body opens with the precondition checks (throw on failure
   with a diagnostic naming the condition) and ends with the
   postcondition checks before returning.
5. **Given** a `func F` that calls another `func G` in its body,
   **When** both are generated, **Then** the emitted module orders
   declarations such that `G` is defined before `F`, and the call site
   in `F` invokes `G(...)` directly (no namespace prefix needed for
   same-module funcs).
6. **Given** a Rune model with both a `condition`-bearing `type` and a
   `func`, **When** the Zod target runs, **Then** the emitted Zod
   schemas for the `type` are present and the `func` is silently
   skipped (no Zod output for funcs); when the TypeScript target runs
   on the same input, both type classes AND function declarations are
   emitted in the same module file.

---

### Edge Cases

- **Reserved-word collisions**: A Rune attribute named `class`, `default`,
  `function`, or `enum` must produce output that compiles. Fix: quote the
  property key in object types and rename when used as a binding.
- **Self-referential types**: `type Foo: child Foo (0..*)` must emit
  `z.lazy(...)` and not infinite-loop the generator.
- **Empty types**: A `type` with zero attributes must emit `z.object({})`,
  not crash or omit the export.
- **Forward references across files**: Import paths must resolve at compile
  time when one Rune namespace references a type defined in another.
- **Display names with quote characters**: Enum display names may contain
  `"` or backslashes; the generator must escape them rather than emitting
  invalid TypeScript.
- **Conditions that name attributes the parent type doesn't declare**:
  Mis-spelled attribute references in a `condition` block must produce a
  generator-time diagnostic, not silently emit a predicate that always
  returns `false`.
- **Studio offline**: The live-preview panel must continue to render the
  most-recent good output when the language server crashes; it must not
  blank.
- **Large CDM payloads**: Generating against the full CDM (thousands of
  types, ~50,000 attributes) must complete in under 30 seconds on a
  modern laptop and produce output that `tsc --noEmit` accepts.
- **Path navigation through optional chains**: Conditions that traverse
  `a -> b -> c` where any link may be absent must use optional chaining
  and never throw at validation time.
- **Null vs. missing distinction**: Zod treats `undefined` and missing
  keys identically by default; the generator must encode `(0..1)` and
  the `exists` predicate consistently with the Python generator's
  semantics (i.e., null/undefined/missing are all "not present").
- **Legacy package downstream consumers**: Renaming `packages/codegen`
  to `packages/codegen-legacy` breaks every existing import statement.
  The feature must migrate `apps/codegen-worker` and
  `apps/codegen-container` to the new path inside the same change set,
  not as a follow-up.
- **`func` recursion and self-reference**: A `func F` whose body calls
  itself must emit valid TypeScript without infinite-loop in the
  generator's dependency-ordering pass. Indirect cycles (`F` calls `G`,
  `G` calls `F`) must also work; the emitted module uses function
  declarations (hoisted) rather than `const` so call order at the source
  level doesn't matter.
- **`func` calling a `func` in another namespace**: When `func F` in
  namespace `cdm.product` calls `func G` from `cdm.base.math`, the
  generated TS module for `cdm.product` must `import { G } from
  '../base/math/index.js'` — same import-resolution rules as
  cross-namespace type references (FR-007).
- **`func` with no body but conditions only**: An abstract-style func
  declared as `func F: inputs: x int (1..1), output: y int (1..1),
  condition: y > 0` (no `set`/`add`) — the TS target should emit a
  function whose body throws a "not implemented" diagnostic, with
  the conditions still installed as pre/post checks. Authors writing
  abstract funcs are signalling "this is meant to be overridden"; the
  emitted TS surfaces that intent rather than silently emitting an
  empty body.

## Requirements *(mandatory)*

### Functional Requirements

#### Generator behavior

- **FR-001**: The system MUST accept one or more `.rune` files as input
  and emit a TypeScript module per Rune namespace, mirroring the Rune
  package hierarchy in the output directory tree.
- **FR-002**: The system MUST emit a `<TypeName>Schema` Zod export AND a
  `<TypeName>` type alias (`z.infer<typeof …Schema>`) for every Rune `type`.
- **FR-003**: The system MUST encode Rune cardinality verbatim into Zod:
  `(1..1)` → required scalar; `(0..1)` → `.optional()`; `(0..*)` → array;
  `(1..*)` → `array.min(1)`; `(n..m)` → `array.min(n).max(m)`;
  `(n..n)` where n>1 → `array.length(n)`.
- **FR-004**: The system MUST emit `z.enum([...])` for every Rune `enum`,
  plus a sibling `Record<EnumType, string>` capturing `displayName` strings
  when present.
- **FR-005**: The system MUST emit `<ChildSchema> = <ParentSchema>.extend({...})`
  for every Rune type that uses `extends`, without re-declaring inherited attributes.
- **FR-006**: The system MUST emit `z.lazy(() => …)` for any type that
  participates in a reference cycle, automatically detected by cycle
  detection over the type-reference graph.
- **FR-007**: The system MUST emit schemas in dependency-resolved order so
  that any non-cyclic forward reference is declared before its first use.
- **FR-008**: The system MUST emit `z.object({})` for empty types and not
  fail.
- **FR-009**: The system MUST quote or rename property keys that collide
  with TypeScript reserved words deterministically (i.e., the same input
  always produces the same output bytes).
- **FR-010**: The system MUST encode `one-of`, `choice`, `exists`,
  `is absent`, and `only exists` constraints using `.refine()` for single
  predicates and `.superRefine()` when more than one constraint applies
  to a single type.
- **FR-011**: The system MUST emit at most one `.superRefine()` call per
  type when multiple conditions are present, combining their predicates
  into one closure.
- **FR-012**: The system MUST transpile every Rune expression form listed
  in the Phase 3 inventory (literals, navigation, existence, arithmetic,
  comparison, boolean, contains, disjoint, count, sum/min/max/sort/distinct/
  first/last/flatten/reverse, filter, map, conditional) into a JavaScript
  predicate whose runtime semantics match the Python generator's output
  for the same input.
- **FR-013**: The system MUST navigate Rune `->` paths in conditions using
  optional chaining so that absent intermediate values do not throw.
- **FR-014**: Every emitted refinement MUST include an error message naming
  the condition (the user-supplied condition name), the type, and the
  attribute path that triggered the rejection.
- **FR-015**: The system MUST be packaged as a standalone npm package
  (`packages/codegen` (canonical name; the existing JVM-bridge package is renamed to `packages/codegen-legacy` in this feature)) under MIT license, depending only on the Langium
  runtime, the Rune grammar package, and standard npm dependencies; it
  MUST NOT bundle, copy, or link any Rosetta or REGnosys-licensed code.
- **FR-016**: The system MUST be runnable in two contexts: (a) Node.js CLI
  reading from disk and writing to disk; (b) browser bundle inside the
  Studio app reading from in-memory documents and producing strings.
- **FR-017**: The Studio integration MUST update the active live-preview
  target within 500ms of a successful build phase on the source document,
  and MUST retain the last-known-good output for that target when the
  source has parser errors.
- **FR-018**: The Studio integration MUST expose a target switcher
  (Zod / JSON Schema / TypeScript) on the live-preview panel and MUST
  emit source-mapping data for ALL THREE targets (not just Zod) so that
  clicks on generated regions navigate to the originating Rune source
  locations regardless of which target is active.
- **FR-019**: When `--target json-schema` is selected, the system MUST emit
  output that validates against the JSON Schema 2020-12 meta-schema and
  encodes cardinality and enums (matching the cardinality semantics from
  FR-003).
- **FR-020**: When `--target typescript` is selected, the system MUST
  emit full `.ts` modules (NOT `.d.ts` declaration files) containing,
  for every Rune type:
  - a `class <TypeName> implements <TypeName>Shape` declaration with
    each Rune attribute as a typed instance field,
  - a static `from(json: unknown): <TypeName>` constructor that
    validates and instantiates from a plain JSON object,
  - a top-level `is<TypeName>(x: unknown): x is <TypeName>` type guard,
  - for inheritance hierarchies, a discriminator predicate
    (`is<ChildType>(x: <ParentType>): x is <ChildType>`),
  - for every Rune `condition <Name>` declared on the type, an
    instance method `validate<Name>(): { valid: boolean; errors: ... }`
    that runs the same predicate logic as the Zod `.refine()` /
    `.superRefine()` would, but as a method body.
  The emitted module MUST NOT import from `zod` (no runtime Zod
  dependency for consumers of this target).
- **FR-021**: Runtime helpers (`runeCheckOneOf`, `runeCount`,
  `runeAttrExists`) MUST be inlined into each emitted output file, not
  imported from a companion runtime package. Consumers depend only on
  the codegen-emitted files plus their existing Zod dependency; there
  is NO `@rune-langium/runtime` package to install. Inlining adds
  roughly 30 lines per emitted module — acceptable, tree-shakeable, and
  removes a version-skew failure mode.

#### Quality bars

The validation contract is **two-tier** (one tier for small, controlled
fixtures; one tier for the full CDM smoke).

**Tier 1 — fixture-diff (small, exhaustive)**

- **FR-022**: For every Rune construct in the fixture taxonomy
  (basic types, every cardinality form, enums with/without display names,
  single-level inheritance, multi-level inheritance, simple conditions,
  if/then/else, choice/one-of, meta types, key references, circular
  references), the test suite MUST hold a *committed* expected output
  file. Each test asserts byte-identical equality between the generated
  output and the committed fixture. Re-runs over the same input MUST
  produce identical bytes; SC-007 enforces this in CI.

**Tier 2 — black-box smoke (full CDM, no committed snapshot)**

- **FR-023**: When run against the full CDM model, the system MUST
  produce TypeScript that passes `tsc --noEmit` with zero errors. CDM
  output is NOT committed as a snapshot — it is regenerated and
  type-checked on every run. (This avoids ~10–50 MB of snapshot churn
  on every grammar tweak; structural breakage still surfaces because
  `tsc --noEmit` fails on any malformed emission.)
- **FR-024**: For every condition kind in the test taxonomy, the
  full-CDM smoke MUST be paired with a parse-valid / reject-invalid JSON
  battery: at least one valid CDM JSON instance is parsed without errors,
  and at least one hand-crafted invalid instance per condition kind is
  rejected. The small-fixture diffs cover output shape; the JSON battery
  covers behavioral correctness at scale.
- **FR-025**: Generator-time diagnostics MUST fail the build (CLI exits
  non-zero; Studio surfaces an error) when the input model references an
  attribute that does not exist on the type a condition is attached to.

#### Package coexistence

- **FR-026**: The existing `packages/codegen` (JVM bridge to
  `rosetta-code-generators`) MUST be renamed to `packages/codegen-legacy`
  as part of this feature. The new MIT-licensed Langium-native generator
  takes the canonical `packages/codegen` name. Both packages MUST build
  cleanly side-by-side after the rename.
- **FR-027**: Every existing import of `@rune-langium/codegen` in the
  workspace MUST be migrated as part of this feature. Consumers of the
  legacy JVM bridge (`apps/codegen-worker`, `apps/codegen-container`,
  any test utility) MUST switch to `@rune-langium/codegen-legacy`. After
  the migration, `pnpm -r run type-check` MUST pass without unresolved
  imports.

#### Function declarations (US6 — TS target only)

- **FR-028**: When the TypeScript target runs on a Rune model that
  contains `func` declarations, every `func` MUST emit as a
  module-level `export function` in the same generated module file as
  the types it shares a namespace with. The function signature MUST
  encode the Rune `inputs:` and `output:` shapes, including cardinality
  (scalar vs. array, optional vs. required).
- **FR-029**: The function body MUST be transpiled from the same
  expression-language pipeline US3 builds (FR-012, FR-013). `set <out>:
  <expr>` becomes `result = <expr>`; `add <out>: <expr>` becomes
  `result.push(<expr>)` for `(0..*)` outputs; `alias <name>: <expr>`
  becomes a `const <name> = <expr>` binding scoped to the function;
  pre-condition blocks MUST install at function entry as
  validation-throw checks; post-condition blocks MUST run at exit
  before the return value is surfaced.
- **FR-030**: When emitting a function module, the generator MUST order
  declarations so that any non-cyclic forward-call dependency is
  satisfied. For cyclic call graphs (mutual recursion), the generator
  MUST use function-declaration syntax (hoisted) rather than `const`
  bindings so source-level order does not matter. Cross-namespace
  function calls MUST emit a corresponding `import` statement at the
  top of the module file.
- **FR-031**: The Zod and JSON Schema targets MUST silently skip Rune
  `func` declarations (no Zod schema, no JSON Schema entry). The CLI
  MUST NOT emit a warning when a model contains funcs and the active
  target is Zod or JSON Schema; the silent skip is the contract.
- **FR-032**: A `func` declared without a body (no `set` or `add`,
  conditions only) is treated as abstract. The TS target MUST emit a
  function whose body throws a `Diagnostic("not_implemented")` after
  the pre-conditions run, AND MUST surface a generator-time hint
  (non-fatal warning) reminding the author to add a body. The
  pre/post conditions are still installed; abstract-ness is signalled
  by the throw, not by skipping the function entirely.

### Key Entities

- **Generator** — A pure function `(LangiumDocument | LangiumDocument[]) → GeneratorOutput`.
  No I/O. The CLI and Studio integrations wrap it with their respective
  read/write strategies.
- **GeneratorOutput** — A tree of `(relativePath, fileContents, sourceMap)`
  tuples that the caller writes to disk or to a virtual file system.
- **Target** — A discriminated identifier (`zod` | `json-schema` |
  `typescript`) selecting which emitter pipeline runs. The Zod target is
  canonical; JSON Schema is derivative (mechanical transformation);
  TypeScript is its own emitter pipeline that reuses the Zod target's
  expression transpiler but emits class-style modules with no Zod
  runtime dependency.
- **Fixture** — A `.rune` source file paired with an expected output file
  AND a set of JSON test cases (some valid, some invalid) used to drive
  parse/reject correctness tests.
- **Runtime helpers** — Generic JavaScript helper functions
  (`runeCheckOneOf`, `runeCount`, `runeAttrExists`) emitted *inline*
  into each generated file. There is no separate runtime package;
  helpers live alongside the schemas they support.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no JVM installed can install the package
  via npm, run the CLI on a `.rune` file, and `tsc --noEmit` the output
  cleanly within 5 minutes of starting (the JVM-dependent Rosetta
  generator path takes ~60 minutes including Maven downloads).
- **SC-002**: For the full CDM model, the generator emits output that
  passes `tsc --noEmit` with zero errors.
- **SC-003**: For every condition kind in the test taxonomy, the
  emitted Zod predicate accepts the same JSON inputs and rejects the
  same JSON inputs as the equivalent Python generator output, measured
  by ≥99% behavioral parity on a 200-case condition-fidelity test
  matrix.
- **SC-004**: The Studio live-preview panel updates within 500ms of a
  source edit on a 1000-type model on a modern laptop.
- **SC-005**: For a side-by-side comparison of the Rosetta TypeScript
  generator's `.d.ts` output vs. this generator's `--target typescript`
  output for the same Rune input, this generator emits a fully-runtime
  module (classes, constructors, type guards, condition methods) where
  the Rosetta TS gen emits ambient declarations only. Concretely: every
  `<TypeName>` in this generator's output is constructible from JSON
  (`Type.from(json)` returns a runnable instance), discriminable
  (`isType(x)` works on plain inputs), and validatable (every
  `condition <Name>` surfaces as an instance method); the Rosetta TS
  output supports none of these.
- **SC-006**: Running the generator against the full CDM completes in
  under 30 seconds on a modern laptop without exhausting heap.
- **SC-007**: Re-running the generator on identical input produces
  byte-identical output, verified by a CI fixture-diff job.
- **SC-008**: Once the Studio integration ships, ≥80% of `.rune` editing
  sessions in the Studio show an actively-rendered Zod preview panel
  (rather than the panel being closed or in a degraded state) — measured
  by the existing Studio telemetry.
- **SC-009**: Every `func` declaration in the curated CDM round-trips
  cleanly through the TypeScript target — the emitted module
  (a) compiles with `tsc --noEmit`, (b) every emitted function is
  callable with valid CDM input data and produces output that matches
  the Python generator's evaluation of the same function on the same
  input, measured by ≥99% behavioral parity on a 100-case
  function-fidelity test matrix (sibling to SC-003's condition-fidelity
  matrix).

## Assumptions

- The Rune grammar in `packages/core` is treated as the source of truth
  for the AST shape; this feature does not modify the grammar.
- The new generator takes the canonical `packages/codegen` name. The
  existing JVM-bridge to `rosetta-code-generators` is renamed in-place
  to `packages/codegen-legacy` as part of this feature, and its current
  consumers (`apps/codegen-worker`, `apps/codegen-container`) are
  re-wired to import from the new path. Deprecation / removal of the
  legacy package is out-of-scope for this feature and tracked separately.
- The CDM model versions used for the smoke test are the ones already
  vendored under `packages/curated-schema/fixtures/cdm/`.
- Reasonable npm-ecosystem norms apply: ESM-only, Node 20+, TypeScript
  5.9+, no transitive Java dependencies.
- No separate runtime helpers package is shipped: the three helpers
  (`runeCheckOneOf`, `runeCount`, `runeAttrExists`) are inlined into
  each generated file. This trades ~30 lines per emitted module for
  zero install-time deps and no version-skew risk.
- "Browser execution" means the generator runs in a Web Worker (the
  Studio's existing language-server worker) — not the main thread —
  so the 30-second CDM bound does not gate the UI.
- The Python generator (`REGnosys/rune-python-generator`) is the
  authoritative reference for condition semantics; ties go to its
  behavior on canonical CDM inputs.
- Generated output files are committed to neither the runtime monorepo
  nor downstream consumer repos by default; consumers run the generator
  in their own build step.
- Display name escaping follows JSON-string conventions (escape
  backslash, double-quote, and control characters); display names that
  cannot be expressed as a single-line JSON string are an authoring error.
- Substantial prior art for both expression-language interpretation
  AND `func` AST handling already exists in
  `packages/visual-editor/src/adapters/` — specifically
  `ast-to-expression-node.ts` (421 lines), `expression-node-to-dsl.ts`
  (327 lines, complete operator-precedence + visitor-pattern emitter),
  `ast-to-model.ts` lines 296–336 (handles `RosettaFunction` inputs,
  output, and super-function inheritance), and the operator-catalog +
  block-renderer machinery under
  `src/components/editors/expression-builder/`. The codegen MUST reuse
  the AST-shape understanding, operator-precedence table, and node
  taxonomy from these adapters; reimplementing them is wasted work.
  The new pipeline emits TypeScript / Zod / JSON Schema output rather
  than DSL text, but the visitor-pattern dispatch over the same `$type`
  discriminator is the same shape.
