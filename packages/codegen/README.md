# @rune-langium/codegen

> Generate code and form-preview schemas from parsed Rune DSL documents.

Code generation and preview-schema utilities for parsed Rune DSL / Rosetta models.

## Features

- Emit generated files with `generate`
- Build inspector/form schemas with `generatePreviewSchemas`
- Surface generator diagnostics through `GeneratorError`

## TypeScript functions

Rune functions emit named exports with a single typed input object and an explicit
return type. Data values use `RuneFuncData<TypeShape>`, which preserves nested
fields while excluding class validation methods. Required inputs are required properties; optional inputs use `?`;
collection inputs and outputs use arrays. An optional scalar output returns
`T | undefined`. These types describe values and collection shape; TypeScript
arrays do not encode every Rune minimum or maximum cardinality. Generated
functions enforce declared output bounds at runtime, including absent-only `(0..0)` outputs.
Required metadata assignment fields reject absent values. Metadata helper discovery
follows linked declarations, including imported constructor and assignment fields.

Generated TypeScript imports `Temporal` from `@js-temporal/polyfill`; install that
package alongside the generated code. Function inputs and outputs use ISO strings,
while model classes use Temporal instances. Shared helpers convert class arguments
at function calls, read calendar fields, construct validated calendar values, and
perform date arithmetic. Studio supplies the same polyfill to executable previews.

Scalar/list normalization is shared across functions, validators, and previews.
`extract` and list literals flatten one collection level; scalar assignments reject
multiple values. Arithmetic returns no value when an operand is absent or has more
than one value. Ordered comparisons involving absent operands are false. Sorting
places absent keys last; min/max choose populated keys when present.

Studio function previews resolve inherited and dispatch input signatures.
`normalizePreviewInputs` adapts plain form values to metadata wrappers using the
shared type resolver and runtime helpers, including nested and recursive values
beyond the form renderer's expansion depth.

Function bodies preserve calls, aliases, assignments, conditions, inheritance,
and dispatch, including overloads split across namespace files. Core and codegen
share the base-signature resolver. Qualified calls retain their resolved namespace through imports,
implicit calls, and `super`. Functions sharing a name with a type receive a `NameFunction` export (with a numeric suffix when needed); `GeneratedFunc.exportName` records it while `name` retains the Rune name. Otherwise per-namespace files keep their original exported
function names; conflicting callable names in barrel and single-file output use
`__rune$namespace$Name` exports (namespace dots become `$`). Internal aliases use
`$` so Rune inputs and aliases cannot shadow them.
Metadata-annotated parameters use `RuneFieldWithMeta<T>` or
`RuneReferenceWithMeta<T>`; ordinary value expressions unwrap field metadata,
while calls and assignments retain wrappers where their declarations require them.
Aliases retain metadata wrappers, including through chained bindings; value reads
unwrap them using the alias's metadata kind and cardinality.
Constructor fields use the same declared metadata and cardinality normalization
as function parameters. Nested assignments enter wrapper values and create missing
containers; collection intermediates select or create the first element, matching
the Java generator's builder semantics.
Implicit collection and pipeline calls retain the item's metadata. Conditional
and `default` branches normalize mixed raw, field, and reference values to a common
wrapper kind while evaluating only the selected branch. Switches use the same
branch normalization and preserve scalar, collection, and empty results.
Switch comparisons use selector payloads while whole-selector `item` branches
retain the original metadata wrapper. Choice branches bind the projected option. Arithmetic, aggregation,
conversions, predicates, and collection comparison keys read payloads even when
the enclosing output requires metadata. Filters, sorting, and min/max retain the
selected values' wrappers.

Deep navigation resolves types through `default` receivers and switch branch results.
Collection and pipeline result types use the same core operator propagation as language-service scopes.
Metadata navigation projects over collections and omits absent metadata values.
Functionless `extract` and `then` preserve item metadata for wrapped outputs and
read payloads for raw outputs.
Structural equality and collection keys compare Temporal values by their type and
canonical string value, including when nested in Data records.

Choice constructors, navigation, and assignment paths share emitted option names.
Nested assignments select the declared Choice arm when building its value, including
through collection and metadata boundaries.
Mixed list literals normalize each element separately. Reducers track accumulator
and item metadata independently, normalize the initial accumulator, and omit
unresolved references when reducing payloads. Empty reductions return no value.
Dispatch compares the selector's value without changing the wrapper used by its body.
Converting reference metadata to field metadata requires a payload value; an
unresolved reference throws instead of producing a field wrapper without a value.
Collection membership and distinct operations use structural value keys, so
separately allocated records with the same values compare equally.
`distinct` compares metadata payloads and retains the first matching wrapper.
Deep navigation preserves collections at intermediate path segments, including
collection-valued `default` receivers. Switch cases
and defaults bind `item` to the selected value. Two empty collections or two absent
optional scalars compare equal and do not compare unequal; an empty collection
and an absent scalar remain distinct.
Data switch guards compare linked declaration identity and explicit supertypes,
keeping same-named types in different namespaces distinct.
Data subtype switch cases require a populated distinguishing field when the
selector's declared type does not already establish that subtype. Inherited
fields alone do not distinguish a subtype from its parent.

Mapped TypeScript library functions use the bindings in `typescriptProfile`:
`Min` and `Max` use `Math.min` and `Math.max`, and `IsLeapYear` uses the shared
runtime implementation in every output layout. Unmapped library callables expose
a typed `.implementation` property for the host to supply. Abstract functions
still require implementations.
Invalid or unknown expression nodes emit diagnostics and throw when evaluated.

`test/emit/function-runtime.test.ts` parses Rune, generates complete modules,
checks them with TypeScript strict mode, and executes the result. Its call-site
checks also verify rejection of incompatible inputs and return assignments.
