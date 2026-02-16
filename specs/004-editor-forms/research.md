# Research: Editor Forms for Types, Enums, Choices, and Functions

**Feature**: 004-editor-forms | **Date**: 2026-02-14

## R-01: Searchable Type Selector (shadcn/ui Combobox)

**Decision**: Use the shadcn/ui Combobox component pattern (cmdk-based) composed inside a Radix Popover for type selectors (parent type, attribute type, choice option type).

**Rationale**: The project already has the CVA/clsx/tailwind-merge stack. The Combobox pattern provides keyboard navigation, type-ahead filtering, and selection out of the box. Two new npm packages are needed: `cmdk` and `@radix-ui/react-popover`.

**Alternatives considered**:
- Raw `<select>` — no search/filtering capability; unusable with 400+ types
- Radix `<Select>` — no type-ahead filtering, only scroll navigation
- Manual Command + Popover composition — more boilerplate, same result as Combobox

**Implementation notes**:
- Copy shadcn Combobox component files to `apps/studio/src/components/ui/`
- Build a `TypeSelector` wrapper in `packages/visual-editor/src/components/editors/` that takes `availableTypes: { value: string; label: string; kind: TypeKind }[]` and an `onSelect` callback
- The `TypeSelector` renders a Combobox with kind-colored badges (data=blue, choice=amber, enum=green) per the design system tokens
- Include built-in types (`string`, `date`, `int`, `number`, `boolean`, `time`, `date-time`) as a fixed prefix group

## R-02: Tailwind CSS v4 + shadcn/ui Token Aliasing

**Decision**: Add a small `@theme inline` alias block to `apps/studio/src/styles.css` that maps shadcn's expected variable names to the Rune design system tokens.

**Rationale**: Keeps shadcn components copy-pasteable from docs without renaming every utility class. The alias block is ~10 lines. When shadcn publishes updates, components can be dropped in without class name translation.

**Mapping**:
```css
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

**Alternatives considered**:
- Rename classes inside each shadcn component — works but creates maintenance burden on every shadcn update
- Separate shadcn theme file — unnecessary complexity for a single app

## R-03: Auto-Save with Debounce Pattern

**Decision**: Use a `useAutoSave` hook with `setTimeout`/`clearTimeout`, a ref for the latest value, and unmount flush.

**Rationale**: Simple, zero-dependency, well-understood pattern. Avoids premature store churn during fast typing. The ref-based approach prevents stale closures. Flush-on-unmount prevents data loss when the panel closes or selection changes.

**Pattern**:
```ts
function useAutoSave<T>(
  value: T,
  commitFn: (val: T) => void,
  delayMs = 500
): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const latestRef = useRef(value);
  latestRef.current = value;

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => commitFn(latestRef.current), delayMs);
    return () => clearTimeout(timeoutRef.current);
  }, [value, delayMs, commitFn]);

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      commitFn(latestRef.current);
    };
  }, [commitFn]);
}
```

**Alternatives considered**:
- `lodash.debounce` — adds a dependency for a 10-line function; harder to integrate cleanup with React lifecycle
- `useDeferredValue` / `useTransition` — wrong abstraction; controls render priority, not commit timing
- `rxjs` debounce — massively over-engineered for this use case
- Zustand middleware (debounce writes at store level) — loses the "local state for responsiveness" benefit; would make typing sluggish

## R-04: Zundo Undo/Redo Integration

**Decision**: Wrap `createEditorStore`'s `create` call with `temporal(...)` using the existing `temporalOptions` from `history.ts`. Expose `undo`/`redo` via a `useTemporalStore` selector hook exported from the visual-editor package.

**Rationale**: The project already has zundo installed and a correctly-configured `temporalOptions` with `partialize` (nodes + edges only) and `limit: 50`. The wiring requires changing only the `create` call and adding an export.

**Implementation**:
```ts
// Double-call syntax required for TypeScript middleware inference with Zustand v5
export const createEditorStore = (overrides?: Partial<EditorState>) =>
  create<EditorStore>()(
    temporal(
      (set, get) => ({ /* existing store body */ }),
      temporalOptions
    )
  );
