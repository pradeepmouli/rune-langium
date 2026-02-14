/**
 * CardinalityEditor — Inline editor for attribute cardinality (T070).
 */

import { useState, useCallback, memo } from 'react';

export interface CardinalityEditorProps {
  nodeId: string;
  attrName: string;
  currentCardinality: string;
  onUpdateCardinality: (nodeId: string, attrName: string, cardinality: string) => void;
  onCancel?: () => void;
}

const PRESETS = [
  { label: '1..1', value: '1..1' },
  { label: '0..1', value: '0..1' },
  { label: '0..*', value: '0..*' },
  { label: '1..*', value: '1..*' }
];

export const CardinalityEditor = memo(function CardinalityEditor({
  nodeId,
  attrName,
  currentCardinality,
  onUpdateCardinality,
  onCancel
}: CardinalityEditorProps) {
  const [value, setValue] = useState(currentCardinality.replace(/[()]/g, ''));

  const handleApply = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onUpdateCardinality(nodeId, attrName, trimmed);
    onCancel?.();
  }, [nodeId, attrName, value, onUpdateCardinality, onCancel]);

  const handlePreset = useCallback(
    (preset: string) => {
      setValue(preset);
      onUpdateCardinality(nodeId, attrName, preset);
      onCancel?.();
    },
    [nodeId, attrName, onUpdateCardinality, onCancel]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleApply();
      } else if (e.key === 'Escape') {
        onCancel?.();
      }
    },
    [handleApply, onCancel]
  );

  return (
    <div className="rune-cardinality-editor" data-testid="cardinality-editor">
      <div className="rune-cardinality-editor__header">Cardinality: {attrName}</div>
      <div className="rune-cardinality-editor__presets">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={`rune-cardinality-editor__preset ${
              value === p.value ? 'rune-cardinality-editor__preset--active' : ''
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="rune-cardinality-editor__custom">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 2..5"
          className="rune-cardinality-editor__input"
          aria-label="Custom cardinality"
        />
        <button
          onClick={handleApply}
          disabled={!value.trim()}
          className="rune-cardinality-editor__apply"
        >
          Apply
        </button>
      </div>
    </div>
  );
});
