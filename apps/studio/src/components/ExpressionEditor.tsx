/**
 * ExpressionEditor — CodeMirror 6 expression editor for function definitions.
 *
 * This component provides syntax-highlighted editing of Rune DSL expressions.
 * It is injected into `FunctionForm` via the `renderExpressionEditor` slot
 * so that the `visual-editor` package stays free of CodeMirror dependencies.
 *
 * @module
 */

import { useRef, useEffect, useCallback } from 'react';
import { EditorView, placeholder as cmPlaceholder, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { runeDslLanguage } from '../lang/rune-dsl.js';
import { cn } from '@rune-langium/design-system/utils';
import type { ExpressionEditorSlotProps } from '@rune-langium/visual-editor';

// ---------------------------------------------------------------------------
// Minimal CM extensions for an inline expression editor
// ---------------------------------------------------------------------------

function buildExtensions(
  onChange: (value: string) => void,
  onBlur: () => void,
  placeholderText?: string
): Extension[] {
  return [
    keymap.of(defaultKeymap),
    syntaxHighlighting(defaultHighlightStyle),
    runeDslLanguage(),

    // Single-line feel: soft-wrap, no line numbers, compact padding
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        fontSize: '13px',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)'
      },
      '.cm-content': {
        padding: '8px 10px',
        minHeight: '80px'
      },
      '.cm-focused': {
        outline: 'none'
      },
      '&.cm-editor': {
        borderRadius: '6px',
        border: '1px solid var(--border, hsl(var(--border)))',
        backgroundColor: 'var(--input, hsl(var(--input)))'
      },
      '&.cm-editor.cm-focused': {
        borderColor: 'var(--ring, hsl(var(--ring)))',
        boxShadow: '0 0 0 1px var(--ring, hsl(var(--ring)))'
      }
    }),

    // Placeholder
    ...(placeholderText ? [cmPlaceholder(placeholderText)] : []),

    // onChange listener
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),

    // onBlur listener
    EditorView.domEventHandlers({
      blur: () => {
        onBlur();
        return false;
      }
    })
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpressionEditor({
  value,
  onChange,
  onBlur,
  error,
  placeholder
}: ExpressionEditorSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef({ onChange, onBlur });
  callbacksRef.current = { onChange, onBlur };

  // Stable callbacks that read from ref — avoids re-creating CM on every render
  const stableOnChange = useCallback((val: string) => callbacksRef.current.onChange(val), []);
  const stableOnBlur = useCallback(() => callbacksRef.current.onBlur(), []);

  // Create CM instance
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(stableOnChange, stableOnBlur, placeholder)
    });

    const view = new EditorView({
      state,
      parent: containerRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create once — value sync handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into CM (e.g. form reset)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value }
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      data-slot="expression-editor"
      className={cn('expression-editor-cm', error && '[&_.cm-editor]:border-red-500')}
      aria-label="Function expression"
    />
  );
}
