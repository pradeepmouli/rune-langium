# TypeScript Interface Contracts

**Feature**: 006-adopt-zod-to-form
**Date**: 2026-02-28

This feature has no REST or GraphQL API — all contracts are TypeScript type interfaces and module shape constraints.

---

## Contract 1: `./components` Subpath Module Shape

```typescript
// @rune-langium/visual-editor/components
// Resolved via package.json exports["./components"]

export declare function TypeSelector(props: TypeSelectorProps): JSX.Element;
export declare function CardinalityPicker(props: CardinalityPickerProps): JSX.Element;

// This module shape is referenced as:
type VisualModule = typeof import('@rune-langium/visual-editor/components');
// Used in component-config.ts to constrain: component: keyof VisualModule
```

**Constraint**: Any value in `fieldTypes[*].component` or `fields[*].component` in `component-config.ts` MUST be a key of `VisualModule`. Invalid names are TypeScript compile errors (FR-008).

---

## Contract 2: `ZodToFormComponentConfig<T>` Shape

```typescript
// From @zod-to-form/cli
type ZodToFormComponentConfig<T> = {
  components: string;           // module path for widget barrel
  fieldTypes: {
    [fieldTypeName: string]: {
      component: keyof T;       // constrained to VisualModule keys
      props?: Record<string, unknown>;
    };
  };
  fields?: {
    [fieldPath: string]: {      // format: "{schemaName}.{fieldName}"
      fieldType: string;        // must be a key of fieldTypes
      props?: Record<string, unknown>;
    };
  };
};

// Usage in component-config.ts:
export default { ... } satisfies ZodToFormComponentConfig<VisualModule>;
```

---

## Contract 3: Generated Schema Shape (per grammar type)

```typescript
// Static base schema (always emitted)
export const RosettaEnumerationSchema: z.ZodObject<{
  $type: z.ZodLiteral<'RosettaEnumeration'>;
  name: z.ZodString;
  superEnum: z.ZodOptional<z.ZodString>;
  enumValues: z.ZodArray<EnumValueSchema>;
}>;

// Cross-ref validation refs interface (emitted with --cross-ref-validation)
export interface RosettaEnumerationSchemaRefs {
  RosettaEnumeration?: string[];  // valid superEnum target names
}

// Factory (emitted with --cross-ref-validation)
export function createRosettaEnumerationSchema(
  refs?: RosettaEnumerationSchemaRefs
): z.ZodObject<...>;  // extends base with .refine() on superEnum
```

**Field name note**: Actual field names (`superEnum`, `superType`, `typeCall`, etc.) are determined by the Rune grammar. Confirm after first `pnpm generate:schemas` run and adjust `component-config.ts` accordingly.

---

## Contract 4: `EnumFormProps` (Unchanged Public Interface)

```typescript
// packages/visual-editor/src/components/editors/EnumForm.tsx
// Public interface is UNCHANGED by this migration

export interface EnumFormProps {
  nodeId: string;
  data: TypeNodeData<'enum'>;
  availableTypes: TypeOption[];
  actions: EditorFormActions<'enum'>;
  inheritedGroups?: InheritedGroup[];
}
```

**Invariant**: No consumer of `EnumForm` requires any change as a result of the internal migration to `ZodForm`.

---

## Contract 5: `MapFormRegistry` Interface

```typescript
// Implements ZodFormRegistry from @zod-to-form/core
import type { ZodFormRegistry, FormMeta } from '@zod-to-form/core';
import type { ZodType } from 'zod';

export class MapFormRegistry implements ZodFormRegistry {
  add(schema: ZodType, meta: FormMeta): this;
  get(schema: ZodType): FormMeta | undefined;
  has(schema: ZodType): boolean;
}
```

---

## Contract 6: `ExternalDataSync` Component Props

```typescript
// Generic over form values shape
interface ExternalDataSyncProps<T extends FieldValues> {
  /** Upstream data object — reference-equality tracked for change detection */
  data: unknown;
  /** Maps upstream data to form default values */
  toValues: () => T;
}

// Renders null; must be a child of ZodForm (which provides FormProvider)
export function ExternalDataSync<T extends FieldValues>(
  props: ExternalDataSyncProps<T>
): null;
```

---

## Contract 7: `package.json` Exports Map (Updated)

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./components": {
      "types": "./dist/components.d.ts",
      "default": "./dist/components.js"
    },
    "./styles.css": "./dist/styles.css"
  }
}
```

**Backward compatibility**: Existing `.` and `./styles.css` entries are unchanged (FR-017, CA-005).

---

## Contract 8: CI Job Interface

```yaml
# .github/workflows/ci.yml — new job: check-generated
check-generated:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @rune-langium/visual-editor generate:schemas
    - run: pnpm --filter @rune-langium/visual-editor scaffold:forms
    - run: git diff --exit-code
      # Fails if any generated file differs from committed version (FR-018, SC-008)
```
