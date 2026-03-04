/**
 * ExpressionBuilder — root component for the visual expression editor.
 *
 * Provides Builder/Text mode toggle via tabs, renders function sections
 * (inputs, output) with labeled headers, and shows live DSL preview.
 *
 * @module
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type { ExpressionEditorSlotProps } from '../../../types.js';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type { FunctionScope } from '../../../store/expression-store.js';
import { BlockRenderer } from './BlockRenderer.js';
import { DslPreview } from './DslPreview.js';
import { OperatorPalette } from './OperatorPalette.js';
import { ReferencePicker } from './ReferencePicker.js';
import { astToExpressionNode } from '../../../adapters/ast-to-expression-node.js';
import { expressionNodeToDslPreview } from '../../../adapters/expression-node-to-dsl.js';
import { useContextFilter } from '../../../hooks/useContextFilter.js';

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
  const [mode, setMode] = useState<'builder' | 'text'>(defaultMode);
  const [textValue, setTextValue] = useState(value ?? '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteAnchorId, setPaletteAnchorId] = useState<string | null>(null);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tree = useMemo<ExpressionNode>(() => {
    if (!value) {
      return { $type: 'Placeholder', id: 'root-placeholder' } as unknown as ExpressionNode;
    }
    try {
      const parsed = JSON.parse(value);
      return astToExpressionNode(parsed, value);
    } catch {
      return {
        $type: 'Unsupported',
        id: 'parse-error',
        rawText: value
      } as unknown as ExpressionNode;
    }
  }, [value]);

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
    [mode, tree, value, textValue, onChange]
  );

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setTextValue(newText);
  }, []);

  const handleTextBlur = useCallback(() => {
    onChange?.(textValue);
    onBlur?.();
  }, [textValue, onChange, onBlur]);

  const handleActivatePlaceholder = useCallback((nodeId: string) => {
    setPaletteAnchorId(nodeId);
    setPaletteOpen(true);
  }, []);

  const handlePaletteSelect = useCallback((_node: ExpressionNode) => {
    // In a full implementation, this would replace the placeholder node
    // in the tree. For now, close the palette.
    setPaletteOpen(false);
    setPaletteAnchorId(null);
  }, []);

  const handlePaletteClose = useCallback(() => {
    setPaletteOpen(false);
    setPaletteAnchorId(null);
  }, []);

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
              onSelect={setSelectedNodeId}
              onActivatePlaceholder={handleActivatePlaceholder}
              onDragNode={onDragNode}
            />
            <OperatorPalette
              open={paletteOpen}
              onSelect={handlePaletteSelect}
              onClose={handlePaletteClose}
              filteredCategories={filteredCategories}
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
