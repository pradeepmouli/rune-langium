# Synonym Source Picker (rune integration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit synonym `sources` as cross-reference picks against declared `RosettaSynonymSource` names (with a value field for enum synonyms) so z2f validates synonyms natively, covering `RosettaClassSynonym` (Data/Choice), `RosettaSynonym` (enum-level), and `RosettaEnumSynonym` (per enum value); then remove render-core's hand-rolled synonym guards.

**Architecture:** A focused `SourceRefField` (Popover + cmdk `Command` flat list + chip) replaces the free-text synonym tag input. `RosettaSynonymSource` declarations — collected nowhere today — are gathered from the parsed workspace and threaded to the forms exactly like `availableTypes`. The store's synonym actions are widened from a bare string to `(source, value?)`. With the regenerated `langium-zod@0.10.0` schema carrying `.min(1)` on `sources`, z2f's `createRosetta*SynonymSchema(refs)` factories validate the source ref against the available names and reject empty sources — so render-core's guards come out.

**Tech Stack:** React 19, react-hook-form + `@zod-to-form/react` (`useZodForm`), zustand + mutative store, base-ui/cmdk design-system primitives, Vitest. Depends on `langium-zod@0.10.0` (the array-min-occurrence plan).

## Global Constraints

- Branch: `feat/schema-driven-synonym-validity` (already created off `master`; the spec is committed there).
- **Tasks 4–7 depend on `langium-zod@0.10.0` being published + Task 1's regen** (the `.min(1)` schema). Tasks 2–3 (`SourceRefField`, options plumbing) have no such dependency and may land first.
- Cross-namespace source refs qualify their `$refText` as `` `${namespace}.${name}` `` (mirror TypeAlias wrapped-type qualify from #350); a local source stays bare.
- Commits: `SKIP_SIMPLE_GIT_HOOKS=1`; stage only changed files (NEVER `git add -A` — untracked `reference-design/`, `packages/visual-editor/src/generated/zod-schemas.conformance.ts`, and old plan files must NOT be committed). Commit footers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session:`.
- Commands: VE tests `pnpm --filter @rune-langium/visual-editor test`; VE type-check `pnpm --filter @rune-langium/visual-editor type-check`; codegen tests `pnpm --filter @rune-langium/codegen test`; single VE file `pnpm --filter @rune-langium/visual-editor test -- test/<path>`. After any codegen render change, rebuild dist: `pnpm --filter @rune-langium/codegen run build` (VE/studio consume the build).
- Run the FULL VE suite before completing a UI/store task (sibling tests assert old behavior).

## File Structure

- **Create** `packages/visual-editor/src/components/editors/SourceRefField.tsx` — the focused source-ref picker (one ref value).
- **Modify** `packages/visual-editor/src/types.ts` — add `SourceRefOption` (`{ value; label; namespace? }`) + extend the relevant form-actions interfaces.
- **Modify** `apps/studio/src/shell/ExplorePerspective.tsx` — build `synonymSourceOptions` from parsed models; pass to `EditorFormPanel`.
- **Modify** `packages/visual-editor/src/components/panels/EditorFormPanel.tsx` — thread `synonymSourceOptions` to the forms.
- **Modify** `DataTypeForm.tsx`, `ChoiceForm.tsx`, `EnumForm.tsx` — accept + forward `synonymSourceOptions`.
- **Modify** `packages/visual-editor/src/components/editors/MetadataSection.tsx` — host-aware source-ref synonym control.
- **Modify** `packages/visual-editor/src/components/editors/EnumValueRow.tsx` — per-enum-value synonym control.
- **Modify** `packages/visual-editor/src/store/editor-store.ts` — widen `addSynonym`; add `addEnumValueSynonym`/`removeEnumValueSynonym`.
- **Modify** `pnpm-workspace.yaml`, `packages/core/package.json`, `packages/visual-editor/package.json` — bump `langium-zod` 0.9.0 → 0.10.0; regenerate.
- **Modify** `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` — remove synonym `null` guards.

---

### Task 1: Bump `langium-zod@0.10.0` + regenerate schemas

**Precondition:** `langium-zod@0.10.0` is published (the array-min-occurrence plan merged + released).

**Files:**
- Modify: `pnpm-workspace.yaml` (the `langium-zod` override + catalog entry), `packages/core/package.json`, `packages/visual-editor/package.json`.
- Regenerate: `packages/core/src/generated/zod-schemas.ts`, `packages/visual-editor/src/generated/zod-schemas.ts` (+ `.conformance.ts`).

- [ ] **Step 1: Bump the pin**

In `pnpm-workspace.yaml`, change every `langium-zod` `0.9.0` to `0.10.0` (the `overrides`/`catalog` entries — see `project_pnpm_overrides_location`: overrides live here, not package.json). In `packages/core/package.json` and `packages/visual-editor/package.json` devDependencies, change `"langium-zod": "0.9.0"` → `"0.10.0"`.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates to `langium-zod@0.10.0`, no `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.

- [ ] **Step 3: Regenerate schemas**

```bash
pnpm --filter @rune-langium/core run generate:zod
pnpm --filter @rune-langium/visual-editor run generate:schemas
```

- [ ] **Step 4: Verify the `.min(1)` diff is confined to comma-list `+=` props**

Run: `git diff -- packages/core/src/generated/zod-schemas.ts packages/visual-editor/src/generated/zod-schemas.ts | rg 'min\(1\)'`
Expected: `RosettaClassSynonymSchema.sources`, `RosettaSynonymSchema.sources`, and other genuine ≥1 comma-list arrays gain `.min(1)`. Spot-check that no unrelated optional array gained it.

- [ ] **Step 5: Full suites + type-check**

```bash
pnpm --filter @rune-langium/core test
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor type-check
```
Expected: green. If the `.min(1)` tightens a form test that was relying on empty arrays, fix the test fixture to supply a source (the new constraint is correct).

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/core/package.json packages/visual-editor/package.json packages/core/src/generated/zod-schemas.ts packages/visual-editor/src/generated/zod-schemas.ts packages/visual-editor/src/generated/zod-schemas.conformance.ts
git commit -m "chore: bump langium-zod 0.10.0 + regenerate schemas (sources .min(1))"
```

---

### Task 2: `SourceRefField` component

**Files:**
- Create: `packages/visual-editor/src/components/editors/SourceRefField.tsx`
- Modify: `packages/visual-editor/src/types.ts` (add `SourceRefOption`)
- Test: `packages/visual-editor/test/editors/SourceRefField.test.tsx`

**Interfaces:**
- Produces: `SourceRefOption = { value: string; label: string; namespace?: string }`; `SourceRefField` props `{ value: string | null; options: SourceRefOption[]; onSelect: (value: string | null) => void; placeholder?: string; disabled?: boolean; readOnly?: boolean }`. `value` is the option's `value` (its canonical id); `onSelect` receives that id (or `null` on clear).

- [ ] **Step 1: Add `SourceRefOption` to types**

In `packages/visual-editor/src/types.ts`, near `TypeOption` (line ~174), add:
```ts
/** Option for the synonym-source reference picker. */
export interface SourceRefOption {
  /** Canonical id of the source declaration (e.g. `ns.FpML`). */
  value: string;
  /** Display name (bare source name). */
  label: string;
  /** Namespace for cross-namespace qualification. */
  namespace?: string;
}
```

- [ ] **Step 2: Write the failing component test**

Create `packages/visual-editor/test/editors/SourceRefField.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceRefField } from '../../src/components/editors/SourceRefField.js';

