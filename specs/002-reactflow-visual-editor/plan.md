# Implementation Plan: ReactFlow Visual Editor

**Branch**: `002-reactflow-visual-editor` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-reactflow-visual-editor/spec.md`

## Summary

Build a ReactFlow-based visual editor for the Rune DSL type hierarchy, delivered as two new packages in the monorepo. The editor parses `.rosetta` files via `@rune-langium/core`, transforms the typed AST (Data, Choice, Enumeration nodes) into an interactive graph, and supports full round-trip editing — visual changes produce valid `.rosetta` source. The component library (`@rune-langium/visual-editor`) is embeddable in any React app; the standalone app (`@rune-langium/studio`) wraps it with file management and export features.

**Critical gap identified**: No AST-to-text serializer exists in `@rune-langium/core`. A custom serializer must be built for round-trip editing (Phase 2 delivery alongside editing features).

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**:
- `@xyflow/react` 12.10.0 (ReactFlow v12 — renamed from `reactflow`)
- `@dagrejs/dagre` 1.1.4 (hierarchical auto-layout; upgrade to `elkjs` 0.11.0 if edge routing quality insufficient)
- `zustand` 5.x (state management — used internally by ReactFlow)
- `zundo` 2.3.0 (undo/redo temporal middleware for zustand)
- `html-to-image` 1.x (SVG/PNG export)
- `@rune-langium/core` workspace:* (parser, AST types, validator)
**Storage**: Browser-only; File System Access API for standalone app, no backend
**Testing**: Vitest (unit/integration), React Testing Library (component tests), Playwright (E2E for standalone app)
**Build**: Vite 6.x (standalone app), tsc (component library)
**Target Platform**: Modern browsers (ES2020+, same as core parser)
**Project Type**: Monorepo — 2 new packages + 1 new app
**Performance Goals**: Graph renders 500+ nodes with smooth pan/zoom (60fps interaction); auto-layout < 2s for 500 nodes; initial load < 3s
**Constraints**: Zero backend dependency; all parsing/layout/serialization runs in-browser; parsing delegatable to Web Worker
**Scale/Scope**: CDM corpus upper bound (~400+ types, 10+ files)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Implementation |
|-----------|--------|----------------|
| **I. DSL Fidelity & Typed AST** | PASS | Visual editor consumes typed AST from `@rune-langium/core`. Data, Choice, RosettaEnumeration types with `Reference<T>` cross-references are rendered as graph nodes/edges. Round-trip serializer produces `.rosetta` source that parses to semantically equivalent AST. |
| **II. Deterministic Fixtures** | PASS | Graph rendering tests and round-trip serialization tests use vendored CDM corpus (`.rune-dsl/` and `.resources/`). No network access required. |
| **III. Validation Parity** | PASS | Edit validation reuses `RuneDslValidator` from core (S-01: no duplicate attributes, S-02: circular inheritance, S-04: cardinality bounds). No new validation rules beyond parity. |
| **IV. Performance & Workers** | PASS | Parsing runs in Web Worker (existing core API). Auto-layout runs via dagre/elkjs (async). Graph rendering uses ReactFlow viewport culling for 500+ nodes. Latency benchmarks automated. |
| **V. Reversibility & Compatibility** | PASS | Component library API follows semver. Adapter layer (`AstToGraphAdapter`) isolates ReactFlow graph model from core AST types. Migration guide required for breaking API changes. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-reactflow-visual-editor/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity/graph data model
├── quickstart.md        # Phase 1: developer quickstart
├── contracts/           # Phase 1: component API contracts
│   ├── visual-editor-api.ts    # Component library public API types
│   └── studio-api.ts           # Standalone app API types
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── core/                          # Existing: @rune-langium/core
│   └── src/
│       ├── api/parse.ts           # Existing parse()/parseWorkspace()
│       ├── generated/ast.ts       # Existing ~95 AST interfaces
│       ├── services/              # Existing validator, scope provider
│       └── serializer/            # NEW: AST-to-text serializer
│           └── rosetta-serializer.ts
├── visual-editor/                 # NEW: @rune-langium/visual-editor
│   ├── src/
│   │   ├── index.ts               # Public API exports
│   │   ├── components/
│   │   │   ├── RuneTypeGraph.tsx   # Main graph component
│   │   │   ├── nodes/
│   │   │   │   ├── DataNode.tsx    # Custom node: Data type
│   │   │   │   ├── ChoiceNode.tsx  # Custom node: Choice type
│   │   │   │   ├── EnumNode.tsx    # Custom node: Enumeration
│   │   │   │   └── index.ts       # nodeTypes registry
│   │   │   ├── edges/
│   │   │   │   ├── InheritanceEdge.tsx
│   │   │   │   ├── ReferenceEdge.tsx
│   │   │   │   └── index.ts       # edgeTypes registry
│   │   │   ├── panels/
│   │   │   │   ├── DetailPanel.tsx # Type detail sidebar
│   │   │   │   ├── SearchPanel.tsx # Search/filter UI
│   │   │   │   └── ToolbarPanel.tsx
│   │   │   └── editors/           # P2: inline editing components
│   │   │       ├── AttributeEditor.tsx
│   │   │       ├── TypeCreator.tsx
│   │   │       └── CardinalityEditor.tsx
│   │   ├── adapters/
│   │   │   ├── ast-to-graph.ts    # AST → ReactFlow nodes/edges
│   │   │   └── graph-to-ast.ts    # Graph edits → AST mutations
│   │   ├── layout/
│   │   │   ├── dagre-layout.ts    # Dagre auto-layout integration
│   │   │   └── layout-worker.ts   # Web Worker for layout computation
│   │   ├── store/
│   │   │   ├── editor-store.ts    # Zustand store (nodes, edges, selection)
│   │   │   └── history.ts         # Zundo undo/redo configuration
│   │   ├── validation/
│   │   │   └── edit-validator.ts  # Wraps RuneDslValidator for visual edits
│   │   └── types.ts               # Shared TypeScript types
│   ├── test/
│   │   ├── adapters/
│   │   │   ├── ast-to-graph.test.ts
│   │   │   └── graph-to-ast.test.ts
│   │   ├── components/
│   │   │   └── RuneTypeGraph.test.tsx
│   │   ├── layout/
│   │   │   └── dagre-layout.test.ts
│   │   └── validation/
│   │       └── edit-validator.test.ts
│   └── package.json
│
apps/
└── studio/                        # NEW: @rune-langium/studio (P3)
    ├── src/
    │   ├── App.tsx                 # Main app shell
    │   ├── pages/
    │   │   └── EditorPage.tsx      # Graph + panels layout
    │   ├── components/
    │   │   ├── FileLoader.tsx      # Drag-and-drop / file picker
    │   │   ├── SourceView.tsx      # Side-by-side .rosetta source
    │   │   └── ExportMenu.tsx      # SVG/PNG/file export
    │   └── services/
    │       └── workspace.ts        # Multi-file workspace management
    ├── test/
    ├── vite.config.ts
    └── package.json
```

