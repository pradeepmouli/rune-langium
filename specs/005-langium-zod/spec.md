# Feature Specification: Langium-to-Zod Schema Generator

**Feature Branch**: `005-langium-zod`
**Created**: 2026-02-18
**Status**: Draft
**Input**: Need for runtime-validated Zod schemas derived from Langium-generated TypeScript AST types

## Overview

A code generation utility that reads a Langium grammar (`.langium`) and produces Zod v4 schemas for the generated AST types. This enables runtime validation, form integration (react-hook-form + zodResolver), API boundary contracts, and serialization guards — without manually duplicating the AST type definitions as Zod schemas.

The generator is grammar-aware: it leverages Langium's cardinality (`*`, `?`, `+`), cross-references (`Reference<T>`), union/alternative types, and discriminated unions (`$type`) to produce idiomatic Zod output that plain `ts-to-zod` cannot achieve.

## Problem Statement

Langium generates TypeScript interfaces from `.langium` grammar files (`src/generated/ast.ts`). These interfaces are the single source of truth for the AST structure. However:

1. **No runtime validation**: The generated types are compile-time only. Passing untrusted or malformed data (e.g., from JSON deserialization, WebSocket messages, or IPC) has no guardrails.
2. **Form integration gap**: react-hook-form + zod is the standard for validated forms in React. Without Zod schemas, form validation must be hand-coded and manually kept in sync with the AST types.
3. **Schema drift**: Hand-written Zod schemas (even with `z.infer` conformance checks) can drift when the grammar evolves. Grammar changes update `ast.ts` automatically, but Zod schemas require manual updates.
4. **Langium-specific challenges**: Langium AST types have circular references (`$container`), internal metadata (`$type`, `$document`, `$cstNode`), and `Reference<T>` cross-references that generic TS-to-Zod tools (`ts-to-zod`) cannot handle correctly.

## Clarifications

### Session 2026-02-18

**Q1**: Should the generator read the `.langium` grammar or the generated `ast.ts`?
**A**: The `.langium` grammar. It contains cardinality, optionality, and type alternative information that is lost in the generated TypeScript (e.g., `?` becomes `T | undefined`, `*` becomes `T[]`, but the distinction between `*` and `+` is lost in TS). The grammar JSON (`grammar.json`) is also acceptable as input.

**Q2**: How should `Reference<T>` cross-references be handled?
**A**: Configurable. Default: `z.string()` (the reference text). Optional: `z.object({ $refText: z.string() })` for LSP-aware consumers. Full resolution is out of scope.

**Q3**: Should internal Langium metadata (`$type`, `$container`, `$document`, `$cstNode`) be included?
**A**: `$type` should be included as a `z.literal()` discriminator. The rest should be excluded by default, with an `--include-internals` flag for advanced use cases.

**Q4**: What about circular references (e.g., `Data.superType → Reference<Data>`)?
**A**: Use `z.lazy()` for recursive types. The generator must detect cycles in the grammar graph and emit lazy schemas for back-edges.

**Q5**: Should the generator produce one schema per AST type, or composite schemas?
**A**: One schema per named grammar rule (each type in `ast.ts`), plus optional aggregate schemas for union types (e.g., `RosettaRootElementSchema = z.union([DataSchema, ChoiceSchema, ...])`).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Zod Schemas from Grammar (Priority: P1)

As a **Langium DSL developer**, I want to run a CLI command that reads my `.langium` grammar and generates Zod schemas for all AST types so that I have runtime validation matching my grammar without manual schema authoring.

**Why this priority**: This is the core value proposition. Without schema generation, the tool has no purpose.

**Independent Test**: Run the generator against the Rune DSL grammar. Verify that the generated schemas validate successfully against real CDM corpus AST data produced by the parser.

**Acceptance Scenarios**:

1. **Given** a `.langium` grammar with a `Data` rule containing `name: ValidID`, `superType: [Data]?`, `attributes: Attribute*`, **When** the generator runs, **Then** it produces a `DataSchema` with `name: z.string()`, `superType: z.string().optional()`, `attributes: z.array(AttributeSchema)`
2. **Given** a grammar with `RosettaEnumeration` having `enumValues: RosettaEnumValue+`, **When** generated, **Then** `enumValuesSchema` uses `z.array(RosettaEnumValueSchema).min(1)` (preserving `+` cardinality)
3. **Given** a grammar with union alternatives `RosettaRootElement: Data | Choice | RosettaEnumeration`, **When** generated, **Then** `RosettaRootElementSchema` uses `z.discriminatedUnion('$type', [DataSchema, ChoiceSchema, RosettaEnumerationSchema])`
4. **Given** a grammar with circular references (`Data.superType → Data`), **When** generated, **Then** the schema uses `z.lazy(() => DataSchema)` without stack overflow

---

### User Story 2 - Conformance Testing (Priority: P1)

As a **DSL developer**, I want the generated schemas to pass compile-time conformance checks against the Langium-generated TypeScript types so that I know immediately when the grammar changes break schema alignment.

**Why this priority**: Without conformance guarantees, the schemas are just another thing to maintain. Automated parity is the key differentiator over hand-written schemas.

**Independent Test**: Modify a grammar rule (e.g., add a field to `Data`), regenerate both the AST and the Zod schemas, and verify that the type-level conformance check fails until the schema is updated.

**Acceptance Scenarios**:

1. **Given** generated schemas, **When** `z.infer<typeof DataSchema>` is compared to the Langium `Data` interface at compile time, **Then** the types are assignable in both directions (modulo excluded internals)
2. **Given** a grammar change that adds a required field, **When** schemas are regenerated, **Then** the new field appears in the schema and existing conformance tests still pass
3. **Given** a grammar change that removes a field, **When** schemas are regenerated, **Then** the field is removed from the schema

---

### User Story 3 - Selective Generation (Priority: P2)

As a **DSL developer**, I want to generate schemas only for specific types (e.g., form-surface projections) so that I don't bloat my bundle with schemas for internal AST nodes I never validate at runtime.

**Why this priority**: Full AST schema generation produces large output. Most consumers need schemas for a subset (e.g., Data, Attribute, Enumeration for forms; RosettaModel for API boundaries).

**Independent Test**: Run the generator with `--include Data,Attribute,RosettaEnumeration`. Verify only those schemas are generated, with referenced types stubbed as `z.any()`.

**Acceptance Scenarios**:

1. **Given** `--include Data,Attribute`, **When** generated, **Then** only `DataSchema` and `AttributeSchema` are emitted; types referenced by Data but not in the include list are `z.any()`
2. **Given** `--exclude Condition,AnnotationRef`, **When** generated, **Then** all schemas except those are emitted
3. **Given** `--projection Data:name,attributes,superType`, **When** generated, **Then** `DataSchema` includes only those three fields (a projection/pick)

---

### User Story 4 - Form-Surface Schemas (Priority: P2)

As a **visual editor developer**, I want to generate form-surface Zod schemas that represent the editable subset of each AST type so that react-hook-form can validate form inputs against the grammar.

**Why this priority**: This is the immediate use case in `@rune-langium/visual-editor`. Form-surface schemas are small projections of the full AST types, matching what the editor forms actually edit.

**Independent Test**: Generate form-surface schemas for Data, Enumeration, Choice, and Function. Wire them into react-hook-form with `zodResolver`. Verify that invalid inputs (empty name, invalid cardinality) are rejected with correct error messages.

**Acceptance Scenarios**:

