# Configuration

## GraphFilters

Visibility filter state for the type graph.

### Properties

#### namespaces



**Type:** `string[]`

#### kinds



**Type:** `TypeKind[]`

#### namePattern



**Type:** `string`

#### hideOrphans



**Type:** `boolean`

## LayoutOptions

### Properties

#### direction



**Type:** `LayoutDirection`

#### nodeSeparation



**Type:** `number`

#### rankSeparation



**Type:** `number`

#### groupByInheritance

Group nodes into inheritance trees and lay out each tree independently.

**Type:** `boolean`

## NodeStyleConfig

### Properties

#### data



**Type:** `{ headerColor?: string; borderColor?: string }`

#### choice



**Type:** `{ headerColor?: string; borderColor?: string }`

#### enum



**Type:** `{ headerColor?: string; borderColor?: string }`

## EdgeStyleConfig

### Properties

#### extends



**Type:** `{ color?: string; strokeWidth?: number }`

#### attribute-ref



**Type:** `{ color?: string; strokeWidth?: number; dashed?: boolean }`

#### choice-option



**Type:** `{ color?: string; strokeWidth?: number }`

#### enum-extends



**Type:** `{ color?: string; strokeWidth?: number }`

## RuneTypeGraphConfig

Configuration props for the `RuneTypeGraph` component.

### Properties

#### layout



**Type:** `LayoutOptions`

#### nodeStyles



**Type:** `NodeStyleConfig`

#### edgeStyles



**Type:** `EdgeStyleConfig`

#### initialFilters



**Type:** `GraphFilters`

#### showMinimap



**Type:** `boolean`

#### showControls



**Type:** `boolean`

#### readOnly



**Type:** `boolean`

## EditorState

Snapshot of visual editor state tracked by the zustand store.

### Properties

#### nodes



**Type:** `TypeGraphNode[]`

**Required:** yes

#### edges



**Type:** `TypeGraphEdge[]`

**Required:** yes

#### selectedNodeId



**Type:** `string | null`

**Required:** yes

#### searchQuery



**Type:** `string`

**Required:** yes

#### searchResults



**Type:** `string[]`

**Required:** yes

#### activeFilters



**Type:** `GraphFilters`

**Required:** yes

#### detailPanelOpen



**Type:** `boolean`

**Required:** yes

#### validationErrors



**Type:** `ValidationError[]`

**Required:** yes

#### layoutOptions



**Type:** `LayoutOptions`

**Required:** yes

#### visibility



**Type:** `VisibilityState`

**Required:** yes