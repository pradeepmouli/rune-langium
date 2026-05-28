// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExplorePerspective — the Explore-perspective workbench content, rendered by
 * PerspectiveHost in its keep-alive `explore` slot. Formerly `EditorPage`; the
 * outer app shell (ActivityBar + PerspectiveHost) now lives in App, so this
 * component renders only the studio topbar + the `DockShell` workbench.
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
 * Replaces the previous fixed two-panel resizable layout. Workspace-level
 * actions live in a compact studio header, while graph-specific controls
 * now live inside the graph panel itself. The diagnostics drawer +
 * explorer sidebar merge into the dockable shell, reducing chrome (T091).
 */

import { useRef, useCallback, useState, useMemo, useEffect, type KeyboardEvent } from 'react';
import {
  RuneTypeGraph,
  NamespaceExplorerPanel,
  EditorFormPanel,
  ExpressionBuilder,
  StructureView,
  NameCell,
  CardinalityCell,
  TypePickerCell,
  BUILTIN_TYPES,
  resolveNodeKind,
  useEditorStore,
  useModelSourceSync
} from '@rune-langium/visual-editor';
import type {
  RuneTypeGraphRef,
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  ExpressionEditorSlotProps,
  FunctionScope,
  LayoutDirection,
  AdapterChoiceOption,
  AdapterDocument,
  AdapterNode,
  RangeDiagnostic
} from '@rune-langium/visual-editor';
import { useStructureViewStore } from '../store/structure-view-store.js';
import type { RosettaModel } from '@rune-langium/core';
import { SourceEditor } from '../components/SourceEditor.js';
import type { SourceEditorRef } from '../components/SourceEditor.js';
import { ConnectionStatus } from '../components/ConnectionStatus.js';
import { LspConnectionBadge } from '../components/LspConnectionBadge.js';
import { SyncStatusBadge } from '../components/SyncStatusBadge.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.js';
import { ExportDialog } from '../components/ExportDialog.js';
import { ModelLoader } from '../components/ModelLoader.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Separator } from '@rune-langium/design-system/ui/separator';
import { Avatar, AvatarFallback } from '@rune-langium/design-system/ui/avatar';
import { Kbd } from '@rune-langium/design-system/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@rune-langium/design-system/ui/dialog';
import {
  Maximize2,
  LayoutGrid,
  Network,
  Check,
  Download,
  Share2,
  Zap,
  Search,
  ChevronDown,
  Plus,
  LogOut
} from 'lucide-react';
import { listRecents, type RecentWorkspaceRecord } from '../workspace/persistence.js';
import { useStudioToast } from '../components/StudioToastProvider.js';
import { DockShell } from './DockShell.js';
import { usePerspectiveStore } from '../store/perspective-store.js';
import type { WorkspaceFile } from '../services/workspace.js';
import { linkDocument } from '../services/workspace.js';
import { useLspDiagnosticsBridge } from '../hooks/useLspDiagnosticsBridge.js';
import { useDiagnosticsStore } from '../store/diagnostics-store.js';
import { CodePreviewPanel } from '../components/CodePreviewPanel.js';
import type { SourceEditorHandle } from '../components/CodePreviewPanel.js';
import { FontScaleButton } from '../components/FontScaleButton.js';
import { mergeSerializedIntoSource } from '../utils/source-merge.js';
import { subscribeToEngine, resolveConflict } from '../services/git-sync.js';
import type { SyncStatus } from '@rune-langium/git-sync-engine';
import { usePreviewStore, type FormPreviewTarget } from '../store/preview-store.js';
import { FormPreviewPanel as FormPreviewPanelShell } from './panels/FormPreviewPanel.js';
import { CenterStackPanel } from './panels/CenterStackPanel.js';
import '../test-api.js';
import { useWorkspace } from './providers/workspace-context.js';
import { useLsp } from './providers/lsp-context.js';
import { useWorkspaceActions } from './perspectives/workspace-actions-context.js';
import type { DeferredExportEntry } from '../workers/parser-worker.js';
import type { LspDiagnostic } from '../store/diagnostics-store.js';
import { uriToPath, pathToUri } from '../utils/uri.js';

/**
 * Stable identity used as the default for the optional `deferredExports`
 * prop. An inline `= []` default creates a fresh array on every render,
 * which made the workspace-load effect's dependency list change every
 * render and triggered an unconditional `loadModels` → re-render loop
 * (Codex P2 review on PR #164). A module-level constant keeps the
 * reference stable so `useEffect`'s shallow-equality dep check works.
 */
const EMPTY_DEFERRED_EXPORTS: DeferredExportEntry[] = Object.freeze(
  [] as DeferredExportEntry[]
) as DeferredExportEntry[];
const EMPTY_PARSE_ERRORS: ReadonlyMap<string, string[]> = new Map();

/**
 * Stable empty diagnostics array — stable module-level reference so that
 * renderStructurePane's useMemo dep check doesn't false-positive when
 * there are no diagnostics for the focused file.
 */
const EMPTY_RANGE_DIAGNOSTICS: readonly RangeDiagnostic[] = Object.freeze([]);

function normalizeDiagnosticFilePath(uri: string, files: readonly WorkspaceFile[]): string {
  const path = uriToPath(uri);
  const match = files.find(
    (file) =>
      file.path === path || file.name === path || path.endsWith(`/${file.path}`) || path.endsWith(`/${file.name}`)
  );
  return match?.path ?? path;
}

function toParserDiagnostics(messages: readonly string[]): LspDiagnostic[] {
  return messages.map((message, index) => ({
    range: {
      start: { line: index, character: 0 },
      end: { line: index, character: 0 }
    },
    severity: 1,
    source: 'parser',
    message
  }));
}

function countDiagnostics(fileDiagnostics: ReadonlyMap<string, readonly LspDiagnostic[]>): {
  errors: number;
  warnings: number;
  total: number;
} {
  let errors = 0;
  let warnings = 0;
  let total = 0;
  for (const diagnostics of fileDiagnostics.values()) {
    for (const diagnostic of diagnostics) {
      total += 1;
      if (diagnostic.severity === 2) warnings += 1;
      else if (diagnostic.severity === 1) errors += 1;
    }
  }
  return { errors, warnings, total };
}

// ---------------------------------------------------------------------------
// Adapter: TypeGraphNode[] → AdapterDocument
// ---------------------------------------------------------------------------

/**
 * Project the editor store's node array into the AdapterDocument shape.
 *
 * Only `Data`, `Choice`, and `Enum` nodes are included. `superType.$refText`
 * maps to `extends`; Data `attributes` carry through to `AdapterAttribute`
 * directly since their fields match. Choice arms are mapped to the new
 * `choiceOptions` field on `AdapterNode`, preserving the real `ChoiceOption`
 * AST shape (only `typeCall`, no synthesized `name` or `card`).
 *
 * This is a **pure projection** — no side-effects, safe to call inside useMemo.
 */
