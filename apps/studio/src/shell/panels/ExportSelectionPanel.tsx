// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ReactElement } from 'react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Button } from '@rune-langium/design-system/ui/button';
import {
  NODE_TYPE_TO_AST_TYPE,
  selectNodeRepository,
  useEditorStore,
  type TypeKind,
  type TypeOption
} from '@rune-langium/visual-editor';
import type { ExportDeclarationSelection, ExportSelection } from '@rune-langium/codegen/export';
import { WorkspaceTypePicker } from '../../components/WorkspaceTypePicker.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

const EXPORTABLE_KINDS: TypeKind[] = [
  'data',
  'choice',
  'enum',
  'func',
  'record',
  'typeAlias',
  'basicType',
  'annotation'
];

function declarationFromOption(option: TypeOption): ExportDeclarationSelection | undefined {
  if (!option.namespace || option.kind === 'builtin') return undefined;
  const kind = NODE_TYPE_TO_AST_TYPE[option.kind];
  return kind ? { namespace: option.namespace, name: option.label, kind } : undefined;
}

function sameDeclaration(left: ExportDeclarationSelection, right: ExportDeclarationSelection): boolean {
  return left.namespace === right.namespace && left.name === right.name && left.kind === right.kind;
}

export interface ExportSelectionPanelProps {
  selection: ExportSelection;
  onChange(selection: ExportSelection): void;
}

/** Accumulates export roots from the shared workspace type inventory. */
export const ExportSelectionPanel = withInstrumentation(
  function ExportSelectionPanel({ selection, onChange }: ExportSelectionPanelProps): ReactElement {
    const nodesById = useEditorStore((state) => state.nodesById);
    const namespaces = selectNodeRepository(nodesById).namespaces().filter(Boolean).sort();
    const addOption = (option: TypeOption | null) => {
      const declaration = option ? declarationFromOption(option) : undefined;
      if (!declaration || selection.declarations.some((current) => sameDeclaration(current, declaration))) return;
      onChange({ ...selection, declarations: [...selection.declarations, declaration] });
    };
    const removeDeclaration = (declaration: ExportDeclarationSelection) => {
      onChange({
        ...selection,
        declarations: selection.declarations.filter((current) => !sameDeclaration(current, declaration))
      });
    };
    const addNamespace = (namespace: string) => {
      if (!namespace || selection.namespaces.includes(namespace)) return;
      onChange({ ...selection, namespaces: [...selection.namespaces, namespace] });
    };
    const removeNamespace = (namespace: string) => {
      onChange({ ...selection, namespaces: selection.namespaces.filter((current) => current !== namespace) });
    };

    return (
      <section data-testid="export-selection" className="flex min-h-0 flex-col gap-3 p-3">
        <div>
          <h2 className="text-sm font-semibold">Export selection</h2>
          <p className="text-xs text-muted-foreground">
            Add types, functions, and declarations to export with their dependencies.
          </p>
        </div>
        <WorkspaceTypePicker
          label="Add declaration"
          value={null}
          onSelect={() => undefined}
          onSelectOption={addOption}
          filterKinds={EXPORTABLE_KINDS}
        />
        {namespaces.length > 0 && (
          <label className="flex flex-col gap-1 text-xs font-medium">
            Add namespace
            <select
              aria-label="Add export namespace"
              className="h-8 rounded border border-input bg-background px-2 text-sm font-normal"
              value=""
              onChange={(event) => addNamespace(event.target.value)}
            >
              <option value="">Select a namespace</option>
              {namespaces.map((namespace) => (
                <option key={namespace} value={namespace}>
                  {namespace}
                </option>
              ))}
            </select>
          </label>
        )}
        {selection.namespaces.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label="Selected export namespaces">
            {selection.namespaces.map((namespace) => (
              <Badge key={namespace} variant="secondary" className="gap-1">
                <span>{namespace}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-mr-1 h-4 px-1"
                  aria-label={`Remove ${namespace}`}
                  onClick={() => removeNamespace(namespace)}
                >
                  ×
                </Button>
              </Badge>
            ))}
          </div>
        )}
        {selection.declarations.length > 0 ? (
          <div className="flex flex-wrap gap-1" aria-label="Selected export declarations">
            {selection.declarations.map((declaration) => (
              <Badge
                key={`${declaration.namespace}\0${declaration.kind}\0${declaration.name}`}
                variant="secondary"
                className="gap-1"
              >
                <span>{declaration.name}</span>
                <span className="text-muted-foreground">{declaration.namespace}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-mr-1 h-4 px-1"
                  aria-label={`Remove ${declaration.name}`}
                  onClick={() => removeDeclaration(declaration)}
                >
                  ×
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Choose one or more declarations to generate a focused export.</p>
        )}
      </section>
    );
  },
  { op: 'ExportSelectionPanel' }
);
