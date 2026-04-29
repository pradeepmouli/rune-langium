# Configuration

## GeneratePreviewSchemaOptions

Options for `generatePreviewSchemas()`.

`targetId` narrows generation to a single data type / form target. When
omitted, schemas are generated for every supported target in the document set.

### Properties

#### targetId

Generate only the schema for this fully-qualified target id.

**Type:** `string`

#### maxDepth

Maximum recursion depth to follow when expanding nested object fields.

**Type:** `number`

## GeneratorOptions

Options for a generation run.
FR-001 (target selection), FR-022 (strict mode).

### Properties

#### target

Selects the emitter pipeline. Defaults to 'zod'.

**Type:** `Target`

#### strict

If true, any GeneratorDiagnostic with severity 'error' causes
generate() to throw a GeneratorError instead of returning a partial result.
FR-022.

**Type:** `boolean`

#### headerComment

Optional string prepended to each emitted file's header comment.
Do NOT set when requiring byte-identical output (SC-007).

**Type:** `string`