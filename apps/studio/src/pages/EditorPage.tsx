/**
 * EditorPage — Main editor layout embedding RuneTypeGraph (T088, T027).
 *
 * Provides the graph canvas + side panels (source editor, detail panel)
 * in a responsive layout. Now uses SourceEditor (CodeMirror) instead
 * of read-only SourceView.
 */

import { useRef, useCallback, useState, useMemo } from 'react';
import {
  RuneTypeGraph,
  NamespaceExplorerPanel,
  EditorFormPanel,
  astToGraph,
  BUILTIN_TYPES
} from '@rune-langium/visual-editor';
import type {
  RuneTypeGraphRef,
  VisibilityState,
  TypeGraphNode,
  TypeNodeData,
  TypeOption,
  EditorFormActions
} from '@rune-langium/visual-editor';
import type { RosettaModel } from '@rune-langium/core';
import { SourceEditor } from '../components/SourceEditor.js';
import { ConnectionStatus } from '../components/ConnectionStatus.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.js';
import { ExportMenu } from '../components/ExportMenu.js';
import { Button } from '../components/ui/button.js';
import { Separator } from '../components/ui/separator.js';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '../components/ui/resizable.js';
import { ScrollArea } from '../components/ui/scroll-area.js';
import type { WorkspaceFile } from '../services/workspace.js';
import type { LspClientService } from '../services/lsp-client.js';
import type { TransportState } from '../services/transport-provider.js';
import { useLspDiagnosticsBridge } from '../hooks/useLspDiagnosticsBridge.js';
import { useDiagnosticsStore } from '../store/diagnostics-store.js';

export interface EditorPageProps {
  models: RosettaModel[];
  files: WorkspaceFile[];
  onFilesChange?: (files: WorkspaceFile[]) => void;
  lspClient?: LspClientService;
  transportState?: TransportState;
  onReconnect?: () => void;
}

