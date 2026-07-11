// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LanguageLensEditor — Rune/TypeScript toggle over a condition expression.
 *
 * Drop-in replacement for `<ExpressionBuilder>` in the `renderExpressionEditor`
 * slot (ExpressionEditorSlotProps). Defaults to showing the Rune text as-is
 * (no risk added over today's behavior). Toggling to TypeScript renders the
 * projection via `renderTs` (from `@rune-langium/codegen/lens`) when the
 * current expression is in subset S; otherwise shows read-only Rune with a
 * notice and disables further editing in that mode — it never shows an
 * approximate TypeScript rendering.
 *
 * Commit path: on blur, `parseTs` parses the edited TS buffer. A refusal
 * (syntax error or out-of-subset construct) is shown inline and `onChange`
 * is NOT called — canonical Rune is unaffected. A successful parse is
 * rendered back to canonical Rune text via `renderExpression` (the shipped,
 * corpus-tested Rune emitter) and handed to `onChange` UNCHANGED — this is
 * the exact same plain-text commit contract `ConditionSection.tsx`'s
 * Textarea fallback already uses (`onChange={(val) => onUpdate?.(index, {
 * expressionText: val })}`), so no new store-patch mechanism is needed.
 *
 * @module
 */
import { useEffect, useState, useCallback } from 'react';
import type { ExpressionEditorSlotProps } from '@rune-langium/visual-editor';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '@rune-langium/codegen/rosetta';
import { renderTs, parseTs } from '@rune-langium/codegen/lens';
import { cn } from '@rune-langium/design-system/utils';
import { Button } from '@rune-langium/design-system/ui/button';
import { getTsWasmBytes } from '../lens/ts-wasm-asset.js';

type Language = 'rune' | 'typescript';

export function LanguageLensEditor({ value, onChange, onBlur, error }: ExpressionEditorSlotProps) {
  const [language, setLanguage] = useState<Language>('rune');
  const [tsDraft, setTsDraft] = useState('');
  const [tsError, setTsError] = useState<string | null>(null);
  const [projection, setProjection] = useState<string | null>(null);

  // Recompute the TS projection whenever the canonical Rune text or the
  // language mode changes — never cached across a different `value`.
  useEffect(() => {
    if (language !== 'typescript') return;
    const parsed = parseExpression(value);
    if (parsed.hasErrors) {
      setProjection(null);
      return;
    }
    const ts = renderTs(parsed.value);
    setProjection(ts);
    if (ts !== null) setTsDraft(ts);
  }, [language, value]);

  const handleToggle = useCallback((next: Language) => {
    setTsError(null);
    setLanguage(next);
  }, []);

  const handleTsBlur = useCallback(async () => {
    let wasmBytes: Uint8Array;
    try {
      wasmBytes = await getTsWasmBytes();
    } catch {
      setTsError('Could not load the TypeScript parser — check your connection and try again.');
      return;
    }
    const result = await parseTs(tsDraft, wasmBytes);
    if (!result.ok) {
      setTsError(result.reason.message);
      return;
    }
    setTsError(null);
    const runeText = renderExpression(result.node);
    onChange(runeText);
    onBlur();
  }, [tsDraft, onChange, onBlur]);

  const outOfSubset = language === 'typescript' && projection === null;

  return (
    <div data-slot="language-lens-editor" className="flex flex-col gap-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant={language === 'rune' ? 'default' : 'outline'}
          size="xs"
          onClick={() => handleToggle('rune')}
        >
          Rune
        </Button>
        <Button
          type="button"
          variant={language === 'typescript' ? 'default' : 'outline'}
          size="xs"
          onClick={() => handleToggle('typescript')}
        >
          TypeScript
        </Button>
      </div>

      {language === 'rune' || outOfSubset ? (
        <pre className="studio-scroll text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap overflow-auto max-h-40">
          {value || '(empty)'}
        </pre>
      ) : (
        // Phase 1 stand-in for a real CodeMirror instance (see
        // ExpressionEditor.tsx's buildExtensions for the pattern this will
        // migrate to) — deliberate scope decision, not an unfinished path.
        <div
          role="textbox"
          aria-label="TypeScript expression"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          className={cn(
            'text-xs font-mono rounded p-2 border border-input bg-background min-h-[2.5rem]',
            (tsError || error) && 'border-destructive'
          )}
          onInput={(e) => setTsDraft(e.currentTarget.textContent ?? '')}
          onBlur={handleTsBlur}
        >
          {tsDraft}
        </div>
      )}

      {outOfSubset && (
        <p className="text-xs text-muted-foreground italic">This expression can't be shown in TypeScript.</p>
      )}
      {tsError && <p className="text-xs text-destructive">{tsError}</p>}
      {!tsError && error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
