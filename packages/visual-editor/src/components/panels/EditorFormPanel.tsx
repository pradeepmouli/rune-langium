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

import { useEffect, useCallback, useRef } from 'react';
import { DataTypeForm } from '../editors/DataTypeForm.js';
import { EnumForm } from '../editors/EnumForm.js';
import { ChoiceForm } from '../editors/ChoiceForm.js';
import { FunctionForm } from '../editors/FunctionForm.js';
import { DetailPanel } from './DetailPanel.js';
import { getKindBadgeClasses, getKindLabel } from '../editors/TypeSelector.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EditorFormPanelProps {
  /** The selected node's data, or null if nothing is selected. */
  nodeData: TypeNodeData | null;
  /** Node ID of the selected node. */
  nodeId: string | null;
  /** Whether the node is read-only (from external/locked source). */
  isReadOnly?: boolean;
  /** Available type options for type selectors. */
  availableTypes: TypeOption[];
  /** All editor form actions. */
  actions: EditorFormActions;
  /** Called when the panel requests to close (e.g., Escape key). */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EditorFormPanel({
  nodeData,
  nodeId,
  isReadOnly = false,
  availableTypes,
  actions,
  onClose
}: EditorFormPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

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

  if (isReadOnly || nodeData.isReadOnly) {
    return (
      <aside
        ref={panelRef}
        data-slot="editor-form-panel"
        role="complementary"
        aria-label={`Details for ${nodeData.name}`}
        className="flex flex-col h-full overflow-hidden"
        tabIndex={-1}
      >
        <DetailPanel nodeData={nodeData} />
      </aside>
    );
  }

  // ---- Dispatch by kind ----------------------------------------------------

  function renderForm() {
    switch (nodeData!.kind) {
      case 'data':
        return (
          <DataTypeForm
            nodeId={nodeId!}
            data={nodeData as TypeNodeData<'data'>}
            availableTypes={availableTypes}
            actions={actions}
          />
        );

      case 'enum':
        return (
          <EnumForm
            nodeId={nodeId!}
            data={nodeData as TypeNodeData<'enum'>}
            availableTypes={availableTypes}
            actions={actions}
          />
        );

      case 'choice':
        return (
          <ChoiceForm
            nodeId={nodeId!}
            data={nodeData as TypeNodeData<'choice'>}
            availableTypes={availableTypes}
            actions={actions}
          />
        );

      case 'func':
        return (
          <FunctionForm
            nodeId={nodeId!}
            data={nodeData as TypeNodeData<'func'>}
            availableTypes={availableTypes}
            actions={actions}
          />
        );

      default:
        return <DetailPanel nodeData={nodeData} />;
    }
  }

  return (
    <aside
      ref={panelRef}
      data-slot="editor-form-panel"
      role="complementary"
      aria-label={`Edit ${nodeData.name}`}
      className="flex flex-col h-full overflow-hidden"
      tabIndex={-1}
    >
      {/* Sticky header */}
      <div
        data-slot="panel-header"
        className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3
          border-b bg-surface-overlay"
      >
        <span className="text-sm font-semibold truncate">{nodeData.name}</span>
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${getKindBadgeClasses(nodeData.kind)}`}
        >
          {getKindLabel(nodeData.kind)}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Close editor panel"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div data-slot="panel-content" className="flex-1 overflow-y-auto">
        {renderForm()}
      </div>
    </aside>
  );
}

export { EditorFormPanel };
