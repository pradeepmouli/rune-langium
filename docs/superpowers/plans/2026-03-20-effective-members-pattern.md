# Effective Members Pattern Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `isOverride` flag pattern with a derived effective-members model where the store only holds local members, effective members are computed by merging local + inherited, and override/revert is expressed by adding/removing local members that shadow inherited ones.

**Architecture:** The `useInheritedMembers` hook is refactored into `useEffectiveMembers` which returns `{ effective, isOverride(name) }`. Each entry in the effective list is tagged `source: 'local' | 'inherited'`. Local entries that shadow an inherited name get `isOverride: true`. The forms render effective lists — local rows are editable with a "Revert" action for overrides, inherited rows show an "Override" button. The store is unchanged — `addAttribute`/`removeAttribute` always operate on the local-only arrays.

**Tech Stack:** TypeScript, React 19, zustand, react-hook-form, vitest, @testing-library/react

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/visual-editor/src/hooks/useInheritedMembers.ts` | Modify | Add `useEffectiveMembers` hook + `EffectiveEntry` types. Keep existing `useInheritedMembers` and builders for backward compat. |
| `packages/visual-editor/src/components/editors/DataTypeForm.tsx` | Modify | Switch from `buildMergedAttributeList` to `useEffectiveMembers`. Render effective list with override/revert. |
| `packages/visual-editor/src/components/editors/EnumForm.tsx` | Modify | Switch from `buildMergedEnumValueList` to `useEffectiveMembers`. Same override/revert pattern. |
| `packages/visual-editor/src/components/editors/AttributeRow.tsx` | Modify | `InheritedAttributeRow`: add "Revert" button for override rows. Remove `isOverride` from local `AttributeRow`. |
| `packages/visual-editor/src/components/editors/EnumValueRow.tsx` | Modify | `InheritedEnumValueRow`: add "Revert" button for override rows. |
| `packages/visual-editor/test/hooks/useInheritedMembers.test.ts` | Modify | Add tests for `useEffectiveMembers`. |

---

## Chunk 1: Core Hook + Types

### Task 1: Define EffectiveEntry types

**Files:**
- Modify: `packages/visual-editor/src/hooks/useInheritedMembers.ts`

- [ ] **Step 1: Add EffectiveEntry type**

Add after the existing `MergedEnumValueEntry` type (around line 165):

```typescript
// ---------------------------------------------------------------------------
// Effective Members — unified view of local + inherited
// ---------------------------------------------------------------------------

export interface EffectiveEntry {
  /** Stable key for React rendering. */
  id: string;
  /** Member name. */
  name: string;
  /** Whether this entry comes from local attributes or inherited. */
  source: 'local' | 'inherited';
  /** Type name (for attributes/inputs). */
  typeName?: string;
  /** Formatted cardinality string (for attributes/inputs). */
  cardinality?: string;
  /** Display name (for enum values). */
  displayName?: string;
  /** Index in the local useFieldArray fields (only for source='local'). */
  fieldIndex?: number;
  /** Ancestor this was inherited from (only for source='inherited'). */
  ancestorName?: string;
  /** Inheritance depth (1 = immediate parent). */
  inheritanceDepth?: number;
  /** True when a local member shadows an inherited one with the same name. */
  isOverride: boolean;
  /** Raw AST member object (for inherited entries). */
  rawMember?: unknown;
}

