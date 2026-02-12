# Quickstart: ReactFlow Visual Editor

**Feature**: 002-reactflow-visual-editor

> **Implementation verified**: All packages build cleanly. 113 visual-editor tests pass;
> 11 studio unit tests pass. Studio type-checks via `tsc --noEmit`. Run `pnpm test` from
> the repo root to verify.

## Prerequisites

- Node.js ≥ 20.0.0
- pnpm ≥ 10.0.0
- Existing `@rune-langium/core` package built

## Setup

### 1. Install dependencies

From the repo root:

```bash
# Add new workspace entries to pnpm-workspace.yaml:
# packages:
#   - 'packages/*'
#   - 'apps/*'

# Install all dependencies
pnpm install
```

### 2. Build core (if not already built)

```bash
pnpm --filter @rune-langium/core build
```

### 3. Start the standalone app in dev mode

```bash
pnpm --filter @rune-langium/studio dev
```

This starts the Vite dev server at `http://localhost:5173`.

## Using the Component Library

### Basic Usage

```tsx
import { RuneTypeGraph } from '@rune-langium/visual-editor';
import '@rune-langium/visual-editor/styles.css';
import { parse } from '@rune-langium/core';

function App() {
  const [model, setModel] = useState(null);

  useEffect(() => {
    parse(`
      namespace demo.model
      version "1.0.0"

      type Trade:
        tradeDate date (1..1)
        product Product (1..1)

      type Product:
        productName string (1..1)
    `).then(result => setModel(result.value));
  }, []);

  if (!model) return <div>Loading...</div>;
  return <RuneTypeGraph models={model} />;
}
```

### With Configuration

```tsx
<RuneTypeGraph
  models={model}
  config={{
    layout: { direction: 'TB', rankSeparation: 100 },
    showMinimap: true,
    showControls: true,
    readOnly: false, // Enable editing (P2)
    initialFilters: {
      kinds: ['data', 'choice'], // Hide enums initially
    },
  }}
  callbacks={{
    onNodeSelect: (nodeId, data) => console.log('Selected:', data.name),
    onModelChanged: (serialized) => console.log('Model updated'),
  }}
/>
```

### With Imperative API (ref)

```tsx
const graphRef = useRef<RuneTypeGraphRef>(null);

// Programmatic control
graphRef.current?.fitView();
graphRef.current?.focusNode('Trade');
graphRef.current?.search('Product');

// Export
const imageBlob = await graphRef.current?.exportImage('png');
const rosettaFiles = graphRef.current?.exportRosetta();
```

## Using the Standalone App

1. Open `http://localhost:5173`
2. Drag-and-drop `.rosetta` files onto the window (or use the file picker)
3. The type hierarchy graph renders automatically
4. Click nodes to see details, use search to find types
5. (P2) Right-click to add types, drag edges for inheritance
6. (P3) Export as image or download modified `.rosetta` files

## Development Workflow

### Run tests

```bash
# Component library tests
pnpm --filter @rune-langium/visual-editor test

# Standalone app tests
pnpm --filter @rune-langium/studio test

# All tests
pnpm test
```

### Build for production

```bash
# Build all packages
pnpm build

# Build only visual editor
pnpm --filter @rune-langium/visual-editor build

# Build standalone app
pnpm --filter @rune-langium/studio build
```

### Lint and format

```bash
pnpm lint
pnpm format
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/visual-editor/src/index.ts` | Component library public API |
| `packages/visual-editor/src/components/RuneTypeGraph.tsx` | Main graph component |
| `packages/visual-editor/src/adapters/ast-to-graph.ts` | AST → ReactFlow transform |
| `packages/visual-editor/src/adapters/graph-to-ast.ts` | Graph edits → AST mutations |
| `packages/visual-editor/src/store/editor-store.ts` | Zustand state store |
| `packages/visual-editor/src/layout/dagre-layout.ts` | Auto-layout integration |
| `packages/core/src/serializer/rosetta-serializer.ts` | AST → .rosetta text |
| `apps/studio/src/App.tsx` | Standalone app shell |