**Structure Decision**: The visual editor is a React component library in `packages/visual-editor/` following the existing monorepo pattern (pnpm workspaces, ESM, TypeScript strict). The standalone app lives in `apps/studio/` as a Vite SPA. The serializer is added to `packages/core/` since it's a parser concern reusable beyond the visual editor. The workspace config (`pnpm-workspace.yaml`) must be updated to include `apps/*`.

## Architecture Decisions

### AD-1: AST as Source of Truth (Unidirectional Data Flow)

```
.rosetta file ──parse()──→ Langium AST ──transform──→ ReactFlow Nodes/Edges
                                ↑                              │
                          apply edits                    user actions
                                │                              │
.rosetta file ←──serialize── Langium AST ←──commands── Editor Store
```

The Langium AST is the single source of truth. ReactFlow nodes/edges are a derived view. User actions produce domain commands (e.g., "add attribute") applied to the AST, which triggers re-derivation of the graph. This prevents AST/graph desynchronization.

### AD-2: Serializer Location — In Core Package

The `.rosetta` serializer belongs in `@rune-langium/core` because:
- It's a parser-domain concern (grammar-aware text generation)
- Other consumers (CLI, future LSP) will need serialization
- It must stay in sync with grammar changes

### AD-3: Layout Strategy — Dagre First, ELK Upgrade Path