function graphNodesToAdapterDocument(nodes: readonly { id: string; data: AnyGraphNode }[]): AdapterDocument {
  const adapterNodes: AdapterNode[] = [];
  const namespacesSet = new Set<string>();

  for (const rfNode of nodes) {
    const d = rfNode.data;
    if (!d || typeof d.namespace !== 'string') continue;
    namespacesSet.add(d.namespace);

    // Codex P1 review (e2e-batch fix #1 follow-up): some hydration paths
    // (curated /api/parse round-trips, deferred exports) attach `typeKind`
    // to data but leave `$type` undefined. The `selectedNodeType` selector
    // in this file already handles that fallback chain; the adapter
    // projection MUST mirror it, otherwise nodes recognized as Data/Choice/
    // Enum by selectedNodeType get filtered out here and Structure View
    // shows the stale-selection state for them. Effective $type is the
    // first defined of: $type → typeKind-mapped → node.type-mapped.
    const effectiveType = ((): string | undefined => {
      if (d.$type) return d.$type;
      const k = (d as { typeKind?: string }).typeKind ?? (rfNode as { type?: string }).type;
      if (k === 'data' || k === 'Data') return 'Data';
      if (k === 'choice' || k === 'Choice') return 'Choice';
      if (k === 'enum' || k === 'Enum' || k === 'RosettaEnumeration') return 'RosettaEnumeration';
      if (k === 'record' || k === 'RosettaRecordType') return 'RosettaRecordType';
      if (k === 'typeAlias' || k === 'TypeAlias' || k === 'RosettaTypeAlias') return 'TypeAlias';
      return undefined;
    })();

    // Copilot review (e2e-batch confirmation pass): the previous
    // `Extract<AnyGraphNode, { $type: 'Data' }>` casts asserted nodes
    // belong to the $type-discriminated union — which is exactly what
    // fallback nodes (the ones that took this path because `$type` was
    // MISSING) violate. The asserts happened to work at runtime because
    // only structural fields get read, but the type system was being
    // lied to. Use shape-of-what-we-read structural types instead so
    // (a) TS surfaces a real error if the read shape ever drifts and
    // (b) we're not pretending fallback nodes have a $type field.
    if (effectiveType === 'Data') {
      const dd = d as {
        name: string;
        namespace: string;
        superType?: { $refText?: string };
        attributes?: readonly unknown[];
      };
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Data',
        name: dd.name,
        namespace: dd.namespace,
        extends: dd.superType?.$refText,
        // `attributes` on AstNodeModel<Data> has the same structural shape as
        // AdapterAttribute: { name, typeCall: { type?: { $refText? } }, card: { inf, sup?, unbounded } }
        attributes: (dd.attributes ?? []) as AdapterNode['attributes']
      });
    } else if (effectiveType === 'Choice') {
      // ChoiceOption AST shape: { $type, typeCall, … } — NO `name`, NO `card`.
      // Pass through to the new `choiceOptions` field on AdapterNode unchanged.
      // The adapter's buildChoiceArm consumes the real shape via typeCall only.
      const dc = d as { name: string; namespace: string; attributes?: readonly unknown[] };
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Choice',
        name: dc.name,
        namespace: dc.namespace,
        choiceOptions: (dc.attributes ?? []) as ReadonlyArray<AdapterChoiceOption>
      });
    } else if (effectiveType === 'RosettaEnumeration') {
      const de = d as { name: string; namespace: string; enumValues?: readonly unknown[] };
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Enum',
        name: de.name,
        namespace: de.namespace,
        values: (de.enumValues ?? []) as Array<{ name: string }>
      });
    } else if (effectiveType === 'RosettaRecordType') {
      const dr = d as { name: string; namespace: string };
      adapterNodes.push({ id: rfNode.id, $type: 'Record', name: dr.name, namespace: dr.namespace });
    } else if (effectiveType === 'TypeAlias' || effectiveType === 'RosettaTypeAlias') {
      const ta = d as { name: string; namespace: string };
      adapterNodes.push({ id: rfNode.id, $type: 'TypeAlias', name: ta.name, namespace: ta.namespace });
    }
    // Other kinds (Function, etc.) are not relevant to Structure View; Record and TypeAlias are now projected above.
  }

  const namespaces = Array.from(namespacesSet).map((uri) => ({ uri }));
  return { namespaces, nodes: adapterNodes };
}

/**
 * EditorPage now sources every former prop from context — workspace data from
 * {@link useWorkspace}, LSP handles from {@link useLsp}, and workspace actions
 * from {@link useWorkspaceActions} (all supplied by StudioProviders). It takes
 * no props; the studio build version stays a module constant.
 */
const STUDIO_VERSION = '0.1.0';

const DECL_KEYWORDS = /^(type|enum|func|choice|annotation|metaType|typeAlias|library\s+function|reporting\s+rule)\s+/;

function findDeclarationLine(content: string, name: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimStart();
    if (DECL_KEYWORDS.test(trimmed) && trimmed.includes(name)) {
      return i + 1;
    }
  }
  return 0;
}

