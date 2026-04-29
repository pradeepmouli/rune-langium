# Quickstart: Studio Form Preview

## Prerequisites

- Dependencies installed with `pnpm install`
- Current branch: `016-studio-form-preview`

## Run Studio

```bash
pnpm --filter @rune-langium/studio dev --host 127.0.0.1
```

Open the printed local URL.

## Manual Verification Flow

1. Create a blank workspace or load a small `.rosetta` fixture.
2. Confirm the default layout presents:
   - Navigate on the left with Files / Model Tree
   - Edit in the middle with Source / Structure
   - Preview on the right with Form / Code
   - Visualize as a separate graph mode
   - Problems / Messages as bottom utilities
3. Select a model type.
4. Open Preview -> Form and confirm the generated form appears for the selected type.
5. Enter invalid sample values and confirm field-level validation errors appear.
6. Enter valid sample values and confirm the sample status becomes valid.
7. Expand **Sample data**, confirm it mirrors the current form values, then use **Copy sample data** and confirm the copied payload matches the visible sample output.
8. Open Preview -> Code and confirm generated source is readable, wraps long lines, shows the generated relative path, and does not corrupt the surrounding layout.
9. Use the **Show utilities / Hide utilities** button and confirm Problems / Messages collapse and restore without disturbing the primary Navigate / Edit / Visualize / Preview columns.
10. Edit the selected type in Source, reselect it in Navigate if needed, and confirm Form refreshes with the latest generated fields.

## Automated Verification Targets

```bash
pnpm --filter @rune-langium/studio exec vitest run test/pages/EditorPage.test.tsx test/components/FormPreviewPanel.test.tsx test/store/preview-store.test.ts test/services/nfr-verification.test.tsx test/components/CodePreviewPanel.test.tsx test/components/CodePreviewPanel-targets.test.tsx test/components/CodePreviewPanel-sourcemap.test.tsx test/components/SourceEditor.test.tsx test/shell/DockShell.test.tsx
pnpm --filter @rune-langium/codegen exec vitest run test/preview-schema.test.ts
pnpm --filter @rune-langium/studio exec playwright test test/e2e/form-preview.spec.ts test/e2e/dock-chrome.spec.ts test/e2e/a11y.spec.ts
```

These checks cover the grouped layout, Preview/Form + Code workflow, in-memory sample-data copy behavior, preview refresh, and the preview-schema parity cases required for completion.
