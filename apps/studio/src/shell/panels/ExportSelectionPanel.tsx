// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NamespaceExplorerPanel, selectNodeRepository, useEditorStore } from '@rune-langium/visual-editor';
import type { ExportSelection } from '@rune-langium/codegen/export';
import type { ExplorerSelectionAction } from '@rune-langium/visual-editor';
import {
  exportSelectionFromExplorer,
  exportSelectionIdForNode,
  exportSelectionToExplorerSet
} from '../../services/export-explorer-selection.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface ExportSelectionPanelProps {
  selection: ExportSelection;
  requiredBy?: ReadonlyMap<string, readonly string[]>;
  onChange(selection: ExportSelection): void;
}

/** Reuses the shared type explorer to collect semantic export roots. */
export const ExportSelectionPanel = withInstrumentation(
  function ExportSelectionPanel({ selection, requiredBy, onChange }: ExportSelectionPanelProps): ReactElement {
    const nodesById = useEditorStore((state) => state.nodesById);
    const repository = selectNodeRepository(nodesById);
    const namespaces = useMemo(() => repository.namespaces(), [repository]);
    const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(() => new Set(namespaces));

    useEffect(() => {
      setExpandedNamespaces(new Set(namespaces));
    }, [namespaces]);

    const explicit = useMemo(() => exportSelectionToExplorerSet(selection, repository), [repository, selection]);
    const handleChange = useCallback(
      (next: Set<string>, action?: ExplorerSelectionAction) => {
        onChange(exportSelectionFromExplorer(next, selection, repository, action));
      },
      [onChange, repository, selection]
    );

    return (
      <section data-testid="export-selection" className="flex h-full min-h-[22rem] flex-col">
        <div className="border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Export selection</h2>
          <p className="text-xs text-muted-foreground">
            Select declarations or namespaces. Referenced declarations are included automatically when generated.
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <NamespaceExplorerPanel
            nodeRepository={repository}
            expandedNamespaces={expandedNamespaces}
            hiddenNodeIds={new Set()}
            onToggleNamespace={() => undefined}
            onExpandAll={() => setExpandedNamespaces(new Set(namespaces))}
            onCollapseAll={() => setExpandedNamespaces(new Set())}
            selection={{
              explicit,
              requiredBy: requiredBy ?? new Map(),
              getSelectionId: exportSelectionIdForNode,
              onChange: handleChange
            }}
          />
        </div>
      </section>
    );
  },
  { op: 'ExportSelectionPanel' }
);