export interface EffectiveMembersResult {
  /** The merged effective list: local entries first, then non-shadowed inherited. */
  effective: EffectiveEntry[];
  /** Set of local member names that shadow inherited names. */
  overrideNames: Set<string>;
  /** Set of all inherited member names (including shadowed ones). */
  inheritedNames: Set<string>;
}
```

- [ ] **Step 2: Commit types**

```bash
git add packages/visual-editor/src/hooks/useInheritedMembers.ts
git commit -m "feat: add EffectiveEntry types for unified inheritance model"
```

### Task 2: Implement useEffectiveMembers hook

**Files:**
- Modify: `packages/visual-editor/src/hooks/useInheritedMembers.ts`
- Test: `packages/visual-editor/test/hooks/useInheritedMembers.test.ts`

- [ ] **Step 1: Write failing tests for useEffectiveMembers**

Add to the existing test file:

```typescript
describe('useEffectiveMembers', () => {
  // Helper to render hook
  function renderEffective(nodeData: any, allNodes: any[]) {
    const { result } = renderHook(() =>
      useEffectiveMembers(nodeData as AnyGraphNode, allNodes as TypeGraphNode[])
    );
    return result.current;
  }

  it('returns empty effective list for null node', () => {
    const { effective } = renderEffective(null, []);
    expect(effective).toEqual([]);
  });

  it('returns local-only entries when no parent', () => {
    const node = makeDataNode('Foo', undefined, [makeAttrMember('x', 'string')]);
    const { effective } = renderEffective(node.data, [node]);
    expect(effective).toHaveLength(1);
    expect(effective[0].source).toBe('local');
    expect(effective[0].name).toBe('x');
    expect(effective[0].isOverride).toBe(false);
  });

  it('merges inherited members after local', () => {
    const parent = makeDataNode('Parent', undefined, [makeAttrMember('a', 'int')]);
    const child = makeDataNode('Child', 'Parent', [makeAttrMember('b', 'string')]);
    const { effective } = renderEffective(child.data, [child, parent]);
    expect(effective).toHaveLength(2);
    expect(effective[0]).toMatchObject({ name: 'b', source: 'local' });
    expect(effective[1]).toMatchObject({ name: 'a', source: 'inherited', ancestorName: 'Parent' });
  });

  it('marks local member as override when it shadows inherited', () => {
    const parent = makeDataNode('Parent', undefined, [makeAttrMember('x', 'int')]);
    const child = makeDataNode('Child', 'Parent', [makeAttrMember('x', 'string')]);
    const { effective, overrideNames } = renderEffective(child.data, [child, parent]);
    expect(effective).toHaveLength(1); // shadowed inherited is excluded
    expect(effective[0]).toMatchObject({ name: 'x', source: 'local', isOverride: true });
    expect(overrideNames.has('x')).toBe(true);
  });

  it('tracks inheritedNames including shadowed ones', () => {
    const parent = makeDataNode('Parent', undefined, [makeAttrMember('x', 'int')]);
    const child = makeDataNode('Child', 'Parent', [makeAttrMember('x', 'string')]);
    const { inheritedNames } = renderEffective(child.data, [child, parent]);
    expect(inheritedNames.has('x')).toBe(true);
  });

  it('works for enum types', () => {
    const parent = makeEnumNode('ParentEnum', undefined, [makeEnumMember('A'), makeEnumMember('B')]);
    const child = makeEnumNode('ChildEnum', 'ParentEnum', [makeEnumMember('C')]);
    const { effective } = renderEffective(child.data, [child, parent]);
    expect(effective).toHaveLength(3);
    expect(effective[0]).toMatchObject({ name: 'C', source: 'local' });
    expect(effective[1]).toMatchObject({ name: 'A', source: 'inherited' });
    expect(effective[2]).toMatchObject({ name: 'B', source: 'inherited' });
  });

  it('revert: removing local override reveals inherited member', () => {
    // Simulate: child has local 'x' overriding parent 'x'.
    // After removing local 'x', re-render should show inherited 'x'.
    const parent = makeDataNode('Parent', undefined, [makeAttrMember('x', 'int')]);

    // Before revert: child has local x
    const childWithOverride = makeDataNode('Child', 'Parent', [makeAttrMember('x', 'string')]);
    const r1 = renderEffective(childWithOverride.data, [childWithOverride, parent]);
    expect(r1.effective).toHaveLength(1);
    expect(r1.effective[0].source).toBe('local');

    // After revert: child has no local x → inherited x reappears
    const childWithoutOverride = makeDataNode('Child', 'Parent', []);
    const r2 = renderEffective(childWithoutOverride.data, [childWithoutOverride, parent]);
    expect(r2.effective).toHaveLength(1);
    expect(r2.effective[0].source).toBe('inherited');
    expect(r2.effective[0].name).toBe('x');
  });
});
```

Note: The test helpers `makeDataNode`, `makeEnumNode`, `makeAttrMember`, `makeEnumMember` should already exist in the test file. If `makeEnumNode`/`makeEnumMember` don't exist, add them following the same pattern as `makeDataNode`/`makeAttrMember`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/visual-editor run test -- useInheritedMembers`
Expected: FAIL — `useEffectiveMembers` is not exported

