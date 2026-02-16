# Research: ReactFlow Visual Editor

**Feature**: 002-reactflow-visual-editor
**Date**: 2026-02-11

## R-1: Graph Rendering Library

**Decision**: @xyflow/react 12.10.0 (ReactFlow v12)

**Rationale**: ReactFlow is the de facto standard for node-based UIs in React. v12 was renamed from `reactflow` to `@xyflow/react` and provides custom node/edge types, built-in viewport controls (pan, zoom, minimap), event handling, and TypeScript-first APIs. It handles 500+ nodes with viewport culling (`onlyRenderVisibleElements`). The library is actively maintained (latest release December 2025).

**Alternatives considered**:
- **Sigma.js** (WebGL-based): Better raw performance at 10K+ nodes, but no built-in interaction primitives (editing, connecting, context menus). Overkill for 500-node scale.
- **Cytoscape.js**: Powerful graph library with built-in layout, but React integration is weaker and custom node rendering requires canvas, limiting UI richness.
- **D3.js (raw)**: Maximum flexibility but requires building all interaction from scratch. Too much effort for the features ReactFlow provides out of the box.

---

## R-2: Auto-Layout Algorithm

**Decision**: @dagrejs/dagre 1.1.4 (initial), with elkjs 0.11.0 upgrade path

**Rationale**: Dagre provides hierarchical (top-down/left-right) layout suitable for type inheritance trees. At ~30KB it's lightweight and synchronous. For the CDM corpus (~400 types), dagre with `tight-tree` ranker completes in <1s. ReactFlow's official examples demonstrate dagre integration. The layout function is behind a `LayoutEngine` interface, enabling a swap to elkjs if edge routing quality is insufficient.

**Alternatives considered**:
- **elkjs** (Eclipse Layout Kernel): Superior edge routing (around nodes, not through them) and port support. ~150KB bundle, async computation. Ideal for UML-class diagrams but more complex to configure. Reserved as upgrade path.
- **d3-hierarchy**: Tree-only layout — cannot handle the multi-parent graph structure of Rune types (a type can both extend a parent AND reference other types).
- **d3-force**: Physics-based layout produces organic layouts, not suitable for hierarchical type diagrams.

**Performance benchmarks (dagre)**:

| Node count | Ranker | Recommendation |
|------------|--------|----------------|
| < 100 | `network-simplex` | Default, optimal quality |
| 100-500 | `tight-tree` | Good speed/quality balance |
| 500-1000 | `longest-path` | Fast but lower quality; run in Web Worker |

---

## R-3: AST-to-Text Serializer

**Decision**: Custom serializer in `@rune-langium/core` using hybrid CST-preserving + generator approach

**Rationale**: Langium 4.2.x does not ship a generic grammar-aware text serializer. The standard approaches are:

1. **CST-preserving edits** (for existing files): Langium preserves the Concrete Syntax Tree. Targeted `TextEdit` operations modify specific ranges in the source text, preserving formatting and comments. This is the LSP-standard approach.

2. **Full re-serialization** (for new types created visually): A custom generator walks AST nodes and emits `.rosetta` text following the grammar rules. This produces valid but freshly-formatted output.

The serializer covers Data, Choice, RosettaEnumeration, Attribute, TypeCall, and RosettaCardinality — the subset needed for type hierarchy editing. Expression serialization is out of scope.

