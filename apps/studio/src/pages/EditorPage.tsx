// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * EditorPage — Main editor layout embedding RuneTypeGraph (T088, T027).
 *
 * Uses the zustand editor store as source of truth for graph state.
 * Forms call store mutations directly — no roundtrip through the graph.
 */

import { useRef, useCallback, useState, useMemo, useEffect, type KeyboardEvent } from 'react';
import type { PanelImperativeHandle } from '@rune-langium/design-system/ui/resizable';
import {
  RuneTypeGraph,
  NamespaceExplorerPanel,
  EditorFormPanel,
  ExpressionBuilder,
  BUILTIN_TYPES,
  AST_TYPE_TO_NODE_TYPE,
  useEditorStore
} from '@rune-langium/visual-editor';
import type {
  RuneTypeGraphRef,
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  ExpressionEditorSlotProps,
  FunctionScope
} from '@rune-langium/visual-editor';
import type { RosettaModel } from '@rune-langium/core';
import { SourceEditor } from '../components/SourceEditor.js';
import type { SourceEditorRef } from '../components/SourceEditor.js';
import { ConnectionStatus } from '../components/ConnectionStatus.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.js';
import { ExportMenu } from '../components/ExportMenu.js';
import { ExportDialog } from '../components/ExportDialog.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Separator } from '@rune-langium/design-system/ui/separator';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@rune-langium/design-system/ui/resizable';
import { ScrollArea } from '@rune-langium/design-system/ui/scroll-area';
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
  const sourceEditorRef = useRef<SourceEditorRef>(null);
  const sourcePanelRef = useRef<PanelImperativeHandle>(null);
  const editorPanelRef = useRef<PanelImperativeHandle>(null);
  const [showSource, setShowSource] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeEditorFile, setActiveEditorFile] = useState<string | undefined>(undefined);
  /** Tracks file paths explicitly opened in the source editor (by node navigation). */
  const [openedFilePaths, setOpenedFilePaths] = useState<Set<string>>(new Set<string>());
  /** Pending reveal to fire after source files update. */
  const pendingRevealRef = useRef<{ line: number; filePath: string } | null>(null);
  /** Navigation history stack for back-navigation (Task 8). */
  const navigationHistoryRef = useRef<string[]>([]);
  /** Pending displayFile resolve callbacks for cross-file go-to-definition. */
  const pendingDisplayFileRef = useRef<
    Map<string, (view: import('@codemirror/view').EditorView | null) => void>
  >(new Map());

  // --- Store subscriptions ---
  const storeNodes = useEditorStore((s) => s.nodes);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const visibility = useEditorStore((s) => s.visibility);
  const explorerOpen = visibility.explorerOpen;
  const expandedNamespaces = visibility.expandedNamespaces;
  const hiddenNodeIds = visibility.hiddenNodeIds;

  // Store actions (stable references)
  const storeSelectNode = useEditorStore((s) => s.selectNode);
  const storeToggleNamespace = useEditorStore((s) => s.toggleNamespace);
  const storeToggleNodeVisibility = useEditorStore((s) => s.toggleNodeVisibility);
  const storeExpandAllNamespaces = useEditorStore((s) => s.expandAllNamespaces);
  const storeCollapseAllNamespaces = useEditorStore((s) => s.collapseAllNamespaces);
  const storeToggleExplorer = useEditorStore((s) => s.toggleExplorer);

  // --- Load models into store when prop changes ---
  useEffect(() => {
    if (models.length > 0) {
      useEditorStore.getState().loadModels(models as unknown[]);
    }
  }, [models]);

  // Derive selectedNodeData from store
  const selectedNodeData: AnyGraphNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = storeNodes.find((n) => n.id === selectedNodeId);
    return (node?.data as unknown as AnyGraphNode) ?? null;
  }, [selectedNodeId, storeNodes]);

  // React to selection changes for panel expansion + source navigation
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedNodeId;

    if (!selectedNodeId || !selectedNodeData) return;

    expandEditor();

    // Resolve the node's source file and open it in the source tabs
    const filePath = resolveNodeFile(selectedNodeData);
    if (filePath) openFileInSource(filePath);

    // Navigate source editor to the AST node's definition line
    // $cstNode lives directly on the node data (spread from the AST element)
    const nodeData = selectedNodeData as unknown as Record<string, unknown>;
    const cstNode = nodeData['$cstNode'] as
      | { range?: { start?: { line?: number } }; _rangeCache?: { start?: { line?: number } } }
      | undefined;
    const range = cstNode?._rangeCache ?? cstNode?.range;
    if (range?.start?.line !== undefined) {
      const line = range.start.line + 1;
      if (filePath) {
        pendingRevealRef.current = { line, filePath };
        expandSource();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedNodeData]);

  // --- Collapsible panel expand helpers (needed by navigation handlers) ---
  const expandSource = useCallback(() => {
    if (sourcePanelRef.current?.isCollapsed()) {
      sourcePanelRef.current.resize('35%');
      setShowSource(true);
    }
  }, []);

  const expandEditor = useCallback(() => {
    if (editorPanelRef.current?.isCollapsed()) {
      editorPanelRef.current.expand();
      setShowEditor(true);
    }
  }, []);

  const collapseEditor = useCallback(() => {
    editorPanelRef.current?.collapse();
    setShowEditor(false);
  }, []);

  // Derive FunctionScope from the selected function's data for ExpressionBuilder
  const functionScope: FunctionScope = useMemo(() => {
    const d = selectedNodeData as any;
    if (!d || d.$type !== 'RosettaFunction') {
      return { inputs: [], output: null, aliases: [] };
    }
    return {
      inputs: (d.inputs ?? []).map((p: any) => ({
        name: p.name,
        typeName: p.typeCall?.type?.$refText,
        cardinality: p.card
          ? `(${p.card.inf}..${p.card.unbounded ? '*' : (p.card.sup ?? p.card.inf)})`
          : undefined
      })),
      output: d.output?.typeCall?.type?.$refText
        ? { name: 'output', typeName: d.output.typeCall.type.$refText }
        : null,
      aliases: (d.shortcuts ?? []).map((s: any) => ({
        name: s.name,
        typeName: s.typeCall?.type?.$refText
      }))
    };
  }, [selectedNodeData]);

  const renderExpressionEditor = useCallback(
    (props: ExpressionEditorSlotProps) => <ExpressionBuilder {...props} scope={functionScope} />,
    [functionScope]
  );

  // --- Stable ref for files (prevents stale closure in handleSourceChange) ---
  const filesRef = useRef(files);
  useEffect(() => {
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
  // Build namespace → file path mapping for reverse sync (handleModelChanged)
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

  // Build nodeId → file path mapping for precise node→file resolution.
  const nodeIdToFilePath = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < models.length && i < files.length; i++) {
      const model = models[i] as {
        name?: string | { segments?: string[] };
        elements?: Array<{ name?: string }>;
      };
      let ns = 'unknown';
      if (typeof model.name === 'string') {
        ns = model.name;
      } else if (model.name && typeof model.name === 'object' && 'segments' in model.name) {
        ns = (model.name as { segments: string[] }).segments.join('.');
      }
      for (const element of model.elements ?? []) {
        const name = element.name ?? 'unknown';
        const nodeId = `${ns}::${name}`;
        if (!map.has(nodeId)) {
          map.set(nodeId, files[i]!.path);
        }
      }
    }
    return map;
  }, [models, files]);

  /** Resolve which workspace file contains a given node. */
  const resolveNodeFile = useCallback(
    (nodeData: AnyGraphNode): string | undefined => {
      const d = nodeData as any;

      // Primary: use the Langium document URI from the AST container
      const docPath = d.$container?.$document?.uri?.path as string | undefined;
      if (docPath) {
        // docPath is like "/base-math-type.rosetta" — match against file paths
        const match = files.find(
          (f) => f.path === docPath || f.path.endsWith(docPath) || docPath.endsWith(f.path)
        );
        if (match) return match.path;
        // Try matching just the filename
        const fileName = docPath.split('/').pop();
        if (fileName) {
          const byName = files.find((f) => f.path.endsWith(fileName) || f.name === fileName);
          if (byName) return byName.path;
        }
      }

      // Fallback: index-based mapping
      const nodeId = `${d.namespace}::${d.name}`;
      return nodeIdToFilePath.get(nodeId);
    },
    [files, nodeIdToFilePath]
  );

  /** Open a file in the source editor tabs (adds to openedFilePaths). */
  const openFileInSource = useCallback((filePath: string) => {
    setOpenedFilePaths((prev) => {
      if (prev.has(filePath)) return prev;
      const next = new Set(prev);
      next.add(filePath);
      return next;
    });
    setActiveEditorFile(filePath);
  }, []);

  const handleExplorerSelectNode = useCallback(
    (nodeId: string) => {
      graphRef.current?.focusNode(nodeId);
      storeSelectNode(nodeId);
    },
    [storeSelectNode]
  );

  // --- Task 2: navigateToNode callback ---
  const navigateToNode = useCallback(
    (nodeId: string) => {
      const exists = storeNodes.some((n) => n.id === nodeId);
      if (!exists) {
        const shortName = nodeId.includes('::') ? nodeId.split('::').pop() : nodeId;
        setToastMessage(`Type "${shortName}" not loaded — load the file containing this type`);
        return;
      }
      // Task 8: push current selection onto history before navigating (capped at 100)
      const current = useEditorStore.getState().selectedNodeId;
      if (current) {
        navigationHistoryRef.current.push(current);
        if (navigationHistoryRef.current.length > 100) {
          navigationHistoryRef.current.shift();
        }
      }
      graphRef.current?.focusNode(nodeId);
      storeSelectNode(nodeId);
    },
    [storeNodes, storeSelectNode]
  );

  // --- Task 8: navigateBack callback ---
  const navigateBack = useCallback(() => {
    const prev = navigationHistoryRef.current.pop();
    if (!prev) return;
    // Validate the node still exists (may have been removed by graph reload)
    const exists = storeNodes.some((n) => n.id === prev);
    if (!exists) {
      setToastMessage(`Previous node "${prev}" is no longer in the graph`);
      return;
    }
    graphRef.current?.focusNode(prev);
    storeSelectNode(prev);
  }, [storeSelectNode, storeNodes]);

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Task 8: keyboard shortcut for back-navigation
  const handleEditorPageKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Alt+ArrowLeft (all platforms) or Meta+[ (Mac)
      if ((e.altKey && e.key === 'ArrowLeft') || (e.metaKey && e.key === '[')) {
        e.preventDefault();
        navigateBack();
      }
    },
    [navigateBack]
  );

  const handleModelChanged = useCallback(
    (serialized: Map<string, string>) => {
      const currentFiles = filesRef.current;
      const updatedFiles = currentFiles.map((f) => {
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

  // Register displayFile handler for cross-file go-to-definition.
  // When the LSP returns a definition in a file not yet open in a tab,
  // this opens the tab and returns the new EditorView.
  useEffect(() => {
    if (!lspClient) return;
    const unsub = lspClient.onDisplayFile(async (uri: string) => {
      // Parse URI properly to handle encoding (e.g., %20 for spaces)
      let path: string;
      try {
        const parsed = new URL(uri);
        path = decodeURIComponent(parsed.pathname);
      } catch {
        path = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
      }
      const fileName = path.split('/').pop() ?? path;
      const file = files.find(
        (f) => f.path === path || f.path.endsWith(fileName) || path.endsWith(f.path)
      );
      if (!file) {
        console.warn(
          `[displayFile] No workspace file found matching URI: ${uri} (fileName: ${fileName})`
        );
        return null;
      }

      // Open the file tab
      openFileInSource(file.path);
      expandSource();

      // Return a promise that resolves when the EditorView is created
      return new Promise<import('@codemirror/view').EditorView | null>((resolve) => {
        // Resolve any stale pending promise for the same file before replacing
        const existing = pendingDisplayFileRef.current.get(file.path);
        if (existing) existing(null);

        pendingDisplayFileRef.current.set(file.path, resolve);
        setTimeout(() => {
          if (pendingDisplayFileRef.current.has(file.path)) {
            pendingDisplayFileRef.current.delete(file.path);
            console.warn(`[displayFile] Timed out waiting for EditorView: "${file.path}"`);
            resolve(null);
          }
        }, 2000);
      });
    });
    return unsub;
  }, [lspClient, files, openFileInSource, expandSource]);

  /** Resolve pending displayFile promise when a new EditorView is created. */
  const handleEditorViewCreated = useCallback(
    (filePath: string, view: import('@codemirror/view').EditorView) => {
      const resolve = pendingDisplayFileRef.current.get(filePath);
      if (resolve) {
        pendingDisplayFileRef.current.delete(filePath);
        resolve(view);
      }
    },
    []
  );

  /** Only pass files that the user has explicitly opened (via node selection). */
  const sourceEditorFiles = useMemo(
    () => files.filter((f) => openedFilePaths.has(f.path)),
    [files, openedFilePaths]
  );

  // Fire pending reveal after sourceEditorFiles updates with the target file
  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    const exists = sourceEditorFiles.some((f) => f.path === pending.filePath);
    if (exists) {
      pendingRevealRef.current = null;
      requestAnimationFrame(() => {
        sourceEditorRef.current?.revealLine(pending.line, pending.filePath);
      });
    }
  }, [sourceEditorFiles]);

  /** Close a file tab (remove from openedFilePaths). */
  const closeFileInSource = useCallback(
    (filePath: string) => {
      setOpenedFilePaths((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
      if (activeEditorFile === filePath) {
        const remaining = files.filter((f) => openedFilePaths.has(f.path) && f.path !== filePath);
        setActiveEditorFile(remaining[0]?.path);
      }
    },
    [files, openedFilePaths, activeEditorFile]
  );

  // --- Collapsible panel toggle helpers ---
  const toggleSource = useCallback(() => {
    const panel = sourcePanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.resize('35%');
      setShowSource(true);
    } else {
      panel.collapse();
      setShowSource(false);
    }
  }, []);

  const toggleEditor = useCallback(() => {
    const panel = editorPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.resize('30%');
      setShowEditor(true);
    } else {
      panel.collapse();
      setShowEditor(false);
    }
  }, []);

  const handleNodeDoubleClick = useCallback(
    (_nodeId: string) => {
      expandSource();
    },
    [expandSource]
  );

  const getSerializedFiles = useCallback((): Map<string, string> => {
    const rosettaText = graphRef.current?.exportRosetta?.();
    if (!rosettaText || rosettaText.size === 0) return new Map();
    return rosettaText;
  }, []);

  const handleExportImage = useCallback((format: 'svg' | 'png') => {
    return graphRef.current?.exportImage(format) ?? Promise.resolve(new Blob());
  }, []);

  const validateModelForExport = useCallback((): string[] => {
    const warnings: string[] = [];
    const { totalErrors, totalWarnings } = useDiagnosticsStore.getState();
    if (totalErrors > 0) {
      warnings.push(
        `Model has ${totalErrors} error(s) that may affect code generation output quality.`
      );
    }
    if (totalWarnings > 0) {
      warnings.push(`Model has ${totalWarnings} warning(s).`);
    }
    const serialized = getSerializedFiles();
    if (serialized.size === 0) {
      warnings.push('No user-authored files found to export.');
    }
    return warnings;
  }, [getSerializedFiles]);

  // --- Available types for editor form TypeSelector ---
  const availableTypes: TypeOption[] = useMemo(() => {
    const builtinOptions: TypeOption[] = BUILTIN_TYPES.map((t) => ({
      value: `builtin::${t}`,
      label: t,
      kind: 'builtin' as const
    }));
    const graphOptions: TypeOption[] = storeNodes.map((n) => ({
      value: n.id,
      label: n.data.name,
      kind: (AST_TYPE_TO_NODE_TYPE[(n.data as any).$type] ?? 'data') as TypeOption['kind'],
      namespace: n.data.namespace
    }));
    return [...builtinOptions, ...graphOptions];
  }, [storeNodes]);

  // --- Editor form actions wired to store ---
  const editorActions: EditorFormActions = useMemo(() => {
    const s = useEditorStore.getState;
    return {
      renameType: (nodeId, newName) => s().renameType(nodeId, newName),
      deleteType: (nodeId) => s().deleteType(nodeId),
      updateDefinition: (nodeId, def) => s().updateDefinition(nodeId, def),
      updateComments: (nodeId, comments) => s().updateComments(nodeId, comments),
      addSynonym: (nodeId, synonym) => s().addSynonym(nodeId, synonym),
      removeSynonym: (nodeId, index) => s().removeSynonym(nodeId, index),
      addAttribute: (nodeId, name, type, card) => s().addAttribute(nodeId, name, type, card),
      removeAttribute: (nodeId, name) => s().removeAttribute(nodeId, name),
      updateAttribute: (nodeId, oldN, newN, type, card) =>
        s().updateAttribute(nodeId, oldN, newN, type, card),
      reorderAttribute: (nodeId, from, to) => s().reorderAttribute(nodeId, from, to),
      setInheritance: (childId, parentId) => s().setInheritance(childId, parentId),
      addEnumValue: (nodeId, name, display) => s().addEnumValue(nodeId, name, display),
      removeEnumValue: (nodeId, name) => s().removeEnumValue(nodeId, name),
      updateEnumValue: (nodeId, oldN, newN, display) =>
        s().updateEnumValue(nodeId, oldN, newN, display),
      reorderEnumValue: (nodeId, from, to) => s().reorderEnumValue(nodeId, from, to),
      setEnumParent: (nodeId, parentId) => s().setEnumParent(nodeId, parentId),
      addChoiceOption: (nodeId, type) => s().addChoiceOption(nodeId, type),
      removeChoiceOption: (nodeId, type) => s().removeChoiceOption(nodeId, type),
      addInputParam: (nodeId, name, type) => s().addInputParam(nodeId, name, type),
      removeInputParam: (nodeId, name) => s().removeInputParam(nodeId, name),
      updateOutputType: (nodeId, type) => s().updateOutputType(nodeId, type),
      updateExpression: (nodeId, expr) => s().updateExpression(nodeId, expr),
      addAnnotation: (nodeId, name) => s().addAnnotation(nodeId, name),
      removeAnnotation: (nodeId, index) => s().removeAnnotation(nodeId, index),
      addCondition: (nodeId, condition) => s().addCondition(nodeId, condition),
      removeCondition: (nodeId, index) => s().removeCondition(nodeId, index),
      updateCondition: (nodeId, index, updates) => s().updateCondition(nodeId, index, updates),
      reorderCondition: (nodeId, from, to) => s().reorderCondition(nodeId, from, to),
      validate: () => s().validate()
    };
  }, []);

  const handleFitView = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  const handleRelayout = useCallback(() => {
    graphRef.current?.relayout();
  }, []);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="editor-page"
      onKeyDown={handleEditorPageKeyDown}
      tabIndex={-1}
    >
      {/* Toolbar */}
      <nav
        className="flex items-center justify-between px-3 py-1.5 bg-card gap-2"
        aria-label="Editor toolbar"
      >
        <div className="flex items-center gap-1.5">
          <Button
            variant={explorerOpen ? 'default' : 'secondary'}
            size="sm"
            onClick={storeToggleExplorer}
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
            onClick={toggleEditor}
            title="Toggle editor form panel"
          >
            Editor
          </Button>
          <Button
            variant={showSource ? 'default' : 'secondary'}
            size="sm"
            onClick={toggleSource}
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
            exportImage={handleExportImage}
            hasModels={models.length > 0}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExportDialog(true)}
            disabled={models.length === 0}
            title="Generate code from model"
          >
            Export Code
          </Button>
        </div>
      </nav>
      <Separator />

      {/* Toast message (Task 2) */}
      {toastMessage && (
        <div
          className="flex items-center justify-between px-3 py-1.5 bg-destructive/10 text-destructive text-sm border-b border-destructive/20"
          role="alert"
        >
          <span>{toastMessage}</span>
          <button
            className="ml-2 text-destructive hover:text-destructive/80 font-medium"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main content — explorer sidebar + resizable graph/source */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Namespace Explorer — fixed sidebar */}
        {explorerOpen && (
          <aside
            className="w-(--sidebar-width) min-w-(--sidebar-min-width) max-w-(--sidebar-max-width) h-full overflow-hidden flex flex-col bg-card border-r border-border"
            aria-label="Namespace explorer"
          >
            <ScrollArea className="flex-1">
              <NamespaceExplorerPanel
                nodes={storeNodes}
                expandedNamespaces={expandedNamespaces}
                hiddenNodeIds={hiddenNodeIds}
                selectedNodeId={selectedNodeId}
                onToggleNamespace={storeToggleNamespace}
                onToggleNode={storeToggleNodeVisibility}
                onExpandAll={storeExpandAllNamespaces}
                onCollapseAll={storeCollapseAllNamespaces}
                onSelectNode={handleExplorerSelectNode}
              />
            </ScrollArea>
          </aside>
        )}

        {/* Graph + Source — resizable split */}
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0">
          <ResizablePanel id="graph" defaultSize={70}>
            <RuneTypeGraph
              ref={graphRef}
              config={{
                layout: { direction: 'TB' },
                showControls: true,
                showMinimap: true,
                readOnly: false
              }}
              callbacks={{
                onNodeDoubleClick: handleNodeDoubleClick,
                onModelChanged: handleModelChanged,
                onNavigateToType: navigateToNode
              }}
            />
          </ResizablePanel>

          {/* Source panel — always mounted, collapsible via panelRef */}
          <ResizableHandle withHandle />
          <ResizablePanel
            id="source"
            collapsible
            collapsedSize={0}
            defaultSize={0}
            minSize={15}
            panelRef={sourcePanelRef}
          >
            <aside
              className="studio-editor-page__source h-full overflow-auto"
              aria-label="Source editor"
            >
              <SourceEditor
                ref={sourceEditorRef}
                files={sourceEditorFiles}
                activeFile={activeEditorFile}
                lspClient={lspClient}
                onFileSelect={(path) => setActiveEditorFile(path)}
                onFileClose={closeFileInSource}
                onContentChange={handleSourceChange}
                onNavigateToNode={navigateToNode}
                onEditorViewCreated={handleEditorViewCreated}
              />
            </aside>
          </ResizablePanel>

          {/* Editor form panel — always mounted, collapsible via panelRef */}
          <ResizableHandle withHandle />
          <ResizablePanel
            id="editor-form"
            collapsible
            collapsedSize={0}
            defaultSize={30}
            minSize={15}
            panelRef={editorPanelRef}
          >
            <EditorFormPanel
              nodeData={selectedNodeData}
              nodeId={selectedNodeId}
              availableTypes={availableTypes}
              actions={editorActions}
              allNodes={storeNodes}
              renderExpressionEditor={renderExpressionEditor}
              onClose={collapseEditor}
              onNavigateToNode={navigateToNode}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Diagnostics panel (toggleable) */}
      {showDiagnostics && (
        <DiagnosticsPanel
          fileDiagnostics={fileDiagnostics}
          onNavigate={(uri, _line, _char) => {
            const normPath = uri.startsWith('file://') ? uri.slice(7) : uri;
            const fileName = normPath.split('/').pop() ?? normPath;
            const file = files.find(
              (f) => f.path === normPath || f.name === fileName || normPath.endsWith(f.path ?? '')
            );
            if (file) {
              const path = file.path ?? file.name;
              openFileInSource(path);
              expandSource();
            }
          }}
        />
      )}

      {/* Status bar */}
      <Separator />
      <footer className="flex items-center gap-4 px-3 py-1 text-sm text-muted-foreground bg-card">
        <span>{models.length} model(s) loaded</span>
        <span>{files.filter((f) => f.dirty).length} modified</span>
        {selectedNodeId && <span>Selected: {selectedNodeId}</span>}
        {transportState && <ConnectionStatus state={transportState} onReconnect={onReconnect} />}
      </footer>

      {/* Code Generation Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getUserFiles={getSerializedFiles}
        validateModel={validateModelForExport}
      />
    </div>
  );
}
