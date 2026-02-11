# Xtext Custom Parsing Analysis — Rune DSL

## Source Location
- Xtext grammar: `.resources/rune-dsl-src/rune-lang/src/main/java/com/regnosys/rosetta/Rosetta.xtext` (938 lines)
- Java custom services: `.resources/rune-dsl-src/rune-lang/src/main/java/com/regnosys/rosetta/`
- Ecore model: `.resources/rune-dsl-src/rune-lang/model/RosettaExpression.xcore`

## Key Findings

### 1. Value Converters (parsing/*)
- `ValidIDConverter.java` — allows keywords (`condition`, `source`, `value`, `version`, `pattern`, `scope`) as identifiers. Our Langium `ValidID` rule is equivalent. No gap.
- `RosettaValueConverterService.java` — binds ValidID, QualifiedName, Integer, BigDecimal, PATTERN converters. All handled by Langium grammar data type rules. No gap.
- `BigDecimalConverter.java` / `BigIntegerConverter.java` — simple numeric converters. Handled by grammar. No gap.
- `PATTERNValueConverter.java` — for `/regex/` patterns. Currently commented out in Xtext too. No gap.

### 2. Critical Grammar Differences

#### 2.1 InlineFunction vs ImplicitInlineFunction (BIGGEST IMPACT)

**Xtext (lines 538-544, 687-692):**
```xtext
InlineFunction:
    =>((parameters+=ClosureParameter (',' parameters += ClosureParameter)*)? '[') body=Expression ']'
;
ImplicitInlineFunction returns InlineFunction:
    body=OrOperation
;
// Usage for extract/filter/reduce:
) (function=InlineFunction|=>function=ImplicitInlineFunction)?
```

**Problem:** `extract`/`filter`/`reduce` accept EITHER `InlineFunction` (with `[...]` brackets) OR `ImplicitInlineFunction` (bare OrOperation). The `=>` syntactic predicate resolves the ambiguity. Langium (Chevrotain LL(k)) cannot do this — adding `ImplicitInlineFunction` as an alternative causes the parser builder to **hang indefinitely**.

**CDM patterns affected (54+ files):**
- `extract BusinessCenterHolidays(item)` — bare function call
- `extract value` — bare symbol reference
- `filter priceType = PriceTypeEnum -> AssetPrice` — bare equality
- `filter (priceQuantity -> quantitySchedule exists)` — parenthesized expr
- `then extract value` — in ThenOperation chain

**Solution:** Do NOT add ImplicitInlineFunction to grammar. Instead:
1. Keep `function=InlineFunction?` for extract/filter/reduce
2. In `ThenOperation`, the `ImplicitInlineFunction` is already `function=ImplicitInlineFunction?` which works because it's `body=OrOperation` and there's no ambiguity with InlineFunction at that level
3. For standalone `extract expr` patterns (outside ThenOperation), restructure so `extract`/`filter`/`reduce` absorb the following expression differently — possibly by making them accept an optional raw expression when no `[` bracket follows
4. Alternative: implement a **custom parser override** in TypeScript that handles the ambiguity

#### 2.2 "Without Left Parameter" Pattern (7 duplicated rule sets)

**Xtext (lines 573-767):** Every binary op rule (`OrOperation`, `AndOperation`, `EqualityOperation`, `ComparisonOperation`, `MultiplicativeOperation`, `BinaryOperation`) and the `UnaryOperation` rule has a duplicated "without left parameter" alternative. The parser creates AST nodes with `left=null` / `argument=null`, and `RosettaDerivedStateComputer` fills in `item` post-parse.

**CDM patterns affected:**
- `then all = True` — EqualityOperation without left (cardMod='all', op='=', right=True)
- `then default False` — DefaultOperation without left
- `then flatten`, `then distinct`, `then first` — UnaryOperation without argument

**Solution:** Add "without argument" unary operators and "without left" binary operators as `PrimaryExpression` alternatives. These don't cause LL(k) issues because they start with unique keywords. Then implement a TypeScript derived state service to fill in `item`.

#### 2.3 RosettaCalcOnlyExists (Multi-arg only-exists)

**Xtext (lines 797-800):**
```xtext
RosettaCalcOnlyExists returns RosettaExpression:
    {RosettaOnlyExistsExpression} (args+=RosettaOnlyExistsElement | (hasParentheses?='(' args+=RosettaOnlyExistsElement (',' args+=RosettaOnlyExistsElement)* ')')) 'only' 'exists'
;
```

**CDM usage:** `(primitiveInstruction -> execution, primitiveInstruction -> transfer) only exists`

**Solution:** Add as PrimaryExpression alternative with its own helper rules. This is already added in the pending changes and doesn't cause LL(k) issues.

#### 2.4 ConstructorExpression (Separate in Xtext)

**Xtext (line 787):** ConstructorExpression is a separate PrimaryExpression, not merged with function call.

**Our grammar:** Merged into `QualifiedNamePrimary` — works but may have edge cases.

### 3. Derived State Computer (derivedstate/RosettaDerivedStateComputer.java)

