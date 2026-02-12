# Data Model: ReactFlow Visual Editor

**Feature**: 002-reactflow-visual-editor
**Date**: 2026-02-11

## Source AST Types (from @rune-langium/core)

These are the existing Langium AST types that the visual editor consumes. They are auto-generated from the grammar and are **read-only inputs** to the adapter layer.

### RosettaModel (Root)

| Field | Type | Description |
|-------|------|-------------|
| `$type` | `'RosettaModel'` | Discriminator |
| `name` | `QualifiedName \| string` | Namespace (e.g., `com.example.model`) |
| `version` | `string?` | Model version |
| `elements` | `RosettaRootElement[]` | All top-level elements |
| `imports` | `Import[]` | Imported namespaces |

### Data

| Field | Type | Description |
|-------|------|-------------|
| `$type` | `'Data'` | Discriminator |
| `name` | `ValidID` | Type name |
| `definition` | `string?` | Documentation string |
| `superType` | `Reference<Data>?` | Inheritance parent (resolve via `.ref`) |
| `attributes` | `Attribute[]` | Typed fields |
| `conditions` | `Condition[]` | Validation conditions |
| `annotations` | `AnnotationRef[]` | Metadata annotations |

### Choice

| Field | Type | Description |
|-------|------|-------------|
| `$type` | `'Choice'` | Discriminator |
| `name` | `ValidID` | Type name |
| `definition` | `string?` | Documentation string |
| `attributes` | `ChoiceOption[]` | Choice options (each references a type) |

### RosettaEnumeration

| Field | Type | Description |
|-------|------|-------------|
| `$type` | `'RosettaEnumeration'` | Discriminator |
| `name` | `ValidID` | Enum name |
| `definition` | `string?` | Documentation string |
| `parent` | `Reference<RosettaEnumeration>?` | Parent enum (inheritance) |
| `enumValues` | `RosettaEnumValue[]` | Enum members |

### Attribute

| Field | Type | Description |
|-------|------|-------------|
| `$type` | `'Attribute'` | Discriminator |
| `name` | `ValidID` | Attribute name |
| `typeCall` | `TypeCall` | Type reference (contains `Reference<RosettaType>`) |
| `card` | `RosettaCardinality` | Cardinality bounds |
| `definition` | `string?` | Documentation string |
| `override` | `boolean` | Whether this overrides a parent attribute |

### RosettaCardinality

| Field | Type | Description |
|-------|------|-------------|
| `inf` | `number` | Lower bound (0 or ≥1) |
| `sup` | `number?` | Upper bound (undefined = same as inf) |
| `unbounded` | `boolean` | `true` means `*` (unlimited) |

### TypeCall

| Field | Type | Description |
|-------|------|-------------|
| `type` | `Reference<RosettaType>` | Cross-reference to Data/Choice/Enum/BasicType |
| `arguments` | `TypeCallArgument[]` | Generic arguments (rare) |

### Reference<T> (Langium built-in)

| Field | Type | Description |
|-------|------|-------------|
| `ref` | `T \| undefined` | Resolved target AST node |
| `$refText` | `string` | Unresolved name text |
| `$refNode` | `CstNode?` | CST node for the reference |

---

## Graph Data Model (Visual Editor)

These types are defined in `@rune-langium/visual-editor` and represent the ReactFlow graph derived from the AST.

### TypeGraphNode

Extends ReactFlow `Node<TypeNodeData>`. One node per Data/Choice/Enumeration AST element.

```typescript
type TypeKind = 'data' | 'choice' | 'enum';

interface TypeNodeData {
  /** AST node $type discriminator */
  kind: TypeKind;
  /** Type name from AST */
  name: string;
  /** Namespace this type belongs to */
  namespace: string;
  /** Documentation definition string */
  definition?: string;
  /** Attributes (for Data) or options (for Choice) or values (for Enum) */
  members: MemberDisplay[];
  /** Parent type name (if extends) */
  parentName?: string;
  /** Whether node has unresolved external references */
  hasExternalRefs: boolean;
  /** Validation errors attached to this node */
  errors: ValidationError[];
}

interface MemberDisplay {
  /** Member name */
  name: string;
  /** Type name (for attributes/options) or value text (for enum values) */
  typeName?: string;
  /** Cardinality display string: "(1..1)", "(0..*)", etc. */
  cardinality?: string;
  /** Whether this member is overriding a parent member */
  isOverride: boolean;
}
```

### TypeGraphEdge

Extends ReactFlow `Edge<EdgeData>`. One edge per relationship.

```typescript
type EdgeKind = 'extends' | 'attribute-ref' | 'choice-option' | 'enum-extends';

interface EdgeData {
  /** Relationship type */
  kind: EdgeKind;
  /** Label to display on edge (e.g., attribute name) */
  label?: string;
  /** Cardinality string (for attribute-ref edges) */
  cardinality?: string;
}
```

### Edge Types

