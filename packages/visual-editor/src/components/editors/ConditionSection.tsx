/**
 * ConditionSection — Reusable conditions editor for Data, Function, and TypeAlias forms.
 *
 * Displays pre-conditions (and post-conditions for functions) with:
 * - Condition name (optional)
 * - Definition/description (optional)
 * - Expression body text
 * - Add/remove/reorder capabilities
 *
 * Used by DataTypeForm, FunctionForm, and TypeAliasForm.
 *
 * @module
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { ExpressionEditorSlotProps } from '../../types.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { FieldGroup, FieldLegend, FieldSet } from '@rune-langium/design-system/ui/field';
import { conditionsToDisplay, type ConditionDisplayInfo } from '../../adapters/model-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @deprecated Use ConditionDisplayInfo from model-helpers.ts instead. */
export type ConditionDisplay = ConditionDisplayInfo;

export interface ConditionSectionProps {
  /** Label for this section (e.g. "Conditions", "Pre-Conditions"). */
  label?: string;
  /**
   * Raw AST conditions from the graph node.
   * Internally converted to display-friendly objects via conditionsToDisplay().
   */
  conditions: unknown[] | undefined;
  /** Raw AST post-conditions (functions only). */
  postConditions?: unknown[] | undefined;
  /** Whether to allow editing. */
  readOnly?: boolean;
  /** Called when a condition is added. */
  onAdd?: (condition: {
    name?: string;
    definition?: string;
    expressionText: string;
    isPostCondition?: boolean;
  }) => void;
  /** Called when a condition is removed by index. */
  onRemove?: (index: number) => void;
  /** Called when a condition is updated. */
  onUpdate?: (index: number, updates: Partial<ConditionDisplayInfo>) => void;
  /** Called when conditions are reordered. */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Whether to show the post-condition toggle (functions only). */
  showPostConditionToggle?: boolean;
  /**
   * Optional render-prop for a rich expression editor.
   * When provided, condition expressions use this instead of plain Textarea.
   * The slot receives expression value/onChange/onBlur and should render
   * an expression builder with the function's scope context.
   */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
}

// ---------------------------------------------------------------------------
// ConditionRow (internal)
// ---------------------------------------------------------------------------

