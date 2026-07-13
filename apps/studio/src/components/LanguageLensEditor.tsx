// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LanguageLensEditor — Rune/TypeScript/Python toggle over a condition expression.
 *
 * Drop-in replacement for `<ExpressionBuilder>` in the `renderExpressionEditor`
 * slot (ExpressionEditorSlotProps). Defaults to showing the Rune text as-is
 * (no risk added over today's behavior). Toggling to a foreign language
 * (TypeScript or Python) renders the projection via that language's `render`
 * function (from `@rune-langium/codegen/lens`) when the current expression is
 * in subset S; otherwise shows read-only Rune with a notice and disables
 * further editing in that mode — it never shows an approximate rendering.
 *
 * Commit path: on blur, the active language's `parse` function parses the
 * edited buffer. A refusal (syntax error or out-of-subset construct) is
 * shown inline and `onChange` is NOT called — canonical Rune is unaffected.
 * A successful parse is compared structurally (via `treesEquivalent`)
 * against the current canonical Rune text — if the edited buffer's tree is
 * equivalent to the original (e.g. the field was toggled and blurred without
 * a real edit), `onChange` is skipped so an unedited field never rewrites
 * the canonical text's formatting. A real edit is rendered back to
 * canonical Rune text via `renderExpression` (the shipped, corpus-tested
 * Rune emitter) and handed to `onChange` UNCHANGED — this is the exact same
 * plain-text commit contract `ConditionSection.tsx`'s Textarea fallback
 * already uses (`onChange={(val) => onUpdate?.(index, { expressionText: val })}`),
 * so no new store-patch mechanism is needed.
 *
 * `onBlur` fires on every outcome above — success (no-op or real edit),
 * refusal, WASM load failure, or an unexpected throw — because it's the
 * slot's blur notification (marks the field touched / triggers validation
 * upstream), not just a commit signal; a real DOM blur happened regardless
 * of whether the parse succeeded, so upstream form state must see it.
 *
 * Each foreign language is described by a `LensDescriptor` in the `LENSES`
 * table below — the projection/parse/blur logic is written once, generic
 * over the active language's descriptor, so adding a further language is a
 * data addition (one more `LENSES` entry) rather than a new component or a
 * duplicated effect/blur-handler.
 *
 * @module
 */
import { useEffect, useState, useCallback } from 'react';
import type { ExpressionEditorSlotProps } from '@rune-langium/visual-editor';
import { parseExpression } from '@rune-langium/core';
import type { RosettaExpression } from '@rune-langium/core';
import { renderExpression, treesEquivalent } from '@rune-langium/codegen/rosetta';
import { renderTs, parseTs, renderPy, parsePy } from '@rune-langium/codegen/lens';
import type { LensResult } from '@rune-langium/codegen/lens';
import { cn } from '@rune-langium/design-system/utils';
import { Button } from '@rune-langium/design-system/ui/button';
import { getTsWasmBytes } from '../lens/ts-wasm-asset.js';
import { getPyWasmBytes } from '../lens/py-wasm-asset.js';

type Language = 'rune' | 'typescript' | 'python';
type ForeignLanguage = Exclude<Language, 'rune'>;

interface LensDescriptor {
  label: string;
  render: (node: RosettaExpression) => string | null;
  parse: (text: string, wasmBytes: Uint8Array) => Promise<LensResult>;
  getWasmBytes: () => Promise<Uint8Array>;
}

const LENSES: Record<ForeignLanguage, LensDescriptor> = {
  typescript: { label: 'TypeScript', render: renderTs, parse: parseTs, getWasmBytes: getTsWasmBytes },
  python: { label: 'Python', render: renderPy, parse: parsePy, getWasmBytes: getPyWasmBytes }
};

export function LanguageLensEditor({ value, onChange, onBlur, error }: ExpressionEditorSlotProps) {
  const [language, setLanguage] = useState<Language>('rune');
  const [foreignDraft, setForeignDraft] = useState('');
  const [foreignError, setForeignError] = useState<string | null>(null);
  const [projection, setProjection] = useState<string | null>(null);

  const descriptor = language === 'rune' ? null : LENSES[language];

  // Recompute the foreign-language projection whenever the canonical Rune
  // text or the language mode changes — never cached across a different
  // `value`.
  useEffect(() => {
    if (language === 'rune') return;
    const activeDescriptor = LENSES[language];
    const parsed = parseExpression(value);
    if (parsed.hasErrors) {
      setProjection(null);
      return;
    }
    const rendered = activeDescriptor.render(parsed.value);
    setProjection(rendered);
    if (rendered !== null) setForeignDraft(rendered);
  }, [language, value]);

  const handleToggle = useCallback((next: Language) => {
    setForeignError(null);
    setLanguage(next);
  }, []);

  const handleForeignBlur = useCallback(async () => {
    if (language === 'rune') return;
    const activeDescriptor = LENSES[language];

    // `onBlur` is the slot's blur notification (marks the field touched /
    // triggers validation upstream — see ExpressionEditorSlotProps), not
    // just a commit signal, so every path below calls it — a refused parse,
    // a load failure, or an unexpected throw is still a real DOM blur that
    // upstream form state (e.g. FunctionForm's field.onBlur()) must see.
    let wasmBytes: Uint8Array;
    try {
      wasmBytes = await activeDescriptor.getWasmBytes();
    } catch {
      setForeignError(`Could not load the ${activeDescriptor.label} parser — check your connection and try again.`);
      onBlur();
      return;
    }

    try {
      const result = await activeDescriptor.parse(foreignDraft, wasmBytes);
      if (!result.ok) {
        setForeignError(result.reason.message);
        onBlur();
        return;
      }
      setForeignError(null);

      const original = parseExpression(value);
      const isNoOp = !original.hasErrors && treesEquivalent(original.value, result.node);
      if (!isNoOp) {
        const runeText = renderExpression(result.node);
        onChange(runeText);
      }
      onBlur();
    } catch {
      setForeignError('Something went wrong parsing that expression — try again.');
      onBlur();
    }
  }, [language, foreignDraft, value, onChange, onBlur]);

  const outOfSubset = descriptor !== null && projection === null;

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
        {(Object.keys(LENSES) as ForeignLanguage[]).map((lang) => (
          <Button
            key={lang}
            type="button"
            variant={language === lang ? 'default' : 'outline'}
            size="xs"
            onClick={() => handleToggle(lang)}
          >
            {LENSES[lang].label}
          </Button>
        ))}
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
          aria-label={`${descriptor!.label} expression`}
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          className={cn(
            'text-xs font-mono rounded p-2 border border-input bg-background min-h-[2.5rem]',
            (foreignError || error) && 'border-destructive'
          )}
          onInput={(e) => setForeignDraft(e.currentTarget.textContent ?? '')}
          onBlur={handleForeignBlur}
        >
          {foreignDraft}
        </div>
      )}

      {outOfSubset && (
        <p className="text-xs text-muted-foreground italic">This expression can't be shown in {descriptor!.label}.</p>
      )}
      {foreignError && <p className="text-xs text-destructive">{foreignError}</p>}
      {!foreignError && error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
