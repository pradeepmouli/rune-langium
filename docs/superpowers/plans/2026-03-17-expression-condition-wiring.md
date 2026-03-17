# Expression & Condition Wiring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up condition CRUD and function expression editing so they actually persist changes to the store.

**Architecture:** Add 4 condition store actions (`addCondition`, `removeCondition`, `updateCondition`, `reorderCondition`), fix `updateExpression` to target `operations[0].expression` for functions, and wire the `ConditionSection` callbacks in all 3 forms (`FunctionForm`, `DataTypeForm`, `TypeAliasForm`). Also add condition actions to the `FuncFormActions`/`DataFormActions`/`CommonFormActions` type interfaces and wire them through `EditorPage`.

**Tech Stack:** TypeScript, zustand, React, vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/visual-editor/src/store/editor-store.ts` | Modify | Add condition CRUD actions; fix `updateExpression` for function bodies |
| `packages/visual-editor/src/types.ts` | Modify | Add condition action signatures to `CommonFormActions` |
| `packages/visual-editor/src/components/editors/FunctionForm.tsx` | Modify | Wire `ConditionSection` callbacks; fix expression mapping |
| `packages/visual-editor/src/components/editors/DataTypeForm.tsx` | Modify | Wire `ConditionSection` callbacks |
| `packages/visual-editor/src/components/editors/TypeAliasForm.tsx` | Modify | Wire `ConditionSection` callbacks |
| `apps/studio/src/pages/EditorPage.tsx` | Modify | Wire condition actions from store to `editorActions` |
| `packages/visual-editor/test/store/editor-store-actions.test.ts` | Modify | Add tests for new store actions |

---

## Chunk 1: Store actions + types + tests

### Task 1: Add condition action signatures to types and store interface

**Files:**
- Modify: `packages/visual-editor/src/types.ts:240-260` (CommonFormActions)
- Modify: `packages/visual-editor/src/store/editor-store.ts:66-141` (EditorActions interface)

- [ ] **Step 1: Add condition actions to `CommonFormActions` in `types.ts`**

In `packages/visual-editor/src/types.ts`, add to `CommonFormActions` (after `setInheritance`):

```typescript
  // --- Condition operations ---
  addCondition(nodeId: string, condition: {
    name?: string;
    definition?: string;
    expressionText: string;
    isPostCondition?: boolean;
  }): void;
  removeCondition(nodeId: string, index: number): void;
  updateCondition(nodeId: string, index: number, updates: {
    name?: string;
    definition?: string;
    expressionText?: string;
  }): void;
  reorderCondition(nodeId: string, fromIndex: number, toIndex: number): void;
```

- [ ] **Step 2: Add condition actions to `EditorActions` in `editor-store.ts`**

In `packages/visual-editor/src/store/editor-store.ts`, add to `EditorActions` interface (after `updateExpression` line 126):

```typescript
  // --- Condition operations ---
  addCondition(nodeId: string, condition: {
    name?: string;
    definition?: string;
    expressionText: string;
    isPostCondition?: boolean;
  }): void;
  removeCondition(nodeId: string, index: number): void;
  updateCondition(nodeId: string, index: number, updates: {
    name?: string;
    definition?: string;
    expressionText?: string;
  }): void;
  reorderCondition(nodeId: string, fromIndex: number, toIndex: number): void;
```

- [ ] **Step 3: Run type-check to verify signatures compile**

Run: `cd packages/visual-editor && npx tsgo --noEmit`
Expected: Errors about missing implementations (expected at this stage)

---

### Task 2: Implement condition store actions

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts:1015` (after `updateExpression`)

- [ ] **Step 1: Implement `addCondition`**

Add after the `updateExpression` action (line ~1015), before the Metadata operations comment:

```typescript
        addCondition(
          nodeId: string,
          condition: {
            name?: string;
            definition?: string;
            expressionText: string;
            isPostCondition?: boolean;
          }
        ) {
          const newCondition = {
            $type: 'Condition',
            name: condition.name,
            definition: condition.definition,
            expression: { $cstText: condition.expressionText },
            postCondition: condition.isPostCondition ?? false
          };

          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (condition.isPostCondition) {
                const postConditions = [...((d as any).postConditions ?? []), newCondition];
                return { ...n, data: { ...d, postConditions } };
              }
              const conditions = [...((d as any).conditions ?? []), newCondition];
              return { ...n, data: { ...d, conditions } };
            })
          }));
        },

        removeCondition(nodeId: string, index: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              // Merge conditions + postConditions, remove by overall index,
              // then split back
              const allConditions = [
                ...((d as any).conditions ?? []),
                ...((d as any).postConditions ?? [])
              ];
              allConditions.splice(index, 1);
              const conditions = allConditions.filter((c: any) => !c.postCondition);
              const postConditions = allConditions.filter((c: any) => c.postCondition);
              return { ...n, data: { ...d, conditions, postConditions } };
            })
          }));
        },

        updateCondition(
          nodeId: string,
          index: number,
          updates: { name?: string; definition?: string; expressionText?: string }
        ) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              // Merge all conditions, update by index, split back
              const allConditions = [
                ...((d as any).conditions ?? []),
                ...((d as any).postConditions ?? [])
              ];
              if (index < 0 || index >= allConditions.length) return n;
              const cond = allConditions[index];
              allConditions[index] = {
                ...cond,
                ...(updates.name !== undefined ? { name: updates.name } : {}),
                ...(updates.definition !== undefined ? { definition: updates.definition } : {}),
                ...(updates.expressionText !== undefined
                  ? { expression: { ...cond.expression, $cstText: updates.expressionText } }
                  : {})
              };
              const conditions = allConditions.filter((c: any) => !c.postCondition);
              const postConditions = allConditions.filter((c: any) => c.postCondition);
              return { ...n, data: { ...d, conditions, postConditions } };
            })
          }));
        },

        reorderCondition(nodeId: string, fromIndex: number, toIndex: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const conditions = [...((d as any).conditions ?? [])];
              const [moved] = conditions.splice(fromIndex, 1);
              if (moved) {
                conditions.splice(toIndex, 0, moved);
              }
              return { ...n, data: { ...d, conditions } };
            })
          }));
        },
```

- [ ] **Step 2: Run type-check**

Run: `cd packages/visual-editor && npx tsgo --noEmit`
Expected: PASS (0 errors)

---

### Task 3: Fix `updateExpression` for function bodies

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts:990-1015`

The current `updateExpression` wrongly updates `conditions[0].expression.$cstText`. For functions, it should update `operations[0].expression.$cstText` (the function body). For Data/TypeAlias, expressions don't have a separate body — conditions ARE the expressions, so keep the current behavior only for those types but also store `expressionText` as a top-level display field.

- [ ] **Step 1: Replace `updateExpression` implementation**

Replace lines 990-1015 with:

```typescript
        updateExpression(nodeId: string, expressionText: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaFunction') {
                // Function body is in operations[0].expression
                const operations = [...((d as any).operations ?? [])];
                if (operations.length === 0) {
                  // Create a new "set" operation
                  operations.push({
                    $type: 'Operation',
                    operator: 'set',
                    expression: { $cstText: expressionText }
                  });
                } else {
                  operations[0] = {
                    ...operations[0],
                    expression: {
                      ...(operations[0].expression ?? {}),
                      $cstText: expressionText
                    }
                  };
                }
                return {
                  ...n,
                  data: { ...d, operations, expressionText }
                };
              }
              // For Data/TypeAlias, store as a display field
              return { ...n, data: { ...d, expressionText } };
            })
          }));
        },
