// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * EditorFormPanel — dispatch component that renders the appropriate editor
 * form based on the selected node's type kind.
 *
 * Renders:
 * - DataTypeForm / EnumForm / ChoiceForm / FunctionForm / TypeAliasForm
 *   for their respective kinds — in both editable and read-only mode.
 * - OtherForm for kinds without a dedicated form (record, basicType,
 *   annotation, default fallback) and for refOnly curated reference entries.
 * - Empty state when no node is selected.
 *
 * Read-only routing: covered kinds always render their own form (with zero
 * editable controls when locked). OtherForm is used ONLY for uncovered kinds
 * and refOnly entries.
 *
 * Features:
 * - Scrollable content with sticky header (name + kind badge)
 * - role="complementary" with aria-label
 * - Escape key closes panel
 *
 * @module
 */

import { useEffect, useCallback, useRef, useMemo, Component, memo } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { DataTypeForm } from '../editors/DataTypeForm.js';
import { EnumForm } from '../editors/EnumForm.js';
import { ChoiceForm } from '../editors/ChoiceForm.js';
import { FunctionForm } from '../editors/FunctionForm.js';
import { TypeAliasForm } from '../editors/TypeAliasForm.js';
import { OtherForm } from './OtherForm.js';
import { useInheritedMembers } from '../../hooks/useInheritedMembers.js';
import type {
  GraphNodeMeta,
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  TypeGraphNode,
  ExpressionEditorSlotProps
} from '../../types.js';
import { resolveNodeKind } from '../../adapters/model-helpers.js';

/**
 * Fallback metadata for callers that render a node without supplying `meta`
 * (e.g. legacy tests). `node.data` no longer carries any flat metadata
 * (Phase 3 step 3), so there is nothing to derive it from — an empty,
 * editable meta is the neutral default.
 */
