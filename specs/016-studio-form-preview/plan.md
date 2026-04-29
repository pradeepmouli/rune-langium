# Implementation Plan: Studio Form Preview

**Branch**: `016-studio-form-preview` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/016-studio-form-preview/spec.md`
**Propagated**: 2026-04-28 — Updated from spec.md refinement

## Summary

Add a generated form preview to Studio and reorganize the default workspace into stable user-facing mode groups: Navigate on the left, Edit in the middle, Preview on the right, Visualize as its own graph-focused mode, and Problems/Messages as bottom auto-hide utilities. The form preview will render and validate sample values from a serializable preview schema snapshot produced by the existing codegen worker from the same model analysis used for z2f-generated Zod source, and it must preserve z2f exported-subschema component and nested-field mappings so Studio matches generated form output. Generated Form and Code remain sibling surfaces under Preview; the current graph surface is renamed/reframed as Visualize.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, React 19, Vite 8  
**Primary Dependencies**: `dockview-react`, CodeMirror 6, `@rune-langium/codegen`, `@rune-langium/core`, `@rune-langium/visual-editor`, React Hook Form 7, Zod v4, `@zod-to-form/*` for schema-derived preview rendering and exported-subschema mapping parity  
**Storage**: Browser workspace state and layout records already use IndexedDB-backed Studio persistence; form preview sample state is in-memory only  
**Testing**: Vitest for component/unit/shell tests; Playwright for Studio e2e and visual layout checks  
**Target Platform**: Browser-based Studio app under `apps/studio`  
**Project Type**: Frontend web application in a pnpm workspace, with shared TypeScript packages  
**Performance Goals**: Form preview appears within 2s after successful generation; layout remains usable at 1440x900 and 1280x800; typing in Source must not visibly stall or lose input  
**Constraints**: Do not execute generated TypeScript/Zod source with `eval` or dynamic module loading; do not persist or transmit sample data; keep Source and Structure editing primary; no persisted-layout migration requirement; avoid introducing a second non-z2f schema-to-form interpretation path for Studio preview  
**Scale/Scope**: One Studio feature slice covering mode layout, generated Form/Code preview grouping, form preview rendering/validation, Code preview readability, and a source-editor usability investigation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. DSL Fidelity & Typed AST**: Pass. The feature consumes parsed Rune models and generated-schema metadata; it does not change grammar, scoping, or typed AST semantics.
- **II. Deterministic Fixtures**: Pass. Tests will use in-repo Studio fixtures and generated sample models; no runtime network dependency is required.
- **III. Validation Parity**: Pass. This feature does not expand language validation. Form sample validation is against generated schema semantics and must not alter DSL diagnostics.
- **IV. Performance & Workers**: Pass with guard. Preview generation stays in the existing codegen worker path. Source-editor responsiveness is a known planning risk and must be tested.
- **V. Reversibility & Compatibility**: Pass. Existing panels remain available through renamed/grouped modes. Persisted-layout migration is explicitly out of scope; Reset Layout may restore new defaults.

No constitution violations require complexity tracking.

## Project Structure

### Documentation (this feature)

```text
specs/016-studio-form-preview/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── form-preview-schema.md
│   └── studio-mode-layout.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/studio/
├── src/
│   ├── components/
│   │   ├── CodePreviewPanel.tsx
│   │   ├── FormPreviewPanel.tsx
│   │   └── SourceEditor.tsx
│   ├── pages/
│   │   └── EditorPage.tsx
│   ├── shell/
│   │   ├── DockShell.tsx
│   │   ├── dockview-bridge.ts
│   │   ├── layout-factory.ts
│   │   ├── layout-types.ts
│   │   └── panels/
│   ├── store/
│   │   └── preview-store.ts
│   └── workers/
│       └── codegen-worker.ts
└── test/
    ├── components/
    ├── e2e/
    └── shell/

packages/codegen/
├── src/
│   ├── preview-schema.ts
│   ├── generator.ts
│   └── types.ts
└── test/

packages/design-system/
└── src/ui/
```

**Structure Decision**: Implement the feature in `apps/studio` with one small exported preview-schema contract from `packages/codegen`. Keep layout and rendering changes inside Studio; keep reusable schema derivation alongside the code generator so Code and Form previews share the same parsed model input and target semantics, and derive preview field/component behavior from z2f-compatible schema metadata including exported-subschema defaults.

## Complexity Tracking

No constitution gate violations.