function matchesPreviewSourceIdentity(current: FormPreviewTarget, candidate: FormPreviewTarget): boolean {
  if (!current.sourceUri || current.sourceUri !== candidate.sourceUri || current.kind !== candidate.kind) {
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

/**
 * Render an unmapped Langium `$type` as a human-friendly kind label.
 * Strips the `Rosetta` prefix and inserts spaces before interior capital
 * letters, then lowercases the tail so the result reads as sentence case
 * (`RosettaTypeAlias` → `Type alias`, `RosettaExternalRuleSource` →
 * `External rule source`). Used as the fallback in
 * `structureUnsupportedSelectedType`'s KIND_LABEL map so any newly-added
 * Rosetta AST node type produces a passable label without code change.
 */
function formatUnknownKind(rawType: string): string {
  const stripped = rawType.startsWith('Rosetta') ? rawType.slice('Rosetta'.length) : rawType;
  // Insert a space before each interior capital, then lowercase everything
  // except the first character.
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0) + spaced.slice(1).toLowerCase();
}

function getFileKindBadge(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  switch (ext) {
    case 'rosetta':
      return 'DSL';
    case 'json':
      return 'JSON';
    case 'yaml':
    case 'yml':
      return 'YAML';
    case 'ts':
      return 'TS';
    case 'js':
      return 'JS';
    case 'md':
      return 'MD';
    default:
      return ext ? ext.slice(0, 4).toUpperCase() : 'FILE';
  }
}

function resolveResponsiveLayoutDirection(
  width: number,
  height: number,
  previous: Extract<LayoutDirection, 'LR' | 'TB'>
): Extract<LayoutDirection, 'LR' | 'TB'> {
  if (width <= 0 || height <= 0) return previous;
  if (width > height) return 'LR';
  if (height > width) return 'TB';
  return previous;
}

function FileTabStrip({
  files,
  activeFile,
  onSelectFile
}: {
  files: readonly WorkspaceFile[];
  activeFile: string | undefined;
  onSelectFile: (path: string) => void;
}) {
  const userFiles = files.filter((f) => !f.readOnly);
  if (userFiles.length === 0) return null;

  return (
    <div className="studio-topbar__tabs">
      {userFiles.map((f) => (
        <button
          key={f.path}
          type="button"
          className={`studio-topbar__tab ${f.path === activeFile ? 'is-active' : ''}`}
          onClick={() => onSelectFile(f.path)}
          title={f.path}
        >
          <span className={`studio-topbar__tab-dot ${f.dirty ? 'is-dirty' : ''}`} />
          <span className="studio-topbar__tab-name">{f.name}</span>
          <span className="studio-topbar__tab-badge" aria-hidden="true">
            {getFileKindBadge(f.name)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ExplorePerspective() {
  // Workspace model data — formerly props, now from WorkspaceProvider.
  const workspace = useWorkspace();
  const { models, parsedModels, files } = workspace;
  const deferredExports: DeferredExportEntry[] = workspace.deferredExports ?? EMPTY_DEFERRED_EXPORTS;
  const parseErrors = workspace.parseErrors ?? EMPTY_PARSE_ERRORS;
  const workspaceId = workspace.workspaceId ?? 'default';
  const workspaceKind = workspace.workspaceKind;
  const workspaceName = workspace.workspaceName;
  const fileCount = workspace.fileCount;
  const studioVersion = STUDIO_VERSION;

  // LSP handles — formerly props, now from LspProvider.
  const { lspClient: lspClientValue, transportState, reconnect } = useLsp();
  const lspClient = lspClientValue ?? undefined;
  const onReconnect = reconnect;

  // Workspace actions — formerly props, now from the actions context.
  const { onFilesChange, onClose, onSwitchWorkspace, onCreateWorkspace } = useWorkspaceActions();

  const graphRef = useRef<RuneTypeGraphRef>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const sourceEditorRef = useRef<SourceEditorRef>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  // Curated Models modal — wired from the ActivityBar's Database button.
  // The Welcome screen renders <ModelLoader /> inline; inside EditorPage we
  // reuse the same component in a Dialog so the affordance stays discoverable
  // once a workspace is open. A richer bottom-bar multi-selector is deferred
  // to a future task; the modal is the minimal landing.
  const [showCuratedModels, setShowCuratedModels] = useState(false);
  // Topbar workspace dropdown — populated lazily when the popover opens
  // so we don't read IDB on every EditorPage mount. Recents list is filtered
  // to exclude the current workspace (no point switching to where you are).
  const [workspaceMenuRecents, setWorkspaceMenuRecents] = useState<RecentWorkspaceRecord[]>([]);
  const handleWorkspaceMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        void listRecents().then((rows) => {
          setWorkspaceMenuRecents(rows.filter((r) => r.id !== workspaceId));
        });
      }
    },
    [workspaceId]
  );
  const [groupedLayout, setGroupedLayout] = useState(false);
  const [graphLayoutDirection, setGraphLayoutDirection] = useState<Extract<LayoutDirection, 'LR' | 'TB'>>('LR');
  // Ref so ResizeObserver callbacks always see the latest value without stale closures.
  const groupedLayoutRef = useRef(groupedLayout);
  groupedLayoutRef.current = groupedLayout;
  const graphLayoutDirectionRef = useRef<Extract<LayoutDirection, 'LR' | 'TB'>>('LR');
  // File tabs are an Explore-only affordance (perspective-registry.showsFileTabs).
  // Hide them when the user switches to Git / Export / Settings / Workspaces.
  const activePerspective = usePerspectiveStore((s) => s.activePerspective);
  const focusMode = useEditorStore((s) => s.focusMode);
  const storeToggleFocusMode = useEditorStore((s) => s.toggleFocusMode);
  const [activeEditorFile, setActiveEditorFile] = useState<string | undefined>(undefined);
  const [inspectorFocusNonce, setInspectorFocusNonce] = useState(0);
  const pendingRevealRef = useRef<{ line: number; filePath: string } | null>(null);
  const linkDocumentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates corpus models returned by linkDocument so they can be merged into
  // the graph. Reset when a new workspace is loaded.
  const corpusModelsRef = useRef<RosettaModel[]>([]);
  const workspaceIdRef = useRef(workspaceId);
  const modelsRef = useRef(models);
  const navigationHistoryRef = useRef<string[]>([]);
  const { showToast } = useStudioToast();
  const pendingDisplayFileRef = useRef<Map<string, (view: import('@codemirror/view').EditorView | null) => void>>(
    new Map()
  );
  const displayFileTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Git sync status — only meaningful for git-backed workspaces.
  // Uses subscribeToEngine so the subscription survives async engine creation:
  // the badge will receive state even if the engine is created after this effect
  // runs (which is the common case on first boot).
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    if (workspaceKind !== 'git-backed') return;
    // Reset to null immediately on workspace switch so the badge never shows
    // the previous workspace's status while the new engine initialises.
    setSyncStatus(null);
    return subscribeToEngine(workspaceId, setSyncStatus);
  }, [workspaceId, workspaceKind]);

  const storeNodes = useEditorStore((s) => s.nodes);
  const storeEdges = useEditorStore((s) => s.edges);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const visibility = useEditorStore((s) => s.visibility);
  const expandedNamespaces = visibility.expandedNamespaces;
  const hiddenNodeIds = visibility.hiddenNodeIds;

  const storeSelectNode = useEditorStore((s) => s.selectNode);
  const storeToggleNamespace = useEditorStore((s) => s.toggleNamespace);
  const storeExpandAllNamespaces = useEditorStore((s) => s.expandAllNamespaces);
  const storeCollapseAllNamespaces = useEditorStore((s) => s.collapseAllNamespaces);
  const storeLayoutEngine = useEditorStore((s) => s.layoutOptions.engine ?? 'elk');

  // Structure View store — expansion state for the structure pane
  const expansionMap = useStructureViewStore((s) => s.expansionMap);
  // Row-level expansion toggle (Phase 13 / Finding 1). Wired into StructureView
  // so the per-row chevron rendered by DataNode can flip its store entry.
  const toggleExpansion = useStructureViewStore((s) => s.toggleExpansion);

  // Derive $type of the currently-selected node to gate which ids get forwarded
  // to StructureView as focusedTypeId. Using a separate selector avoids breaking
  // zustand's referential-equality optimisation that would fire on every nodes mutation.
  //
  // Defensive derivation (e2e-batch fix): the curated/deferred-export path
  // attaches $type to data.$type, but earlier hydration variants stored kind
  // info on data.typeKind or only on the React Flow node.type. Fall through to
  // every known source so curated-loaded nodes also derive a valid type and
  // route through to Structure View (issue #1 — curated bundles showed empty
  // structure pane because selectedNodeType was null even though Inspector
  // populated from the same node).
  const selectedNodeType = useEditorStore((s) => {
    if (!s.selectedNodeId) return null;
    const node = s.nodes.find((n) => n.id === s.selectedNodeId);
    if (!node) return null;
    const d = node.data as { $type?: string; typeKind?: string } | undefined;
    if (d?.$type) return d.$type;
    // Map React Flow node.type (lowercase: 'data', 'choice', 'enum', 'func',
    // 'record', 'typeAlias', 'basicType', 'annotation') or data.typeKind back
    // to the Langium AST $type the StructureView gate + the unsupported-kind
    // empty state both expect. Copilot review (e2e-batch adversarial) flagged
    // the earlier 3-kind fallback as incomplete — it returned null for non-
    // Data RF node types, so the contextual "X is a Function" empty state
    // never fired for curated-loaded functions/records/etc.
    const kind = d?.typeKind ?? (node as { type?: string }).type;
    switch (kind) {
      case 'data':
      case 'Data':
        return 'Data';
      case 'choice':
      case 'Choice':
        return 'Choice';
      case 'enum':
      case 'Enum':
      case 'RosettaEnumeration':
        return 'RosettaEnumeration';
      case 'func':
      case 'Function':
      case 'RosettaFunction':
        return 'RosettaFunction';
      case 'record':
      case 'Record':
      case 'RosettaRecordType':
        return 'RosettaRecordType';
      case 'typeAlias':
      case 'TypeAlias':
      case 'RosettaTypeAlias':
        return 'RosettaTypeAlias';
      case 'basicType':
      case 'BasicType':
      case 'RosettaBasicType':
        return 'RosettaBasicType';
      case 'annotation':
      case 'Annotation':
        return 'Annotation';
      default:
        return null;
    }
  });
  const storeSetLayoutEngine = useEditorStore((s) => s.setLayoutEngine);
  const layoutEngineRef = useRef(storeLayoutEngine);
  layoutEngineRef.current = storeLayoutEngine;
  const previewSelectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  const previewSelectedTarget = usePreviewStore((s) => s.selectedTarget);
  const setPreviewTargets = usePreviewStore((s) => s.setAvailableTargets);
  const selectPreviewTarget = usePreviewStore((s) => s.selectTarget);

  // Structure View: drag-source state for the NamespaceExplorerPanel palette.
  const dragSource = useStructureViewStore((s) => s.dragSource);
  const setDragSource = useStructureViewStore((s) => s.setDragSource);
  const clearDragSource = useStructureViewStore((s) => s.clearDragSource);
  const updateGraphLayoutDirection = useCallback((nextDirection: Extract<LayoutDirection, 'LR' | 'TB'>) => {
    graphLayoutDirectionRef.current = nextDirection;
    setGraphLayoutDirection((prev) => (prev === nextDirection ? prev : nextDirection));
    return nextDirection;
  }, []);
  const getResponsiveGraphDirection = useCallback((): Extract<LayoutDirection, 'LR' | 'TB'> => {
    const rect = graphContainerRef.current?.getBoundingClientRect();
    if (!rect) return graphLayoutDirectionRef.current;
    const nextDirection = resolveResponsiveLayoutDirection(rect.width, rect.height, graphLayoutDirectionRef.current);
    return updateGraphLayoutDirection(nextDirection);
  }, [updateGraphLayoutDirection]);
  const syncResponsiveGraphLayout = useCallback(() => {
    const rect = graphContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const direction = resolveResponsiveLayoutDirection(rect.width, rect.height, graphLayoutDirectionRef.current);
    if (direction !== graphLayoutDirectionRef.current) {
      updateGraphLayoutDirection(direction);
      graphRef.current?.relayout({
        engine: layoutEngineRef.current,
        direction,
        groupByInheritance: groupedLayoutRef.current
      });
      return;
    }
    graphRef.current?.fitView();
  }, [updateGraphLayoutDirection]);

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const frameId = window.requestAnimationFrame(() => {
      syncResponsiveGraphLayout();
    });
    const observer = new ResizeObserver(() => {
      syncResponsiveGraphLayout();
    });
    const handleWindowResize = () => {
      syncResponsiveGraphLayout();
    };
    observer.observe(el);
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [syncResponsiveGraphLayout]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!storeNodes.some((node) => node.id === selectedNodeId)) return;
    graphRef.current?.relayout({
      engine: layoutEngineRef.current,
      direction: getResponsiveGraphDirection(),
      groupByInheritance: groupedLayoutRef.current
    });
  }, [getResponsiveGraphDirection, selectedNodeId, storeNodes]);

  const resolvedModelFiles = useMemo(() => {
    if (parsedModels && parsedModels.length > 0) {
      return parsedModels;
    }
    return models.flatMap((model, index) => {
      const file = files[index];
      return file ? [{ filePath: file.path, model }] : [];
    });
  }, [files, models, parsedModels]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  useEffect(() => {
    // Hydrated curated docs live only in `corpusModelsRef` (the routed parse
    // intentionally keeps them out of workspace `models[]`). Clear that cache
    // only when the workspace itself changes; clearing on every parse rerender
    // makes Structure/Inspector populate for a frame and then drop back to the
    // deferred placeholder graph.
    if (linkDocumentTimerRef.current) clearTimeout(linkDocumentTimerRef.current);
    corpusModelsRef.current = [];
  }, [workspaceId]);

  useEffect(() => {
    // loadDeferredExports only stashes entries on the store (no node
    // mutation) — Codex P2 review of PR #164: doing both in one set()
    // avoids the "mixed stale graph in undo history" state. Then call
    // loadModels unconditionally — even with `models: []` — so it
    // materializes the curated placeholder nodes from the stashed
    // deferredExports. Hydrated curated docs merged through linkDocument live
    // in `corpusModelsRef`; keep them in the graph across same-workspace parse
    // rerenders because the routed parser does not echo them back in
    // `workspace.models`.
    useEditorStore.getState().loadDeferredExports(deferredExports);
    useEditorStore.getState().loadModels([...models, ...corpusModelsRef.current] as unknown[]);
  }, [models, deferredExports, workspaceId]);

  const selectedNodeData: AnyGraphNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = storeNodes.find((n) => n.id === selectedNodeId);
    return (node?.data as unknown as AnyGraphNode) ?? null;
  }, [selectedNodeId, storeNodes]);
  const selectedNodeDataRef = useRef<AnyGraphNode | null>(selectedNodeData);
  selectedNodeDataRef.current = selectedNodeData;

  const previewTargets: FormPreviewTarget[] = useMemo(() => {
    const sourceByTargetId = new Map<string, Pick<FormPreviewTarget, 'sourceUri' | 'sourceIndex' | 'sourceRange'>>();
    for (const entry of resolvedModelFiles) {
      const model = entry.model;
      const modelUriValue = (
        model as unknown as {
          $document?: { uri?: { path?: string; toString(): string } };
        }
      ).$document?.uri;
      const sourceUri = pathToUri(modelUriValue?.path ?? modelUriValue?.toString() ?? entry.filePath);
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
          sourceUri,
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
  }, [resolvedModelFiles, storeNodes]);

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
    const renamedTarget = previewTargets.find((target) => matchesPreviewSourceIdentity(previewSelectedTarget, target));
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

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    // Increments a nonce to signal the inspector to re-focus.
    // No external resource is acquired here, so no cleanup is required.
    setInspectorFocusNonce((current) => current + 1);
    // react-doctor/effect-needs-cleanup: intentional — pure state update, no subscription.
  }, [selectedNodeId]);

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
    const textRegion = nodeData['$textRegion'] as { range?: { start?: { line?: number } } } | undefined;
    const range = cstNode?._rangeCache ?? cstNode?.range ?? textRegion?.range;
    if (range?.start?.line !== undefined && filePath) {
      pendingRevealRef.current = { line: range.start.line + 1, filePath };
    } else if (filePath) {
      const typeName = (nodeData as { name?: string }).name;
      const file = files.find((f) => f.path === filePath);
      const line = typeName && file ? findDeclarationLine(file.content, typeName) : 0;
      pendingRevealRef.current = { line: line > 0 ? line : 1, filePath };
    }

    // Trigger on-demand linking for the selected node's document (ADR 007 Phase 2).
    // Skip system:// URIs (base types are always parsed, never deferred).
    // Debounced so rapid keyboard navigation doesn't queue many worker requests.
    let cancelled = false;
    if (filePath && !filePath.startsWith('system://')) {
      const requestWorkspaceId = workspaceId;
      if (linkDocumentTimerRef.current) clearTimeout(linkDocumentTimerRef.current);
      linkDocumentTimerRef.current = setTimeout(() => {
        void linkDocument(filePath).then((result) => {
          if (cancelled || workspaceIdRef.current !== requestWorkspaceId || result.newModels.length === 0) {
            return;
          }
          if (result.newModels.length > 0) {
            corpusModelsRef.current = [...corpusModelsRef.current, ...result.newModels];
            // loadModels now re-merges the deferred-export placeholder nodes
            // automatically from store state — no need to call
            // loadDeferredExports after this. The store-owned deferredExports
            // state was populated when /api/parse responded.
            useEditorStore.getState().loadModels([...modelsRef.current, ...corpusModelsRef.current] as unknown[]);
          }
        });
      }, 150);
    }
    return () => {
      cancelled = true;
      if (linkDocumentTimerRef.current) clearTimeout(linkDocumentTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedNodeData, workspaceId]);

  // Re-link the selected node after an on-demand hydration completes.
  //
  // The selection effect above fires once when the node is first selected and
  // calls linkDocument 150ms later. If the node's namespace wasn't in the
  // worker yet (deferred / curated), that link fails silently — the worker has
  // no AST for the file yet. The on-demand hydration parse then completes and
  // triggers markNamespacesHydrated, which bumps hydrationNonce. This effect
  // reacts to that nonce change and re-links immediately (no 150ms debounce
  // needed — we're not racing file edits here, the worker is fully ready).
  // linkDocument is safe to re-run for an already-linked selection, but this
  // effect must not depend on the selected node object's identity. `loadModels`
  // can rebuild placeholder node objects during hydration, and keying this
  // effect on `selectedNodeData` would cancel the first successful re-link and
  // immediately issue a second one that returns `newModels: []`.
  const hydrationNonce = useEditorStore((s) => s.hydrationNonce);
  useEffect(() => {
    if (hydrationNonce === 0 || !selectedNodeId) return;
    const nodeData = selectedNodeDataRef.current;
    if (!nodeData) return;
    const filePath = resolveNodeFile(nodeData);
    if (!filePath || filePath.startsWith('system://')) return;
    const requestWorkspaceId = workspaceId;
    let cancelled = false;
    void linkDocument(filePath).then((result) => {
      if (cancelled || workspaceIdRef.current !== requestWorkspaceId || result.newModels.length === 0) return;
      corpusModelsRef.current = [...corpusModelsRef.current, ...result.newModels];
      useEditorStore.getState().loadModels([...modelsRef.current, ...corpusModelsRef.current] as unknown[]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationNonce, selectedNodeId, workspaceId]);

  const functionScope: FunctionScope = useMemo(() => {
    const d = selectedNodeData as any;
    if (!d || d.$type !== 'RosettaFunction') {
      return { inputs: [], output: null, aliases: [] };
    }
    return {
      inputs: (d.inputs ?? []).map((p: any) => ({
        name: p.name,
        typeName: p.typeCall?.type?.$refText,
        cardinality: p.card ? `(${p.card.inf}..${p.card.unbounded ? '*' : (p.card.sup ?? p.card.inf)})` : undefined
      })),
      output: d.output?.typeCall?.type?.$refText ? { name: 'output', typeName: d.output.typeCall.type.$refText } : null,
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
      setActiveEditorFile((prev) => (prev === undefined ? prev : undefined));
      return;
    }

    const availablePaths = new Set(files.map((file) => file.path));
    const preferredFile = files.find((file) => !file.readOnly) ?? files[0]!;

    setActiveEditorFile((prev) => {
      if (prev && availablePaths.has(prev)) {
        return prev;
      }
      return preferredFile.path;
    });
  }, [files]);

  const handleSourceChange = useCallback(
    (path: string, content: string) => {
      const updatedFiles = filesRef.current.map((f) => (f.path === path ? { ...f, content, dirty: true } : f));
      onFilesChange?.(updatedFiles);
    },
    [onFilesChange]
  );

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
    // Include deferred corpus entries so linkDocument can resolve their file paths.
    for (const entry of deferredExports) {
      for (const exp of entry.exports) {
        const nodeId = `${entry.namespace}::${exp.name}`;
        if (!map.has(nodeId)) map.set(nodeId, entry.filePath);
      }
    }
    return map;
  }, [resolvedModelFiles, deferredExports]);

  const resolveNodeFile = useCallback(
    (nodeData: AnyGraphNode): string | undefined => {
      const d = nodeData as any;
      const docPath = d.$container?.$document?.uri?.path as string | undefined;
      if (docPath) {
        const match = files.find((f) => f.path === docPath || f.path.endsWith(docPath) || docPath.endsWith(f.path));
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
    setActiveEditorFile(filePath);
  }, []);

  const handleExplorerSelectNode = useCallback(
    (nodeId: string) => {
      storeSelectNode(nodeId, { reapplyFocusMode: true });
      // On-demand curated hydration: only deferred (list-only, un-hydrated
      // curated) nodes need a server round-trip; user types and already-
      // hydrated curated types resolve locally.
      const selectedNode = useEditorStore.getState().nodes.find((n) => n.id === nodeId);
      const data = selectedNode?.data as { namespace?: string; deferred?: boolean } | undefined;
      if (data?.deferred && data.namespace) {
        useEditorStore.getState().requestNamespaceHydration(data.namespace);
      }
    },
    [storeSelectNode]
  );

  // Expanding a namespace header is an equally natural browse gesture that
  // should trigger hydration. Wrap the bare toggle action so we can also
  // queue the namespace for on-demand hydration before toggling visibility.
  const handleToggleNamespace = useCallback(
    (namespace: string) => {
      const needsHydration = useEditorStore.getState().nodes.some((n) => {
        const d = n.data as { namespace?: string; deferred?: boolean };
        return d.namespace === namespace && d.deferred === true;
      });
      if (needsHydration) useEditorStore.getState().requestNamespaceHydration(namespace);
      storeToggleNamespace(namespace);
    },
    [storeToggleNamespace]
  );

  const shouldCenterNavigationTarget = useCallback(
    (nodeId: string) => {
      if (!focusMode) return true;
      const hasIncidentEdge = storeEdges.some((edge) => edge.source === nodeId || edge.target === nodeId);
      if (!hasIncidentEdge) return true;
      return useEditorStore.getState().visibility.hiddenNodeIds.size === 0;
    },
    [focusMode, storeEdges]
  );

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const targetNode = storeNodes.find((n) => n.id === nodeId);
      const exists = Boolean(targetNode);
      if (!exists) {
        const shortName = nodeId.includes('::') ? nodeId.split('::').pop() : nodeId;
        showToast({
          description: `Type "${shortName}" not loaded — load the file containing this type`,
          variant: 'destructive',
          duration: 3000
        });
        return;
      }
      const current = useEditorStore.getState().selectedNodeId;
      if (current) {
        navigationHistoryRef.current.push(current);
        if (navigationHistoryRef.current.length > 100) navigationHistoryRef.current.shift();
      }
      storeSelectNode(nodeId, { reapplyFocusMode: true });
      const targetData = targetNode?.data as { namespace?: string; deferred?: boolean } | undefined;
      if (targetData?.deferred && targetData.namespace) {
        useEditorStore.getState().requestNamespaceHydration(targetData.namespace);
      }
      if (!focusMode && shouldCenterNavigationTarget(nodeId)) {
        graphRef.current?.focusNode(nodeId);
      }
    },
    [focusMode, showToast, shouldCenterNavigationTarget, storeNodes, storeSelectNode]
  );

  const navigateBack = useCallback(() => {
    const prev = navigationHistoryRef.current.pop();
    if (!prev) return;
    const exists = storeNodes.some((n) => n.id === prev);
    if (!exists) {
      showToast({
        description: `Previous node "${prev}" is no longer in the graph`,
        variant: 'destructive',
        duration: 3000
      });
      return;
    }
    storeSelectNode(prev, { reapplyFocusMode: true });
    if (!focusMode && shouldCenterNavigationTarget(prev)) {
      graphRef.current?.focusNode(prev);
    }
  }, [focusMode, showToast, shouldCenterNavigationTarget, storeSelectNode, storeNodes]);

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
    async (serialized: Map<string, string>) => {
      // Smart-merge serialized output into the original source so we don't
      // erase root elements the serializer can't emit (Function bodies,
      // TypeAlias, Rule, Report, RecordType, BasicType, …). See
      // `mergeSerializedIntoSource` and PR #221's Codex P1 review for the
      // history. Wholesale-overwriting `f.content` with `text` was a
      // data-loss regression strictly worse than the bug it fixed.
      const filesAtStart = filesRef.current;
      const mergedEntries = await Promise.all(
        filesAtStart.map(async (f) => {
          for (const [ns, text] of serialized) {
            if (namespaceToFile.get(ns) !== f.path) continue;
            const merged = await mergeSerializedIntoSource(f.content, text);
            // Avoid marking the file dirty when the merge collapsed to a
            // no-op (effect re-fired but content actually matched). This
            // mirrors the visual-editor source-sync's own equality guard.
            if (merged === f.content) return f;
            return { ...f, content: merged, dirty: true };
          }
          return f;
        })
      );
      // Discard the result if the underlying files array changed under us
      // mid-await — the next handler invocation will produce a fresh merge
      // from the up-to-date baseline.
      if (filesRef.current !== filesAtStart) return;
      const changed = mergedEntries.some((entry, i) => entry !== filesAtStart[i]);
      if (!changed) return;
      onFilesChange?.(mergedEntries);
    },
    [namespaceToFile, onFilesChange]
  );

  // Source-text sync — fires onModelChanged whenever inspector/structure edits
  // change the editor-store, regardless of which center pane is mounted.
  // Previously this subscription lived inside RuneTypeGraph, which is only
  // mounted when the Graph pane is active; Structure-pane edits never reached
  // the source pane (2026-05-21, fix/inspector-source-sync).
  useModelSourceSync(storeNodes, storeEdges, handleModelChanged);

  useLspDiagnosticsBridge(lspClient);
  const { fileDiagnostics } = useDiagnosticsStore();
  const combinedFileDiagnostics = useMemo(() => {
    const merged = new Map<string, LspDiagnostic[]>();
    for (const [uri, diagnostics] of fileDiagnostics) {
      merged.set(normalizeDiagnosticFilePath(uri, files), [...diagnostics]);
    }
    for (const [filePath, messages] of parseErrors) {
      if (messages.length === 0) continue;
      const existing = merged.get(filePath) ?? [];
      merged.set(filePath, [...toParserDiagnostics(messages), ...existing]);
    }
    return merged;
  }, [fileDiagnostics, files, parseErrors]);
  const combinedDiagnostics = useMemo(() => countDiagnostics(combinedFileDiagnostics), [combinedFileDiagnostics]);

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
      const file = files.find((f) => f.path === path || f.path.endsWith(fileName) || path.endsWith(f.path));
      if (!file) {
        // eslint-disable-next-line no-console
        console.warn(`[displayFile] No workspace file found matching URI: ${uri} (fileName: ${fileName})`);
        return null;
      }
      openFileInSource(file.path);
      return new Promise<import('@codemirror/view').EditorView | null>((resolve) => {
        const existing = pendingDisplayFileRef.current.get(file.path);
        if (existing) existing(null);
        pendingDisplayFileRef.current.set(file.path, resolve);
        const timerId = setTimeout(() => {
          displayFileTimersRef.current.delete(timerId);
          if (pendingDisplayFileRef.current.has(file.path)) {
            pendingDisplayFileRef.current.delete(file.path);
            // eslint-disable-next-line no-console
            console.warn(`[displayFile] Timed out waiting for EditorView: "${file.path}"`);
            resolve(null);
          }
        }, 2000);
        displayFileTimersRef.current.add(timerId);
      });
    });
    return () => {
      unsub();
      for (const id of displayFileTimersRef.current) clearTimeout(id);
      displayFileTimersRef.current.clear();
      // Resolve any pending displayFile promises so LSP client doesn't hang.
      for (const resolve of pendingDisplayFileRef.current.values()) resolve(null);
      pendingDisplayFileRef.current.clear();
    };
  }, [lspClient, files, openFileInSource]);

  const handleEditorViewCreated = useCallback((filePath: string, view: import('@codemirror/view').EditorView) => {
    const resolve = pendingDisplayFileRef.current.get(filePath);
    if (resolve) {
      pendingDisplayFileRef.current.delete(filePath);
      resolve(view);
    }
  }, []);

  const sourceEditorFiles = useMemo(() => {
    const resolvedActiveFile =
      (activeEditorFile ? files.find((file) => file.path === activeEditorFile) : undefined) ??
      files.find((file) => !file.readOnly) ??
      files[0];
    return resolvedActiveFile ? [resolvedActiveFile] : [];
  }, [activeEditorFile, files]);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    if (sourceEditorFiles.some((f) => f.path === pending.filePath)) {
      pendingRevealRef.current = null;
      requestAnimationFrame(() => {
        sourceEditorRef.current?.revealLine(pending.line, pending.filePath);
      });
    }
  }, [sourceEditorFiles, selectedNodeId]);

  const getSerializedFiles = useCallback((): Map<string, string> => {
    const rosettaText = graphRef.current?.exportRosetta?.();
    if (!rosettaText || rosettaText.size === 0) return new Map();
    return rosettaText;
  }, []);

  const validateModelForExport = useCallback((): string[] => {
    const warnings: string[] = [];
    if (combinedDiagnostics.errors > 0) {
      warnings.push(`Model has ${combinedDiagnostics.errors} error(s) that may affect code generation output quality.`);
    }
    if (combinedDiagnostics.warnings > 0) {
      warnings.push(`Model has ${combinedDiagnostics.warnings} warning(s).`);
    }
    const serialized = getSerializedFiles();
    if (serialized.size === 0) warnings.push('No user-authored files found to export.');
    return warnings;
  }, [combinedDiagnostics.errors, combinedDiagnostics.warnings, getSerializedFiles]);

  const availableTypes: TypeOption[] = useMemo(() => {
    const builtinOptions: TypeOption[] = BUILTIN_TYPES.map((t) => ({
      value: `builtin::${t}`,
      label: t,
      kind: 'builtin' as const
    }));
    const graphOptions: TypeOption[] = storeNodes.map((n) => ({
      value: n.id,
      label: n.data.name,
      kind: resolveNodeKind(n) as TypeOption['kind'],
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
      updateAttribute: (nodeId, oldN, newN, type, card) => s().updateAttribute(nodeId, oldN, newN, type, card),
      reorderAttribute: (nodeId, from, to) => s().reorderAttribute(nodeId, from, to),
      setInheritance: (childId, parentId) => s().setInheritance(childId, parentId),
      addEnumValue: (nodeId, name, display) => s().addEnumValue(nodeId, name, display),
      removeEnumValue: (nodeId, name) => s().removeEnumValue(nodeId, name),
      updateEnumValue: (nodeId, oldN, newN, display) => s().updateEnumValue(nodeId, oldN, newN, display),
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
    graphRef.current?.relayout({
      engine: layoutEngineRef.current,
      direction: getResponsiveGraphDirection(),
      groupByInheritance: groupedLayout
    });
  }, [getResponsiveGraphDirection, groupedLayout]);
  const handleToggleFocusMode = useCallback(() => {
    const nextFocusMode = !focusMode;
    storeToggleFocusMode();
    if (!nextFocusMode) {
      setTimeout(() => {
        graphRef.current?.relayout({
          engine: layoutEngineRef.current,
          direction: graphLayoutDirectionRef.current,
          groupByInheritance: groupedLayoutRef.current
        });
      }, 0);
    }
  }, [focusMode, storeToggleFocusMode]);
  const handleToggleGroupedLayout = useCallback(() => {
    setGroupedLayout((prev) => {
      const next = !prev;
      setTimeout(() => {
        graphRef.current?.relayout({
          engine: layoutEngineRef.current,
          direction: getResponsiveGraphDirection(),
          groupByInheritance: next
        });
      }, 0);
      return next;
    });
  }, [getResponsiveGraphDirection]);

  // ---------- panel components rendered inside dockview ----------

  // NamespaceExplorerPanel manages its own scrolling — the virtualizer
  // (useVirtualTree) must own the scroll element to compute viewport
  // metrics. Wrapping it in a Radix <ScrollArea> creates a double
  // scroll container: the inner virtualized div grows to its natural
  // size and never scrolls, while the outer Radix viewport scrolls
  // with `scrollbar-width: none` (so no native bar shows) and only
  // lazy-mounts its custom scrollbar on hover — producing the
  // "looks nice but un-clickable" scrollbar the user reported.
  const FileTreePanelMounted = useCallback(
    () => (
      <div className="h-full">
        <NamespaceExplorerPanel
          nodes={storeNodes}
          expandedNamespaces={expandedNamespaces}
          hiddenNodeIds={hiddenNodeIds}
          selectedNodeId={selectedNodeId}
          onToggleNamespace={handleToggleNamespace}
          onExpandAll={storeExpandAllNamespaces}
          onCollapseAll={storeCollapseAllNamespaces}
          onSelectNode={handleExplorerSelectNode}
          dragSourceId={dragSource?.typeId}
          onSetDragSource={setDragSource}
          onClearDragSource={clearDragSource}
        />
      </div>
    ),
    [
      storeNodes,
      expandedNamespaces,
      hiddenNodeIds,
      selectedNodeId,
      handleToggleNamespace,
      storeExpandAllNamespaces,
      storeCollapseAllNamespaces,
      handleExplorerSelectNode,
      dragSource,
      setDragSource,
      clearDragSource
    ]
  );

  // workspace.editor and workspace.inspector are rendered inside CenterStackPanel.
  // These stubs are kept so the dockview component registry remains complete,
  // but they are not part of the active layout.
  const SourceEditorPanelMounted = useCallback(() => <div data-testid="panel-editor" />, []);

  const InspectorPanelMounted = useCallback(() => <div data-testid="panel-inspector" />, []);

  const ProblemsPanelMounted = useCallback(
    () => (
      <DiagnosticsPanel
        fileDiagnostics={combinedFileDiagnostics}
        onNavigate={(uri) => {
          const normPath = uri.startsWith('file://') ? uri.slice(7) : uri;
          const fileName = normPath.split('/').pop() ?? normPath;
          const file = files.find((f) => f.path === normPath || f.name === fileName || normPath.endsWith(f.path ?? ''));
          if (file) openFileInSource(file.path ?? file.name);
        }}
      />
    ),
    [combinedFileDiagnostics, files, openFileInSource]
  );

  // Stable adapter for CodePreviewPanel cross-file source-map navigation.
  const sourceEditorHandle = useMemo<SourceEditorHandle>(
    () => ({
      revealPosition: (position, filePath) => sourceEditorRef.current?.revealPosition(position, filePath)
    }),
    // Intentionally stable — reads ref.current at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // CodePreviewPanel is a pure-display consumer of useCodegenStore. The codegen
  // worker is owned by CodegenProvider (mounted by StudioProviders), which feeds
  // results into the store; the panel renders from that store unconditionally.
  const CodePreviewPanelMounted = useCallback(
    () => <CodePreviewPanel sourceEditorRef={sourceEditorHandle} files={files} />,
    [files, sourceEditorHandle]
  );

  const FormPreviewPanelMounted = useCallback(() => <FormPreviewPanelShell />, []);

  const renderGraphPane = useCallback(
    () => (
      <section
        aria-label="Graph"
        data-testid="panel-visualPreview"
        data-component="workspace.visualPreview"
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <div
          role="toolbar"
          aria-label="Graph toolbar"
          className="glass-toolbar flex flex-wrap items-center gap-1 border-b border-border px-2 py-1"
        >
          <Button variant="secondary" size="xs" onClick={handleFitView} title="Fit to view">
            <Maximize2 />
            Fit View
          </Button>
          <Button variant="secondary" size="xs" onClick={handleRelayout} title="Re-run auto layout">
            <LayoutGrid />
            Re-layout
          </Button>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Button
            variant={focusMode ? 'default' : 'secondary'}
            data-variant={focusMode ? 'default' : 'secondary'}
            aria-pressed={focusMode}
            size="xs"
            onClick={handleToggleFocusMode}
            title="Show the selected type, its inheritance chain, and its direct references only"
          >
            <Network />
            Focus
          </Button>
          <Button
            variant={groupedLayout ? 'default' : 'secondary'}
            data-variant={groupedLayout ? 'default' : 'secondary'}
            aria-pressed={groupedLayout}
            size="xs"
            onClick={handleToggleGroupedLayout}
            title="Group by inheritance trees"
          >
            <LayoutGrid />
            Grouped
          </Button>
        </div>
        <div ref={graphContainerRef} className="min-h-0 flex-1 relative studio-graph-canvas">
          <RuneTypeGraph
            ref={graphRef}
            config={{
              // 'LR' is a safe default — the ResizeObserver corrects direction on the first frame
              // once the container is measured. The container dimensions aren't available yet here.
              layout: { engine: storeLayoutEngine, direction: graphLayoutDirection, groupByInheritance: groupedLayout },
              showControls: true,
              showMinimap: false,
              readOnly: false
            }}
            callbacks={{
              onNodeDoubleClick: () => {},
              onModelChanged: handleModelChanged,
              onLayoutEngineChange: storeSetLayoutEngine,
              onNavigateToType: navigateToNode
            }}
          />
        </div>
      </section>
    ),
    [
      focusMode,
      groupedLayout,
      graphLayoutDirection,
      handleFitView,
      handleModelChanged,
      handleRelayout,
      handleToggleFocusMode,
      handleToggleGroupedLayout,
      navigateToNode
    ]
  );

  const renderSourcePane = useCallback(() => {
    const activeFile = sourceEditorFiles[0];
    const fileExt = activeFile?.name.includes('.') ? `.${activeFile.name.split('.').pop()}` : null;
    const lineEnding = activeFile?.content.includes('\r\n') ? 'CRLF' : 'LF';
    const lineCount = activeFile?.content.split('\n').length ?? 0;
    return (
      <div className="flex flex-col min-h-0 h-full">
        <div className="studio-source-meta" aria-label="Source file path">
          {fileExt && <span className="studio-source-meta__pill">{fileExt}</span>}
          <span className="studio-source-meta__path">{activeFile?.path ?? '—'}</span>
          <span className="studio-source-meta__spacer" />
          {activeFile && (
            <span className="studio-source-meta__stat">
              UTF-8 · {lineEnding} · {lineCount} lines
            </span>
          )}
        </div>
        <SourceEditor
          ref={sourceEditorRef}
          files={sourceEditorFiles}
          activeFile={activeEditorFile}
          lspClient={lspClient}
          onFileSelect={(path) => setActiveEditorFile(path)}
          onContentChange={handleSourceChange}
          onNavigateToNode={navigateToNode}
          onEditorViewCreated={handleEditorViewCreated}
          hideTabs
        />
      </div>
    );
  }, [sourceEditorFiles, activeEditorFile, lspClient, handleSourceChange, navigateToNode, handleEditorViewCreated]);

  // Namespaces that belong to refOnly curated files. Earlier revisions
  // inferred this by matching `deferredExports[i].filePath.split('/')[0]`
  // against loaded refOnly bundle ids — that false-positive'd for user
  // files saved under `${bundleId}/foo.rosetta` paths (Codex P2 review
  // of PR #163). The correct anchor is the workspace file's `refOnly`
  // flag itself; we resolve each refOnly file's server-side filePath
  // (the form the server emits in deferredExports, which is
  // `${bundleId}/${pathInBundle}` without the studio's bracket prefix)
  // and look up the matching deferredExports entry to recover the
  // namespace. Pure intersection — no inference required.
  const refOnlyNamespaces = useMemo(() => {
    if (deferredExports.length === 0) return new Set<string>();
    const refOnlyServerPaths = new Set<string>();
    for (const f of files) {
      if (!f.refOnly) continue;
      const m = /^\[([^\]]+)\]\/(.*)$/.exec(f.path);
      if (m) refOnlyServerPaths.add(`${m[1]}/${m[2]}`);
    }
    if (refOnlyServerPaths.size === 0) return new Set<string>();
    const ns = new Set<string>();
    for (const d of deferredExports) {
      if (refOnlyServerPaths.has(d.filePath)) ns.add(d.namespace);
    }
    return ns;
  }, [files, deferredExports]);

  const selectedNodeIsRefOnly = useMemo(() => {
    const data = selectedNodeData as unknown as { namespace?: string } | null;
    return !!(data?.namespace && refOnlyNamespaces.has(data.namespace));
  }, [selectedNodeData, refOnlyNamespaces]);

  const renderInspectorPane = useCallback(
    () => (
      <div className="studio-scroll flex flex-col min-h-0 h-full overflow-auto">
        <EditorFormPanel
          nodeData={selectedNodeData}
          nodeId={selectedNodeId}
          refOnly={selectedNodeIsRefOnly}
          availableTypes={availableTypes}
          actions={editorActions}
          allNodes={storeNodes}
          renderExpressionEditor={renderExpressionEditor}
          onClose={() => {
            /* pane visibility handled by paneswitch */
          }}
          onNavigateToNode={navigateToNode}
        />
      </div>
    ),
    [
      selectedNodeData,
      selectedNodeId,
      selectedNodeIsRefOnly,
      availableTypes,
      editorActions,
      storeNodes,
      renderExpressionEditor,
      navigateToNode
    ]
  );

  // Structure pane — focusedTypeId gated by node $type (Data / Choice / Enum only)
  const structureFocusedTypeId = useMemo(() => {
    if (!selectedNodeId) return undefined;
    if (selectedNodeType === 'Data' || selectedNodeType === 'Choice' || selectedNodeType === 'RosettaEnumeration')
      return selectedNodeId;
    // Unsupported kind — pass undefined so StructureView shows its empty-selection state
    return undefined;
  }, [selectedNodeId, selectedNodeType]);

  // e2e-batch fix #10: when the user has selected a type whose kind isn't
  // supported in Structure View, expose the name + kind so the empty state can
  // explain WHY the pane is blank instead of repeating the generic prompt.
  // Selected-but-supported types fall through to the regular focused-type
  // render path; unsupported types produce { name, kind } for the targeted
  // empty state in StructureView.
  const structureUnsupportedSelectedType = useMemo<{ name: string; kind: string } | undefined>(() => {
    if (!selectedNodeId || structureFocusedTypeId) return undefined;
    if (!selectedNodeType) return undefined;
    const node = storeNodes.find((n) => n.id === selectedNodeId);
    const name =
      (node?.data as { name?: string } | undefined)?.name ?? selectedNodeId.split('::').pop() ?? selectedNodeId;
    // Map AST $type → user-friendly kind label. Codex review (e2e-batch
    // adversarial) flagged the previous map as non-exhaustive — it omitted
    // RosettaTypeAlias, RosettaBasicType, RosettaSynonymSource,
    // RosettaExternalFunction, RosettaMetaType, RosettaBody, RosettaCorpus,
    // RosettaSegment, RosettaExternalRuleSource, RosettaReport, RosettaRule,
    // any of which a user could select from the explorer. Missing entries
    // previously fell through to the raw $type string (ugly but not crash-y);
    // now we cover the common cases AND `formatUnknownKind` strips the
    // `Rosetta` prefix + inserts spaces so unmapped types still render as
    // "Type alias" / "Basic type" / "Synonym source" etc.
    const KIND_LABEL: Record<string, string> = {
      Function: 'Function',
      RosettaFunction: 'Function',
      TypeAlias: 'Type alias',
      RosettaTypeAlias: 'Type alias',
      Record: 'Record',
      RosettaRecordType: 'Record',
      RosettaBasicType: 'Basic type',
      Annotation: 'Annotation',
      RosettaMetaType: 'Meta type',
      RosettaSynonymSource: 'Synonym source',
      RosettaExternalFunction: 'External function',
      RosettaBody: 'Body',
      RosettaCorpus: 'Corpus',
      RosettaSegment: 'Segment',
      RosettaExternalRuleSource: 'External rule source',
      RosettaReport: 'Report',
      RosettaRule: 'Rule'
    };
    return { name, kind: KIND_LABEL[selectedNodeType] ?? formatUnknownKind(selectedNodeType) };
  }, [selectedNodeId, selectedNodeType, structureFocusedTypeId, storeNodes]);

  const adapterDocument = useMemo(
    () => (storeNodes.length > 0 ? graphNodesToAdapterDocument(storeNodes) : undefined),
    [storeNodes]
  );

  // Memoize cell components to preserve prop identity across renders — avoids
  // unnecessary ReactFlow reconciliation when unrelated EditorPage state changes.
  // InheritanceCell is not included here because GroupContainerNode (the base-type
  // wrap) does not expose a cell-injection API; that wiring is a future addition.
  const structureCellComponents = useMemo(
    () => ({
      name: NameCell,
      type: TypePickerCell,
      card: CardinalityCell
    }),
    []
  );

  // ---------------------------------------------------------------------------
  // Spec §8 / §3.3 — enum-nav callback for StructureView (affordance 1).
  // Sets the focused type in the structure pane to the given enum typeId,
  // which re-roots the structure graph on that enum. Also selects the node
  // in the editor store so the inspector + other panels stay in sync.
  // ---------------------------------------------------------------------------
  const handleStructureNavigateToEnumType = useCallback(
    (typeId: string) => {
      storeSelectNode(typeId, { reapplyFocusMode: false });
    },
    [storeSelectNode]
  );

  // ---------------------------------------------------------------------------
  // Spec §3.4 — diagnostic left-edge marker for StructureView (affordance 3).
  //
  // Strategy (approach b from spec §3.4):
  //   1. Derive the file URI for the currently focused type from its nodeId.
  //   2. Retrieve LSP diagnostics for that URI from the diagnostics store.
  //   3. Precompute a `lineOffsets` array from the file's source text where
  //      `lineOffsets[line] = character offset of the start of that line`.
  //      Converting an LSP line/character pair to a character offset is then
  //      O(1) direct indexing: `lineOffsets[line] + character`. (The reverse
  //      conversion — offset → line — would need binary search; the previous
  //      comment claimed binary search here in error. Copilot caught it.)
  //   4. Map each LspDiagnostic to a RangeDiagnostic and pass the resulting
  //      array into StructureView. DataNode calls useDiagnosticsForRange per row.
  //
  // Keeping the conversion here (rather than in a hook or in DataNode) lets
  // the memoized lineOffsets array amortize the cost across all rows in one
  // render pass instead of recomputing it once per row.
  //
  // **astRange-threading gap (deferred PR #207 follow-up):** in studio-created
  // rows today, `StructureRow.astRange` is `undefined` because
  // `graphNodesToAdapterDocument` forwards attributes from
  // `stripAdditionalAstFields` (which strips `$cstNode`) and never derives an
  // offset range. The wiring on this side (RangeDiagnostic[] → StructureView →
  // useDiagnosticsForRange) is correct and exercised by synthetic tests; the
  // severity marker just won't fire in production until upstream threading
  // lands.
  // ---------------------------------------------------------------------------

  // Resolve file path for the focused structure node (ns::TypeName format).
  const structureFilePath = useMemo(() => {
    if (!structureFocusedTypeId) return undefined;
    return nodeIdToFilePath.get(structureFocusedTypeId);
  }, [structureFocusedTypeId, nodeIdToFilePath]);

  // Source text for the focused file (to build lineOffsets).
  const structureFileContent = useMemo(() => {
    if (!structureFilePath) return undefined;
    return files.find((f) => f.path === structureFilePath)?.content;
  }, [structureFilePath, files]);

  // Precomputed lineOffsets: lineOffsets[i] = character offset of the start
  // of line i in structureFileContent. Direct-indexed (O(1)) for the
  // line/character → offset conversion in `structureDiagnostics` below.
  const structureLineOffsets = useMemo<readonly number[]>(() => {
    if (!structureFileContent) return [];
    const offsets: number[] = [0];
    for (let i = 0; i < structureFileContent.length; i++) {
      if (structureFileContent[i] === '\n') {
        offsets.push(i + 1);
      }
    }
    return offsets;
  }, [structureFileContent]);

  // Raw LSP diagnostics for the focused file.
  // `fileDiagnostics` is already subscribed at line ~968 via useDiagnosticsStore() —
  // reuse that reference here; no duplicate subscriber needed.
  const structureLspDiagnostics = useMemo(() => {
    if (!structureFilePath) return undefined;
    const uri = pathToUri(structureFilePath);
    return fileDiagnostics.get(uri);
  }, [structureFilePath, fileDiagnostics]);

  // Convert LSP diagnostics (line/character) to RangeDiagnostic (character offsets).
  const structureDiagnostics = useMemo<readonly RangeDiagnostic[]>(() => {
    if (!structureLspDiagnostics || structureLspDiagnostics.length === 0 || structureLineOffsets.length === 0) {
      return EMPTY_RANGE_DIAGNOSTICS;
    }
    const result: RangeDiagnostic[] = [];
    const lineCount = structureLineOffsets.length;
    for (const d of structureLspDiagnostics) {
      const startLine = d.range.start.line;
      const endLine = d.range.end.line;
      // Skip diagnostics whose line indices are out of bounds for the current
      // source — this happens when source has changed but the diagnostic store
      // hasn't caught up. Previously falling back to offset 0 would map stale
      // diagnostics to the start of the file and produce false-positive markers
      // on completely unrelated rows. Copilot caught this on PR #207.
      if (startLine >= lineCount || endLine >= lineCount) continue;
      const start = structureLineOffsets[startLine]! + d.range.start.character;
      const end = structureLineOffsets[endLine]! + d.range.end.character;
      if (end > start) {
        result.push({ start, end, severity: d.severity ?? 3, message: d.message });
      }
    }
    return result.length > 0 ? result : EMPTY_RANGE_DIAGNOSTICS;
  }, [structureLspDiagnostics, structureLineOffsets]);

  const renderStructurePane = useCallback(
    () => (
      <StructureView
        focusedTypeId={structureFocusedTypeId}
        adapterDoc={adapterDocument}
        expansionMap={expansionMap}
        cellComponents={structureCellComponents}
        onToggleExpansion={toggleExpansion}
        unsupportedSelectedType={structureUnsupportedSelectedType}
        onNodeSelect={(canonicalId) => storeSelectNode(canonicalId, { reapplyFocusMode: false })}
        onNavigateToEnumType={handleStructureNavigateToEnumType}
        structureDiagnostics={structureDiagnostics}
      />
    ),
    [
      structureFocusedTypeId,
      adapterDocument,
      expansionMap,
      structureCellComponents,
      toggleExpansion,
      structureUnsupportedSelectedType,
      storeSelectNode,
      handleStructureNavigateToEnumType,
      structureDiagnostics
    ]
  );

  const VisualPreviewPanelMounted = useCallback(
    () => (
      <CenterStackPanel
        renderGraph={renderGraphPane}
        renderSource={renderSourcePane}
        renderInspector={renderInspectorPane}
        renderStructure={renderStructurePane}
      />
    ),
    [renderGraphPane, renderSourcePane, renderInspectorPane, renderStructurePane]
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

  const workspaceFileCount = fileCount;
  const totalProblemCount = useMemo(() => combinedDiagnostics.total, [combinedDiagnostics.total]);
  const panelTabMeta = useMemo(
    () => ({
      'workspace.problems': { count: totalProblemCount }
    }),
    [totalProblemCount]
  );
  const focusPanelRequest = useMemo(
    () => (inspectorFocusNonce > 0 ? { component: 'workspace.inspector' as const, nonce: inspectorFocusNonce } : null),
    [inspectorFocusNonce]
  );

  // Empty-content guard (keep-alive hazard): ExplorePerspective is ALWAYS
  // mounted by PerspectiveHost (display:none when inactive), including before
  // any user files OR reference models exist. With neither editable files,
  // materialized models, nor deferred curated exports, the dockview/graph/
  // structure workbench has nothing meaningful to render, and mounting
  // DockShell against an empty corpus risks running layout/effects with no
  // graph data. Deferred-only curated loads are valid Explore content because
  // loadModels([]) materializes placeholder nodes from deferredExports.
  if (fileCount === 0 && models.length === 0 && deferredExports.length === 0) {
    return <div data-testid="explore-workbench" className="flex flex-col h-full overflow-hidden" />;
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="explore-workbench"
      onKeyDown={handleEditorPageKeyDown}
      tabIndex={-1}
    >
      <header className="studio-topbar" aria-label="Studio workspace header">
        <div className="studio-topbar__left">
          <div className="studio-brand">
            <div className="studio-brand__mark">R</div>
            <span className="studio-brand__name">Rune Studio</span>
          </div>
          <span className="studio-topbar__divider" />
          <Popover onOpenChange={handleWorkspaceMenuOpenChange}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="studio-topbar__ws-btn"
                  aria-label={`Workspace menu — ${workspaceName || 'workspace'}`}
                  title="Switch / create / close workspace"
                >
                  <span className="studio-topbar__ws-mark" aria-hidden="true">
                    {(workspaceName || 'Workspace').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="studio-topbar__ws-name">{workspaceName || 'Untitled workspace'}</span>
                  <span className="studio-topbar__ws-sub">
                    {workspaceFileCount} file{workspaceFileCount === 1 ? '' : 's'}
                  </span>
                  <ChevronDown className="size-3" />
                </button>
              }
            />
            <PopoverContent align="start" sideOffset={6} className="w-72 p-1.5">
              {/* Switch-to section — only shown when callback is provided AND
                  there are recents OTHER than the current workspace. The
                  dropdown was the user-reported gap (workspace tab had a
                  ChevronDown that promised a menu but only fired onClose). */}
              {onSwitchWorkspace && workspaceMenuRecents.length > 0 && (
                <>
                  <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Switch to
                  </p>
                  <ul className="space-y-0.5" role="menu">
                    {workspaceMenuRecents.slice(0, 6).map((r) => (
                      <li key={r.id} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent/50 cursor-pointer text-left"
                          onClick={() => onSwitchWorkspace(r.id)}
                        >
                          <span className="font-medium truncate flex-1">{r.name}</span>
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground uppercase tracking-wide">
                            {r.kind === 'git-backed' ? 'GIT' : r.kind === 'folder-backed' ? 'FOLDER' : 'BROWSER'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="my-1 border-t border-border" />
                </>
              )}
              {onCreateWorkspace && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent/50 cursor-pointer text-left"
                  onClick={onCreateWorkspace}
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span>New workspace</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent/50 cursor-pointer text-left text-destructive"
                  onClick={onClose}
                  aria-label={`Close ${workspaceName || 'workspace'} and return to start page`}
                >
                  <LogOut className="size-3.5" />
                  <span>Close workspace</span>
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
        {activePerspective === 'explore' && (
          <FileTabStrip files={files} activeFile={activeEditorFile} onSelectFile={openFileInSource} />
        )}
        <div className="studio-topbar__right">
          <button type="button" className="studio-topbar__cmdk" aria-label="Search">
            <Search className="size-3.5" />
            <span>Search types, files, commands…</span>
            <Kbd>⌘K</Kbd>
          </button>
          {workspaceKind === 'git-backed' && syncStatus && (
            <SyncStatusBadge
              status={syncStatus}
              onResolve={(choice) => {
                resolveConflict(workspaceId, choice);
              }}
            />
          )}
          <span className="studio-topbar__divider" />
          <FontScaleButton />
          <Button variant="ghost" size="icon-sm" aria-label="Validate" title="Validate">
            <Check />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Export code"
            title="Export code"
            onClick={() => setShowExportDialog(true)}
          >
            <Download />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Share" title="Share">
            <Share2 />
          </Button>
          <button type="button" className="studio-topbar__generate" onClick={() => setShowExportDialog(true)}>
            <Zap className="size-3.5" />
            Generate
          </button>
          <span className="studio-topbar__divider" />
          <Avatar render={<button type="button" aria-label="Account" />} className="size-7 cursor-pointer">
            <AvatarFallback className="bg-linear-to-br from-enum to-data text-primary-foreground text-[11px] font-bold">
              PM
            </AvatarFallback>
          </Avatar>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <DockShell
          studioVersion={studioVersion}
          workspaceId={workspaceId}
          focusPanel={focusPanelRequest}
          panelComponents={panelComponents}
          panelTabMeta={panelTabMeta}
        />
      </div>

      <footer className="glass-statusbar flex items-center gap-4 px-3 py-1 text-xs text-muted-foreground border-t border-border">
        <span>
          {models.length} model{models.length === 1 ? '' : 's'}
        </span>
        <span>{files.filter((f) => f.dirty).length} modified</span>
        {selectedNodeId && <span>{selectedNodeId}</span>}
        {(combinedDiagnostics.errors > 0 || combinedDiagnostics.warnings > 0) && (
          <span>
            {combinedDiagnostics.errors} err / {combinedDiagnostics.warnings} warn
          </span>
        )}
        {transportState && <LspConnectionBadge state={transportState} onRetry={onReconnect} />}
        {transportState && <ConnectionStatus state={transportState} onReconnect={onReconnect} />}
      </footer>

      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getUserFiles={getSerializedFiles}
        validateModel={validateModelForExport}
      />

      {/*
        Curated Models dialog — reuses the same <ModelLoader /> the welcome
        screen mounts. ModelLoader pulls from useModelStore directly so no
        props need to be threaded through. We leave the dialog open after a
        load click so the user can see progress/badges. Dismiss paths
        (Radix defaults): Esc, the X close button, AND click on the overlay
        outside the dialog content — all close via `onOpenChange(false)`.
        If "Esc only / outside-click does nothing" is ever wanted, attach
        `onInteractOutside={(e) => e.preventDefault()}` to DialogContent
        (Copilot review on PR #215). A future task will replace this with
        a bottom-bar multi-selector — see PR description.
      */}
      <Dialog open={showCuratedModels} onOpenChange={setShowCuratedModels}>
        <DialogContent
          className="w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto"
          data-testid="curated-models-dialog"
          overlayProps={{ 'data-testid': 'curated-models-dialog-overlay' }}
        >
          <DialogHeader>
            <DialogTitle>Reference Models</DialogTitle>
            <DialogDescription>
              Load curated reference bundles to explore them alongside your workspace.
            </DialogDescription>
          </DialogHeader>
          <ModelLoader />
        </DialogContent>
      </Dialog>
    </div>
  );
}