```

- [ ] **Step 2: Run type-check**

Run: `cd packages/visual-editor && npx tsgo --noEmit`
Expected: PASS

---

### Task 4: Write tests for new store actions

**Files:**
- Modify: `packages/visual-editor/test/store/editor-store-actions.test.ts`

- [ ] **Step 1: Add test fixtures and tests**

Append to the end of the existing test file (before the final closing `});`):

```typescript
  // -----------------------------------------------------------------------
  // Condition operations
  // -----------------------------------------------------------------------

  describe('addCondition', () => {
    it('adds a condition to a Data type', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();

      store.getState().addCondition(tradeNode!.id, {
        name: 'ValidDate',
        expressionText: 'tradeDate exists'
      });

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions.length).toBe(1);
      expect(conditions[0].name).toBe('ValidDate');
      expect(conditions[0].expression.$cstText).toBe('tradeDate exists');
    });
  });

  describe('removeCondition', () => {
    it('removes a condition by index', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();

      // Add two conditions
      store.getState().addCondition(tradeNode!.id, {
        name: 'C1',
        expressionText: 'expr1'
      });
      store.getState().addCondition(tradeNode!.id, {
        name: 'C2',
        expressionText: 'expr2'
      });

      // Remove first
      store.getState().removeCondition(tradeNode!.id, 0);

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions.length).toBe(1);
      expect(conditions[0].name).toBe('C2');
    });
  });

  describe('updateCondition', () => {
    it('updates condition name and expression', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();

      store.getState().addCondition(tradeNode!.id, {
        name: 'C1',
        expressionText: 'old expression'
      });

      store.getState().updateCondition(tradeNode!.id, 0, {
        name: 'C1_Updated',
        expressionText: 'new expression'
      });

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions[0].name).toBe('C1_Updated');
      expect(conditions[0].expression.$cstText).toBe('new expression');
    });
  });

  describe('reorderCondition', () => {
    it('reorders conditions by index', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();

      store.getState().addCondition(tradeNode!.id, { name: 'First', expressionText: 'e1' });
      store.getState().addCondition(tradeNode!.id, { name: 'Second', expressionText: 'e2' });
      store.getState().addCondition(tradeNode!.id, { name: 'Third', expressionText: 'e3' });

      store.getState().reorderCondition(tradeNode!.id, 0, 2);

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions[0].name).toBe('Second');
      expect(conditions[1].name).toBe('Third');
      expect(conditions[2].name).toBe('First');
    });
  });

  // -----------------------------------------------------------------------
  // updateExpression (function body)
  // -----------------------------------------------------------------------

  describe('updateExpression', () => {
    it('updates the function body expression via operations', async () => {
      // Load a model with a function
      const funcStore = createEditorStore();
      const funcResult = await parse(`
        namespace test.func
        version "test"

        func MyFunc:
          inputs:
            x int (1..1)
          output:
            result int (1..1)
          set result:
            x + 1
      `);
      funcStore.getState().loadModels(funcResult.value);

      const funcNode = funcStore.getState().nodes.find((n) => n.data.name === 'MyFunc');
      expect(funcNode).toBeDefined();

      funcStore.getState().updateExpression(funcNode!.id, 'x * 2');

      const updated = funcStore.getState().nodes.find((n) => n.id === funcNode!.id);
      const ops = (updated!.data as any).operations ?? [];
      expect(ops.length).toBeGreaterThan(0);
      expect(ops[0].expression.$cstText).toBe('x * 2');
      expect((updated!.data as any).expressionText).toBe('x * 2');
    });
  });
```

- [ ] **Step 2: Run tests**

Run: `cd packages/visual-editor && npx vitest run test/store/editor-store-actions.test.ts`
Expected: All new tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/visual-editor/src/store/editor-store.ts \
       packages/visual-editor/src/types.ts \
       packages/visual-editor/test/store/editor-store-actions.test.ts
git commit -m "feat: add condition CRUD store actions and fix updateExpression for function bodies"
```

---

## Chunk 2: Wire forms

### Task 5: Wire `FunctionForm` condition callbacks

**Files:**
- Modify: `packages/visual-editor/src/components/editors/FunctionForm.tsx:264-310`

- [ ] **Step 1: Add condition callback handlers**

Add after the annotation callbacks block (after `handleRemoveAnnotation`, around line 308), before the `// ---- Render` comment:

```typescript
  // ---- Condition callbacks -------------------------------------------------

  const handleAddCondition = useCallback(
    (condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }) => {
      actions.addCondition(nodeId, condition);
    },
    [nodeId, actions]
  );

  const handleRemoveCondition = useCallback(
    (index: number) => {
      actions.removeCondition(nodeId, index);
    },
    [nodeId, actions]
  );

  const handleUpdateCondition = useCallback(
    (index: number, updates: Partial<ConditionDisplayInfo>) => {
      actions.updateCondition(nodeId, index, updates);
    },
    [nodeId, actions]
  );

  const handleReorderCondition = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderCondition(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions]
  );
```

- [ ] **Step 2: Add `ConditionDisplayInfo` import**

Add to the imports from `../../adapters/model-helpers.js`:

```typescript
import {
  formatCardinality,
  getTypeRefText,
  classExprSynonymsToStrings,
  type ConditionDisplayInfo
} from '../../adapters/model-helpers.js';
```

- [ ] **Step 3: Wire the callbacks into `ConditionSection`**

