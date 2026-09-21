// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ReactElement } from 'react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Button } from '@rune-langium/design-system/ui/button';
import { NODE_TYPE_TO_AST_TYPE, type TypeKind, type TypeOption } from '@rune-langium/visual-editor';
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

    return (
      <section data-testid="export-selection" className="flex min-h-0 flex-col gap-3 border-b border-border p-3">
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