- [ ] **Step 3: Implement useEffectiveMembers**

Add to `useInheritedMembers.ts` after the builder functions:

```typescript
/**
 * Compute effective members by merging local + inherited.
 *
 * Local members come from the node's own member array (attributes/enumValues/inputs).
 * Inherited members come from walking the parent chain via useInheritedMembers.
 * A local member with the same name as an inherited one is an "override" —
 * the inherited version is excluded from the effective list.
 *
 * Removing a local override (via the store's removeAttribute/removeEnumValue)
 * causes the inherited member to reappear on the next render.
 */
export function useEffectiveMembers(
  nodeData: AnyGraphNode | null,
  allNodes: TypeGraphNode[],
  localFields?: LocalMemberField[]
): EffectiveMembersResult {
  const inheritedGroups = useInheritedMembers(nodeData, allNodes);

  return useMemo(() => {
    if (!nodeData) return { effective: [], overrideNames: new Set(), inheritedNames: new Set() };

    // Get local members from the node data
    const localMembers = getMembers(nodeData);
    const localNames = new Set<string>();

    // Build local entries
    const localEntries: EffectiveEntry[] = localMembers.map((member, i) => {
      const m = member as InheritedAttributeMemberShape & InheritedEnumValueMemberShape;
      const name = m.name ?? '';
      localNames.add(name);
      return {
        id: localFields?.[i]?.id ?? `local:${name}:${i}`,
        name,
        source: 'local' as const,
        typeName: getTypeRefText(m.typeCall),
        cardinality: formatCardinality(m.card),
        displayName: m.display ?? m.displayName,
        fieldIndex: i,
        isOverride: false // will be updated below
      };
    });

    // Collect all inherited names (including those that will be shadowed)
    const inheritedNames = new Set<string>();
    const inheritedEntries: EffectiveEntry[] = [];
    const seenNames = new Set(localNames);

    inheritedGroups.forEach((group, depth) => {
      for (const member of group.members) {
        const m = member as InheritedAttributeMemberShape & InheritedEnumValueMemberShape;
        const name = m.name ?? '';
        inheritedNames.add(name);

        if (!seenNames.has(name)) {
          seenNames.add(name);
          inheritedEntries.push({
            id: `inherited:${group.ancestorName}:${name}`,
            name,
            source: 'inherited' as const,
            typeName: getTypeRefText(m.typeCall),
            cardinality: formatCardinality(m.card),
            displayName: m.display ?? m.displayName,
            ancestorName: group.ancestorName,
            inheritanceDepth: depth + 1,
            isOverride: false,
            rawMember: member
          });
        }
      }
    });

    // Mark local entries that shadow inherited names as overrides
    const overrideNames = new Set<string>();
    for (const entry of localEntries) {
      if (inheritedNames.has(entry.name)) {
        entry.isOverride = true;
        overrideNames.add(entry.name);
      }
    }

    return {
      effective: [...localEntries, ...inheritedEntries],
      overrideNames,
      inheritedNames
    };
  }, [nodeData, localFields, inheritedGroups]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/visual-editor run test -- useInheritedMembers`