export function EditorPage({
  models,
  files,
  onFilesChange,
  lspClient,
  transportState,
  onReconnect
}: EditorPageProps) {
  const graphRef = useRef<RuneTypeGraphRef>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<TypeNodeData | null>(null);
  const [activeEditorFile, setActiveEditorFile] = useState<string | undefined>(undefined);

  // --- Namespace visibility state ---
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set<string>());
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set<string>());
  const [visibilityInitialized, setVisibilityInitialized] = useState(false);

  // Derive namespace tree from models to compute initial visibility
  // We need to parse the models through astToGraph to get nodes, or use a
  // lightweight approach: count elements across models for threshold logic.
  const totalElementCount = useMemo(() => {
    let count = 0;
    for (const model of models) {
      const m = model as { elements?: unknown[] };
      count += (m.elements ?? []).length;
    }
    return count;
  }, [models]);

  // Initialize visibility on first load / model change
  useMemo(() => {
    if (models.length === 0) return;
    const LARGE_MODEL_THRESHOLD = 100;
    const shouldCollapse = totalElementCount > LARGE_MODEL_THRESHOLD;

    if (!visibilityInitialized || totalElementCount !== expandedNamespaces.size) {
      // Extract all namespaces
      const allNamespaces = new Set<string>();
      for (const model of models) {
        const m = model as { name?: string | { segments?: string[] } };
        let ns = 'unknown';
        if (typeof m.name === 'string') {
          ns = m.name;
        } else if (m.name && typeof m.name === 'object' && 'segments' in m.name) {
          ns = (m.name as { segments: string[] }).segments.join('.');
        }
        allNamespaces.add(ns);
      }

      setExpandedNamespaces(shouldCollapse ? new Set<string>() : allNamespaces);
      setHiddenNodeIds(new Set<string>());
      setVisibilityInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, totalElementCount]);

  // All graph nodes (unpositionally) for the explorer tree
  const allGraphNodes: TypeGraphNode[] = useMemo(() => {
    if (models.length === 0) return [];
    const { nodes } = astToGraph(models as unknown[]);
    return nodes;
  }, [models]);

  const visibilityState: VisibilityState = useMemo(
    () => ({
      expandedNamespaces,
      hiddenNodeIds,
      explorerOpen
    }),
    [expandedNamespaces, hiddenNodeIds, explorerOpen]
  );

  const handleToggleNamespace = useCallback((namespace: string) => {
    setExpandedNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(namespace)) {
        next.delete(namespace);
      } else {
        next.add(namespace);
      }
      return next;
    });
  }, []);

  const handleToggleNode = useCallback((nodeId: string) => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const allNs = new Set<string>();
    for (const model of models) {
      const m = model as { name?: string | { segments?: string[] } };
      let ns = 'unknown';
      if (typeof m.name === 'string') {
        ns = m.name;
      } else if (m.name && typeof m.name === 'object' && 'segments' in m.name) {
        ns = (m.name as { segments: string[] }).segments.join('.');
      }
      allNs.add(ns);
    }
    setExpandedNamespaces(allNs);
    setHiddenNodeIds(new Set<string>());
  }, [models]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNamespaces(new Set<string>());
    setHiddenNodeIds(new Set<string>());
  }, []);

  const handleExplorerSelectNode = useCallback((nodeId: string) => {
    graphRef.current?.focusNode(nodeId);
  }, []);

  // --- Stable ref for files (prevents stale closure in handleSourceChange) ---
  const filesRef = useRef(files);
  useMemo(() => {
    filesRef.current = files;
  }, [files]);

  // --- Source → Graph: wire onContentChange ---
  const handleSourceChange = useCallback(
    (path: string, content: string) => {
      const currentFiles = filesRef.current;
      const updatedFiles = currentFiles.map((f) =>
        f.path === path ? { ...f, content, dirty: true } : f
      );
      onFilesChange?.(updatedFiles);
    },
    [onFilesChange]
  );

  // --- Graph → Source: wire onModelChanged ---
  // Build namespace → file path mapping for reverse sync
  const namespaceToFile = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < models.length; i++) {
      const model = models[i] as { name?: string | { segments?: string[] } };
      let ns = 'unknown';
      if (typeof model.name === 'string') {
        ns = model.name;
      } else if (model.name && typeof model.name === 'object' && 'segments' in model.name) {
        ns = (model.name as { segments: string[] }).segments.join('.');
      }
      if (i < files.length) {
        map.set(ns, files[i]!.path);
      }
    }
    return map;
  }, [models, files]);

  const handleModelChanged = useCallback(
    (serialized: Map<string, string>) => {
      const currentFiles = filesRef.current;
      const updatedFiles = currentFiles.map((f) => {
        // Find serialized text that maps to this file
        for (const [ns, text] of serialized) {
          if (namespaceToFile.get(ns) === f.path) {
            return { ...f, content: text, dirty: true };
          }
        }
        return f;
      });
      onFilesChange?.(updatedFiles);
    },
    [namespaceToFile, onFilesChange]
  );

  // T036: Wire LSP diagnostics to store
  useLspDiagnosticsBridge(lspClient);
  const { fileDiagnostics, totalErrors, totalWarnings } = useDiagnosticsStore();

  const handleNodeSelect = useCallback((nodeId: string | undefined, _nodeData?: unknown) => {
    setSelectedNode(nodeId ?? null);
    if (nodeId && _nodeData) {
      setSelectedNodeData(_nodeData as TypeNodeData);
      setShowEditor(true);
    } else {
      setSelectedNodeData(null);
    }
  }, []);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      graphRef.current?.focusNode(nodeId);
      // T038: Open source panel on double-click for editor navigation
      if (!showSource) setShowSource(true);
    },
    [showSource]
  );

  const getSerializedFiles = useCallback((): Map<string, string> => {
    const rosettaText = graphRef.current?.exportRosetta?.();
    if (!rosettaText || rosettaText.size === 0) return new Map();
    return rosettaText;
  }, []);

  const getGraphElement = useCallback(() => graphContainerRef.current, []);

  // --- Available types for editor form TypeSelector ---
  const availableTypes: TypeOption[] = useMemo(() => {
    const builtinOptions: TypeOption[] = BUILTIN_TYPES.map((t) => ({
      value: `builtin::${t}`,
      label: t,
      kind: 'builtin' as const
    }));
    const graphOptions: TypeOption[] = allGraphNodes.map((n) => ({
      value: n.id,
      label: n.data.name,
      kind: n.data.kind,
      namespace: n.data.namespace
    }));
    return [...builtinOptions, ...graphOptions];
  }, [allGraphNodes]);

  // --- Editor form actions wired through graphRef ---
  const editorActions: EditorFormActions = useMemo(
    () => ({
      renameType: (nodeId, newName) => graphRef.current?.renameType(nodeId, newName),
      deleteType: (nodeId) => graphRef.current?.deleteType(nodeId),
      updateDefinition: (nodeId, def) => graphRef.current?.updateDefinition(nodeId, def),
      updateComments: (nodeId, comments) => graphRef.current?.updateComments(nodeId, comments),
      addSynonym: (nodeId, synonym) => graphRef.current?.addSynonym(nodeId, synonym),
      removeSynonym: (nodeId, index) => graphRef.current?.removeSynonym(nodeId, index),
      addAttribute: (nodeId, name, type, card) =>
        graphRef.current?.addAttribute(nodeId, name, type, card),
      removeAttribute: (nodeId, name) => graphRef.current?.removeAttribute(nodeId, name),
      updateAttribute: (nodeId, oldN, newN, type, card) =>
        graphRef.current?.updateAttribute(nodeId, oldN, newN, type, card),
      reorderAttribute: (nodeId, from, to) => graphRef.current?.reorderAttribute(nodeId, from, to),
      setInheritance: (childId, parentId) => graphRef.current?.setInheritance(childId, parentId),
      addEnumValue: (nodeId, name, display) =>
        graphRef.current?.addEnumValue(nodeId, name, display),
      removeEnumValue: (nodeId, name) => graphRef.current?.removeEnumValue(nodeId, name),
      updateEnumValue: (nodeId, oldN, newN, display) =>
        graphRef.current?.updateEnumValue(nodeId, oldN, newN, display),
      reorderEnumValue: (nodeId, from, to) => graphRef.current?.reorderEnumValue(nodeId, from, to),
      setEnumParent: (nodeId, parentId) => graphRef.current?.setEnumParent(nodeId, parentId),
      addChoiceOption: (nodeId, type) => graphRef.current?.addChoiceOption(nodeId, type),
      removeChoiceOption: (nodeId, type) => graphRef.current?.removeChoiceOption(nodeId, type),
      addInputParam: (nodeId, name, type) => graphRef.current?.addInputParam(nodeId, name, type),
      removeInputParam: (nodeId, name) => graphRef.current?.removeInputParam(nodeId, name),
      updateOutputType: (nodeId, type) => graphRef.current?.updateOutputType(nodeId, type),
      updateExpression: (nodeId, expr) => graphRef.current?.updateExpression(nodeId, expr),
      validate: () => graphRef.current?.validate() ?? []
    }),
    []
  );

  const handleFitView = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  const handleRelayout = useCallback(() => {
    graphRef.current?.relayout();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="editor-page">
      {/* Toolbar */}
      <nav
        className="flex items-center justify-between px-3 py-1.5 bg-surface-raised gap-2"
        aria-label="Editor toolbar"
      >
        <div className="flex items-center gap-1.5">
          <Button
            variant={explorerOpen ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setExplorerOpen((v) => !v)}
            title="Toggle namespace explorer"
          >
            Explorer
          </Button>
          <Button variant="secondary" size="sm" onClick={handleFitView} title="Fit to view">
            Fit View
          </Button>
          <Button variant="secondary" size="sm" onClick={handleRelayout} title="Re-run auto layout">
            Re-layout
          </Button>
          <Button
            variant={showEditor ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setShowEditor(!showEditor)}
            title="Toggle editor form panel"
          >
            Editor
          </Button>
          <Button
            variant={showSource ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setShowSource(!showSource)}
            title="Toggle source view"
          >
            Source
          </Button>
          <Button
            variant={showDiagnostics ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            title="Toggle diagnostics panel"
          >
            Problems{totalErrors + totalWarnings > 0 ? ` (${totalErrors + totalWarnings})` : ''}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <ExportMenu
            getSerializedFiles={getSerializedFiles}
            getGraphElement={getGraphElement}
            hasModels={models.length > 0}
          />
        </div>
      </nav>
      <Separator />

      {/* Main content — explorer sidebar + resizable graph/source */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Namespace Explorer — fixed sidebar */}
        {explorerOpen && (
          <aside
            className="w-[280px] min-w-[200px] max-w-[400px] h-full overflow-hidden flex flex-col bg-surface-raised border-r border-border-default"
            aria-label="Namespace explorer"
          >
            <ScrollArea className="flex-1">
              <NamespaceExplorerPanel
                nodes={allGraphNodes}
                expandedNamespaces={expandedNamespaces}
                hiddenNodeIds={hiddenNodeIds}
                onToggleNamespace={handleToggleNamespace}
                onToggleNode={handleToggleNode}
                onExpandAll={handleExpandAll}
                onCollapseAll={handleCollapseAll}
                onSelectNode={handleExplorerSelectNode}
              />
            </ScrollArea>
          </aside>
        )}

        {/* Graph + Source — resizable split */}
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0">
          <ResizablePanel id="graph" defaultSize={showSource ? 65 : 100}>
            <div className="relative h-full" ref={graphContainerRef}>
              <RuneTypeGraph
                ref={graphRef}
                models={models as unknown[]}
                config={{
                  layout: { direction: 'TB' },
                  showControls: true,
                  showMinimap: true,
                  readOnly: false
                }}
                callbacks={{
                  onNodeSelect: handleNodeSelect,
                  onNodeDoubleClick: handleNodeDoubleClick,
                  onModelChanged: handleModelChanged
                }}
                visibilityState={visibilityState}
              />
            </div>
          </ResizablePanel>

          {/* Source panel (toggleable) — keep studio-editor-page__source class for CodeMirror scoping */}
          {showSource && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="source" defaultSize={35} minSize={20} maxSize={50}>
                <aside
                  className="studio-editor-page__source h-full overflow-auto"
                  aria-label="Source editor"
                >
                  <SourceEditor
                    files={files}
                    activeFile={activeEditorFile}
                    lspClient={lspClient}
                    onFileSelect={(path) => setActiveEditorFile(path)}
                    onContentChange={handleSourceChange}
                  />
                </aside>
              </ResizablePanel>
            </>
          )}

          {/* Editor form panel (toggleable) */}
          {showEditor && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="editor-form" defaultSize={30} minSize={20} maxSize={45}>
                <EditorFormPanel
                  nodeData={selectedNodeData}
                  nodeId={selectedNode}
                  availableTypes={availableTypes}
                  actions={editorActions}
                  onClose={() => setShowEditor(false)}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Diagnostics panel (toggleable) */}
      {showDiagnostics && (
        <DiagnosticsPanel
          fileDiagnostics={fileDiagnostics}
          onNavigate={(uri, _line, _char) => {
            // Normalise URI to a path for comparison (strip file:// prefix)
            const normPath = uri.startsWith('file://') ? uri.slice(7) : uri;
            const fileName = normPath.split('/').pop() ?? normPath;
            const file = files.find(
              (f) => f.path === normPath || f.name === fileName || normPath.endsWith(f.path ?? '')
            );
            if (file) {
              setActiveEditorFile(file.path ?? file.name);
              if (!showSource) setShowSource(true);
            }
          }}
        />
      )}

      {/* Status bar */}
      <Separator />
      <footer className="flex items-center gap-4 px-3 py-1 text-sm text-text-muted bg-surface-raised">
        <span>{models.length} model(s) loaded</span>
        <span>{files.filter((f) => f.dirty).length} modified</span>
        {selectedNode && <span>Selected: {selectedNode}</span>}
        {transportState && <ConnectionStatus state={transportState} onReconnect={onReconnect} />}
      </footer>
    </div>
  );
}