1. **Given** a form-surface config for `Data` with fields `[name, parentType]`, **When** generated, **Then** `DataFormSchema` validates `name: z.string().min(1)` and `parentType: z.string().nullable()`
2. **Given** a `MemberDisplay` projection with `[name, typeName, cardinality]`, **When** generated, **Then** `AttributeFormSchema` validates cardinality format with a regex pattern
3. **Given** generated form schemas wired via `zodResolver`, **When** a user submits a form with an empty name, **Then** the error message "Name is required" appears inline via `<FormMessage>`

---

## Non-Functional Requirements

| NFR | Target | Measurement |
|-----|--------|-------------|
| Generation speed | <2s for Rune DSL grammar (~50 rules) | CLI timing |
| Output size | <500 lines for full AST schemas | `wc -l` on generated file |
| Zero runtime dep beyond zod | No additional deps in generated code | Package inspection |
| Idiomatic output | Generated code passes oxlint | Lint check |
| Deterministic | Same input → identical output (no timestamps) | Diff check |

## Technical Approach

### Architecture

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  .langium file │────▶│  Grammar Parser   │────▶│   Schema Emitter │
│  (or .json)    │     │  (Langium API)    │     │   (Zod codegen)  │
└────────────────┘     └──────────────────┘     └─────────────────┘
                              │                         │
                              ▼                         ▼
                       Grammar AST              Generated .ts file
                       (rules, types,           with Zod schemas
                        alternatives,
                        cardinalities)
```

### Key Mapping Rules

| Langium Concept | Zod Output |
|-----------------|------------|
| `name: ValidID` (required string) | `z.string().min(1)` |
| `value: INT` (required number) | `z.number().int()` |
| `flag: BOOLEAN` | `z.boolean()` |
| `attr: Attribute` (required ref) | `AttributeSchema` |
| `attr: Attribute?` (optional) | `AttributeSchema.optional()` |
| `attrs: Attribute*` (0..n array) | `z.array(AttributeSchema)` |
| `attrs: Attribute+` (1..n array) | `z.array(AttributeSchema).min(1)` |
| `ref: [Data]` (cross-reference) | `z.string()` (ref text) |
| `ref: [Data]?` (optional xref) | `z.string().optional()` |
| `A \| B \| C` (union) | `z.union([ASchema, BSchema, CSchema])` |
| `$type` discriminator | `z.literal('TypeName')` |
| Circular reference | `z.lazy(() => Schema)` |

### Package Structure

```
packages/langium-zod/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # CLI entry
│   ├── grammar-reader.ts # Parse .langium / .json grammar
│   ├── type-analyzer.ts  # Analyze rules, detect cycles
│   ├── schema-emitter.ts # Emit Zod schema code
│   ├── projection.ts     # Form-surface projection config
│   └── conformance.ts    # Type-level conformance check generator
└── test/
    ├── rune-dsl.test.ts  # Test against Rune DSL grammar
    ├── hello-world.test.ts # Test against simple grammar
    └── fixtures/
        └── hello-world.langium
```

### CLI Interface

```bash
# Full generation
npx langium-zod generate --grammar src/language/rune-dsl.langium --output src/generated/schemas.ts

# Selective generation
npx langium-zod generate --grammar ... --include Data,Attribute,RosettaEnumeration

# Form-surface projection
npx langium-zod generate --grammar ... --projection form-surfaces.json

# With conformance checks
npx langium-zod generate --grammar ... --conformance --ast-types src/generated/ast.ts
```

## Out of Scope

- Full `Reference<T>` resolution at runtime (requires Langium document context)
- Zod schemas for Langium internals (`$document`, `$cstNode`, `$container`)
- Schema generation for non-Langium TypeScript types (use `ts-to-zod` for that)
- Zod v3 support (v4 only)
- Runtime validators beyond what Zod provides (no custom parser integration)

## Open Questions

1. Should the generator be a Langium CLI plugin (`langium generate --zod`) or a standalone CLI?
2. Should generated schemas import from `zod` or `zod/v4`? (Depends on whether Zod v4 is stable by build time)
3. Should the tool be published to npm as a standalone package for the broader Langium community?