interface ConditionRowProps {
  condition: ConditionDisplayInfo;
  index: number;
  total: number;
  readOnly: boolean;
  onUpdate?: (index: number, updates: Partial<ConditionDisplayInfo>) => void;
  onRemove?: (index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
}

function ConditionRow({
  condition,
  index,
  total,
  readOnly,
  onUpdate,
  onRemove,
  onReorder,
  renderExpressionEditor
}: ConditionRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div
      data-slot="condition-row"
      className="border border-border rounded-md bg-card"
      role="listitem"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/30 rounded-t-md">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label={isExpanded ? 'Collapse condition' : 'Expand condition'}
        >
          {isExpanded ? '▾' : '▸'}
        </button>

        <span className="text-xs font-medium text-muted-foreground">
          {condition.isPostCondition ? 'post-condition' : 'condition'}
        </span>

        {condition.name && (
          <span className="text-xs font-semibold text-foreground">{condition.name}</span>
        )}

        {!readOnly && (
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5"
              disabled={index === 0}
              onClick={() => onReorder?.(index, index - 1)}
              aria-label="Move condition up"
            >
              <ChevronUp className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5"
              disabled={index === total - 1}
              onClick={() => onReorder?.(index, index + 1)}
              aria-label="Move condition down"
            >
              <ChevronDown className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5 text-destructive hover:text-destructive/80"
              onClick={() => onRemove?.(index)}
              aria-label={`Remove condition ${condition.name ?? index}`}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-2 py-2 space-y-2">
          {/* Name */}
          {readOnly ? (
            condition.name && (
              <div className="text-xs">
                <span className="text-muted-foreground">Name: </span>
                <span className="font-medium">{condition.name}</span>
              </div>
            )
          ) : (
            <Input
              value={condition.name ?? ''}
              onChange={(e) => onUpdate?.(index, { name: e.target.value || undefined })}
              placeholder="Condition name (optional)"
              className="text-xs h-7"
              aria-label="Condition name"
            />
          )}

          {/* Definition */}
          {readOnly ? (
            condition.definition && (
              <p className="text-xs text-muted-foreground italic">{condition.definition}</p>
            )
          ) : (
            <Input
              value={condition.definition ?? ''}
              onChange={(e) => onUpdate?.(index, { definition: e.target.value || undefined })}
              placeholder="Description (optional)"
              className="text-xs h-7"
              aria-label="Condition description"
            />
          )}

          {/* Expression */}
          {readOnly ? (
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap overflow-auto max-h-40">
              {condition.expressionText || '(empty)'}
            </pre>
          ) : renderExpressionEditor ? (
            renderExpressionEditor({
              value: condition.expressionText,
              onChange: (val: string) => onUpdate?.(index, { expressionText: val }),
              onBlur: () => {},
              error: null,
              placeholder: 'Condition expression...'
            })
          ) : (
            <Textarea
              value={condition.expressionText}
              onChange={(e) => onUpdate?.(index, { expressionText: e.target.value })}
              placeholder="Expression..."
              className="text-xs font-mono resize-y"
              rows={3}
              aria-label="Condition expression"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddConditionForm (internal)
// ---------------------------------------------------------------------------

interface AddConditionFormProps {
  onAdd: (condition: {
    name?: string;
    definition?: string;
    expressionText: string;
    isPostCondition?: boolean;
  }) => void;
  onCancel: () => void;
  showPostConditionToggle: boolean;
}

function AddConditionForm({ onAdd, onCancel, showPostConditionToggle }: AddConditionFormProps) {
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState('');
  const [expression, setExpression] = useState('');
  const [isPost, setIsPost] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!expression.trim()) return;
    onAdd({
      name: name.trim() || undefined,
      definition: definition.trim() || undefined,
      expressionText: expression.trim(),
      isPostCondition: isPost || undefined
    });
  }, [name, definition, expression, isPost, onAdd]);

  return (
    <div className="border border-primary/30 rounded-md p-2 space-y-2 bg-primary/5">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Condition name (optional)"
          className="text-xs h-7 flex-1"
          aria-label="New condition name"
        />
        {showPostConditionToggle && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isPost}
              onChange={(e) => setIsPost(e.target.checked)}
              className="rounded"
            />
            post-condition
          </label>
        )}
      </div>
      <Input
        value={definition}
        onChange={(e) => setDefinition(e.target.value)}
        placeholder="Description (optional)"
        className="text-xs h-7"
        aria-label="New condition description"
      />
      <Textarea
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        placeholder="Expression body..."
        className="text-xs font-mono resize-y"
        rows={3}
        aria-label="New condition expression"
        autoFocus
      />
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!expression.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionSection
// ---------------------------------------------------------------------------

export function ConditionSection({
  label = 'Conditions',
  conditions: rawConditions,
  postConditions: rawPostConditions,
  readOnly = false,
  onAdd,
  onRemove,
  onUpdate,
  onReorder,
  showPostConditionToggle = false,
  renderExpressionEditor
}: ConditionSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const conditions: ConditionDisplayInfo[] = useMemo(
    () => conditionsToDisplay(rawConditions as any, rawPostConditions as any),
    [rawConditions, rawPostConditions]
  );

  const handleAdd = useCallback(
    (condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }) => {
      onAdd?.(condition);
      setShowAddForm(false);
    },
    [onAdd]
  );

  if (conditions.length === 0 && readOnly) return null;

  return (
    <FieldSet className="gap-1">
      <FieldLegend
        variant="label"
        className="mb-0 text-muted-foreground flex items-center justify-between"
      >
        <span>
          {label} ({conditions.length})
        </span>
        {!readOnly && onAdd && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            aria-label="Add condition"
          >
            <Plus className="size-3" />
          </Button>
        )}
      </FieldLegend>

      <FieldGroup className="gap-1.5">
        {conditions.map((condition, i) => (
          <ConditionRow
            key={`condition-${condition.name ?? ''}-${i}`}
            condition={condition}
            index={i}
            total={conditions.length}
            readOnly={readOnly}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onReorder={onReorder}
            renderExpressionEditor={renderExpressionEditor}
          />
        ))}

        {conditions.length === 0 && !showAddForm && (
          <p className="text-xs text-muted-foreground italic py-2 text-center">
            No conditions defined.
          </p>
        )}

        {showAddForm && (
          <AddConditionForm
            onAdd={handleAdd}
            onCancel={() => setShowAddForm(false)}
            showPostConditionToggle={showPostConditionToggle}
          />
        )}
      </FieldGroup>
    </FieldSet>
  );
}
