# @rune-langium/visual-editor

ReactFlow-based visual editor component library for Rune DSL type hierarchies.

## Overview

This package provides an embeddable React component (`RuneTypeGraph`) that renders Rune DSL type hierarchies (Data, Choice, Enumeration) as interactive graphs using ReactFlow. It consumes typed AST from `@rune-langium/core` and supports:

- **Visualization**: Auto-laid-out hierarchical graph of Data, Choice, and Enum types
- **Navigation**: Pan/zoom, search, filters, detail panel
- **Editing** (P2): Create/rename/delete types, add attributes, undo/redo
- **Export**: SVG/PNG images, updated `.rosetta` source

## Installation

```bash
pnpm add @rune-langium/visual-editor @xyflow/react react react-dom
```

## Quick Start

```tsx
import { RuneTypeGraph } from '@rune-langium/visual-editor';
import '@rune-langium/visual-editor/styles.css';
import '@xyflow/react/dist/style.css';
import { parse } from '@rune-langium/core';

const result = await parse(`
  namespace demo.model
  version "1.0.0"

  type Trade:
    tradeDate date (1..1)
    product Product (1..1)

  type Product:
    productName string (1..1)
`);

<RuneTypeGraph models={result.value} />
```

## API

### `<RuneTypeGraph>` Props

| Prop | Type | Description |
|------|------|-------------|
| `models` | `RosettaModel \| RosettaModel[]` | Parsed AST model(s) to visualize |
| `config` | `RuneTypeGraphConfig` | Layout, styling, and behavior options |
| `callbacks` | `RuneTypeGraphCallbacks` | Event handlers |
| `className` | `string` | CSS class for the container |

### Imperative Ref API

```tsx
const ref = useRef<RuneTypeGraphRef>(null);

ref.current?.fitView();
ref.current?.focusNode('Trade');
ref.current?.search('Product');
```

See the [contracts](/specs/002-reactflow-visual-editor/contracts/visual-editor-api.ts) for the full TypeScript API definition.

## Configuration

```tsx
<RuneTypeGraph
  models={model}
  config={{
    layout: { direction: 'TB', rankSeparation: 100 },
    showMinimap: true,
    showControls: true,
    readOnly: true
  }}
/>
```

## Compatibility & Migration (T006)

### Peer Dependencies

| Package | Required Version | Notes |
|---------|-----------------|-------|
| `react` | `>=18.0.0` | React 19 supported |
| `react-dom` | `>=18.0.0` | Must match `react` version |
| `@xyflow/react` | `>=12.0.0` | ReactFlow v12 (renamed from `reactflow`) |

### Breaking Changes

This is the initial release. No breaking changes from prior versions.

### Migration from `reactflow` to `@xyflow/react`

If you've used `reactflow` (v11) before, note the following changes in v12:
- Package renamed: `reactflow` → `@xyflow/react`
- CSS import: `reactflow/dist/style.css` → `@xyflow/react/dist/style.css`
- `Node<T>` type changed to `Node<T, string>` with required generic params
- `ReactFlowProvider` is still required for `useReactFlow()` hooks

### ESM Only

This package is **ESM-only**. It uses `"type": "module"` and requires:
- Node.js >= 20
- A bundler that supports ESM (Vite, esbuild, webpack 5+)
- TypeScript `"moduleResolution": "nodenext"` or `"bundler"`

### Public API Stability

The following exports are considered stable:
- `RuneTypeGraph` component and its props
- `RuneTypeGraphRef` imperative methods
- `astToGraph()` and `graphToModels()` adapters
- All exported TypeScript types

Internal modules (`store/`, `validation/`, `layout/`) are **not** part of the public API and may change without notice.

## License

MIT
