# Shared Workbench Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse Explore's docking lifecycle and type inventory in Prototype and Export without duplicating shell behavior or changing Explore selection semantics.

**Architecture:** Extract the existing docking lifecycle into a configurable host while retaining Explore's layout schema and adapter. Derive picker options from the existing node repository and add an opt-in checkbox mode to the existing namespace explorer. Workspace-scoped view preferences use the existing IndexedDB settings API.

**Tech Stack:** React 19, TypeScript 7, dockview-react 8, Zustand 5, existing design-system controls, Vitest and Playwright; Node >=22.13.0, pnpm@11.5.0.

**Spec:** [Prototype design](../specs/2026-09-14-prototype-workspace-ux-design.md), [Export design](../specs/2026-09-14-export-workspace-ux-design.md).

## Global Constraints

- “Reuse Explore's shell and layout mechanics rather than maintaining a separate sidebar-and-tabs shell.”
- “Reuse Dockview resizing, layout persistence, reset controls, and responsive behavior.”
- “Keep export inclusion separate from Explore visibility and navigation selection.”
- DRY is the primary correctness rule. Do not add another model inventory or hydration implementation.
- Existing `workspace.layout` and Explore keep-alive behavior must remain compatible. New perspective settings must not overwrite them.
- `packages/` source uses MIT SPDX headers; `apps/studio/` uses FSL-1.1-ALv2. Studio is source-available.
- No new dependencies, generated AST edits, production mutations, or grammar regeneration are needed for this plan.

---

## Execution map

Implement this prerequisite first; [Prototype](2026-09-14-prototype-workspace-ux.md) and [Export](2026-09-14-export-workspace-ux.md) then consume its public interfaces independently. Read both linked specs plus `docs/agents/architecture.md` and `docs/agents/workflow.md`. Before execution, use `superpowers:using-git-worktrees` for isolation and preserve the current uncommitted design/plan documents. Base implementation on fetched master, not the already-merged PR520 branch. Follow Infigraph's references/impact checks before the shell refactor.

File responsibilities:

| File | Responsibility |
| --- | --- |
| `apps/studio/src/shell/WorkbenchHost.tsx` (new) | Dockview mount, registry, native layout restore, serialize, disposal |
| `apps/studio/src/shell/workbench-types.ts` (new) | Host contract independent of domain panels |
| `apps/studio/src/shell/workbench-settings.ts` (new) | Workspace/perspective settings keys and serialization queue |
| `apps/studio/src/shell/DockShell.tsx` | Explore adapter, existing actions and layout translation |
| `apps/studio/src/shell/dockview-bridge.ts` | Existing Explore factory/native compatibility |
| `packages/visual-editor/src/utils/type-options.ts` (new) | Shared repository-to-picker projection |
| `apps/studio/src/components/WorkspaceTypePicker.tsx` (new) | Searchable host composition of existing TypeSelector |
| `packages/visual-editor/src/utils/explorer-selection.ts` (new) | Pure checkbox state and bulk-selection helpers |
| `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` | Existing virtualized explorer with opt-in selection controls |

### Task 1: Extract docking lifecycle and prove Explore stays mounted

**Files:** Create `apps/studio/src/shell/{WorkbenchHost.tsx,workbench-types.ts,workbench-settings.ts}`; modify `apps/studio/src/shell/{DockShell.tsx,dockview-bridge.ts}` and `apps/studio/src/workspace/persistence.ts`; extend `apps/studio/test/workspace/persistence.test.ts`; test `apps/studio/test/shell/{WorkbenchHost.test.tsx,workbench-settings.test.ts,DockShell.test.tsx,PerspectiveHost.test.tsx}`. Read existing `layout-factory.ts`, `layout-migrations.ts`, and design-system `src/ui/dock-layout.tsx`.

**Interfaces:** Existing `DockShellProps` remains compatible. New host contract:

