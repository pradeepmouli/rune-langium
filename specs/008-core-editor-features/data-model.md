# Data Model: Core Editor Features

**Branch**: `008-core-editor-features` | **Date**: 2026-03-12

## Entities

### ModelSource

Represents a git repository containing Rune DSL model files.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (e.g., "cdm", "fpml", or URL hash) |
| name | string | Display name (e.g., "CDM", "FpML") |
| repoUrl | string | Public git repository URL |
| ref | string | Git tag, branch, or commit ref |
| paths | string[] | Glob patterns for .rosetta file discovery (e.g., ["rosetta-source/src/main/rosetta/**/*.rosetta"]) |

**Validation**: repoUrl must be a valid HTTPS URL. ref must be non-empty.

### CachedModel

Represents a locally cached model with version tracking.

| Field | Type | Description |
|-------|------|-------------|
| sourceId | string | References ModelSource.id |
| ref | string | Git ref that was fetched |
| commitHash | string | Actual commit SHA at time of fetch |
| files | CachedFile[] | Parsed .rosetta file contents |
| fetchedAt | number | Timestamp of last fetch (epoch ms) |
| totalFiles | number | Count of .rosetta files in the model |

**Lifecycle**: Created on first load → Updated when ref changes → Deleted on explicit clear.

### CachedFile

Individual cached .rosetta file within a model.

| Field | Type | Description |
|-------|------|-------------|
| path | string | Relative path within the repository |
| content | string | Raw .rosetta file content |
| namespace | string | Extracted namespace from file |

### ModelRegistry

Static configuration of well-known models.

| Field | Type | Description |
|-------|------|-------------|
| models | ModelSource[] | Curated list of known models |

**Built-in entries**: CDM (REGnosys/rosetta-cdm), FpML (REGnosys/rosetta-dsl), Rune FpML (finos/rune-fpml).

### Condition (existing AST node)

Already defined in the Langium grammar. Editor representation:

| Field | Type | Description |
|-------|------|-------------|
| name | string? | Optional condition name |
| definition | string? | Optional description |
| expression | Expression | Required expression body |
| postCondition | boolean | false = pre-condition, true = post-condition |

**State transitions**: Empty → Named → Has Expression → Valid (expression resolves without errors).

### FormSurface (generation artifact)

| Field | Type | Description |
|-------|------|-------------|
| schemaName | string | Zod schema export name (e.g., "RosettaEnumerationSchema") |
| grammarRule | string | Source grammar rule (e.g., "RosettaEnumeration") |
| projectedFields | string[] | Business-relevant fields from form-surfaces.json |
| componentMappings | Record<string, string> | Field path → custom component name |
| status | "generated" \| "migrated" \| "hand-coded" | Current migration state |

### CodeGenerationRequest

| Field | Type | Description |
|-------|------|-------------|
| language | string | Target language (e.g., "java", "python", "scala") |
| modelFiles | string[] | Serialized .rosetta file contents |
| options | Record<string, string> | Generator-specific options |

### CodeGenerationResult

| Field | Type | Description |
|-------|------|-------------|
| language | string | Target language used |
| files | GeneratedFile[] | Output code files |
| errors | GenerationError[] | Errors encountered |
| warnings | string[] | Non-fatal warnings |

### GeneratedFile

| Field | Type | Description |
|-------|------|-------------|
| path | string | Output file path (e.g., "com/rosetta/model/MyType.java") |
| content | string | Generated source code |

### GenerationError

| Field | Type | Description |
|-------|------|-------------|
| sourceFile | string | .rosetta file that caused the error |
| construct | string | DSL construct that failed |
| message | string | Error description |

## Relationships

```
ModelRegistry 1──* ModelSource
ModelSource 1──? CachedModel (cached locally)
CachedModel 1──* CachedFile
RosettaFunction 1──* Condition
Condition 1──1 Expression
FormSurface *──1 GrammarRule (via schemaName)
CodeGenerationRequest *──* ModelFile (serialized .rosetta)
CodeGenerationResult 1──* GeneratedFile
CodeGenerationResult 1──* GenerationError
```
