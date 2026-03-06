/**
 * ExpressionBuilder — root component for the visual expression editor.
 *
 * Provides Builder/Text mode toggle via tabs, renders function sections
 * (inputs, output) with labeled headers, and shows live DSL preview.
 *
 * Uses the useExpressionBuilder hook (zustand store + zundo undo/redo)
 * for state management, and wires keyboard navigation.
 *
 * @module
 */

import { useState, useCallback, useRef } from 'react';
import type { ExpressionEditorSlotProps } from '../../../types.js';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type { FunctionScope } from '../../../store/expression-store.js';
import { BlockRenderer } from './BlockRenderer.js';
import { DslPreview } from './DslPreview.js';
import { OperatorPalette } from './OperatorPalette.js';
import { ReferencePicker } from './ReferencePicker.js';
import { expressionNodeToDslPreview } from '../../../adapters/expression-node-to-dsl.js';
import { useContextFilter } from '../../../hooks/useContextFilter.js';
import { useExpressionBuilder } from '../../../hooks/useExpressionBuilder.js';
import { useKeyboardNavigation } from '../../../hooks/useKeyboardNavigation.js';
import { parseExpression } from '../../../adapters/parse-expression.js';

export interface ExpressionBuilderProps extends ExpressionEditorSlotProps {
  scope: FunctionScope;
  defaultMode?: 'builder' | 'text';
  /** Callback when a node is dragged to a placeholder target. */
  onDragNode?: (draggedNodeId: string, targetNodeId: string) => void;
}

export function ExpressionBuilder({
  value,
  onChange,
  onBlur,
  scope,
  placeholder,
  error,
  defaultMode = 'builder',
  onDragNode
}: ExpressionBuilderProps) {
  // Parse incoming value into an initial tree
  const initialTree = parseExpression(value ?? '');

  const {
    tree,
    mode,
    selectedNodeId,
    paletteOpen,
    paletteAnchorId,
    replaceNode,
    selectNode,
    setMode,
    openPalette,
    closePalette,
    handleBlur,
    store
  } = useExpressionBuilder({
    value: value ?? '',
    onChange: onChange ?? (() => {}),
    onBlur,
    scope,
    initialTree
  });

  const [textValue, setTextValue] = useState(value ?? '');
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Wire keyboard navigation (undo/redo, arrow keys, copy/paste, etc.)
  useKeyboardNavigation({ store, containerRef });

  // Override mode from store default if defaultMode prop differs
  if (defaultMode !== 'builder' && mode === 'builder') {
    setMode(defaultMode);
  }

  const handleModeSwitch = useCallback(
    (newMode: 'builder' | 'text') => {
      if (newMode === mode) return;
      if (newMode === 'text') {
        // Serialize tree to text
        try {
          const dsl = expressionNodeToDslPreview(tree);
          setTextValue(dsl);
          setParseError(null);
        } catch {
          setTextValue(value ?? '');
        }
      } else {
        // Parse text back to builder - just update the value
        onChange?.(textValue);
        setParseError(null);
      }
      setMode(newMode);
    },
    [mode, tree, value, textValue, onChange, setMode]
  );

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setTextValue(newText);
  }, []);

  const handleTextBlur = useCallback(() => {
    onChange?.(textValue);
    handleBlur();
  }, [textValue, onChange, handleBlur]);

  const handleActivatePlaceholder = useCallback(
    (nodeId: string) => {
      openPalette(nodeId);
    },
    [openPalette]
  );

  const handleOpenReferencePicker = useCallback(() => {
    closePalette();
    setReferencePickerOpen(true);
  }, [closePalette]);

  const handlePaletteSelect = useCallback(
    (node: ExpressionNode) => {
      if (paletteAnchorId) {
        replaceNode(paletteAnchorId, node);
      }
      closePalette();
      setReferencePickerOpen(false);
    },
    [paletteAnchorId, replaceNode, closePalette]
  );

  const handlePaletteClose = useCallback(() => {
    closePalette();
  }, [closePalette]);

  const handleReferenceClose = useCallback(() => {
    setReferencePickerOpen(false);
  }, []);

  // Context-aware operator filtering
  const { categories: filteredCategories } = useContextFilter(tree, paletteAnchorId);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
      data-testid="expression-builder"
      tabIndex={-1}
    >
      {/* Mode toggle tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        <button
          className={`rounded-t px-3 py-1 text-xs font-medium transition-colors ${
            mode === 'builder'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => handleModeSwitch('builder')}
          data-testid="tab-builder"
        >
          Builder
        </button>
        <button
          className={`rounded-t px-3 py-1 text-xs font-medium transition-colors ${
            mode === 'text'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => handleModeSwitch('text')}
          data-testid="tab-text"
        >
          Text
        </button>
      </div>

      {/* Builder mode */}
      {mode === 'builder' && (
        <>
          <div className="relative min-h-[32px] rounded border border-border/50 bg-background/50 p-2">
            <BlockRenderer
              node={tree}
              selectedNodeId={selectedNodeId}
              onSelect={selectNode}
              onActivatePlaceholder={handleActivatePlaceholder}
              onDragNode={onDragNode}
            />
            <OperatorPalette
              open={paletteOpen}
              onSelect={handlePaletteSelect}
              onClose={handlePaletteClose}
              filteredCategories={filteredCategories}
              onOpenReferencePicker={handleOpenReferencePicker}
            />
            <ReferencePicker
              open={referencePickerOpen}
              scope={scope}
              onSelect={handlePaletteSelect}
              onClose={handleReferenceClose}
            />
          </div>
          <DslPreview tree={tree} />
        </>
      )}

      {/* Text mode */}
      {mode === 'text' && (
        <textarea
          className="min-h-[80px] w-full rounded border border-input bg-background p-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={textValue}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          placeholder={placeholder}
          data-testid="text-editor"
        />
      )}

      {/* Scope info */}
      {scope.inputs.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Inputs</span>
          <div className="flex flex-wrap gap-1">
            {scope.inputs.map((input) => (
              <span
                key={input.name}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {input.name}
                {input.typeName && `: ${input.typeName}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {scope.output && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Output</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {scope.output.name}
            {scope.output.typeName && `: ${scope.output.typeName}`}
          </span>
        </div>
      )}

      {(error || parseError) && (
        <span className="text-xs text-destructive">{error ?? parseError}</span>
      )}

      {!value && placeholder && mode === 'builder' && (
        <span className="text-xs text-muted-foreground">{placeholder}</span>
      )}
    </div>
  );
}