```ts
import type { ComponentType } from 'react';
import type { DockviewApi } from 'dockview-react';
import type { WorkbenchSettingKey } from '../workspace/persistence.js';

export interface WorkbenchDefinition {
  id: 'explore' | 'prototype' | 'export';
  panels: Readonly<Record<string, ComponentType>>;
  titles: Readonly<Record<string, string>>;
  buildDefault(api: DockviewApi, width: number): void;
}
export interface WorkbenchHostProps {
  definition: WorkbenchDefinition;
  initialNativeLayout?: unknown;
  onNativeLayoutChange(json: unknown): void;
  onReady?(api: DockviewApi): void;
}
export function workbenchSettingsKey(workspaceId: string, perspective: string): WorkbenchSettingKey {
  return `workbench:${JSON.stringify([workspaceId, perspective])}:v1`;
}
```

`readWorkbenchSettings<T>(workspaceId: string, perspective: string, fallback: T): Promise<T>` and `writeWorkbenchSettings<T>(workspaceId: string, perspective: string, value: T): Promise<void>` wrap existing `loadSetting`/`saveSetting`. Callers validate stored values against their concrete model and use their fallback on invalid records; do not persist payloads, ASTs, workers, or generated artifacts here.

- [ ] **Step 1: Add settings isolation and lifecycle regression tests.** Extend existing DockShell/PerspectiveHost render fixtures instead of replacing real providers with an empty model registry. Use this settings test verbatim with imports from the new module:

```ts
it('keeps perspective state separate', async () => {
  await writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'one' });
  await writeWorkbenchSettings('workspace-a', 'export', { target: 'zod' });
  expect(await readWorkbenchSettings('workspace-a', 'prototype', {}))
    .toEqual({ selectedId: 'one' });
  expect(await readWorkbenchSettings('workspace-b', 'prototype', {})).toEqual({});
});
```

Add to the existing PerspectiveHost test's mounted Explore fixture:

```tsx
const editor = screen.getByTestId('explore-workbench');
act(() => usePerspectiveStore.getState().setActivePerspective('prototype'));
act(() => usePerspectiveStore.getState().setActivePerspective('explore'));
expect(screen.getByTestId('explore-workbench')).toBe(editor);
```

- [ ] **Step 2: Run the red tests.** `pnpm --filter @rune-langium/studio exec vitest run test/shell/workbench-settings.test.ts test/shell/WorkbenchHost.test.tsx test/shell/DockShell.test.tsx test/shell/PerspectiveHost.test.tsx`. New modules should be missing; existing tests establish compatibility before refactoring.
- [ ] **Step 3: Implement the settings wrappers.** Extend persistence's existing `SettingKey` union with the template-literal type shown below. The wrapper returns that type without casts. Remove input/output capture from `saveSetting` and `loadSetting` instrumentation: their new keys and values can contain workspace identifiers and model names, so the existing benign-static-preference assumption no longer applies. Keep operation timing/error instrumentation and test that neither dynamic keys nor stored values are captured. Use the key above, serialize writes per key with a `Map<string, Promise<void>>`, capture the workspace key at invocation, recover a rejected prior write before accepting a retry, and remove only the current queue tail. Return write failures to the caller. Use `loadSetting`'s existing undefined result as fallback. Test two writes resolving in reverse order and a failed write followed by a successful retry.
```ts
export type WorkbenchSettingKey = `workbench:${string}:v1`;
```

- [ ] **Step 4: Extract host lifecycle from DockShell.** Move the `DockLayout` mounting, stable panel bridges, `onReady`, layout-change subscription, and subscription disposal into WorkbenchHost. Preserve existing tab/header components through explicit optional host props typed from `DockLayoutProps`; forward them directly rather than rebuilding them. Keep Explore toolbar, center-pane policy, shortcuts, and utility collapse behavior in DockShell. The domain panels must be stable React component types, never direct calls to arbitrary hook-using render functions.

```tsx
function PanelBody({ name }: { name: string }) {
  const definition = useContext(WorkbenchDefinitionContext);
  if (!definition) throw new Error('PanelBody requires WorkbenchHost');
  const Component = definition.panels[name];
  return Component ? <Component /> : null;
}
```

