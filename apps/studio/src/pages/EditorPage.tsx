// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * EditorPage — top-level studio surface, hosted by `DockShell` (T077).
 *
 * Owns editor state (selected node, opened files, navigation history,
 * store wiring) and provides custom dockview panels that render the
 * existing studio components:
 *
 *   workspace.fileTree     ← NamespaceExplorerPanel
 *   workspace.editor       ← SourceEditor
 *   workspace.inspector    ← EditorFormPanel + ExpressionBuilder
 *   workspace.problems     ← DiagnosticsPanel
 *   workspace.output       ← (default stub for now; output stream wires later)
 *   workspace.visualPreview ← RuneTypeGraph
 *
 * Replaces the previous fixed two-panel resizable layout. The persistent
 * top toolbar shrinks to graph-only controls (panel toggles disappear —
 * users hide panels via dockview). The diagnostics drawer + explorer
 * sidebar merge into the dockable shell, reducing chrome (T091).
 */

import { useRef, useCallback, useState, useMemo, useEffect, type KeyboardEvent } from 'react';
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
import { ScrollArea } from '@rune-langium/design-system/ui/scroll-area';
import { Maximize2, LayoutGrid, Code2, Network, XCircle } from 'lucide-react';
import { GraphFilterMenu } from '../components/GraphFilterMenu.js';
import { DockShell } from '../shell/DockShell.js';
import type { WorkspaceFile } from '../services/workspace.js';
import type { LspClientService } from '../services/lsp-client.js';
import type { TransportState } from '../services/transport-provider.js';
import { useLspDiagnosticsBridge } from '../hooks/useLspDiagnosticsBridge.js';
import { useDiagnosticsStore } from '../store/diagnostics-store.js';
import { CodePreviewPanel } from '../components/CodePreviewPanel.js';
import type { SourceEditorHandle } from '../components/CodePreviewPanel.js';
import { pathToUri } from '../utils/uri.js';
import type { ParsedWorkspaceModel } from '../services/workspace.js';
import {
  createPreviewGenerateMessage,
  createPreviewSetFilesMessage,
  isPreviewWorkerMessage
} from '../services/codegen-service.js';
import { usePreviewStore, type FormPreviewTarget } from '../store/preview-store.js';
import { FormPreviewPanel as FormPreviewPanelShell } from '../shell/panels/FormPreviewPanel.js';
import { useCodegenStore } from '../store/codegen-store.js';
import '../test-api.js';
import { getRuneStudioTestApi } from '../test-api.js';

export interface EditorPageProps {
  models: RosettaModel[];
  parsedModels?: ParsedWorkspaceModel[];
  files: WorkspaceFile[];
  onFilesChange?: (files: WorkspaceFile[]) => void;
  lspClient?: LspClientService;
  transportState?: TransportState;
  onReconnect?: () => void;
  /** Workspace id used for layout persistence keying. */
  workspaceId?: string;
  /** Studio build version threaded into layout migrations. */
  studioVersion?: string;
  /** Workspace display name shown in the toolbar. */
  workspaceName?: string;
  /** Called when the user wants to close the current workspace. */
  onClose?: () => void;
}

function matchesPreviewSourceIdentity(
  current: FormPreviewTarget,
  candidate: FormPreviewTarget
): boolean {
  if (
    !current.sourceUri ||
    current.sourceUri !== candidate.sourceUri ||
    current.kind !== candidate.kind
  ) {
    return false;
  }
  if (current.sourceIndex !== undefined && candidate.sourceIndex !== undefined) {
    return current.sourceIndex === candidate.sourceIndex;
  }
  return (
    current.sourceRange?.start.line === candidate.sourceRange?.start.line &&
    current.sourceRange?.start.character === candidate.sourceRange?.start.character
  );
}

