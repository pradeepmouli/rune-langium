# Data Model: Studio Form Preview

## FormPreviewTarget

Represents the selected model type to preview.

**Fields**
- `id`: stable fully-qualified type identity, normally namespace plus type name
- `namespace`: model namespace
- `name`: display name
- `kind`: model kind such as data, enum, choice, function, type alias, or built-in
- `sourceUri`: source document URI when available
- `sourceRange`: optional source line/character range for navigation

**Validation Rules**
- `id`, `namespace`, and `name` must be non-empty for loaded model elements.
- Built-in types may be selectable for references but do not produce top-level form previews unless explicitly supported.
- Duplicate display names must resolve by `id`, not by label.

## FormPreviewSchema

Serializable description of a generated form for one preview target.

**Fields**
- `schemaVersion`: contract version
- `targetId`: matching `FormPreviewTarget.id`
- `title`: user-facing form title
- `status`: `ready`, `unsupported`, or `unavailable`
- `fields`: ordered `PreviewField[]`
- `unsupportedFeatures`: optional list of schema features not yet renderable
- `sourceMap`: optional mapping from preview fields back to model source locations

**Validation Rules**
- `fields` must preserve generated-schema field order.
- Required, optional, array, enum, and nested object semantics must match generated Zod behavior.
- Recursive references must be represented with depth controls instead of expanding infinitely.

## PreviewField

Renderable field descriptor for the form preview.

**Fields**
- `path`: stable sample-data path
- `label`: readable label
- `kind`: `string`, `number`, `boolean`, `enum`, `object`, `array`, `unknown`
- `required`: boolean
- `cardinality`: lower/upper bounds where relevant
- `enumValues`: allowed values and labels for enum fields
- `children`: nested fields for object/array item types
- `description`: optional helper copy from model metadata

**Validation Rules**
- `path` must be unique within a schema.
- `enumValues` is required for `enum` fields.
- `children` is required for supported `object` and `array<object>` fields.
- Unknown fields must render as unsupported, not as silently editable controls.

## PreviewSample

In-memory sample values entered by the user.

**Fields**
- `targetId`: preview target identity
- `values`: structured value object keyed by field path
- `validity`: current validation state
- `errors`: field-path keyed validation messages
- `updatedAt`: local timestamp for UI refresh/debugging only

**Validation Rules**
- Sample data must not be persisted to the authored model.
- Sample data must not be sent outside the browser workspace.
- Reset clears values and errors for the active target only.

## PreviewStatus

Panel-level state for the active preview.

**States**
- `waiting`: generation or schema derivation is pending
- `ready`: preview schema is available and sample can validate
- `invalid`: preview schema is available and sample has validation errors
- `stale`: current model cannot regenerate; last successful schema remains visible
- `unavailable`: no preview can be produced

**Transitions**
- `waiting -> ready`: schema derivation succeeds
- `waiting -> unavailable`: no schema can be produced and no previous schema exists
- `ready -> invalid`: sample validation fails
- `invalid -> ready`: sample validation passes
- `ready|invalid -> stale`: model changes introduce parse/generation errors
- `stale -> ready`: model becomes valid and schema refresh succeeds

## StudioModeLayout

Default arrangement of Studio surfaces.

**Fields**
- `navigate`: left group containing Files and Model Tree
- `edit`: middle group containing Source and Structure
- `visualize`: top-level graph mode
- `preview`: right group containing Form and Code
- `utilities`: bottom auto-hide group containing Problems and Messages

**Validation Rules**
- Fresh and reset desktop layouts must expose Navigate, Edit, Visualize, and Preview.
- 1280px layouts must avoid horizontal overflow and keep Source/Structure usable.
- Problems/Messages must be available without permanently shrinking primary columns.
