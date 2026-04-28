// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rune-langium/design-system/ui/tabs';
import { NamespaceExplorerPanel } from '@rune-langium/visual-editor';
import type { TypeGraphNode } from '@rune-langium/visual-editor';
import { FileTreePanel } from '../shell/panels/FileTreePanel.js';
import type { WorkspaceFile } from '../services/workspace.js';

export interface ExplorerPanelProps {
  files: WorkspaceFile[];
  activeFile?: string;
  nodes: TypeGraphNode[];
  expandedNamespaces: Set<string>;
  hiddenNodeIds: Set<string>;
  selectedNodeId?: string | null;
  onOpenFile: (path: string) => void;
  onToggleNamespace: (namespace: string) => void;
  onToggleNode: (nodeId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onSelectNode?: (nodeId: string) => void;
}

export function ExplorerPanel({
  files,
  activeFile,
  nodes,
  expandedNamespaces,
  hiddenNodeIds,
  selectedNodeId,
  onOpenFile,
  onToggleNamespace,
  onToggleNode,
  onExpandAll,
  onCollapseAll,
  onSelectNode
}: ExplorerPanelProps): ReactElement {
  const [mode, setMode] = useState<'namespaces' | 'files'>('namespaces');

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as 'namespaces' | 'files')}
      className="flex h-full min-h-0 flex-col bg-card"
      data-testid="explorer-panel"
    >
      <div className="border-b px-3 py-2">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="namespaces" data-testid="explorer-tab-namespaces">
            Namespaces
          </TabsTrigger>
          <TabsTrigger value="files" data-testid="explorer-tab-files">
            Files
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="namespaces" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <NamespaceExplorerPanel
          nodes={nodes}
          expandedNamespaces={expandedNamespaces}
          hiddenNodeIds={hiddenNodeIds}
          selectedNodeId={selectedNodeId}
          onToggleNamespace={onToggleNamespace}
          onToggleNode={onToggleNode}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
          onSelectNode={onSelectNode}
          className="h-full"
        />
      </TabsContent>
      <TabsContent value="files" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <FileTreePanel files={files} activePath={activeFile} onOpen={onOpenFile} />
      </TabsContent>
    </Tabs>
  );
}