export function EditorPage({
  models,
  parsedModels,
  files,
  onFilesChange,
  lspClient,
  transportState,
  onReconnect,
  workspaceId = 'default',
  studioVersion = '0.1.0',
  workspaceName,
  onClose
}: EditorPageProps) {
  const graphRef = useRef<RuneTypeGraphRef>(null);
  const sourceEditorRef = useRef<SourceEditorRef>(null);
  const [codegenWorker, setCodegenWorker] = useState<Worker | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [groupedLayout, setGroupedLayout] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeEditorFile, setActiveEditorFile] = useState<string | undefined>(undefined);
  const [openedFilePaths, setOpenedFilePaths] = useState<Set<string>>(new Set<string>());
  const pendingRevealRef = useRef<{ line: number; filePath: string } | null>(null);
  const previewRequestSequenceRef = useRef(0);
  const currentPreviewRequestIdRef = useRef<string | undefined>(undefined);
  const navigationHistoryRef = useRef<string[]>([]);
  const pendingDisplayFileRef = useRef<
    Map<string, (view: import('@codemirror/view').EditorView | null) => void>
  >(new Map());

  const storeNodes = useEditorStore((s) => s.nodes);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const visibility = useEditorStore((s) => s.visibility);
  const expandedNamespaces = visibility.expandedNamespaces;
  const hiddenNodeIds = visibility.hiddenNodeIds;

  const storeSelectNode = useEditorStore((s) => s.selectNode);
  const storeToggleNamespace = useEditorStore((s) => s.toggleNamespace);
  const storeToggleNodeVisibility = useEditorStore((s) => s.toggleNodeVisibility);
  const storeExpandAllNamespaces = useEditorStore((s) => s.expandAllNamespaces);
  const storeCollapseAllNamespaces = useEditorStore((s) => s.collapseAllNamespaces);
  const previewSelectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  const previewSelectedTarget = usePreviewStore((s) => s.selectedTarget);
  const setPreviewTargets = usePreviewStore((s) => s.setAvailableTargets);
  const selectPreviewTarget = usePreviewStore((s) => s.selectTarget);
  const receivePreviewResult = usePreviewStore((s) => s.receivePreviewResult);
  const receivePreviewStale = usePreviewStore((s) => s.receivePreviewStale);
  const codePreviewTarget = useCodegenStore((s) => s.codePreviewTarget);
  const beginCodePreviewRequest = useCodegenStore((s) => s.beginCodePreviewRequest);

  useEffect(() => {
    if (models.length > 0) {
      useEditorStore.getState().loadModels(models as unknown[]);
    }
  }, [models]);

  const selectedNodeData: AnyGraphNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = storeNodes.find((n) => n.id === selectedNodeId);
    return (node?.data as unknown as AnyGraphNode) ?? null;
  }, [selectedNodeId, storeNodes]);

  const previewTargets: FormPreviewTarget[] = useMemo(() => {
    const sourceByTargetId = new Map<
      string,
      Pick<FormPreviewTarget, 'sourceUri' | 'sourceIndex' | 'sourceRange'>
    >();
    for (const model of models) {
      const modelUriValue = (
        model as unknown as {
          $document?: { uri?: { path?: string; toString(): string } };
        }
      ).$document?.uri;
      const modelUri = modelUriValue?.path ?? modelUriValue?.toString();
      const namespace =
        typeof model.name === 'string'
          ? model.name
          : Array.isArray((model.name as { segments?: string[] } | undefined)?.segments)
            ? ((model.name as { segments: string[] }).segments.join('.') ?? 'unknown')
            : 'unknown';
      for (const [sourceIndex, element] of (model.elements ?? []).entries()) {
        const name = (element as { name?: string }).name;
        if (!name) {
          continue;
        }
        const range = (
          element as {
            $cstNode?: {
              range?: {
                start?: { line?: number; character?: number };
                end?: { line?: number; character?: number };
              };
            };
          }
        ).$cstNode?.range;
        sourceByTargetId.set(`${namespace}.${name}`, {
          sourceUri:
            (
              element as {
                $document?: { uri?: { path?: string; toString(): string } };
              }
            ).$document?.uri?.path ??
            (
              element as {
                $document?: { uri?: { path?: string; toString(): string } };
              }
            ).$document?.uri?.toString() ??
            modelUri,
          sourceIndex,
          sourceRange:
            range?.start?.line !== undefined &&
            range?.start?.character !== undefined &&
            range?.end?.line !== undefined &&
            range?.end?.character !== undefined
              ? {
                  start: {
                    line: range.start.line,
                    character: range.start.character
                  },
                  end: {
                    line: range.end.line,
                    character: range.end.character
                  }
                }
              : undefined
        });
      }
    }

    return storeNodes
      .map((node) => {
        const data = node.data as unknown as {
          namespace?: string;
          name?: string;
          $type?: string;
        };
        if (!data.namespace || !data.name) return undefined;
        return {
          id: `${data.namespace}.${data.name}`,
          namespace: data.namespace,
          name: data.name,
          kind: data.$type ?? 'unknown',
          ...sourceByTargetId.get(`${data.namespace}.${data.name}`)
        };
      })
      .filter((target): target is FormPreviewTarget => target !== undefined);
  }, [models, storeNodes]);

  useEffect(() => {
    setPreviewTargets(previewTargets);
  }, [previewTargets, setPreviewTargets]);

  useEffect(() => {
    if (!previewSelectedTargetId || !previewSelectedTarget) {
      return;
    }
    if (previewTargets.some((target) => target.id === previewSelectedTargetId)) {
      return;
    }
    const renamedTarget = previewTargets.find((target) =>
      matchesPreviewSourceIdentity(previewSelectedTarget, target)
    );
    selectPreviewTarget(renamedTarget?.id);
  }, [previewSelectedTarget, previewSelectedTargetId, previewTargets, selectPreviewTarget]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    const data = selectedNodeData as unknown as { namespace?: string; name?: string } | null;
    if (!data?.namespace || !data.name) {
      return;
    }
    selectPreviewTarget(`${data.namespace}.${data.name}`);
  }, [selectedNodeData, selectedNodeId, selectPreviewTarget]);

  // Navigate the source editor when a graph node is selected.
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedNodeId;
    if (!selectedNodeId || !selectedNodeData) return;

    const filePath = resolveNodeFile(selectedNodeData);
    if (filePath) openFileInSource(filePath);

    const nodeData = selectedNodeData as unknown as Record<string, unknown>;
    const cstNode = nodeData['$cstNode'] as
      | { range?: { start?: { line?: number } }; _rangeCache?: { start?: { line?: number } } }
      | undefined;
    const range = cstNode?._rangeCache ?? cstNode?.range;
    if (range?.start?.line !== undefined && filePath) {
      pendingRevealRef.current = { line: range.start.line + 1, filePath };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedNodeData]);

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

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (files.length === 0) {
      setOpenedFilePaths((prev) => (prev.size === 0 ? prev : new Set<string>()));
      setActiveEditorFile((prev) => (prev === undefined ? prev : undefined));
      return;
    }

    const availablePaths = new Set(files.map((file) => file.path));
    const preferredFile = files.find((file) => !file.readOnly) ?? files[0]!;

    setOpenedFilePaths((prev) => {
      const next = new Set([...prev].filter((path) => availablePaths.has(path)));
      if (next.size === 0) {
        next.add(preferredFile.path);
      }
      if (next.size === prev.size && [...next].every((path) => prev.has(path))) {
        return prev;
      }
      return next;
    });

    setActiveEditorFile((prev) => {
      if (prev && availablePaths.has(prev)) {
        return prev;
      }
      return preferredFile.path;
    });
  }, [files]);

  // Initialise dedicated codegen worker once on mount.
  useEffect(() => {
    const worker =
      getRuneStudioTestApi()?.createCodegenWorker?.() ??
      new Worker(new URL('../workers/codegen-worker.ts', import.meta.url), {
        type: 'module'
      });
    setCodegenWorker(worker);
    return () => {
      worker.terminate();
      setCodegenWorker(null);
    };
  }, []);

  const handlePreviewWorkerFailure = useCallback(
    (baseMessage: string, error: unknown, targetId?: string) => {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'type' in error && error.type === 'messageerror'
            ? 'A preview worker message could not be deserialized.'
            : typeof error === 'object' &&
                error &&
                'message' in error &&
                typeof error.message === 'string'
              ? error.message
              : 'Reload Studio to restore form preview.';
      receivePreviewStale({
        targetId,
        reason: 'generation-error',
        message: `${baseMessage} ${detail}`.trim()
      });
      console.error(`[EditorPage] ${baseMessage}`, error);
    },
    [receivePreviewStale]
  );

  // Keep the codegen worker in sync with the workspace file set and
  // regenerate the selected preview whenever the backing files change.
  useEffect(() => {
    if (!codegenWorker) return;
    const previewFiles = files.map((f) => ({ uri: pathToUri(f.path), content: f.content }));
    const codegenRequestId = beginCodePreviewRequest(codePreviewTarget);
    const requestId = previewSelectedTargetId
      ? `preview:${previewSelectedTargetId}:${++previewRequestSequenceRef.current}`
      : undefined;
    currentPreviewRequestIdRef.current = requestId;
    try {
      codegenWorker.postMessage({
        type: 'codegen:setFiles',
        files: previewFiles,
        requestId: codegenRequestId
      });
      codegenWorker.postMessage(createPreviewSetFilesMessage(previewFiles, requestId));
    } catch (error) {
      handlePreviewWorkerFailure(
        'Preview worker could not process updated files.',
        error,
        previewSelectedTargetId
      );
    }
  }, [
    beginCodePreviewRequest,
    codePreviewTarget,
    codegenWorker,
    files,
    handlePreviewWorkerFailure,
    previewSelectedTargetId
  ]);

  useEffect(() => {
    if (!codegenWorker || !previewSelectedTargetId) return;
    const requestId = `preview:${previewSelectedTargetId}:${++previewRequestSequenceRef.current}`;
    currentPreviewRequestIdRef.current = requestId;
    try {
      codegenWorker.postMessage(createPreviewGenerateMessage(previewSelectedTargetId, requestId));
    } catch (error) {
      handlePreviewWorkerFailure(
        'Preview worker could not start generation for the selected type.',
        error,
        previewSelectedTargetId
      );
    }
  }, [codegenWorker, handlePreviewWorkerFailure, previewSelectedTargetId]);

  useEffect(() => {
    if (!codegenWorker) return;
    function handleMessage(e: MessageEvent<unknown>) {
      if (!isPreviewWorkerMessage(e.data)) return;
      if (e.data.requestId !== currentPreviewRequestIdRef.current) {
        return;
      }
      if (e.data.type === 'preview:result') {
        receivePreviewResult(e.data.schema);
      } else {
        receivePreviewStale(e.data);
      }
    }
    function handleWorkerFailure(event: ErrorEvent | MessageEvent<unknown>) {
      const baseMessage =
        event.type === 'messageerror'
          ? 'Preview worker rejected a message.'
          : 'Preview worker crashed.';
      handlePreviewWorkerFailure(baseMessage, event, previewSelectedTargetId);
    }
    codegenWorker.addEventListener('message', handleMessage as EventListener);
    codegenWorker.addEventListener('error', handleWorkerFailure as EventListener);
    codegenWorker.addEventListener('messageerror', handleWorkerFailure as EventListener);
    return () => {
      codegenWorker.removeEventListener('message', handleMessage as EventListener);
      codegenWorker.removeEventListener('error', handleWorkerFailure as EventListener);
      codegenWorker.removeEventListener('messageerror', handleWorkerFailure as EventListener);
    };
  }, [
    codegenWorker,
    handlePreviewWorkerFailure,
    previewSelectedTargetId,
    receivePreviewResult,
    receivePreviewStale
  ]);

  const handleSourceChange = useCallback(
    (path: string, content: string) => {
      const updatedFiles = filesRef.current.map((f) =>
        f.path === path ? { ...f, content, dirty: true } : f
      );
      onFilesChange?.(updatedFiles);
    },
    [onFilesChange]
  );

  const resolvedModelFiles = useMemo(() => {
    if (parsedModels && parsedModels.length > 0) {
      return parsedModels;
    }
    return models.flatMap((model, index) => {
      const file = files[index];
      return file ? [{ filePath: file.path, model }] : [];
    });
  }, [files, models, parsedModels]);

  const namespaceToFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of resolvedModelFiles) {
      const model = entry.model as { name?: string | { segments?: string[] } };
      let ns = 'unknown';
      if (typeof model.name === 'string') ns = model.name;
      else if (model.name && typeof model.name === 'object' && 'segments' in model.name) {
        ns = (model.name as { segments: string[] }).segments.join('.');
      }
      map.set(ns, entry.filePath);
    }
    return map;
  }, [resolvedModelFiles]);

  const nodeIdToFilePath = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of resolvedModelFiles) {
      const model = entry.model as {
        name?: string | { segments?: string[] };
        elements?: Array<{ name?: string }>;
      };
      let ns = 'unknown';
      if (typeof model.name === 'string') ns = model.name;
      else if (model.name && typeof model.name === 'object' && 'segments' in model.name) {
        ns = (model.name as { segments: string[] }).segments.join('.');
      }
      for (const element of model.elements ?? []) {
        const name = element.name ?? 'unknown';
        const nodeId = `${ns}::${name}`;
        if (!map.has(nodeId)) map.set(nodeId, entry.filePath);
      }
    }
    return map;
  }, [resolvedModelFiles]);

  const resolveNodeFile = useCallback(
    (nodeData: AnyGraphNode): string | undefined => {
      const d = nodeData as any;
      const docPath = d.$container?.$document?.uri?.path as string | undefined;
      if (docPath) {
        const match = files.find(
          (f) => f.path === docPath || f.path.endsWith(docPath) || docPath.endsWith(f.path)
        );
        if (match) return match.path;
        const fileName = docPath.split('/').pop();
        if (fileName) {
          const byName = files.find((f) => f.path.endsWith(fileName) || f.name === fileName);
          if (byName) return byName.path;
        }
      }
      const nodeId = `${d.namespace}::${d.name}`;
      return nodeIdToFilePath.get(nodeId);
    },
    [files, nodeIdToFilePath]
  );

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

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const exists = storeNodes.some((n) => n.id === nodeId);
      if (!exists) {
        const shortName = nodeId.includes('::') ? nodeId.split('::').pop() : nodeId;
        setToastMessage(`Type "${shortName}" not loaded — load the file containing this type`);
        return;
      }
      const current = useEditorStore.getState().selectedNodeId;
      if (current) {
        navigationHistoryRef.current.push(current);
        if (navigationHistoryRef.current.length > 100) navigationHistoryRef.current.shift();
      }
      graphRef.current?.focusNode(nodeId);
      storeSelectNode(nodeId);
    },
    [storeNodes, storeSelectNode]
  );

  const navigateBack = useCallback(() => {
    const prev = navigationHistoryRef.current.pop();
    if (!prev) return;
    const exists = storeNodes.some((n) => n.id === prev);
    if (!exists) {
      setToastMessage(`Previous node "${prev}" is no longer in the graph`);
      return;
    }
    graphRef.current?.focusNode(prev);
    storeSelectNode(prev);
  }, [storeSelectNode, storeNodes]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleEditorPageKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if ((e.altKey && e.key === 'ArrowLeft') || (e.metaKey && e.key === '[')) {
        e.preventDefault();
        navigateBack();
      }
    },
    [navigateBack]
  );

  const handleModelChanged = useCallback(
    (serialized: Map<string, string>) => {
      const updatedFiles = filesRef.current.map((f) => {
        for (const [ns, text] of serialized) {
          if (namespaceToFile.get(ns) === f.path) return { ...f, content: text, dirty: true };
        }
        return f;
      });
      onFilesChange?.(updatedFiles);
    },
    [namespaceToFile, onFilesChange]
  );

  useLspDiagnosticsBridge(lspClient);
  const { fileDiagnostics, totalErrors, totalWarnings } = useDiagnosticsStore();

  useEffect(() => {
    if (!lspClient) return;
    const unsub = lspClient.onDisplayFile(async (uri: string) => {
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
        // eslint-disable-next-line no-console
        console.warn(
          `[displayFile] No workspace file found matching URI: ${uri} (fileName: ${fileName})`
        );
        return null;
      }
      openFileInSource(file.path);
      return new Promise<import('@codemirror/view').EditorView | null>((resolve) => {
        const existing = pendingDisplayFileRef.current.get(file.path);
        if (existing) existing(null);
        pendingDisplayFileRef.current.set(file.path, resolve);
        setTimeout(() => {
          if (pendingDisplayFileRef.current.has(file.path)) {
            pendingDisplayFileRef.current.delete(file.path);
            // eslint-disable-next-line no-console
            console.warn(`[displayFile] Timed out waiting for EditorView: "${file.path}"`);
            resolve(null);
          }
        }, 2000);
      });
    });
    return unsub;
  }, [lspClient, files, openFileInSource]);

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

  const sourceEditorFiles = useMemo(
    () => files.filter((f) => openedFilePaths.has(f.path)),
    [files, openedFilePaths]
  );

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    if (sourceEditorFiles.some((f) => f.path === pending.filePath)) {
      pendingRevealRef.current = null;
      requestAnimationFrame(() => {
        sourceEditorRef.current?.revealLine(pending.line, pending.filePath);
      });
    }
  }, [sourceEditorFiles]);

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
    const { totalErrors: terr, totalWarnings: twarn } = useDiagnosticsStore.getState();
    if (terr > 0) {
      warnings.push(`Model has ${terr} error(s) that may affect code generation output quality.`);
    }
    if (twarn > 0) warnings.push(`Model has ${twarn} warning(s).`);
    const serialized = getSerializedFiles();
    if (serialized.size === 0) warnings.push('No user-authored files found to export.');
    return warnings;
  }, [getSerializedFiles]);

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
    graphRef.current?.relayout({ groupByInheritance: groupedLayout });
  }, [groupedLayout]);
  const handleToggleGroupedLayout = useCallback(() => {
    setGroupedLayout((prev) => {
      const next = !prev;
      setTimeout(() => {
        graphRef.current?.relayout({ groupByInheritance: next });
      }, 0);
      return next;
    });
  }, []);

  // ---------- panel components rendered inside dockview ----------

  const FileTreePanelMounted = useCallback(
    () => (
      <ScrollArea className="h-full">
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
    ),
    [
      storeNodes,
      expandedNamespaces,
      hiddenNodeIds,
      selectedNodeId,
      storeToggleNamespace,
      storeToggleNodeVisibility,
      storeExpandAllNamespaces,
      storeCollapseAllNamespaces,
      handleExplorerSelectNode
    ]
  );

  const SourceEditorPanelMounted = useCallback(
    () => (
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
    ),
    [
      sourceEditorFiles,
      activeEditorFile,
      lspClient,
      closeFileInSource,
      handleSourceChange,
      navigateToNode,
      handleEditorViewCreated
    ]
  );

  const InspectorPanelMounted = useCallback(
    () => (
      <EditorFormPanel
        nodeData={selectedNodeData}
        nodeId={selectedNodeId}
        availableTypes={availableTypes}
        actions={editorActions}
        allNodes={storeNodes}
        renderExpressionEditor={renderExpressionEditor}
        onClose={() => {
          /* dock collapse handled by dockview */
        }}
        onNavigateToNode={navigateToNode}
      />
    ),
    [
      selectedNodeData,
      selectedNodeId,
      availableTypes,
      editorActions,
      storeNodes,
      renderExpressionEditor,
      navigateToNode
    ]
  );

  const ProblemsPanelMounted = useCallback(
    () => (
      <DiagnosticsPanel
        fileDiagnostics={fileDiagnostics}
        onNavigate={(uri) => {
          const normPath = uri.startsWith('file://') ? uri.slice(7) : uri;
          const fileName = normPath.split('/').pop() ?? normPath;
          const file = files.find(
            (f) => f.path === normPath || f.name === fileName || normPath.endsWith(f.path ?? '')
          );
          if (file) openFileInSource(file.path ?? file.name);
        }}
      />
    ),
    [fileDiagnostics, files, openFileInSource]
  );

  // Stable adapter for CodePreviewPanel cross-file source-map navigation.
  const sourceEditorHandle = useMemo<SourceEditorHandle>(
    () => ({
      revealPosition: (position, filePath) =>
        sourceEditorRef.current?.revealPosition(position, filePath)
    }),
    // Intentionally stable — reads ref.current at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const CodePreviewPanelMounted = useCallback(() => {
    if (!codegenWorker) return null;
    return <CodePreviewPanel worker={codegenWorker} sourceEditorRef={sourceEditorHandle} />;
  }, [codegenWorker, sourceEditorHandle]);

  const FormPreviewPanelMounted = useCallback(() => <FormPreviewPanelShell />, []);

  const VisualPreviewPanelMounted = useCallback(
    () => (
      <RuneTypeGraph
        ref={graphRef}
        config={{
          layout: { direction: 'TB', groupByInheritance: groupedLayout },
          showControls: true,
          showMinimap: true,
          readOnly: false
        }}
        callbacks={{
          onNodeDoubleClick: () => {},
          onModelChanged: handleModelChanged,
          onNavigateToType: navigateToNode
        }}
      />
    ),
    [groupedLayout, handleModelChanged, navigateToNode]
  );

  // Memoize the overrides object so DockShell's useMemo([panelComponents])
  // only recomputes the dockview component map when a callback actually changes,
  // not on every EditorPage render.
  const panelComponents = useMemo(
    () => ({
      'workspace.fileTree': FileTreePanelMounted,
      'workspace.editor': SourceEditorPanelMounted,
      'workspace.inspector': InspectorPanelMounted,
      'workspace.problems': ProblemsPanelMounted,
      'workspace.visualPreview': VisualPreviewPanelMounted,
      'workspace.formPreview': FormPreviewPanelMounted,
      'workspace.codePreview': CodePreviewPanelMounted
    }),
    [
      FileTreePanelMounted,
      SourceEditorPanelMounted,
      InspectorPanelMounted,
      ProblemsPanelMounted,
      VisualPreviewPanelMounted,
      FormPreviewPanelMounted,
      CodePreviewPanelMounted
    ]
  );

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="editor-page"
      onKeyDown={handleEditorPageKeyDown}
      tabIndex={-1}
    >
      {/* Toolbar — graph-only controls. Panel toggles are gone; users
       * collapse / rearrange via dockview. (T091 chrome reduction.)
       * T059 (014/FR-027) — buttons grouped by category with vertical
       * separators; toggle-style buttons (Grouped) carry aria-pressed
       * matching their data-variant for SR users + automated audits. */}
      <nav
        className="glass-toolbar flex items-center justify-between px-3 py-1.5 gap-2 border-b border-border"
        aria-label="Editor toolbar"
      >
        <div className="flex items-center gap-1.5">
          {/* Layout actions */}
          <Button variant="secondary" size="sm" onClick={handleFitView} title="Fit to view">
            <Maximize2 className="w-3.5 h-3.5 mr-1" />
            Fit View
          </Button>
          <Button variant="secondary" size="sm" onClick={handleRelayout} title="Re-run auto layout">
            <LayoutGrid className="w-3.5 h-3.5 mr-1" />
            Re-layout
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          {/* Toggle controls (panel-toggle semantics: aria-pressed) */}
          <Button
            variant={groupedLayout ? 'default' : 'secondary'}
            data-variant={groupedLayout ? 'default' : 'secondary'}
            aria-pressed={groupedLayout}
            size="sm"
            onClick={handleToggleGroupedLayout}
            title="Group by inheritance trees"
          >
            <Network className="w-3.5 h-3.5 mr-1" />
            Grouped
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          {/* Filter controls */}
          <GraphFilterMenu />
        </div>
        <div className="flex items-center gap-1.5">
          <ExportMenu
            getSerializedFiles={getSerializedFiles}
            exportImage={handleExportImage}
            hasModels={models.length > 0}
          />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExportDialog(true)}
            disabled={models.length === 0}
            title="Generate code from model"
          >
            <Code2 className="w-3.5 h-3.5 mr-1" />
            Export Code
          </Button>
          {onClose && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              {workspaceName && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {workspaceName}
                </span>
              )}
              <Button variant="secondary" size="sm" onClick={onClose} title="Close workspace">
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Close
              </Button>
            </>
          )}
        </div>
      </nav>

      {toastMessage && (
        <div
          className="flex items-center justify-between px-3 py-1.5 bg-destructive/10 text-destructive text-sm border-b border-destructive/20"
          role="alert"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            className="ml-2 text-destructive hover:text-destructive/80 font-medium"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DockShell
          studioVersion={studioVersion}
          workspaceId={workspaceId}
          panelComponents={panelComponents}
        />
      </div>

      <footer className="glass-statusbar flex items-center gap-4 px-3 py-1 text-xs text-muted-foreground border-t border-border">
        <span>
          {models.length} model{models.length === 1 ? '' : 's'}
        </span>
        <span>{files.filter((f) => f.dirty).length} modified</span>
        {selectedNodeId && <span>{selectedNodeId}</span>}
        {(totalErrors > 0 || totalWarnings > 0) && (
          <span>
            {totalErrors} err / {totalWarnings} warn
          </span>
        )}
        {transportState && <ConnectionStatus state={transportState} onReconnect={onReconnect} />}
      </footer>

      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getUserFiles={getSerializedFiles}
        validateModel={validateModelForExport}
      />
    </div>
  );
}
