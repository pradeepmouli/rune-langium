/**
 * EditorFormPanel — dispatch component that renders the appropriate editor
 * form based on the selected node's type kind.
 *
 * Renders:
 * - DataTypeForm when kind='data'
 * - DetailPanel when isReadOnly=true or kind is unsupported
 * - Empty state when no node is selected
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
import { X } from 'lucide-react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Button } from '@rune-langium/design-system/ui/button';
import { DataTypeForm } from '../editors/DataTypeForm.js';
import { EnumForm } from '../editors/EnumForm.js';
import { ChoiceForm } from '../editors/ChoiceForm.js';
import { FunctionForm } from '../editors/FunctionForm.js';
import { TypeAliasForm } from '../editors/TypeAliasForm.js';
import { DetailPanel } from './DetailPanel.js';
import { getKindLabel } from '../editors/TypeSelector.js';
import { useInheritedMembers } from '../../hooks/useInheritedMembers.js';
import type {
  AnyGraphNode,
  TypeKind,
  TypeOption,
  EditorFormActions,
  TypeGraphNode,
  ExpressionEditorSlotProps
} from '../../types.js';
import { AST_TYPE_TO_NODE_TYPE } from '../../adapters/model-helpers.js';

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface FormErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class FormErrorBoundary extends Component<
  { children: ReactNode; nodeId: string | null },
  FormErrorBoundaryState
> {
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
  /** Node ID of the selected node. */
  nodeId: string | null;
  /** Whether the node is read-only (from external/locked source). */
  isReadOnly?: boolean;
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
  nodeId,
  isReadOnly = false,
  availableTypes,
  actions,
  allNodes = [],
  renderExpressionEditor,
  onClose,
  onNavigateToNode
}: EditorFormPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

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
        role="complementary"
        aria-label="Editor form"
        className="flex items-center justify-center h-full text-sm text-muted-foreground"
        tabIndex={-1}
      >
        Select a node to edit
      </aside>
    );
  }

  // ---- Read-only fallback --------------------------------------------------

  if (isReadOnly || (nodeData as any).isReadOnly) {
    return (
      <aside
        ref={panelRef}
        data-slot="editor-form-panel"
        role="complementary"
        aria-label={`Details for ${(nodeData as any).name}`}
        className="flex flex-col h-full overflow-hidden"
        tabIndex={-1}
      >
        <DetailPanel
          nodeData={nodeData}
          onNavigateToNode={onNavigateToNode}
          allNodeIds={allNodeIds}
        />
      </aside>
    );
  }

  // ---- Dispatch by $type → kind --------------------------------------------

  const kind = AST_TYPE_TO_NODE_TYPE[(nodeData as any).$type] ?? 'data';

  function renderForm() {
    switch (kind) {
      case 'data':
        return (
          <DataTypeForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            availableTypes={availableTypes}
            actions={actions}
            inheritedGroups={inheritedGroups}
            renderExpressionEditor={renderExpressionEditor}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      case 'enum':
        return (
          <EnumForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            availableTypes={availableTypes}
            actions={actions}
            inheritedGroups={inheritedGroups}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      case 'choice':
        return (
          <ChoiceForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            availableTypes={availableTypes}
            actions={actions}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      case 'func':
        return (
          <FunctionForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            availableTypes={availableTypes}
            actions={actions}
            inheritedGroups={inheritedGroups}
            renderExpressionEditor={renderExpressionEditor}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      case 'typeAlias':
        return (
          <TypeAliasForm
            key={nodeId!}
            nodeId={nodeId!}
            data={nodeData!}
            actions={actions}
            renderExpressionEditor={renderExpressionEditor}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      // record, basicType, and annotation are currently view-only;
      // full editor forms for these kinds are tracked for a future iteration.
      case 'record':
      case 'basicType':
      case 'annotation':
        return (
          <DetailPanel
            nodeData={nodeData!}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );

      default:
        return (
          <DetailPanel
            nodeData={nodeData!}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        );
    }
  }

  const displayName = (nodeData as any).name as string;
  const displayKind = kind as TypeKind;

  return (
    <aside
      ref={panelRef}
      data-slot="editor-form-panel"
      role="complementary"
      aria-label={`Edit ${displayName}`}
      className="flex flex-col h-full overflow-hidden"
      tabIndex={-1}
    >
      {/* Sticky header */}
      <div
        data-slot="panel-header"
        className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3
          border-b bg-muted"
      >
        <span className="text-sm font-semibold truncate">{displayName}</span>
        <Badge variant={displayKind}>{getKindLabel(displayKind)}</Badge>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Close editor panel"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Scrollable content */}
      <div data-slot="panel-content" className="flex-1 overflow-y-auto">
        <FormErrorBoundary nodeId={nodeId}>{renderForm()}</FormErrorBoundary>
      </div>
    </aside>
  );
});

export { EditorFormPanel };
