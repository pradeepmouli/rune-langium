# Research: 017-codegen-complete-types

**Date**: 2026-05-01

## R1: Rule Grammar & AST Structure

**Decision**: Rules are `RosettaRootElement` with two modes — `reporting` (default) and `eligibility` (flagged by boolean). Each has an expression body, optional input type (`from TypeCall`), optional identifier (`as "string"`), and references.

**Grammar**:
```
RosettaRule:
    ('reporting' | eligibility?='eligibility') 'rule' RosettaNamed
    ('from' input=TypeCall)? ':'
    RosettaDefinable?
    (References)*
    expression=Expression
    ('as' identifier=STRING)?
;
```

**AST Properties**: `name`, `eligibility: boolean`, `expression: RosettaExpression`, `input?: TypeCall`, `identifier?: string`, `definition?: string`, `references[]`.

**Type guard**: `isRosettaRule()` exists in generated AST.

**Real examples from fixtures**:
- `reporting rule DateRule from Trade: Trade -> tradeDate`
- `eligibility rule BigTrade from Trade: Trade -> notional > 1000000`
- Complex rules with `extract`, `filter`, constructor expressions

**Rationale**: Rules use the same expression language as conditions and function bodies — the existing transpiler handles all expression forms.

## R2: Report Grammar & AST Structure

**Decision**: Reports are regulatory-domain-specific constructs referencing regulatory bodies, timing, input types, eligibility rules, output types, and rule sources.

**Grammar**:
```
RosettaReport:
    'report' regulatoryBody=RegulatoryDocumentReference
    'in' ('real-time' | 'T+1' | ... | 'ASATP')
    'from' inputType=TypeCall
    'when' eligibilityRules+=[RosettaRule]+
    ('using' 'standard' reportingStandard=[RosettaCorpus])?
    'with' 'type' reportType=[Data]
    ('with' 'source' ruleSource=[RosettaExternalRuleSource])?
;
```

**AST Properties**: `regulatoryBody`, `inputType`, `eligibilityRules[]` (references to rules), `reportType` (reference to Data), `reportingStandard?`, `ruleSource?`.

**Rationale**: Reports are compositional — they bind eligibility rules to input types and output data types. Codegen emits the structural binding as a typed interface, not the regulatory body text.

## R3: Current Emitter Architecture

**Decision**: Both emitters share identical `EmissionContext` shape: `{ target, emitOrder, lazyTypes, sourceMap, diagnostics, namespace, dataByName, enumByName }`. The `buildEmissionContext()` function only collects `isData()` and `isRosettaEnumeration()` elements — everything else is silently dropped.

**Key findings**:
- `generate()` receives all documents at once, groups by namespace via `groupByNamespace()`, then processes each namespace independently
- No cross-namespace state is shared between per-namespace emitter calls
- No imports are emitted today — not even `import { z } from 'zod'` dynamically (it's hardcoded in header)
- Functions extracted separately via `extractFuncs()` only in TS emitter

**Alternatives considered**:
- Single-pass with global context: simpler but requires loading everything into memory
- Multi-pass with cache: more scalable but more complex
- **Chosen**: Extend existing `generate()` to build a global namespace registry first, then pass it into per-namespace emission. This is a single-pass approach that fits the existing architecture.

## R4: Cross-Namespace Import Resolution

**Decision**: Build a `NamespaceRegistry` (global, across all namespaces) during the grouping phase. Each per-namespace emitter call receives the registry to resolve cross-namespace references and compute import paths.

**Design**:
- `NamespaceRegistry`: `Map<namespace, { dataNames, enumNames, funcNames, ruleNames, typeAliasNames, annotationNames }>`
- Import path computation: namespace `a.b.c` → relative path `../a/b/c/index.js` from current namespace
- Cross-namespace references detected during type resolution (existing `resolveTypeExprAsTs`/`resolveTypeExprAsZod` functions)
- Collected into a `Set<string>` of import statements, deduplicated, emitted after file header

**Rationale**: The `generate()` function already receives all documents. The grouping step already iterates all namespaces. Adding a registry build here is minimal overhead.

**Stub resolution**: `collectFuncCrossNamespaceImports()` at ts-emitter.ts:819 will be replaced by a general `collectCrossNamespaceImports()` that handles all construct types.

## R5: Studio Codegen Worker Pipeline

**Decision**: The codegen worker already handles both code generation and preview schema generation via separate message channels. Function execution for form preview requires a new message type and sandboxed eval capability.

**Current flow**: source edit → `codegen:setFiles` → worker parses → `preview:generate` → `generatePreviewSchemas()` → `preview:result` → preview store → FormPreviewPanel renders.

**No function execution exists** in the current pipeline. Form preview only renders forms and validates via client-side Zod schemas — it does not execute generated TypeScript code.

**Function execution design**: New `preview:execute` message type → worker transpiles function to runnable JS → executes in worker scope (already sandboxed) → returns output or error.

## R6: Annotation Declaration Structure

**Decision**: Annotations are first-class grammar constructs with their own typed attributes.

**Grammar**:
```
Annotation:
    'annotation' RosettaNamed ':' RosettaDefinable?
    ('[' 'prefix' prefix=ValidID ']')?
    attributes+=Attribute*
;
```

**Usage**:
```
AnnotationRef:
    '[' annotation=[Annotation:ValidID]
    (attribute=[Attribute:ValidID] (qualifiers+=AnnotationQualifier)*)?
    ']'
;
```

**Key insight**: Each annotation declaration has its own `attributes` (typed fields with cardinality). This maps naturally to TypeScript decorator factory parameter types and Zod `.meta()` object shapes.

## R7: TypeAlias Structure

**Decision**: Type aliases wrap a type reference with optional conditions and type parameters.

**Grammar**:
```
RosettaTypeAlias:
    'typeAlias' RosettaNamed TypeParameters? ':' RosettaDefinable?
    RosettaTyped conditions+=Condition*
;
```

**AST Properties**: `name`, `typeCall` (the aliased type), `parameters[]` (type params), `conditions[]`, `definition?`.

**Type guard**: `isRosettaTypeAlias()` exists in generated AST.

**Codegen mapping**:
- TS: `export type Price = number;` (for primitive aliases), or `export type Foo = BarShape;` (for data aliases)
- Zod: `export const PriceSchema = z.number().refine(...)` (with conditions)
- Type parameters: TS generics where possible; Zod inlines concrete types (Zod cannot represent generics)

## R8: Zod .meta() API

**Decision**: Zod 4 (used in this project as `zod 4.3.6`) supports `.meta()` for attaching arbitrary metadata to schemas and `.describe()` for string descriptions.

**Rationale**: `.meta()` accepts any JSON-serializable object, making it suitable for structured annotation data. `.describe()` maps naturally to Rune's `<"description">` syntax on annotations.