Define `WorkbenchDefinitionContext = createContext<WorkbenchDefinition | null>(null)` in WorkbenchHost; guard missing context with an explicit thrown error before the lookup above. Keep bridges memoized by panel name, so updates to context do not remount editor content.
- [ ] **Step 5: Preserve restore/reset behavior.** Validate restored component names against `definition.panels`, reject an empty native layout, and invoke `definition.buildDefault` after `api.clear()` on failure. For Explore, continue sanitizing/migrating `PanelLayoutRecord` and applying the existing factory through `applyLayout`; do not force its fixed three-column `FactoryShape` onto the other perspectives. Expose `resetWorkbench(api: DockviewApi, definition: WorkbenchDefinition, width: number): void` from WorkbenchHost; it clears and builds only this host. Test unknown names, empty layouts, reset isolation, and listener cleanup using the existing Dockview mock.
- [ ] **Step 6: Run green checks and commit.** Run Step 2, then `pnpm --filter @rune-langium/studio run type-check`. Update `docs/agents/architecture.md` to explain host versus perspective ownership. Commit only Task 1 files with `git commit -m "refactor(studio): share workbench docking lifecycle"` after explicit `git add` of the listed paths and architecture document.

### Task 2: Share type inventory and searchable picker

**Files:** Create `packages/visual-editor/src/utils/type-options.ts`, `apps/studio/src/components/WorkspaceTypePicker.tsx`; modify `packages/visual-editor/src/index.ts`, `apps/studio/src/shell/ExplorePerspective.tsx:1570`; test `packages/visual-editor/test/utils/type-options.test.ts`, `apps/studio/test/components/WorkspaceTypePicker.test.tsx`.

**Interfaces:** `buildTypeOptions(repository: NodeRepository, includeBuiltins?: boolean): TypeOption[]` exports from visual-editor. `WorkspaceTypePicker({ value, onSelect, filterKinds, allowClear, label }: { value: string | null; onSelect(value: string | null): void; filterKinds: TypeKind[]; allowClear?: boolean; label: string }): ReactElement` derives options from `useEditorStore(s => s.nodesById)` and `selectNodeRepository`; it does not mutate Explore selection.

- [ ] **Step 1: Write projection and interaction tests.** Build a real repository with existing node-repository test fixtures, including two equal bare names in different namespaces, one Choice, a function, and deferred entries. Assert qualified values and both namespaces survive. Picker interaction fixture:

```tsx
const onSelect = vi.fn();
render(<WorkspaceTypePicker value={null} onSelect={onSelect}
  filterKinds={['data', 'choice']} label="Instance type" />);
await userEvent.click(screen.getByRole('button', { name: 'Instance type' }));
await userEvent.type(screen.getByRole('combobox'), 'Party');
await userEvent.click(screen.getByRole('option', { name: /Party.*test\.two/ }));
expect(onSelect).toHaveBeenCalledWith('test.two.Party');
```

The test's repository must be seeded through the real editor-store fixture utilities; do not mock a second catalog. Accessible option names include namespace so this is unambiguous.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/visual-editor exec vitest run test/utils/type-options.test.ts`; `pnpm --filter @rune-langium/studio exec vitest run test/components/WorkspaceTypePicker.test.tsx`.
- [ ] **Step 3: Extract the projection currently in ExplorePerspective.** Preserve `BUILTIN_TYPES`, `resolveNodeKind`, qualified node IDs, names, and namespaces. Use `repository.all()` instead of rebuilding nodes from ASTs. Memoize on the repository identity. Replace Explore's inline mapping with this exported helper; verify the resulting availableTypes is equivalent.

```ts
const repository = selectNodeRepository(nodesById);
const options = buildTypeOptions(repository, false);
```

- [ ] **Step 4: Compose the existing TypeSelector.** Use its `renderTrigger` and `renderPopover` interfaces with existing design-system Popover/Command primitives to supply a genuinely searchable picker; the fallback select alone is insufficient. Preserve keyboard focus, Enter selection, Escape dismissal, and clear behavior. Pass `filterKinds` to TypeSelector; label its input and options. Export no private editor store into codegen.
- [ ] **Step 5: Run green checks and commit.** Run Step 2 plus both package type checks and existing TypeSelector tests. Commit `feat(studio): share searchable workspace type selection` with only the listed files.

