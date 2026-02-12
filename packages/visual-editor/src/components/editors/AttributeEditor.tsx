/**
 * AttributeEditor — Inline editor for type attributes (T069).
 */

import { useState, useCallback, memo } from 'react';

export interface AttributeEditorProps {
  nodeId: string;
  onAddAttribute: (nodeId: string, name: string, typeName: string, cardinality: string) => void;
  onRemoveAttribute: (nodeId: string, name: string) => void;
  onCancel?: () => void;
}

export const AttributeEditor = memo(function AttributeEditor({
  nodeId,
  onAddAttribute,
  onRemoveAttribute,
  onCancel
}: AttributeEditorProps) {
  const [name, setName] = useState('');
  const [typeName, setTypeName] = useState('string');
  const [cardinality, setCardinality] = useState('1..1');

  const handleAdd = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddAttribute(nodeId, trimmed, typeName, cardinality);
    setName('');
  }, [nodeId, name, typeName, cardinality, onAddAttribute]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleAdd();
      } else if (e.key === 'Escape') {
        onCancel?.();
      }
    },
    [handleAdd, onCancel]
  );

  return (
    <div className="rune-attribute-editor" data-testid="attribute-editor">
      <div className="rune-attribute-editor__header">Add Attribute</div>
      <div className="rune-attribute-editor__form">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Attribute name"
          className="rune-attribute-editor__name"
          aria-label="Attribute name"
          autoFocus
        />
        <input
          type="text"
          value={typeName}
          onChange={(e) => setTypeName(e.target.value)}
          placeholder="Type"
          className="rune-attribute-editor__type"
          aria-label="Attribute type"
        />
        <input
          type="text"
          value={cardinality}
          onChange={(e) => setCardinality(e.target.value)}
          placeholder="Cardinality"
          className="rune-attribute-editor__card"
          aria-label="Cardinality"
        />
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="rune-attribute-editor__submit"
        >
          Add
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rune-attribute-editor__cancel">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
});
