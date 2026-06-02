// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * CodeMirror 6 theme for Rune Studio — token-driven, adapts to the active
 * design-system theme (daikonic by default). The chrome (gutters, selection,
 * search, autocomplete, tooltips) uses semantic CSS design tokens so it stays
 * consistent with whatever theme is active; syntax highlighting derives its
 * palette from the `syntax.*` tokens.
 */

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { syntax } from '@rune-langium/design-system/tokens';

export const refactoryDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
      height: '100%'
    },
    '.cm-scroller': {
      overflow: 'auto'
    },
    '.cm-content': {
      caretColor: 'var(--primary)',
      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      fontSize: '13px',
      lineHeight: '1.6'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--primary)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)'
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 34%, transparent)'
    },
    '.cm-gutters': {
      // Match .cm-content's mono font, size, and line-height so the line
      // numbers are monospace and vertically aligned with the code lines.
      // The gutter is a sibling of (not nested in) .cm-content, so it does
      // NOT inherit the content font — without this it falls back to the body
      // UI font (Inter), rendering proportional and misaligned against the
      // JetBrains Mono content.
      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      fontSize: '13px',
      lineHeight: '1.6',
      backgroundColor: 'color-mix(in srgb, var(--card) 92%, var(--background))',
      color: 'var(--muted-foreground)',
      border: 'none',
      borderRight: '1px solid var(--border)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 42%, var(--card))',
      color: 'var(--muted-foreground)'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px'
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: 'var(--muted-foreground)'
    },
    '.cm-tooltip': {
      backgroundColor: 'color-mix(in srgb, var(--card) 88%, var(--background))',
      border: '1px solid var(--border)',
      borderRadius: '8px'
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)'
      }
    },
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in srgb, var(--color-warning) 22%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--color-warning) 45%, transparent)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)'
    },
    '.cm-panels': {
      backgroundColor: 'var(--popover)',
      color: 'var(--foreground)'
    },
    '.cm-panel.cm-search': {
      backgroundColor: 'var(--popover)'
    }
  },
  { dark: true }
);

export const refactoryDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: syntax.keyword },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--foreground)' },
  { tag: [t.function(t.variableName), t.labelName], color: syntax.function },
  { tag: [t.propertyName], color: syntax.attribute },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: syntax.variable },
  { tag: [t.definition(t.name), t.separator], color: 'var(--foreground)' },
  {
    tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: syntax.type
  },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
    color: syntax.operator
  },
  { tag: [t.meta, t.comment], color: syntax.comment, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: syntax.variable, textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: 'var(--foreground)' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: syntax.constant },
  { tag: [t.processingInstruction, t.string, t.inserted], color: syntax.string },
  { tag: t.invalid, color: 'var(--color-error)' },
  { tag: t.number, color: syntax.number }
]);

export const refactoryDark = [refactoryDarkTheme, syntaxHighlighting(refactoryDarkHighlightStyle)];
