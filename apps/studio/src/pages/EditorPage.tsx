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
  buildNamespaceTree,
  astToGraph
} from '@rune-langium/visual-editor';
import type { RuneTypeGraphRef, VisibilityState, TypeGraphNode } from '@rune-langium/visual-editor';
import type { RosettaModel } from '@rune-langium/core';
import { SourceEditor } from '../components/SourceEditor.js';
import { ConnectionStatus } from '../components/ConnectionStatus.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.js';
import { ExportMenu } from '../components/ExportMenu.js';
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
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
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

  // T036: Wire LSP diagnostics to store
  useLspDiagnosticsBridge(lspClient);
  const { fileDiagnostics, totalErrors, totalWarnings } = useDiagnosticsStore();

  const handleNodeSelect = useCallback((nodeId: string | undefined, _nodeData?: unknown) => {
    setSelectedNode(nodeId ?? null);
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
    if (!rosettaText || typeof rosettaText !== 'string') return new Map();

    // If we have workspace files, map back to file names
    if (files.length > 0) {
      const result = new Map<string, string>();
      result.set(files[0]!.name, rosettaText);
      return result;
    }

    return new Map<string, string>([['model.rosetta', rosettaText]]);
  }, [files]);

  const getGraphElement = useCallback(() => graphContainerRef.current, []);

  const handleFitView = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  const handleRelayout = useCallback(() => {
    graphRef.current?.relayout();
  }, []);

  return (
    <div className="studio-editor-page" data-testid="editor-page">
      {/* Toolbar */}
      <div className="studio-editor-page__toolbar">
        <div className="studio-editor-page__toolbar-left">
          <button
            className={`studio-toolbar-button ${explorerOpen ? 'studio-toolbar-button--active' : ''}`}
            onClick={() => setExplorerOpen((v) => !v)}
            title="Toggle namespace explorer"
          >
            Explorer
          </button>
          <button className="studio-toolbar-button" onClick={handleFitView} title="Fit to view">
            Fit View
          </button>
          <button
            className="studio-toolbar-button"
            onClick={handleRelayout}
            title="Re-run auto layout"
          >
            Re-layout
          </button>
          <button
            className={`studio-toolbar-button ${showSource ? 'studio-toolbar-button--active' : ''}`}
            onClick={() => setShowSource(!showSource)}
            title="Toggle source view"
          >
            Source
          </button>
          <button
            className={`studio-toolbar-button ${showDiagnostics ? 'studio-toolbar-button--active' : ''}`}
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            title="Toggle diagnostics panel"
          >
            Problems{totalErrors + totalWarnings > 0 ? ` (${totalErrors + totalWarnings})` : ''}
          </button>
        </div>
        <div className="studio-editor-page__toolbar-right">
          <ExportMenu
            getSerializedFiles={getSerializedFiles}
            getGraphElement={getGraphElement}
            hasModels={models.length > 0}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="studio-editor-page__content">
        {/* Namespace Explorer */}
        {explorerOpen && (
          <div className="studio-editor-page__explorer">
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
          </div>
        )}

        {/* Graph area */}
        <div
          className={`studio-editor-page__graph ${showSource ? 'studio-editor-page__graph--with-source' : ''}`}
          ref={graphContainerRef}
        >
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
              onNodeDoubleClick: handleNodeDoubleClick
            }}
            visibilityState={visibilityState}
          />
        </div>

        {/* Source panel (toggleable) */}
        {showSource && (
          <div className="studio-editor-page__source">
            <SourceEditor
              files={files}
              activeFile={activeEditorFile}
              lspClient={lspClient}
              onFileSelect={(path) => setActiveEditorFile(path)}
            />
          </div>
        )}
      </div>

      {/* Diagnostics panel (toggleable) */}
      {showDiagnostics && (
        <div className="studio-editor-page__diagnostics">
          <DiagnosticsPanel
            fileDiagnostics={fileDiagnostics}
            onNavigate={(uri, line, _char) => {
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
        </div>
      )}

      {/* Status bar */}
      <div className="studio-editor-page__status">
        <span>{models.length} model(s) loaded</span>
        <span>{files.filter((f) => f.dirty).length} modified</span>
        {selectedNode && <span>Selected: {selectedNode}</span>}
        {transportState && <ConnectionStatus state={transportState} onReconnect={onReconnect} />}
      </div>
    </div>
  );
}