### Task 3: Extend the namespace explorer with controlled export selection

**Files:** Create `packages/visual-editor/src/utils/explorer-selection.ts`; modify `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`, `packages/visual-editor/src/index.ts`; test `packages/visual-editor/test/utils/explorer-selection.test.ts`, `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx`.

**Interfaces:** Optional `selection?: ExplorerSelection` on NamespaceExplorerPanel; no behavior change when absent.

```ts
export interface ExplorerSelection {
  explicit: ReadonlySet<string>;
  requiredBy: ReadonlyMap<string, readonly string[]>;
  onChange(next: Set<string>): void;
  getSelectionId?(node: TypeGraphNode): string;
}
export function selectionState(ids: readonly string[], selected: ReadonlySet<string>) {
  const count = ids.filter(id => selected.has(id)).length;
  return count === 0 ? false : count === ids.length ? true : 'indeterminate';
}
export function toggleVisible(ids: readonly string[], selected: ReadonlySet<string>, checked: boolean) {
  const next = new Set(selected);
  for (const id of ids) checked ? next.add(id) : next.delete(id);
  return next;
}
```

- [ ] **Step 1: Add a filter-preservation regression.**

```ts
it('clears visible roots without clearing hidden roots', () => {
  expect(toggleVisible(['a.Party'], new Set(['a.Party', 'b.Trade']), false))
    .toEqual(new Set(['b.Trade']));
  expect(selectionState(['a.Party', 'a.Address'], new Set(['a.Party'])))
    .toBe('indeterminate');
});
```

Add a rendered explorer test: check a row; invoke its navigation button; assert `onSelectNode` fires without a second `onChange`. Required-only items expose the requiring roots and cannot be removed while those roots remain selected. An explicitly selected item may lose its explicit flag and remain required.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/visual-editor exec vitest run test/utils/explorer-selection.test.ts test/components/NamespaceExplorerPanel.test.tsx`.
- [ ] **Step 3: Implement the pure helpers and checkbox rendering.** Import `TypeGraphNode` from the existing visual-editor model types. Resolve checkbox keys with `selection.getSelectionId?.(node) ?? node.id`; apply the same mapping to rows, required markers, namespace descendants, and filtered bulk operations. Navigation continues to use the original node ID. Export supplies its canonical declaration key adapter. Use the existing segmented tree and filtered virtual rows as the source of visible IDs. Namespace checkboxes operate on all eligible descendants of that namespace, not just viewport-mounted rows. “Select visible results” operates on the complete filtered result set. “Clear selection” clears all explicit roots; required markers are derived anew by the caller. Checkbox clicks stop propagation; preserve existing drag and navigation callbacks outside selection mode. Use existing design-system Checkbox's indeterminate state.
- [ ] **Step 4: Verify keyboard and large-tree behavior.** Add tests for Space on a checkbox, filtered bulk selection, parent indeterminate state, an offscreen selected row, and no selection mode preserving existing callbacks. No AST hydration is triggered by merely expanding/filtering this inventory.
- [ ] **Step 5: Run green checks and commit.** Run Step 2, visual-editor type-check, and the existing namespace explorer/virtual tree suite. Update architecture docs with controlled inclusion versus navigation. Commit `feat(visual-editor): add controlled explorer selection mode`.

## Completion checks

- [ ] Run `pnpm --filter @rune-langium/visual-editor run test` and `pnpm --filter @rune-langium/studio run test` after all three tasks.
- [ ] Run affected lint/type checks and `pnpm run format:check`; do not repair unrelated files.
- [ ] Use the existing local Playwright Explore workspace journey to verify editor state survives switching perspectives, resizing, and reset. Mocked Dockview unit tests alone do not prove layout behavior.
- [ ] Record exact checks and any baseline failures in the PR. Do not deploy as part of this foundation refactor.

## Self-review and scope coverage

Shared shell/compatibility: Task 1. Shared type picker: Task 2. Export inclusion without changing Explore navigation: Task 3. Domain-specific creation, generation, graph semantics, and payload ownership belong to the linked consumer plans. All new contracts are declared above; source snippets describe new APIs, not claims that they already exist.