**Alternatives considered**:
- **Langium JSON serializer** (`DefaultJsonSerializer`): Serializes AST to JSON for transfer, but doesn't produce `.rosetta` text. Useful for internal transport but not user-facing output.
- **Template-based generation** (e.g., Eta/EJS): String templates for .rosetta output. Fragile — breaks when grammar changes. A typed AST walker is more maintainable.
- **Community serializer**: No community solution exists for Langium AST-to-text. The Langium team has acknowledged the gap (GitHub discussion #683).

---

## R-4: State Management

**Decision**: zustand 5.x + zundo 2.3.0

**Rationale**: ReactFlow uses zustand internally and all official examples use it. Zundo adds temporal (undo/redo) middleware at ~700 bytes. The store separates:
- **Graph state** (nodes, edges) — tracked by zundo for undo/redo
- **UI state** (selection, viewport, panel visibility) — not tracked
- **Domain state** (parsed AST, workspace files) — managed separately

**Alternatives considered**:
- **Redux Toolkit**: Heavier boilerplate (~7KB + toolkit), requires adapter for ReactFlow integration. Redux-undo exists but adds more weight.
- **React Context**: Built-in but causes full subtree re-renders. Unsuitable for frequent graph updates (node drag, zoom).
- **Jotai**: Atomic state management, good for derived state. But ReactFlow's internal store is zustand, creating mismatched paradigms.

---

## R-5: Build Tooling for Standalone App

**Decision**: Vite 6.x with @vitejs/plugin-react

**Rationale**: Vite supports pnpm workspaces and `workspace:*` protocol natively. The existing monorepo is ESM-first (`"type": "module"`) which aligns with Vite's defaults. Vite provides fast HMR for development and optimized production builds. Adding `apps/*` to `pnpm-workspace.yaml` is the only configuration change needed.

**Alternatives considered**:
- **Webpack**: Heavier configuration, slower dev server. No advantage for a greenfield React SPA.
- **Turbopack**: Still in beta for production builds. Unnecessary risk for a new package.
- **tsup/unbuild**: Good for library builds but not for SPAs with dev server needs.

---

## R-6: Serialization Architecture for Round-Trip Editing

**Decision**: Unidirectional data flow — AST is single source of truth

```
.rosetta ──parse()──→ AST ──transform──→ ReactFlow graph
                       ↑                        │
                  apply edits              user actions
                       │                        │
.rosetta ←─serialize─ AST ←──commands── Editor store
```

**Rationale**: Making the AST the single source of truth prevents desynchronization between the graph view and the underlying model. User actions produce domain commands (e.g., "add attribute X to type Y"), which are applied to the AST. The graph is re-derived from the updated AST. Zundo undo/redo operates at the command level.

**Alternatives considered**:
- **Graph as source of truth**: ReactFlow state drives everything, AST is derived when exporting. Risk: graph state can diverge from valid .rosetta semantics without continuous validation.
- **Dual source of truth**: Both AST and graph are authoritative with bidirectional sync. Risk: synchronization bugs, conflict resolution complexity.

---

## R-7: Component Library Packaging

**Decision**: Dual-export library with ESM + bundled CSS

**Rationale**: The component library (`@rune-langium/visual-editor`) exports React components and TypeScript types. Consumers import components and provide their own React + ReactFlow peer dependencies. CSS is bundled with the library (ReactFlow requires its own CSS). The library uses `tsc` for TypeScript compilation (matching the existing core package pattern) with a separate CSS build step.

**Package exports**:
```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./styles.css": "./dist/styles.css"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0",
    "@xyflow/react": ">=12.0.0"
  }
}
```

---

## R-8: ReactFlow Performance at CDM Scale

**Decision**: Viewport culling + memoized nodes + Web Worker layout

**Performance strategy for 500+ nodes**:
1. `onlyRenderVisibleElements={true}` — only render nodes/edges in viewport
2. `React.memo` on all custom node/edge components
3. `nodeTypes` and `edgeTypes` defined outside component tree (static registry)
4. Layout computation in Web Worker (dagre is CPU-intensive at 500+ nodes)
5. Batch state updates (single `setNodes` call, not per-node)
6. Collapsible attribute lists for nodes with 10+ attributes (reduce DOM per node)

**Measured limits**: ReactFlow handles several hundred nodes well with these optimizations. At 500 nodes we are within range. At 1000+ nodes, consider switching to WebGL (Sigma.js) — but CDM corpus upper bound is ~400 types, so this is not expected.