Expected: All new tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/hooks/useInheritedMembers.ts packages/visual-editor/test/hooks/useInheritedMembers.test.ts
git commit -m "feat: add useEffectiveMembers hook for unified local+inherited member model"
```

---

## Chunk 2: DataTypeForm + AttributeRow

### Task 3: Wire useEffectiveMembers into DataTypeForm

**Files:**
- Modify: `packages/visual-editor/src/components/editors/DataTypeForm.tsx`

- [ ] **Step 1: Replace buildMergedAttributeList with useEffectiveMembers**

In DataTypeForm, replace the `buildMergedAttributeList` import and usage:

1. Import `useEffectiveMembers` and `EffectiveEntry` instead of `buildMergedAttributeList`
2. Replace the `mergedAttributeList` useMemo with:
   ```typescript
   const { effective: effectiveAttributes, overrideNames } = useEffectiveMembers(
     data, allNodes ?? [], fields
   );
   const inheritedCount = effectiveAttributes.filter(e => e.source === 'inherited').length;
   ```
3. Update the JSX to render `effectiveAttributes` instead of `mergedAttributeList`:
   - `source === 'local'` → render `<AttributeRow>` (with `isOverride` from the entry)
   - `source === 'inherited'` → render `<InheritedAttributeRow>`
4. For override rows (local + isOverride=true): pass a "Revert" handler instead of "Remove"

- [ ] **Step 2: Update handleOverrideInherited — don't set isOverride flag**

The `handleOverrideInherited` callback should NOT set `isOverride: true`. It just adds a normal local attribute. The `useEffectiveMembers` hook will derive `isOverride` automatically because the local name matches an inherited name.

```typescript
const handleOverrideInherited = useCallback(
  (memberData: { name: string; typeName: string; cardinality: string }) => {
    append({
      name: memberData.name,
      typeName: memberData.typeName || 'string',
      cardinality: memberData.cardinality || '(1..1)',
      isOverride: false,
      displayName: memberData.name
    });
    actions.addAttribute(nodeId, memberData.name, memberData.typeName || 'string', memberData.cardinality || '(1..1)');
  },
  [nodeId, actions, append]
);
```

- [ ] **Step 3: Add handleRevertOverride callback**

```typescript
const handleRevertOverride = useCallback(
  (attrName: string) => {
    // Find the local field index by name and remove it
    const fieldIdx = fields.findIndex(f => f.name === attrName);
    if (fieldIdx >= 0) {
      remove(fieldIdx);
      actions.removeAttribute(nodeId, attrName);
    }
  },
  [nodeId, actions, fields, remove]
);
```

- [ ] **Step 4: Verify type check passes**

Run: `npx tsgo --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/components/editors/DataTypeForm.tsx
git commit -m "feat: wire useEffectiveMembers into DataTypeForm with override/revert"
```

### Task 4: Update AttributeRow for override/revert

**Files:**
- Modify: `packages/visual-editor/src/components/editors/AttributeRow.tsx`

- [ ] **Step 1: Add isOverride + onRevert props to AttributeRow**

Add to `AttributeRowProps`:
```typescript
/** True when this local attribute shadows an inherited one. */
isOverride?: boolean;
/** Called to revert this override (remove local, inherited reappears). */
onRevert?: () => void;
```

- [ ] **Step 2: Render "Revert" button when isOverride**

In the AttributeRow JSX, replace the remove button with a conditional:
```tsx
{isOverride && onRevert ? (
  <button
    data-slot="attribute-revert"
    type="button"
    onClick={onRevert}
    className="ml-auto shrink-0 text-xs px-2 py-0.5 border border-border rounded
      text-muted-foreground hover:text-foreground hover:border-input transition-colors"
    aria-label={`Revert override for ${committedName}`}
  >
    Revert
  </button>
) : (
  <button
    data-slot="attribute-remove"
    type="button"
    onClick={() => onRemove(index)}
    disabled={disabled}
    className="ml-auto shrink-0 p-0.5 text-muted-foreground hover:text-destructive
      disabled:opacity-30 disabled:cursor-not-allowed"
    aria-label={`Remove attribute ${committedName || 'unnamed'}`}
  >
    ✕
  </button>
)}
```

- [ ] **Step 3: Add visual indicator for override rows**

Add an "override" badge next to the name for override rows:
```tsx
{isOverride && (
  <span className="text-xs text-muted-foreground italic">override</span>
)}
```

- [ ] **Step 4: Run all visual-editor tests**

Run: `pnpm --filter @rune-langium/visual-editor run test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/components/editors/AttributeRow.tsx
git commit -m "feat: add override/revert UI to AttributeRow"
```

---

## Chunk 3: EnumForm + EnumValueRow

### Task 5: Wire useEffectiveMembers into EnumForm

**Files:**
- Modify: `packages/visual-editor/src/components/editors/EnumForm.tsx`

- [ ] **Step 1: Replace buildMergedEnumValueList with useEffectiveMembers**

Same pattern as DataTypeForm (Task 3):
1. Import `useEffectiveMembers`
2. Replace `buildMergedEnumValueList` usage with `useEffectiveMembers(data, allNodes, fields)`
3. Render effective list with local (editable) and inherited (read-only) rows
4. Override enum values show "Revert" button

- [ ] **Step 2: Add handleRevertEnumOverride callback**

```typescript
const handleRevertEnumOverride = useCallback(
  (valueName: string) => {
    const fieldIdx = fields.findIndex(f => f.name === valueName);
    if (fieldIdx >= 0) {
      remove(fieldIdx);
      actions.removeEnumValue(nodeId, valueName);
    }
  },
  [nodeId, actions, fields, remove]
);
```

- [ ] **Step 3: Commit**

```bash
git add packages/visual-editor/src/components/editors/EnumForm.tsx
git commit -m "feat: wire useEffectiveMembers into EnumForm with override/revert"
```

### Task 6: Update EnumValueRow for override/revert

**Files:**
- Modify: `packages/visual-editor/src/components/editors/EnumValueRow.tsx`

- [ ] **Step 1: Add isOverride + onRevert props to EnumValueRow**

Same pattern as AttributeRow (Task 4):
- Add `isOverride?: boolean` and `onRevert?: () => void` to props
- Show "Revert" button instead of "Remove" for overrides
- Add "override" badge

- [ ] **Step 2: Run all tests**

Run: `pnpm --filter @rune-langium/visual-editor run test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/visual-editor/src/components/editors/EnumValueRow.tsx
git commit -m "feat: add override/revert UI to EnumValueRow"
```

---

## Chunk 4: Cleanup + Final Verification

### Task 7: Remove isOverride from form schemas and store

**Files:**
- Modify: `packages/visual-editor/src/schemas/form-schemas.ts` (if `isOverride` is in the schema)

- [ ] **Step 1: Check if isOverride is in the Zod schema**

Search for `isOverride` in form-schemas.ts. If it's there as a required field, make it optional or remove it. The field can stay in the form values for backward compat but should default to `false` and never be explicitly set to `true` by the override handler.

- [ ] **Step 2: Run full test suite**

Run: `pnpm -r run test`
Expected: All packages pass

- [ ] **Step 3: Type check**

Run: `npx tsgo --noEmit`
Expected: Clean

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: remove explicit isOverride flag — now derived from effective members"
```

---

## Key Design Decisions

1. **Store unchanged**: `addAttribute`/`removeAttribute` always operate on the local-only `attributes` array. No new store methods needed.

2. **Override = name collision**: Derived at render time by checking if a local member's name exists in the inherited names set. No explicit flag stored.

3. **Revert = remove local**: Removing a local override causes `useEffectiveMembers` to re-merge on next render, revealing the inherited member.

4. **Override = add local**: Clicking "Override" on an inherited row adds a local member with the same name (pre-filled with inherited values). The `useEffectiveMembers` hook then marks it as an override.

5. **Backward compat**: The existing `useInheritedMembers`, `buildMergedAttributeList`, and `buildMergedEnumValueList` are kept for now. They can be removed in a follow-up cleanup once all consumers migrate to `useEffectiveMembers`.
