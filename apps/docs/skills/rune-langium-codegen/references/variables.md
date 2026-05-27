# Variables & Constants

## generator

### `IMPLEMENTED_TARGETS`
The targets `runGenerate` can actually produce output for in this build.

A target is "implemented" if any of:
  - it has a NAMESPACE_EMITTERS entry (covers per-namespace dispatch);
  - it has a WHOLE_MODEL_EMITTERS entry (covers hand-rolled whole-model);
  - it has a NAMESPACE_EMITTERS entry AND a PROFILES entry (covers
    synthesized whole-model dispatch).

Phase 0/0.5.1 only registers the three per-namespace emitters, so this
resolves to ['zod', 'json-schema', 'typescript']. Phase 1/2/3 add to
the appropriate registry and this list updates automatically.

018 Phase 0 Task 0.7 follow-up; expanded in 019 Phase 0.5.1.
```ts
const IMPLEMENTED_TARGETS: readonly Target[]
```

## types

### `TARGET_DESCRIPTORS`
Registry of all generator targets. The studio reads this to render
the targets table; `runGenerate` reads it to pick the dispatch path.
Keep in sync with the Target union — TS exhaustiveness check
on `Record<Target, ...>` enforces this at compile time.

018 Phase 0 Task 0.3. Phases 1-3 add the missing emitter
implementations; this registry is the contract those phases land
against.
```ts
const TARGET_DESCRIPTORS: Record<Target, TargetDescriptor>
```

## options

### `ExcelOptionsSchema`
```ts
const ExcelOptionsSchema: ZodObject<{ sheets: ZodDefault<ZodObject<{ types: ZodDefault<ZodBoolean>; enums: ZodDefault<ZodBoolean>; typeAliases: ZodDefault<ZodBoolean>; conditions: ZodDefault<ZodBoolean> }, $strip>> }, $strip>
```

## helpers

### `RUNTIME_HELPER_JS_SOURCE`
Plain JavaScript equivalent of `RUNTIME_HELPER_SOURCE` — no type annotations.

Used by the Studio codegen worker when executing generated functions in a
sandboxed Function constructor. Since the worker strips TypeScript annotations
from the isolated function body (`GeneratedFunc.fileContents`), the helpers
also need to be annotation-free so no TypeScript constructs reach the JS engine.
```ts
const RUNTIME_HELPER_JS_SOURCE: string
```
