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
arrays do not encode every Rune minimum or maximum cardinality.

Function bodies preserve calls, aliases, assignments, conditions, inheritance,
and dispatch. Metadata-annotated parameters use `RuneFieldWithMeta<T>` or
`RuneReferenceWithMeta<T>`; ordinary value expressions unwrap field metadata,
while calls and assignments retain wrappers where their declarations require them.
Converting reference metadata to field metadata requires a payload value; an
unresolved reference throws instead of producing a field wrapper without a value.
Collection membership and distinct operations use structural value keys, so
separately allocated records with the same values compare equally.

Abstract functions and library declarations require implementations. A generated
library callable exposes a typed `.implementation` property for the host to supply.
Invalid or unknown expression nodes emit diagnostics and throw when evaluated.

`test/emit/function-runtime.test.ts` parses Rune, generates complete modules,
checks them with TypeScript strict mode, and executes the result. Its call-site
checks also verify rejection of incompatible inputs and return assignments.