```

**Alternatives considered**:
- Custom undo/redo stack — reinventing what zundo already provides
- Tracking all state — would bloat history with UI state transitions (panel open/close, search changes) that aren't meaningful undo targets
- Diff-based storage — worth considering if models grow very large (1000+ nodes), but not needed with 50-entry limit

## R-05: Rename Cascade Pattern

**Decision**: Implement rename cascade at the graph state level (nodes + edges) in a single atomic `set()` call. Do not walk the AST.

**Rationale**: Consistent with the store-first architecture. All existing actions mutate `TypeNodeData` and `EdgeData`. The `graph-to-ast` adapter reconstructs AST references from graph state at serialization time. O(N+E) operation completes in < 1ms for CDM-scale models (400 nodes, ~1000 edges). Works seamlessly with Zundo undo/redo.

**Cascade targets**:
1. Target node: `data.name` → new name, `node.id` → new ID (`namespace::newName`)
2. All other nodes: `members[].typeName` referencing old name → new name; `data.parentName` referencing old name → new name
3. All edges: `source`/`target` referencing old node ID → new ID; `data.label` referencing old name → new name; edge `id` recomputed
4. `selectedNodeId` if matching old node ID → new ID

**Alternatives considered**:
- AST-level rename (walk Langium AST references) — couples store to AST internals; `source` may be stale; more complex for no benefit since `graph-to-ast` handles reconstruction
- Re-parse from scratch — loses undo granularity; 200-500ms latency; graph positions reset

## R-06: Store Actions for Enum/Choice/Metadata

**Decision**: Add 9 new actions to `EditorActions`. Extend `MemberDisplay` with `displayName?: string` for enum values. Extend `TypeNodeData` with `synonyms?: string[]` for editable metadata. Never mutate `source` AST directly.

**New actions**:

| Action | Kind | Signature |
|--------|------|-----------|
| `addEnumValue` | Enum | `(nodeId, valueName, displayName?) → void` |
| `removeEnumValue` | Enum | `(nodeId, valueName) → void` |
| `updateEnumValue` | Enum | `(nodeId, oldName, newName, displayName?) → void` |
| `setEnumParent` | Enum | `(nodeId, parentId \| null) → void` |
| `addChoiceOption` | Choice | `(nodeId, typeName) → void` |
| `removeChoiceOption` | Choice | `(nodeId, typeName) → void` |
| `updateDefinition` | All | `(nodeId, definition) → void` |
| `addSynonym` | All | `(nodeId, synonym) → void` |
| `removeSynonym` | All | `(nodeId, index) → void` |

**Rationale for `displayName` on `MemberDisplay`**: Cannot overload `typeName` for enum display names because `typeName` drives `attribute-ref` edge creation in `ast-to-graph`. Using it for enum display names would create false edge references. A dedicated `displayName` field keeps semantics clean.

**Rationale for `synonyms` on `TypeNodeData`**: Synonyms exist only on `source` AST nodes, not in graph display state. Rather than mutating `source` (which breaks Langium expectations and Zundo diffing), we add a flat `synonyms` array to `TypeNodeData` that the store actions mutate. The `graph-to-ast` adapter reads this during serialization.

**Alternatives considered**:
- Mutate `source` AST directly — breaks Langium immutability; Zustand can't efficiently diff deep AST trees; subtle bugs
- Separate metadata store — overly complex; splits related state; complicates undo/redo coordination

## R-07: Expression Editor Approach (Phase 2)

**Decision**: Text-based expression editor with parse-and-validate, not a visual block editor. Incremental delivery: P2a = read-only display + basic validation textarea; P2b = CodeMirror with syntax highlighting; P2c = block editor (defer).

**Rationale**: Even "simple" Rune expressions have operator precedence, nested parentheses, and dotted feature paths (`if trade -> price * quantity > 0 then trade -> price else 0`). A block editor for this would be more confusing than helpful. The `RosettaExpression` union has 39 variants — visual blocks are impractical. Users working with functions are typically comfortable with expression syntax.

**Scope breakdown**:

| Phase | Deliverable | Effort |
|-------|------------|--------|
| P2a (must have) | Function form with I/O param editing + read-only expression display + plain `<textarea>` with parse validation (red border + error message) | Low |
| P2b (nice to have) | CodeMirror 6 with Rune expression mode (syntax highlighting, inline squiggly errors) | Medium |
| P2c (defer) | Visual block editor; complex expression support (list ops, switch, map/reduce); expression type checking | High |

**Alternatives considered**:
- Visual block editor — very high cost; awkward for expressions with many operators; needs its own undo/redo within the block tree
- Hybrid (text + autocomplete + inline validation) — higher cost than plain text; CodeMirror adds ~100KB bundle weight; requires wiring to Langium for completions
- Defer entirely — functions are critical for business logic modeling; leaving them uneditable reduces the form editor's value proposition

## R-08: DetailPanel Evolution Strategy

**Decision**: Evolve the existing `DetailPanel` component into an `EditorFormPanel` that dispatches to the appropriate form component based on `TypeNodeData.kind`. Retain a read-only mode toggled by `RuneTypeGraphConfig.readOnly`.

**Rationale**: The existing `DetailPanel` is a read-only display component that is already structured by kind (shows name, kind, namespace, definition, extends, members, errors). It's not wired into the Studio UI. Rather than deleting it and starting fresh, evolving it preserves the structure and adds editability progressively.

**Implementation**:
```
EditorFormPanel (dispatch by kind)
  ├── kind === 'data'   → DataTypeForm
  ├── kind === 'enum'   → EnumForm
  ├── kind === 'choice' → ChoiceForm
  ├── kind === 'func'   → FunctionForm (Phase 2)
  └── readOnly === true  → DetailPanel (existing read-only display)
```

**Key design decisions**:
- `EditorFormPanel` receives `nodeData: TypeNodeData`, `readOnly: boolean`, and action callbacks
- Each form manages local state for responsiveness, commits to store via `useAutoSave`
- All forms include a `MetadataSection` sub-component at the bottom
- The panel is wired into `EditorPage` as a right-side `ResizablePanel`

## R-09: New Dependencies Required

| Package | Install to | Version | Purpose |
|---------|-----------|---------|---------|
| `cmdk` | `@rune-langium/studio` | latest | Combobox/Command filtering for type selectors |
| `@radix-ui/react-popover` | `@rune-langium/studio` | latest | Popover positioning for combobox dropdown |
| `@radix-ui/react-collapsible` | `@rune-langium/studio` | latest | Collapsible metadata sections |
| `@radix-ui/react-label` | `@rune-langium/studio` | latest | Accessible form labels |
| `@radix-ui/react-select` | `@rune-langium/studio` | latest | Simple select dropdowns (cardinality presets, kind selector) |

No new dependencies needed for `@rune-langium/visual-editor` — all visual-editor components are unstyled and pass callbacks to the host app's UI components.