Start with dagre (30KB, synchronous, simple) for the P1 MVP. If edge routing quality is insufficient at 400+ nodes, swap in elkjs (150KB, async, superior routing). The layout function is isolated behind a `LayoutEngine` interface for easy substitution.

### AD-4: State Management — Zustand + Zundo

Zustand is used internally by ReactFlow and recommended by the ReactFlow team. Zundo adds undo/redo as temporal middleware (~700 bytes). The store separates:
- **Graph state** (nodes, edges) — tracked by zundo for undo/redo
- **UI state** (selection, viewport, panel visibility) — not tracked
- **Domain state** (parsed AST, workspace files) — managed separately

### AD-5: Serialization Strategy — Hybrid CST + Generator

- **Existing files**: Use CST-preserving edits (targeted TextEdit operations on the source text) to maintain formatting and comments
- **New types created visually**: Use the custom serializer to generate `.rosetta` text from AST nodes
- **Export**: Full re-serialization of the complete model, producing semantically equivalent but freshly-formatted output

## Implementation Phases

### Phase 1: Read-Only Visualization (P1 — MVP)

**Deliverables**: `@rune-langium/visual-editor` component library with read-only graph
**User Stories**: US-1 (View Type Graph), US-2 (Navigate & Explore), US-3 (Embeddable Component)

1. Scaffold `packages/visual-editor/` package with React + ReactFlow + TypeScript
2. Implement `AstToGraphAdapter` — transform Data/Choice/Enum AST nodes to ReactFlow nodes/edges
3. Implement custom node components (DataNode, ChoiceNode, EnumNode) with attribute lists
4. Implement custom edge components (InheritanceEdge, ReferenceEdge) with visual differentiation
5. Implement dagre auto-layout integration
6. Implement search, filter, and detail panel
7. Compose `RuneTypeGraph` main component with public API
8. Write tests against vendored CDM corpus fixtures

### Phase 2: Visual Editing (P2)

**Deliverables**: Editing capability + serializer in core
**User Stories**: US-4 (Visual Model Editing), US-5 (Change Validation)

1. Implement `.rosetta` serializer in `@rune-langium/core` (Data, Choice, Enum, Attribute)
2. Implement `GraphToAstAdapter` — map visual edits to AST mutations
3. Implement zustand editor store with zundo undo/redo
4. Implement edit validation wrapper around `RuneDslValidator`
5. Implement inline editors (TypeCreator, AttributeEditor, CardinalityEditor)
6. Implement context menus for create/delete/modify operations
7. Implement round-trip test suite (edit → serialize → re-parse → compare)

### Phase 3: Standalone App (P3)

**Deliverables**: `@rune-langium/studio` web application
**User Stories**: US-6 (Standalone Web Application)

1. Scaffold `apps/studio/` with Vite + React
2. Implement workspace service (multi-file loading, cross-file resolution)
3. Implement file loader (drag-and-drop, file picker, directory selection)
4. Implement source view panel (side-by-side .rosetta display)
5. Implement export features (SVG/PNG image, .rosetta file download)
6. E2E tests with Playwright

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Serializer round-trip fidelity | High — edits produce invalid .rosetta | Comprehensive test suite against CDM corpus; CST-preserving edits for existing files |
| ReactFlow performance at 500+ nodes | Medium — laggy interaction | Viewport culling enabled; layout in Web Worker; degrade gracefully with node simplification |
| Dagre layout quality at scale | Medium — unreadable edge crossings | ELK upgrade path behind LayoutEngine interface; manual position persistence as fallback |
| Core API changes breaking adapter | Low — desync between packages | Adapter layer isolates graph model from AST; workspace protocol ensures version alignment |
| Browser File System API support | Low — limited browser support | Fallback to file input + download for unsupported browsers |
