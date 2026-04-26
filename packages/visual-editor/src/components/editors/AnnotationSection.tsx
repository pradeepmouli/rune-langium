// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * AnnotationSection — Displays and manages annotations on a type.
 *
 * Shows annotation badges parsed from the AST, with add/remove
 * capability for editable types.
 *
 * Two call paths are supported (Phase 7 / US5):
 *
 * 1. **Imperative**: the host passes `annotations`, `onAdd`, `onRemove`
 *    directly as props.
 * 2. **Declarative**: the section is resolved by name from z2f's
 *    `componentModule` and only receives `fields: string[]`. The
 *    component reads `annotations` from `useFormContext()` and falls
 *    back to `useEditorActionsContext()` for the callbacks.
 *
 * @module
 */

import { useCallback, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Button } from '@rune-langium/design-system/ui/button';
import { annotationsToDisplay, type AnnotationDisplayInfo } from '../../adapters/model-helpers.js';
import { useEditorActionsContext } from '../forms/sections/EditorActionsContext.js';

export interface AnnotationSectionProps {
  /**
   * Raw AST annotation refs from the graph node.
   * Internally converted to display-friendly objects via annotationsToDisplay().
   * Optional in the declarative path — read from form context when omitted.
   */
  annotations?: unknown[] | undefined;
  /** Available annotation names for adding. */
  availableAnnotations?: string[];
  /** Whether to allow editing (add/remove). */
  readOnly?: boolean;
  /** Called when an annotation is added. */
  onAdd?: (name: string) => void;
  /** Called when an annotation is removed. */
  onRemove?: (index: number) => void;
  /**
   * z2f-host-supplied list of field paths this section groups (declarative
   * path). Optional and intentionally unused at render time per
   * `section-component.md` §3 — the section knows its field set.
   */
  fields?: string[];
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
  annotations: rawAnnotations,
  availableAnnotations,
  readOnly,
  onAdd,
  onRemove
}: AnnotationSectionProps) {
  const [showPicker, setShowPicker] = useState(false);

  // ------ Declarative-path fallbacks (Phase 7 / US5) ----------------------
  //
  // When `annotations` is not passed, we are in the declarative path and
  // read the raw AST refs from form state. Callbacks similarly fall back
  // to the editor-actions context. Either path is no-op safe.
  const ctx = useEditorActionsContext();
  const formCtx = useFormContext();

  const annotationsFromForm =
    rawAnnotations === undefined
      ? (formCtx?.watch?.('annotations') as unknown[] | undefined)
      : undefined;
  const effectiveRawAnnotations = rawAnnotations ?? annotationsFromForm;

  const effectiveAvailable =
    availableAnnotations ?? ctx?.availableAnnotations ?? WELL_KNOWN_ANNOTATIONS;
  const effectiveReadOnly = readOnly ?? ctx?.readOnly ?? false;

  const effectiveOnAdd = useCallback(
    (name: string) => {
      if (onAdd) return onAdd(name);
      if (ctx) ctx.actions.addAnnotation(ctx.nodeId, name);
    },
    [onAdd, ctx]
  );
  const effectiveOnRemove = useCallback(
    (index: number) => {
      if (onRemove) return onRemove(index);
      if (ctx) ctx.actions.removeAnnotation(ctx.nodeId, index);
    },
    [onRemove, ctx]
  );

  const annotations: AnnotationDisplayInfo[] = useMemo(
    () => annotationsToDisplay(effectiveRawAnnotations as any),
    [effectiveRawAnnotations]
  );

  const existingNames = new Set(annotations.map((a) => a.name));
  const addable = effectiveAvailable.filter((name) => !existingNames.has(name));

  const handleAdd = useCallback(
    (name: string) => {
      effectiveOnAdd(name);
      setShowPicker(false);
    },
    [effectiveOnAdd]
  );

  if (annotations.length === 0 && effectiveReadOnly) return null;

  return (
    <div data-slot="annotation-section" className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground px-1">Annotations</span>
        {!effectiveReadOnly && addable.length > 0 && (
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
            {!effectiveReadOnly && (
              <button
                type="button"
                onClick={() => effectiveOnRemove(i)}
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