Post-parse processing that we need to implement in TypeScript:

1. **Auto-fill implicit variable (`item`)** — Any `HasGeneratedInput` node where `left===null` (binary) or `argument===null` (unary) gets `item` auto-generated. This is the mechanism that makes "without left parameter" work.

2. **Auto-fill `else empty`** — `if x then y` without `else` gets `else empty` auto-generated.

3. **Auto-fill join separator** — `join` without explicit separator gets `""`.

4. **Set `implicitVariableIsInContext`** — On callable references.

### 4. Scope Provider (scoping/RosettaScopeProvider.java)

Key custom scoping (partially implemented in our `rune-dsl-scope-provider.ts`):
- Implicit import of `com.rosetta.model.*`
- Feature call scoping based on receiver type (needs TypeProvider)
- Deep feature call (`->>`) recursive features via DeepFeatureCallUtil
- Symbol resolution with context-aware scope (function inputs/outputs, inline params)
- Import aliases
- Reversed scoping (ReversedSimpleScope)

### 5. Runtime Module Bindings (RosettaRuntimeModule.java)

| Xtext Binding | Langium Equivalent | Status |
|---|---|---|
| `IValueConverterService → RosettaValueConverterService` | Grammar data type rules | ✅ Done |
| `IScopeProvider → RosettaScopeProvider` | `rune-dsl-scope-provider.ts` | 🔄 Partial |
| `ILinkingService → RosettaLinkingService` | Langium default linker | ✅ Done |
| `IQualifiedNameProvider → RosettaQualifiedNameProvider` | Langium default | ✅ Done |
| `IDerivedStateComputer → RosettaDerivedStateComputer` | **Needs new TS service** | ❌ Missing |
| `XtextResource → RosettaResource` | Not needed in Langium | N/A |

## Implementation Plan

### Step 1: Grammar Changes (LL(k)-safe)
- Keep `function=InlineFunction?` for extract/filter/reduce in UnaryOperation (no ImplicitInlineFunction)
- Add "without argument" unary ops as PrimaryExpression alternatives
- Add "without left" binary ops (`contains`, `disjoint`, `default`, `join`, `=`, `<>`, `>=`, etc.) as PrimaryExpression alternatives
- Add `RosettaCalcOnlyExists` as PrimaryExpression alternative

### Step 2: TypeScript Services
- **`rune-dsl-derived-state.ts`** — Post-parse processor:
  - Walk AST, find nodes with null argument/left
  - Inject `item` implicit variable reference
  - Auto-fill `else empty`, join separator
- Update `rune-dsl-module.ts` to register as document build listener

### Step 3: Handle ImplicitInlineFunction for extract/filter/reduce
The `then` operation already supports `ImplicitInlineFunction` (`function=ImplicitInlineFunction?` which is `body=OrOperation`). Most CDM usage of bare `extract expr` is via `then extract expr`, so ThenOperation chains handle it.

For the remaining cases where `extract`/`filter`/`reduce` appear as postfix with bare expression, we need either:
a. A custom parser hook (Langium supports `parserCustomizer`)
b. Make extract/filter/reduce absorb the next expression as a direct child (not via InlineFunction) when no `[` follows — this requires a grammar restructure to avoid ambiguity

### Step 4: CDM Conformance Testing
- Run conformance tests to measure parse rate improvement
- Target: 90%+ parse rate after grammar + service fixes

## CDM Parse Error Categories (from prior analysis)

| Error Category | Count | Root Cause | Fix |
|---|---|---|---|
| Generic parse failures | 471 | Multiple causes | Various |
| `paragraph` keyword | 74 | Segment name cross-ref | Scoping fix |
| `)` vs `,` issues | 57 | Inline function syntax | ImplicitInlineFunction |
| `[` expected but `(` found | 56 | Bare expression after extract | ImplicitInlineFunction |
| STRING in `]` issues | 55 | docReference segments | Scoping fix |
| `{` and `:` issues | 35 | Constructor expressions | Already handled |
| `...` spread operator | 17 | Already in grammar | None needed |
| `item` implicit variable | 17 | Without-left pattern | PrimaryExpression + derived state |
| `extract` standalone | 11 | ImplicitInlineFunction | ThenOperation + derived state |

## Files in Xtext Source (for reference)

### Parser/Converter
- `parsing/ValidIDConverter.java`
- `parsing/RosettaValueConverterService.java`
- `parsing/BigDecimalConverter.java`
- `parsing/BigIntegerConverter.java`

### Scoping
- `scoping/RosettaScopeProvider.java`
- `scoping/RosettaLinkingService.java`
- `scoping/ReversedSimpleScope.java`

### Derived State
- `derivedstate/RosettaDerivedStateComputer.java`

### Model
- `model/RosettaExpression.xcore` — HasGeneratedInput interface, needsGeneratedInput()
- `model/Rosetta.xcore`
- `model/RosettaSimple.xcore`

### Utility
- `utils/ExpressionHelper.java`
- `utils/ImplicitVariableUtil.java`
