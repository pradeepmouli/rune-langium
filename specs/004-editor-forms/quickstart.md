# Quickstart: Editor Forms Implementation

**Feature**: 004-editor-forms | **Date**: 2026-02-14

## Prerequisites

- Node.js 22+ and pnpm 10+
- Repository cloned and dependencies installed (`pnpm install`)
- Familiarity with React 19, Zustand 5, shadcn/ui, Tailwind CSS v4

## Setup

### 1. Install new dependencies

```bash
pnpm --filter @rune-langium/studio add cmdk @radix-ui/react-popover @radix-ui/react-collapsible @radix-ui/react-label @radix-ui/react-select
```

### 2. Add shadcn/ui token aliases

Add the following block to `apps/studio/src/styles.css` after the existing `@import` lines:

```css
/* shadcn/ui token aliases — maps shadcn variable names to Rune design tokens */
@theme inline {
  --color-background: var(--color-surface-base);
  --color-foreground: var(--color-text-primary);
  --color-popover: var(--color-surface-raised);
  --color-popover-foreground: var(--color-text-primary);
  --color-muted: var(--color-surface-overlay);
  --color-muted-foreground: var(--color-text-muted);
  --color-border: var(--color-border-default);
  --color-input: var(--color-border-emphasis);
  --color-ring: var(--color-accent);
  --color-primary: var(--color-accent);
  --color-primary-foreground: #ffffff;
  --color-secondary: var(--color-surface-overlay);
  --color-secondary-foreground: var(--color-text-primary);
  --color-destructive: var(--color-error);
  --color-destructive-foreground: #ffffff;
  --color-card: var(--color-surface-raised);
  --color-card-foreground: var(--color-text-primary);
}
```

### 3. Add new shadcn/ui components

Copy the following shadcn/ui components to `apps/studio/src/components/ui/`:
- `label.tsx` — from `npx shadcn@latest add label`
- `select.tsx` — from `npx shadcn@latest add select`
- `textarea.tsx` — from `npx shadcn@latest add textarea`
- `collapsible.tsx` — from `npx shadcn@latest add collapsible`
- `popover.tsx` — from `npx shadcn@latest add popover`
- `command.tsx` — from `npx shadcn@latest add command`

These require the token aliases from step 2 to render correctly with the Rune dark theme.

## Implementation Order

Follow this sequence. Each step is independently testable.

### Phase 0: Foundation (no UI changes visible)

1. **Extend types** — Add `synonyms`, `isReadOnly`, `displayName` to `TypeNodeData` and `MemberDisplay` in `packages/visual-editor/src/types.ts`
2. **Wire Zundo** — Wrap `createEditorStore` with `temporal()` middleware in `editor-store.ts`
3. **Create `useAutoSave` hook** — `packages/visual-editor/src/hooks/useAutoSave.ts`
4. **Add store actions** — Implement the 12 new actions in `editor-store.ts`
5. **Update `renameType`** — Add cascade logic to the existing action
6. **Update `ast-to-graph`** — Populate `synonyms`, `isReadOnly`, `displayName` when building graph from AST
7. **Update `graph-to-ast`** — Read new fields when building synthetic AST models

### Phase 1a: Shared Components

8. **Build `TypeSelector`** — Searchable combobox with kind badges
9. **Build `CardinalityPicker`** — Preset buttons + custom input with validation
10. **Build `MetadataSection`** — Collapsible section with description + synonyms
11. **Build `AttributeRow`** — Inline row with name, type, cardinality, remove
12. **Build `EnumValueRow`** — Inline row with name, display name, remove
13. **Build `ChoiceOptionRow`** — Read-only type label with remove

### Phase 1b: Form Components

14. **Build `DataTypeForm`** — Compose header + inheritance + attributes + metadata
15. **Build `EnumForm`** — Compose header + parent + values + metadata
16. **Build `ChoiceForm`** — Compose header + options + metadata
17. **Build `EditorFormPanel`** — Dispatch by kind, wrap in scrollable panel

### Phase 1c: Studio Integration

18. **Wire into `EditorPage`** — Add right-side `ResizablePanel` with `EditorFormPanel`
19. **Add toolbar toggle** — "Editor" button in toolbar to show/hide the form panel
20. **Add editor form styles** — Dark theme CSS for form components

### Phase 2: Functions (P2 priority)

21. **Build `FunctionForm`** — Header + inputs + output + expression textarea + metadata
22. **Add function node support** — Extend `TypeKind` or use AST-based display

## Development Workflow

```bash
# Start dev server
pnpm --filter @rune-langium/studio dev

# Run visual-editor tests
pnpm --filter @rune-langium/visual-editor test

# Run studio tests
pnpm --filter @rune-langium/studio test

# Lint
pnpm run lint

# Type-check
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio run type-check
```

## Testing Strategy

| Layer | Tool | What to test |
|-------|------|-------------|
| **Unit** | Vitest + Testing Library | Individual form components in isolation; store action correctness; validation rules |
| **Integration** | Vitest + Testing Library | EditorFormPanel dispatch; form → store → graph round-trip; rename cascade |
| **E2E** | Playwright | Select node → edit in form → verify graph updates; source sync; undo/redo |

### Test fixtures

Use vendored `.rosetta` files from `.resources/cdm/` for realistic test data. Parse via `parseWorkspaceFiles()` to get `RosettaModel[]`, then pass to `astToGraph()` to get test graph state.

### Key test scenarios

1. **Data type rename cascade**: Rename "Trade" → "TradeEvent", verify all attributes referencing "Trade" update
2. **Circular inheritance prevention**: Try to set type A extends B when B already extends A
3. **Enum value CRUD**: Add, rename, remove enum values; verify serialized `.rosetta` output
4. **Choice option add/remove**: Add option, verify edge created; remove option, verify edge removed
5. **Auto-save debounce**: Verify store isn't called during rapid typing, only after idle
6. **Undo/redo**: Make edit, undo, verify state reverts; redo, verify state re-applies
7. **Read-only mode**: Verify all form fields are disabled when `readOnly: true`

## Architecture Decisions

| Decision | Rationale | Reference |
|----------|-----------|-----------|
| Forms in `visual-editor` package, shadcn in `studio` app | Library components are unstyled/callback-based; app provides styled UI primitives | [research.md](research.md) R-01 |
| Graph-level rename cascade, not AST-level | Consistent with store-first architecture; O(N+E); works with Zundo | [research.md](research.md) R-05 |
| `displayName` on MemberDisplay, not overloaded `typeName` | Prevents false `attribute-ref` edge creation for enum values | [research.md](research.md) R-06 |
| `synonyms` on TypeNodeData, not mutating `source` AST | Preserves Langium immutability; plays well with Zustand diffing and Zundo | [research.md](research.md) R-06 |
| Text-based expression editor for functions | 39 AST expression variants make visual blocks impractical; text + validation delivers highest ROI | [research.md](research.md) R-07 |
