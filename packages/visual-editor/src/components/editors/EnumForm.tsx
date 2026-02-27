/**
 * EnumForm — structured editor form for an Enumeration node.
 *
 * Renders via <ZodForm> from @zod-to-form/react:
 * - name and parentName are auto-generated fields (name → Input,
 *   parentName → TypeSelector via formRegistry.render)
 * - members list is hidden from ZodForm auto-generation; rendered
 *   as a ZodForm child via EnumValuesList (which accesses the shared
 *   FormProvider via useFormContext + useFieldArray)
 * - MetadataSection and AnnotationSection remain as ZodForm children
 *   with direct store-action callbacks (no form state involved)
 *
 * AutoSaveHelper watches name changes and debounces the renameType
 * store action. parentName changes commit immediately via TypeSelector
 * onSelect. Array mutations commit immediately via individual actions.
 *
 * ExternalDataSync resets the form when external data changes
 * (undo/redo, graph confirmations) while preserving in-flight edits.
 *
 * @module
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { ZodForm } from '@zod-to-form/react';
import type { ZodFormRegistry, FormMeta, FormField } from '@zod-to-form/core';
import type { ZodType } from 'zod';
import { z } from 'zod';
import {
  FieldGroup,
  FieldLegend,
  FieldSet
} from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { EnumValueRow } from './EnumValueRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { InheritedMembersSection } from './InheritedMembersSection.js';
import { AnnotationSection } from './AnnotationSection.js';
import { AutoSaveHelper } from '../forms/AutoSaveHelper.js';
import { enumFormSchema } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../types.js';
import type { InheritedGroup } from '../../hooks/useInheritedMembers.js';

// ---------------------------------------------------------------------------
// Schema — subset of enumFormSchema for ZodForm
// (metadata fields are managed directly by MetadataSection callbacks)
// ---------------------------------------------------------------------------

const enumCoreSchema = enumFormSchema.pick({ name: true, parentName: true, members: true });
type EnumCoreValues = z.infer<typeof enumCoreSchema>;

// ---------------------------------------------------------------------------
// MapFormRegistry — satisfies ZodFormRegistry with an .add() helper
// ---------------------------------------------------------------------------

class MapFormRegistry implements ZodFormRegistry {
  private map = new Map<ZodType, FormMeta>();
  add(schema: ZodType, meta: FormMeta): this {
    this.map.set(schema, meta);
    return this;
  }
  get(schema: ZodType): FormMeta | undefined {
    return this.map.get(schema);
  }
  has(schema: ZodType): boolean {
    return this.map.has(schema);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFormValues(data: TypeNodeData<'enum'>): EnumCoreValues {
  return {
    name: data.name,
    parentName: data.parentName ?? '',
    members: data.members.map((m) => ({
      name: m.name,
      typeName: m.typeName ?? '',
      cardinality: m.cardinality ?? '',
      isOverride: m.isOverride,
      displayName: m.displayName
    }))
  };
}

// ---------------------------------------------------------------------------
// ExternalDataSync — child of ZodForm; resets form when external data changes
// (undo/redo, graph confirmations) while preserving in-flight edits
// ---------------------------------------------------------------------------

function ExternalDataSync({ data }: { data: TypeNodeData<'enum'> }) {
  const form = useFormContext<EnumCoreValues>();
  const prevDataRef = useRef(data);

  useEffect(() => {
    if (prevDataRef.current !== data) {
      prevDataRef.current = data;
      form.reset(toFormValues(data), { keepDirtyValues: true });
    }
  }, [data, form]);

  return null;
}

// ---------------------------------------------------------------------------
// EnumValuesList — child of ZodForm; manages members via useFieldArray
// ---------------------------------------------------------------------------

interface EnumValuesListProps {
  nodeId: string;
  actions: EditorFormActions<'enum'>;
  committedRef: React.MutableRefObject<TypeNodeData<'enum'>>;
}

function EnumValuesList({ nodeId, actions, committedRef }: EnumValuesListProps) {
  const form = useFormContext<EnumCoreValues>();
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'members'
  });

  const handleAddValue = useCallback(() => {
    append({ name: '', typeName: '', cardinality: '', isOverride: false, displayName: '' });
    actions.addEnumValue(nodeId, '', undefined);
  }, [nodeId, actions, append]);

  const handleRemoveValue = useCallback(
    (i: number) => {
      const committed = committedRef.current.members[i];
      if (committed) {
        remove(i);
        actions.removeEnumValue(nodeId, committed.name);
      }
    },
    [nodeId, actions, remove, committedRef]
  );

  const handleReorderValue = useCallback(
    (fromIndex: number, toIndex: number) => {
      move(fromIndex, toIndex);
      actions.reorderEnumValue(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions, move]
  );

  const handleUpdateValue = useCallback(
    (_nodeId: string, oldName: string, newName: string, displayName?: string) => {
      actions.updateEnumValue(nodeId, oldName, newName, displayName);
    },
    [nodeId, actions]
  );

  return (
    <FieldSet className="gap-1">
      <FieldLegend
        variant="label"
        className="mb-0 text-muted-foreground flex items-center justify-between"
      >
        <span>Values ({fields.length})</span>
        <button
          data-slot="add-value-btn"
          type="button"
          onClick={handleAddValue}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary
            border border-border rounded px-2 py-0.5
            hover:bg-card hover:border-input transition-colors"
        >
          + Add Value
        </button>
      </FieldLegend>

      <FieldGroup className="gap-0.5">
        {fields.map((field, i) => (
          <EnumValueRow
            key={field.id}
            index={i}
            name={committedRef.current.members[i]?.name ?? ''}
            displayName={committedRef.current.members[i]?.displayName ?? ''}
            nodeId={nodeId}
            onUpdate={handleUpdateValue}
            onRemove={() => handleRemoveValue(i)}
            onReorder={handleReorderValue}
          />
        ))}

        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-2 text-center">
            No values defined. Click &quot;+ Add Value&quot; to create one.
          </p>
        )}
      </FieldGroup>
    </FieldSet>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnumFormProps {
  nodeId: string;
  data: TypeNodeData<'enum'>;
  availableTypes: TypeOption[];
  actions: EditorFormActions<'enum'>;
  inheritedGroups?: InheritedGroup[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumForm({ nodeId, data, availableTypes, actions, inheritedGroups = [] }: EnumFormProps) {
  const committedRef = useRef(data);
  committedRef.current = data;

  // ---- Parent enum options ------------------------------------------------

  const parentOptions = useMemo(
    () => availableTypes.filter((opt) => opt.kind === 'enum' && opt.label !== data.name),
    [availableTypes, data.name]
  );

  // ---- Form registry — TypeSelector for parentName, hidden for members ----

  const formRegistry = useMemo(() => {
    const reg = new MapFormRegistry();

    reg.add(enumCoreSchema.shape.parentName, {
      render: (_field: FormField, props: unknown) => {
        const p = props as { value: string; onChange: (v: string) => void };
        const parentValue =
          availableTypes.find((opt) => opt.label === p.value)?.value ?? null;
        return (
          <TypeSelector
            value={parentValue ?? ''}
            options={parentOptions}
            onSelect={(v) => {
              const label = v ? (availableTypes.find((o) => o.value === v)?.label ?? '') : '';
              p.onChange(label); // update form state with label (matches schema shape)
              actions.setEnumParent(nodeId, v); // update store immediately
            }}
            placeholder="Select parent enum..."
            allowClear
          />
        );
      }
    });

    // hidden: true → FieldRenderer skips rendering; useFieldArray in
    // EnumValuesList registers and manages this field independently.
    reg.add(enumCoreSchema.shape.members, { hidden: true });

    return reg;
  }, [parentOptions, availableTypes, nodeId, actions]);

  // ---- Auto-save: name only (other fields commit via direct callbacks) -----

  const handleCommit = useCallback(
    (values: Partial<EnumCoreValues>) => {
      if (values.name?.trim() && values.name !== committedRef.current.name) {
        actions.renameType(nodeId, values.name.trim());
      }
    },
    [nodeId, actions]
  );

  // ---- Default values -------------------------------------------------------

  const defaultValues = useMemo(() => toFormValues(data), [data]);

  // ---- Render ---------------------------------------------------------------

  return (
    <ZodForm
      schema={enumCoreSchema}
      onSubmit={() => {}}
      defaultValues={defaultValues}
      components={{ Input }}
      formRegistry={formRegistry}
      className="flex flex-col gap-4 p-4"
    >
      {/* Sync form state when external data changes (undo/redo) */}
      <ExternalDataSync data={data} />

      {/* Drive debounced renameType on name changes */}
      <AutoSaveHelper<EnumCoreValues> onCommit={handleCommit} />

      {/* Enum values — managed via useFieldArray inside FormProvider */}
      <EnumValuesList nodeId={nodeId} actions={actions} committedRef={committedRef} />

      {/* Inherited members from ancestor enums */}
      <InheritedMembersSection groups={inheritedGroups} />

      {/* Annotations */}
      <AnnotationSection
        annotations={data.annotations ?? []}
        onAdd={(name) => actions.addAnnotation(nodeId, name)}
        onRemove={(i) => actions.removeAnnotation(nodeId, i)}
      />

      {/* Metadata — direct store callbacks, not wired through form state */}
      <MetadataSection
        onDefinitionCommit={(def) => actions.updateDefinition(nodeId, def)}
        onCommentsCommit={(comments) => actions.updateComments(nodeId, comments)}
        onSynonymAdd={(s) => actions.addSynonym(nodeId, s)}
        onSynonymRemove={(i) => actions.removeSynonym(nodeId, i)}
      />
    </ZodForm>
  );
}

export { EnumForm };