| EdgeKind | Source | Target | Meaning |
|----------|--------|--------|---------|
| `extends` | Data node | Data node | `type A extends B` |
| `attribute-ref` | Data node | Any type node | Attribute's `typeCall.type` references target |
| `choice-option` | Choice node | Data/Enum node | Choice option references target type |
| `enum-extends` | Enum node | Enum node | `enum A extends B` |

---

## Editor State Model

Managed by zustand store in `@rune-langium/visual-editor`.

### EditorStore

```typescript
interface EditorStore {
  // --- Graph state (tracked by zundo for undo/redo) ---
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];

  // --- Domain state ---
  workspace: WorkspaceState;
  astModels: Map<string, RosettaModel>;  // uri → parsed AST

  // --- UI state (not tracked by undo/redo) ---
  selectedNodeId: string | null;
  searchQuery: string;
  activeFilters: GraphFilters;
  detailPanelOpen: boolean;
  validationErrors: ValidationError[];

  // --- Actions ---
  loadFile(uri: string, content: string): Promise<void>;
  loadWorkspace(entries: Array<{ uri: string; content: string }>): Promise<void>;

  // P1: Navigation
  selectNode(nodeId: string | null): void;
  setSearchQuery(query: string): void;
  setFilters(filters: GraphFilters): void;
  fitView(): void;
  focusNode(nodeId: string): void;

  // P2: Editing
  createType(kind: TypeKind, name: string, namespace: string): void;
  deleteType(nodeId: string): void;
  renameType(nodeId: string, newName: string): void;
  addAttribute(typeId: string, attr: NewAttribute): void;
  updateAttribute(typeId: string, attrName: string, update: AttributeUpdate): void;
  deleteAttribute(typeId: string, attrName: string): void;
  setInheritance(childId: string, parentId: string | null): void;
  exportRosetta(): Map<string, string>;  // uri → .rosetta source
}
```

### GraphFilters

```typescript
interface GraphFilters {
  /** Show only types in these namespaces */
  namespaces?: string[];
  /** Show only these type kinds */
  kinds?: TypeKind[];
  /** Show only types matching this name pattern */
  namePattern?: string;
  /** Hide types with no relationships */
  hideOrphans?: boolean;
}
```

### WorkspaceState

```typescript
interface WorkspaceState {
  /** All loaded file URIs */
  files: string[];
  /** Unresolved cross-file references */
  unresolvedRefs: UnresolvedRef[];
  /** Whether workspace is fully loaded */
  isLoaded: boolean;
}
```

### ValidationError

```typescript
interface ValidationError {
  /** Node ID the error is attached to */
  nodeId: string;
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message */
  message: string;
  /** Validation rule ID (e.g., "S-02" for circular inheritance) */
  ruleId?: string;
}
```

---

## Edit Operations (Command Pattern)

Each edit operation is an atomic, undoable command. Zundo tracks the state before/after for undo/redo.

| Operation | Input | AST Effect | Graph Effect |
|-----------|-------|------------|--------------|
| `createType` | kind, name, namespace | Insert new Data/Choice/Enum into RosettaModel.elements | Add node |
| `deleteType` | nodeId | Remove element from RosettaModel.elements | Remove node + connected edges |
| `renameType` | nodeId, newName | Update `.name` field | Update node label |
| `addAttribute` | typeId, name, type, cardinality | Insert Attribute into Data.attributes | Add member to node + add edge |
| `updateAttribute` | typeId, attrName, changes | Modify Attribute fields | Update member display + edge |
| `deleteAttribute` | typeId, attrName | Remove from Data.attributes | Remove member + edge |
| `setInheritance` | childId, parentId | Set/clear Data.superType | Add/remove extends edge |

---

## AST-to-Graph Mapping Rules

### Node Mapping

| AST Type | → | Graph Node Kind | Members |
|----------|---|-----------------|---------|
| `Data` | → | `data` | `attributes` → MemberDisplay (name, typeCall.type.$refText, cardinality) |
| `Choice` | → | `choice` | `attributes` (ChoiceOption[]) → MemberDisplay (name, typeCall.type.$refText) |
| `RosettaEnumeration` | → | `enum` | `enumValues` → MemberDisplay (name only) |

### Edge Mapping

| AST Relationship | → | Edge Kind | Source | Target |
|-----------------|---|-----------|--------|--------|
| `Data.superType` | → | `extends` | Data node | Referenced Data node |
| `Attribute.typeCall.type` → Data/Choice/Enum | → | `attribute-ref` | Owner Data node | Referenced type node |
| `ChoiceOption.typeCall.type` | → | `choice-option` | Choice node | Referenced type node |
| `RosettaEnumeration.parent` | → | `enum-extends` | Enum node | Referenced Enum node |

### Filtering Rules

- BasicType references (string, number, date, etc.) do NOT produce edges (built-in types are not graph nodes)
- TypeAlias references are resolved to their underlying type
- Cross-file references where the target is not loaded produce a placeholder "external ref" indicator on the source node
- RecordType and RosettaMetaType are not rendered as graph nodes (out of scope per spec)