const options = [
  { value: 'ns.FpML', label: 'FpML', namespace: 'ns' },
  { value: 'ns.FIX', label: 'FIX', namespace: 'ns' }
];

describe('SourceRefField', () => {
  it('shows the selected label and opens a picker listing options', () => {
    const onSelect = vi.fn();
    render(<SourceRefField value="ns.FpML" options={options} onSelect={onSelect} />);
    expect(screen.getByText('FpML')).toBeInTheDocument();
    fireEvent.click(screen.getByText('FpML'));
    expect(screen.getByText('FIX')).toBeInTheDocument();
    fireEvent.click(screen.getByText('FIX'));
    expect(onSelect).toHaveBeenCalledWith('ns.FIX');
  });

  it('renders a placeholder when no value is selected', () => {
    render(<SourceRefField value={null} options={options} onSelect={() => {}} placeholder="Pick source…" />);
    expect(screen.getByText('Pick source…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- test/editors/SourceRefField.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `SourceRefField`**

Create `packages/visual-editor/src/components/editors/SourceRefField.tsx`:
```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * SourceRefField — single cross-reference picker for a synonym source.
 *
 * Mirrors TypeReferenceField's chip+popover idiom but is NOT type-coupled: it
 * picks a `RosettaSynonymSource` from a flat option list (no type kinds, drop
 * target, namespace tree, or node navigation). Built on the shared design-system
 * Popover + cmdk Command primitives.
 */

import { useCallback, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@rune-langium/design-system/ui/command';
import type { SourceRefOption } from '../../types.js';

export interface SourceRefFieldProps {
  value: string | null;
  options: SourceRefOption[];
  onSelect: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function SourceRefField({
  value,
  options,
  onSelect,
  placeholder = 'Select source…',
  disabled = false,
  readOnly = false
}: SourceRefFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const label = selected?.label ?? '';

  const handleSelect = useCallback(
    (v: string) => {
      onSelect(v);
      setOpen(false);
    },
    [onSelect]
  );

  if (readOnly) {
    return (
      <span data-slot="source-ref" className="inline-flex items-center rounded bg-card px-2 py-0.5 text-xs text-foreground">
        {label || placeholder}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            data-slot="source-ref-trigger"
            className="nodrag nopan inline-flex items-center rounded bg-card px-2 py-0.5 text-xs text-foreground"
          >
            {label || placeholder}
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
        <Command className="nodrag nopan">
          <CommandInput placeholder="Search sources…" />
          <CommandList>
            <CommandEmpty>No synonym sources.</CommandEmpty>
            {options.map((o) => (
              <CommandItem key={o.value} value={o.label} onSelect={() => handleSelect(o.value)}>
                {o.label}
                {o.namespace ? <span className="ml-2 text-muted-foreground">{o.namespace}</span> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```
Note: verify the `@rune-langium/design-system/ui/command` export path + `Command*` member names against `packages/design-system/src/ui/command.tsx` (the exploration confirmed cmdk-based `Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator`). The SPDX header is FSL-1.1-ALv2 (this file lives under VE which is source-available; confirm against a sibling editor file's header).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/visual-editor test -- test/editors/SourceRefField.test.tsx`
Expected: PASS. (If cmdk's `CommandInput` filtering hides options in jsdom, assert via `CommandItem` roles or drop the `CommandInput` from the test's interaction.)

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/visual-editor type-check
git add packages/visual-editor/src/components/editors/SourceRefField.tsx packages/visual-editor/src/types.ts packages/visual-editor/test/editors/SourceRefField.test.tsx
git commit -m "feat(ve): SourceRefField — synonym source cross-ref picker"
```

---

### Task 3: Gather `RosettaSynonymSource` options + plumb to forms

**Files:**
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` (build `synonymSourceOptions`, pass to `EditorFormPanel`)
- Modify: `packages/visual-editor/src/components/panels/EditorFormPanel.tsx` (declare + thread the prop)
- Modify: `DataTypeForm.tsx`, `ChoiceForm.tsx`, `EnumForm.tsx` (accept + forward the prop, defaulting to `[]`)
- Test: `packages/visual-editor/test/editors/EditorFormPanel.test.tsx` (assert the prop threads through)

**Interfaces:**
- Produces: a `synonymSourceOptions: SourceRefOption[]` prop on `EditorFormPanel` and on `DataTypeForm`/`ChoiceForm`/`EnumForm` (default `[]`).

- [ ] **Step 1: Build the options in `ExplorePerspective`**

Near the existing `availableTypes` `useMemo` (`ExplorePerspective.tsx:1384`), add (using `parsedModels`/`models` from `useWorkspace()` — `ExplorePerspective.tsx:534`):
```ts
const synonymSourceOptions: SourceRefOption[] = useMemo(() => {
  const out: SourceRefOption[] = [];
  for (const model of parsedModels ?? models ?? []) {
    const namespace = getNamespace(model as RosettaModel);
    for (const element of ((model as RosettaModel).elements ?? [])) {
      if ((element as { $type?: string }).$type === 'RosettaSynonymSource') {
        const name = (element as { name: string }).name;
        out.push({ value: namespace ? `${namespace}.${name}` : name, label: name, namespace });
      }
    }
  }
  return out;
}, [parsedModels, models]);
```
Import `SourceRefOption` from the VE package types and reuse the existing `getNamespace`/`RosettaModel` imports already present in this file (the file already references `RosettaSynonymSource` in its kind-label map at line ~1780).

- [ ] **Step 2: Pass it into `EditorFormPanel`**

At the `<EditorFormPanel ... availableTypes={availableTypes} />` usage (`ExplorePerspective.tsx:1707`), add `synonymSourceOptions={synonymSourceOptions}`.

- [ ] **Step 3: Thread through `EditorFormPanel`**

In `EditorFormPanel.tsx`, add to its props interface (next to `availableTypes: TypeOption[]`, line ~128):
```ts
  synonymSourceOptions?: SourceRefOption[];
```
Destructure it (default `[]`) and pass `synonymSourceOptions={synonymSourceOptions}` to `<DataTypeForm>` (line 257), `<ChoiceForm>` (290), and `<EnumForm>` (273).

- [ ] **Step 4: Accept in the three forms**

In `DataTypeForm.tsx`, `ChoiceForm.tsx`, `EnumForm.tsx`, add `synonymSourceOptions?: SourceRefOption[]` (default `[]`) to props, and pass it down: Data/Choice → into `<MetadataSection>` (new prop, Task 5); Enum → into both `<MetadataSection>` (enum-level) and the enum-value rows (Task 6).

- [ ] **Step 5: Write/extend the panel test**

In `packages/visual-editor/test/editors/EditorFormPanel.test.tsx`, add a case rendering `EditorFormPanel` with `synonymSourceOptions={[{value:'ns.FpML',label:'FpML',namespace:'ns'}]}` for a Data node and assert it reaches the metadata source control (query the rendered source trigger/placeholder). Run:
`pnpm --filter @rune-langium/visual-editor test -- test/editors/EditorFormPanel.test.tsx`
Expected: PASS after Task 5 lands; until then assert the prop is accepted without error.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/visual-editor type-check
pnpm --filter @rune-langium/studio type-check
git add apps/studio/src/shell/ExplorePerspective.tsx packages/visual-editor/src/components/panels/EditorFormPanel.tsx packages/visual-editor/src/components/editors/DataTypeForm.tsx packages/visual-editor/src/components/editors/ChoiceForm.tsx packages/visual-editor/src/components/editors/EnumForm.tsx packages/visual-editor/test/editors/EditorFormPanel.test.tsx
git commit -m "feat(ve): gather RosettaSynonymSource options + thread to forms"
```

---

### Task 4: Widen the store synonym actions

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`addSynonym`; add `addEnumValueSynonym`/`removeEnumValueSynonym`)
- Modify: `packages/visual-editor/src/types.ts` (action signatures)
- Test: `packages/visual-editor/test/store/editor-store-actions.test.ts`

**Interfaces:**
- Produces: `addSynonym(nodeId: string, source: string, value?: string): void` — host-aware: Data/Choice → `RosettaClassSynonym { sources:[{$refText:source}], value? }`; Enum → `RosettaSynonym { sources:[{$refText:source}], body:{ values:[{ name: value }] } }` (no-op when `value` is empty for the enum case). `removeSynonym(nodeId, index)` unchanged. New: `addEnumValueSynonym(nodeId: string, valueIndex: number, source: string, value: string): void` and `removeEnumValueSynonym(nodeId: string, valueIndex: number, synIndex: number): void` → `RosettaEnumValue.enumSynonyms` entries `{ $type:'RosettaEnumSynonym', sources:[{$refText:source}], synonymValue: value }`.

- [ ] **Step 1: Write the failing store tests**

In `editor-store-actions.test.ts`, replace the existing `addSynonym` cases (which pass a single string and assert `sources[0].$refText`) so they pass `(source, value)`:
```ts
it('adds a class synonym from a source ref (Data)', () => {
  const node = store.getState().nodes.find((n) => n.data.name === 'Trade')!;
  store.getState().addSynonym(node.id, 'FpML');
  const syns = (store.getState().nodes.find((n) => n.id === node.id)!.data as any).synonyms;
  expect(syns[0].$type).toBe('RosettaClassSynonym');
  expect(syns[0].sources[0].$refText).toBe('FpML');
});
```
Add a test for `addEnumValueSynonym` on an enum node: after `addEnumValueSynonym(enumId, 0, 'FIX', 'TD')`, assert `enumValues[0].enumSynonyms[0]` is `{ $type:'RosettaEnumSynonym', sources:[{$refText:'FIX'}], synonymValue:'TD' }`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rune-langium/visual-editor test -- test/store/editor-store-actions.test.ts`
Expected: FAIL (signature mismatch / `addEnumValueSynonym` undefined).

- [ ] **Step 3: Implement**

Change `addSynonym` (editor-store.ts ~2144) to the `(nodeId, source, value?)` shape:
```ts
addSynonym(nodeId: string, source: string, value?: string) {
  mutateGraph(set, get, (draft) => {
    const n = draft.nodes.get(nodeId);
    const d = n?.data;
    if (!d) return;
    const dd = d as { synonyms?: any[] };
    const sources = [{ $refText: source }];
    if (d.$type === 'Data' || d.$type === 'Choice') {
      const newSyn: any = { $type: 'RosettaClassSynonym', sources };
      if (value) newSyn.value = { name: value };
      if (!Array.isArray(dd.synonyms)) dd.synonyms = [];
      if (d.$type === 'Data') Data.addSynonym(d, newSyn);
      else Choice.addSynonym(d, newSyn);
    } else if (d.$type === 'RosettaEnumeration') {
      if (!value) return; // enum-level RosettaSynonym requires a value body
      const newSyn = { $type: 'RosettaSynonym', sources, body: { values: [{ name: value }] } };
      if (!Array.isArray(dd.synonyms)) dd.synonyms = [];
      RosettaEnumeration.addSynonym(d, newSyn as any);
    }
  });
},
```
Add the enum-value actions (near `addEnumValue`, ~1660):
```ts
addEnumValueSynonym(nodeId: string, valueIndex: number, source: string, value: string) {
  mutateGraph(set, get, (draft) => {
    const n = draft.nodes.get(nodeId);
    const d = n?.data as { $type?: string; enumValues?: any[] } | undefined;
    if (d?.$type !== 'RosettaEnumeration') return;
    const ev = d.enumValues?.[valueIndex];
    if (!ev) return;
    if (!Array.isArray(ev.enumSynonyms)) ev.enumSynonyms = [];
    ev.enumSynonyms.push({ $type: 'RosettaEnumSynonym', sources: [{ $refText: source }], synonymValue: value });
  });
},
removeEnumValueSynonym(nodeId: string, valueIndex: number, synIndex: number) {
  mutateGraph(set, get, (draft) => {
    const n = draft.nodes.get(nodeId);
    const d = n?.data as { $type?: string; enumValues?: any[] } | undefined;
    if (d?.$type !== 'RosettaEnumeration') return;
    const arr = d.enumValues?.[valueIndex]?.enumSynonyms;
    if (Array.isArray(arr) && synIndex >= 0 && synIndex < arr.length) arr.splice(synIndex, 1);
  });
},
```
Add the four signatures to the action interfaces in `types.ts` (`CommonFormActions.addSynonym` widened; `EnumFormActions` gains the two enum-value actions).

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @rune-langium/visual-editor test -- test/store/editor-store-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @rune-langium/visual-editor type-check
git add packages/visual-editor/src/store/editor-store.ts packages/visual-editor/src/types.ts packages/visual-editor/test/store/editor-store-actions.test.ts
git commit -m "feat(store): widen addSynonym to (source, value?); enum-value synonym actions"
```

---

### Task 5: Host-aware synonym control in `MetadataSection`

**Files:**
- Modify: `packages/visual-editor/src/components/editors/MetadataSection.tsx`
- Test: `packages/visual-editor/test/editors/EnumForm-members.test.tsx` (or a new `MetadataSection-synonyms.test.tsx`)

**Interfaces:**
- Consumes: `SourceRefField` (Task 2), `synonymSourceOptions` prop (Task 3), `addSynonym(source, value?)`/`removeSynonym` (Task 4). Host kind comes from the editor-actions context node `$type` (Data/Choice vs RosettaEnumeration).

- [ ] **Step 1: Write the failing test**

Render a Data form's MetadataSection with `synonymSourceOptions=[{value:'ns.FpML',label:'FpML',namespace:'ns'}]`, pick `FpML` from the source field, assert `addSynonym(nodeId, 'FpML')` fired and the synonym chip shows `FpML`. Add an enum variant asserting a value input appears and `addSynonym(nodeId, 'FpML', 'TD')` fires.

- [ ] **Step 2: Run to verify failure**

Run the new test file; expect FAIL (no source field yet).

- [ ] **Step 3: Implement the control**

Add a `synonymSourceOptions?: SourceRefOption[]` prop and an `isEnumHost` flag (derive from `ctx` node `$type === 'RosettaEnumeration'`, available via `useEditorActionsContext()` already used at line 85). Replace the free-text tag block (MetadataSection.tsx lines 234-282) with: per existing synonym a removable chip showing its source `$refText` (+ value when present), plus an "add" row = `<SourceRefField options={synonymSourceOptions} value={pendingSource} onSelect={setPendingSource} />` and, when `isEnumHost`, a value `<Input>`; an Add button calls `effectiveOnSynonymAdd(pendingSource, isEnumHost ? pendingValue : undefined)`. Update `effectiveOnSynonymAdd` to `(source: string, value?: string) => onSynonymAdd?.(source, value) ?? ctx?.actions.addSynonym(ctx.nodeId, source, value)`; widen `MetadataSectionProps.onSynonymAdd` to `(source: string, value?: string) => void`. Read existing synonyms from the AST shape (objects with `sources`), not `string[]`: `const synonymValues = (getValues('synonyms') ?? []) as Array<{ sources?: {$refText?:string}[]; value?: {name?:string} }>` and render `s.sources?.[0]?.$refText` (+ `s.value?.name`).

- [ ] **Step 4: Run the test + the full editors suite**

```bash
pnpm --filter @rune-langium/visual-editor test -- test/editors
```
Expected: PASS (and the existing `section-resolution.test.ts` still resolves the synonyms field).

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @rune-langium/visual-editor type-check
git add packages/visual-editor/src/components/editors/MetadataSection.tsx packages/visual-editor/test/editors/
git commit -m "feat(ve): host-aware synonym source control in MetadataSection"
```

---

### Task 6: Per-enum-value synonym control in `EnumValueRow`

**Files:**
- Modify: `packages/visual-editor/src/components/editors/EnumValueRow.tsx`
- Test: `packages/visual-editor/test/editors/EnumValueRow.test.tsx`

**Interfaces:**
- Consumes: `SourceRefField` (Task 2), `synonymSourceOptions` (threaded via EnumForm → the value rows), `addEnumValueSynonym`/`removeEnumValueSynonym` (Task 4).

- [ ] **Step 1: Write the failing test**

Render an `EnumValueRow` (index 0) with `synonymSourceOptions` + actions context; pick a source, type a value, click add; assert `addEnumValueSynonym(nodeId, 0, 'FIX', 'TD')` fired and a chip shows `FIX value "TD"`.

- [ ] **Step 2: Run to verify failure** — expect FAIL (no synonym UI in the row).

- [ ] **Step 3: Implement**

Add a `synonymSourceOptions?: SourceRefOption[]` prop to `EnumValueRow`. Bind `enumValues.${index}.enumSynonyms` via the form context for display (read-only render of chips), and an add row (`SourceRefField` + value `Input` + Add button) calling `actions.addEnumValueSynonym(nodeId, index, source, value)`; remove buttons call `actions.removeEnumValueSynonym(nodeId, index, synIndex)`. Thread `synonymSourceOptions` from `EnumForm` → `PaginatedEnumValues` → `EnumValueRow`.

- [ ] **Step 4: Run the test + full editors suite**

Run: `pnpm --filter @rune-langium/visual-editor test -- test/editors/EnumValueRow.test.tsx test/editors/EnumForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @rune-langium/visual-editor type-check
git add packages/visual-editor/src/components/editors/EnumValueRow.tsx packages/visual-editor/src/components/editors/EnumForm.tsx packages/visual-editor/test/editors/EnumValueRow.test.tsx
git commit -m "feat(ve): per-enum-value synonym editor in EnumValueRow"
```

---

### Task 7: Remove render-core synonym guards + round-trip coverage

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (renderClassSynonym/renderSynonym/renderEnumSynonym)
- Test: `packages/codegen/test/emit/rosetta/render-annotations-synonyms.test.ts`, `packages/visual-editor/test/serialize/editable-roundtrip.test.ts`

**Interfaces:**
- The three render functions become unconditional emitters (input is guaranteed valid upstream by the z2f source picker).

- [ ] **Step 1: Update the codegen tests**

In `render-annotations-synonyms.test.ts`, the `'returns null for a source-less synonym'` case is the guard being removed — change those assertions to expect the rendered string (a synonym always has a source now). Keep the escaping/value cases.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rune-langium/codegen test -- test/emit/rosetta/render-annotations-synonyms.test.ts` → FAIL (still returns null).

- [ ] **Step 3: Remove the guards**

In `rosetta-render-core.ts`, drop the `if (!sources) return null;` / `if (!sources || values.length === 0) return null;` / `if (!sources || es.synonymValue === undefined) return null;` early-returns from `renderClassSynonym`/`renderSynonym`/`renderEnumSynonym`, emitting unconditionally (the `synonymSources` helper already yields `''` for empty, which is now an upstream-prevented degenerate case). The functions return `string` (not `string | null`); update the dispatch `case` types accordingly.

- [ ] **Step 4: Rebuild codegen dist + run codegen tests**

```bash
pnpm --filter @rune-langium/codegen run build
pnpm --filter @rune-langium/codegen test
```
Expected: PASS.

- [ ] **Step 5: Add an end-to-end round-trip**

In `editable-roundtrip.test.ts`, add a test: parse a doc declaring a `synonym source FpML` + a `type` with `[synonym FpML]`, load into the store, add a second class synonym via `addSynonym(nodeId, 'FpML')`, render via `buildSourceForNamespaces`, assert both `[synonym FpML]` survive and re-parse. Run:
`pnpm --filter @rune-langium/visual-editor test -- test/serialize/editable-roundtrip.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suites + commit**

```bash
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/codegen test
git add packages/codegen/src/emit/rosetta/rosetta-render-core.ts packages/codegen/test/emit/rosetta/render-annotations-synonyms.test.ts packages/visual-editor/test/serialize/editable-roundtrip.test.ts
git commit -m "feat(codegen): drop hand-rolled synonym guards (validity enforced at z2f)"
```

---

## Self-Review notes

- Tasks 4–7 assume Task 1's regenerated `.min(1)` schema; Tasks 2–3 are independent and may land first.
- The corpus risk (do real `.rosetta` files declare `RosettaSynonymSource`?) is checked implicitly by Task 7's round-trip (it declares one) — verify against `.resources/` during execution; if the corpus has none, the picker is correctly empty and Tasks 5/6's add is a no-op (acceptable).
- Watch the `@zod-to-form` pin lockstep on the regen (Task 1) — a `.min(1)` tightening could surface in the form suite.