Replace the existing `ConditionSection` usage (lines 473-480):

```tsx
        <ConditionSection
          label="Conditions"
          conditions={d.conditions}
          postConditions={d.postConditions}
          readOnly={d.isReadOnly}
          showPostConditionToggle={true}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
          onUpdate={handleUpdateCondition}
          onReorder={handleReorderCondition}
          renderExpressionEditor={renderExpressionEditor}
        />
```

Note: `showPostConditionToggle` changed to `true` (functions support post-conditions).

- [ ] **Step 4: Run type-check**

Run: `cd packages/visual-editor && npx tsgo --noEmit`
Expected: PASS

---

### Task 6: Wire `DataTypeForm` condition callbacks

**Files:**
- Modify: `packages/visual-editor/src/components/editors/DataTypeForm.tsx`

- [ ] **Step 1: Add condition callback handlers**

Add condition handlers to the component body (same pattern as FunctionForm):

```typescript
  // ---- Condition callbacks -------------------------------------------------

  const handleAddCondition = useCallback(
    (condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }) => {
      actions.addCondition(nodeId, condition);
    },
    [nodeId, actions]
  );

  const handleRemoveCondition = useCallback(
    (index: number) => {
      actions.removeCondition(nodeId, index);
    },
    [nodeId, actions]
  );

  const handleUpdateCondition = useCallback(
    (index: number, updates: Partial<ConditionDisplayInfo>) => {
      actions.updateCondition(nodeId, index, updates);
    },
    [nodeId, actions]
  );

  const handleReorderCondition = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderCondition(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions]
  );
```

- [ ] **Step 2: Add `ConditionDisplayInfo` import from model-helpers**

- [ ] **Step 3: Wire callbacks into `ConditionSection`**

Replace the `ConditionSection` render (line 324):

```tsx
        <ConditionSection
          label="Conditions"
          conditions={d.conditions}
          readOnly={d.isReadOnly}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
          onUpdate={handleUpdateCondition}
          onReorder={handleReorderCondition}
        />
```

- [ ] **Step 4: Run type-check**

Run: `cd packages/visual-editor && npx tsgo --noEmit`
Expected: PASS

---

### Task 7: Wire `TypeAliasForm` condition callbacks

**Files:**
- Modify: `packages/visual-editor/src/components/editors/TypeAliasForm.tsx`

Same pattern as DataTypeForm.

- [ ] **Step 1: Add condition handlers + import**

- [ ] **Step 2: Wire callbacks into `ConditionSection` (line 171)**

```tsx
        <ConditionSection
          label="Conditions"
          conditions={d.conditions}
          readOnly={d.isReadOnly}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
          onUpdate={handleUpdateCondition}
          onReorder={handleReorderCondition}
        />
```

- [ ] **Step 3: Run type-check**

Run: `cd packages/visual-editor && npx tsgo --noEmit`
Expected: PASS

---

### Task 8: Wire `EditorPage` to pass condition actions

**Files:**
- Modify: `apps/studio/src/pages/EditorPage.tsx`

The `editorActions` object is built in EditorPage and passed to forms. It needs the 4 new condition actions.

- [ ] **Step 1: Add condition actions to `editorActions`**

Find where `editorActions` is constructed (it maps store methods to action callbacks). Add:

```typescript
addCondition: (nodeId, condition) => store.addCondition(nodeId, condition),
removeCondition: (nodeId, index) => store.removeCondition(nodeId, index),
updateCondition: (nodeId, index, updates) => store.updateCondition(nodeId, index, updates),
reorderCondition: (nodeId, fromIndex, toIndex) => store.reorderCondition(nodeId, fromIndex, toIndex),
```

(Where `store` is `useEditorStore.getState()` or the destructured store reference used for the other actions.)

- [ ] **Step 2: Run type-check for Studio**

Run: `cd apps/studio && npx tsgo --noEmit`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd packages/visual-editor && npx vitest run`
Expected: All tests PASS (including new condition tests)

- [ ] **Step 4: Commit**

```bash
git add packages/visual-editor/src/components/editors/FunctionForm.tsx \
       packages/visual-editor/src/components/editors/DataTypeForm.tsx \
       packages/visual-editor/src/components/editors/TypeAliasForm.tsx \
       apps/studio/src/pages/EditorPage.tsx
git commit -m "feat: wire condition CRUD and expression editing into all editor forms"
```
