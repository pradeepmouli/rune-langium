/**
 * AnnotationSection — Displays and manages annotations on a type.
 *
 * Shows annotation badges parsed from the AST, with add/remove
 * capability for editable types.
 *
 * @module
 */

import { useCallback, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Button } from '@rune-langium/design-system/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@rune-langium/design-system/ui/collapsible';
import type { AnnotationDisplay } from '../../types.js';

export interface AnnotationSectionProps {
  /** Current annotations on the type. */
  annotations: AnnotationDisplay[];
  /** Available annotation names for adding. */
  availableAnnotations?: string[];
  /** Whether to allow editing (add/remove). */
  readOnly?: boolean;
  /** Called when an annotation is added. */
  onAdd?: (name: string) => void;
  /** Called when an annotation is removed. */
  onRemove?: (index: number) => void;
}

/** Default well-known Rune DSL annotations. */
const WELL_KNOWN_ANNOTATIONS = [
  'metadata',
  'rootType',
  'calculation',
  'qualification',
  'deprecated',
  'ingest',
  'enrich',
  'projection',
  'codeImplementation',
  'suppressWarnings'
];

export function AnnotationSection({
  annotations,
  availableAnnotations = WELL_KNOWN_ANNOTATIONS,
  readOnly = false,
  onAdd,
  onRemove
}: AnnotationSectionProps) {
  const [showPicker, setShowPicker] = useState(false);

  const existingNames = new Set(annotations.map((a) => a.name));
  const addable = availableAnnotations.filter((name) => !existingNames.has(name));

  const handleAdd = useCallback(
    (name: string) => {
      onAdd?.(name);
      setShowPicker(false);
    },
    [onAdd]
  );

  if (annotations.length === 0 && readOnly) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground px-1">Annotations</span>
        {!readOnly && addable.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowPicker(!showPicker)}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            aria-label="Add annotation"
          >
            <Plus className="size-3" />
          </Button>
        )}
      </div>

      {/* Existing annotations */}
      <div className="flex flex-wrap gap-1 px-1">
        {annotations.map((ann, i) => (
          <Badge
            key={`${ann.name}-${i}`}
            variant="annotation"
            className="gap-1 text-[10px] h-5 pl-1.5 pr-1"
          >
            [{ann.name}]{ann.attribute && <span className="opacity-60">.{ann.attribute}</span>}
            {!readOnly && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                aria-label={`Remove ${ann.name} annotation`}
              >
                <X className="size-2.5" />
              </button>
            )}
          </Badge>
        ))}
        {annotations.length === 0 && (
          <span className="text-[10px] text-muted-foreground/60 italic">No annotations</span>
        )}
      </div>

      {/* Picker */}
      {showPicker && (
        <div className="border border-border rounded-md p-1.5 space-y-0.5 bg-popover">
          {addable.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => handleAdd(name)}
              className="flex items-center w-full px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-left"
            >
              [{name}]
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