const FALLBACK_META: GraphNodeMeta = Object.freeze({
  namespace: '',
  errors: [],
  hasExternalRefs: false
});

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface FormErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class FormErrorBoundary extends Component<{ children: ReactNode; nodeId: string | null }, FormErrorBoundaryState> {
  constructor(props: { children: ReactNode; nodeId: string | null }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): FormErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EditorFormPanel] Render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: { nodeId: string | null }) {
    // Reset error state when a different node is selected
    if (prevProps.nodeId !== this.props.nodeId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-4 gap-2 text-sm text-muted-foreground">
          <p className="font-medium text-destructive">Failed to render editor form</p>
          <p className="text-xs">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EditorFormPanelProps {
  /** The selected node's data, or null if nothing is selected. */
  nodeData: AnyGraphNode | null;
  /**
   * UI/editor metadata for the selected node (namespace, isReadOnly,
   * errors, ...). Optional only because `nodeData` may be null (no
   * selection); whenever `nodeData` is non-null callers MUST supply the
   * node's `meta` sibling — `nodeData` carries no UI metadata anymore
   * (Phase 3 step 3). Absent meta falls back to an empty editable meta.
   */
  meta?: GraphNodeMeta;
  /** Node ID of the selected node. */
  nodeId: string | null;
  /** Whether the node is read-only (from external/locked source). */
  isReadOnly?: boolean;
  /**
   * True when the node's source file is a refOnly curated reference (no
   * client-side source text). Forces the read-only fallback view and
   * surfaces a "Reference Only" pill in the panel header so the user
   * understands why edits are disabled.
   */
  refOnly?: boolean;
  /** Available type options for type selectors. */
  availableTypes: TypeOption[];
  /** All editor form actions. */
  actions: EditorFormActions;
  /** All graph nodes (for inherited member resolution). */
  allNodes?: TypeGraphNode[];
  /**
   * Optional render-prop for a rich expression editor in FunctionForm.
   * When omitted, FunctionForm renders a plain `<Textarea>` fallback.
   */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
  /** Called when the panel requests to close (e.g., Escape key). */
  onClose?: () => void;
  /** Called when a type reference is clicked to navigate to that type's definition. */
  onNavigateToNode?: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EditorFormPanel = memo(function EditorFormPanel({
  nodeData,
  meta: metaProp,
  nodeId,
  isReadOnly = false,
  refOnly = false,
  availableTypes,
  actions,
  allNodes = [],
  renderExpressionEditor,
  onClose,
  onNavigateToNode
}: EditorFormPanelProps) {
  // refOnly entries always render the read-only OtherForm — there's no
  // source text to back form edits even if the kind would otherwise have
  // a full editor (DataTypeForm, FunctionForm, etc.).
  const effectivelyReadOnly = isReadOnly || refOnly;
  const panelRef = useRef<HTMLElement>(null);

  // Effective node metadata: the meta prop when supplied, else the neutral
  // fallback (callers must pass the node.meta sibling for real nodes).
  const nodeMeta = metaProp ?? FALLBACK_META;

  const inheritedGroups = useInheritedMembers(nodeData as AnyGraphNode | null, allNodes);

  // Derive allNodeIds for TypeLink resolution
  const allNodeIds = useMemo(() => allNodes.map((n) => n.id), [allNodes]);

  // ---- Escape key closes panel --------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ---- Empty state ---------------------------------------------------------

  if (!nodeData || !nodeId) {
    return (
      <aside
        ref={panelRef}
        data-slot="editor-form-panel"
        aria-label="Editor form"
        className="flex items-center justify-center h-full text-sm text-muted-foreground"
        tabIndex={-1}
      >
        Select a node to edit
      </aside>
    );
  }

  // ---- refOnly → OtherForm (lowest-risk: no source text, Reference Only badge) ----
  // refOnly curated entries are truly non-editable (no source to back edits)
  // even for covered kinds. Route them to OtherForm with the "Reference Only"
  // pill so the user understands why the panel is non-editable.

  if (refOnly) {
    return (
      <aside
        ref={panelRef}
        data-slot="editor-form-panel"
        aria-label={`Details for ${(nodeData as any).name}`}
        className="flex flex-col h-full overflow-hidden"
        tabIndex={-1}
      >
        <OtherForm
          nodeData={nodeData}
          meta={nodeMeta}
          nodeId={nodeId}
          onNavigateToNode={onNavigateToNode}
          allNodeIds={allNodeIds}
          refOnly={refOnly}
        />
      </aside>
    );
  }

  // ---- Dispatch by $type → kind --------------------------------------------
  // Covered kinds render their own form (read-only when locked).
  // OtherForm is used only for uncovered kinds (record/basicType/annotation/default).

  const kind = resolveNodeKind(nodeData);
  // Combined lock: panel-prop lock OR node-data flag.
  const readOnly = effectivelyReadOnly || Boolean(nodeMeta?.isReadOnly);

  function renderForm() {
    switch (kind) {
      case 'data':
        return (
          <DataTypeForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            meta={nodeMeta}
            availableTypes={availableTypes}
            actions={actions}
            allNodes={allNodes}
            renderExpressionEditor={renderExpressionEditor}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
            readOnly={readOnly}
          />
        );

      case 'enum':
        return (
          <EnumForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            meta={nodeMeta}
            availableTypes={availableTypes}
            actions={actions}
            allNodes={allNodes}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
            readOnly={readOnly}
          />
        );

      case 'choice':
        return (
          <ChoiceForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            meta={nodeMeta}
            availableTypes={availableTypes}
            actions={actions}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
            readOnly={readOnly}
          />
        );

      case 'func':
        return (
          <FunctionForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            meta={nodeMeta}
            availableTypes={availableTypes}
            actions={actions}
            inheritedGroups={inheritedGroups}
            renderExpressionEditor={renderExpressionEditor}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
            readOnly={readOnly}
          />
        );

      case 'typeAlias':
        return (
          <TypeAliasForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            meta={nodeMeta}
            availableTypes={availableTypes}
            actions={actions}
            renderExpressionEditor={renderExpressionEditor}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
            readOnly={readOnly}
          />
        );

      // record, basicType, and annotation are currently view-only;
      // full editor forms for these kinds are tracked for a future iteration.
      case 'record':
      case 'basicType':
      case 'annotation':
        return (
          <OtherForm
            nodeData={nodeData!}
            meta={nodeMeta}
            nodeId={nodeId}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      default:
        return (
          <OtherForm
            nodeData={nodeData!}
            meta={nodeMeta}
            nodeId={nodeId}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );
    }
  }

  return (
    <aside
      ref={panelRef}
      data-slot="editor-form-panel"
      aria-label={`Edit ${(nodeData as any).name}`}
      className="flex flex-col h-full overflow-hidden"
      tabIndex={-1}
    >
      <div data-slot="panel-content" className="studio-scroll flex-1 overflow-y-auto">
        <FormErrorBoundary nodeId={nodeId}>{renderForm()}</FormErrorBoundary>
      </div>
    </aside>
  );
});

export { EditorFormPanel };
