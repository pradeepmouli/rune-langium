// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Refactory Dark — CodeMirror 6 theme for Rune Studio.
 *
 * Matches the Refactory Dark design system palette.
 */

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { syntax } from '@rune-langium/design-system/tokens';

export const refactoryDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0C0C14',
      color: '#E8E6E1',
      height: '100%'
    },
    '.cm-scroller': {
      overflow: 'auto'
    },
    '.cm-content': {
      caretColor: '#00D4AA',
      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      fontSize: '13px',
      lineHeight: '1.6'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#00D4AA'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(0, 212, 170, 0.15)'
    },
    '.cm-activeLine': {
      backgroundColor: '#181824'
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
      backgroundColor: '#0C0C14',
      color: '#5C5C6A',
      border: 'none',
      borderRight: '1px solid rgba(255, 255, 255, 0.06)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#181824',
      color: '#8A8A96'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px'
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: '#5C5C6A'
    },
    '.cm-tooltip': {
      backgroundColor: '#12121C',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px'
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#1E1E2C'
      }
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(232, 145, 58, 0.15)',
      outline: '1px solid rgba(232, 145, 58, 0.3)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(232, 145, 58, 0.25)'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(0, 212, 170, 0.1)',
      outline: '1px solid rgba(0, 212, 170, 0.25)'
    },
    '.cm-panels': {
      backgroundColor: '#12121C',
      color: '#E8E6E1'
    },
    '.cm-panel.cm-search': {
      backgroundColor: '#12121C'
    }
  },
  { dark: true }
);

export const refactoryDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: syntax.keyword },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#E8E6E1' },
  { tag: [t.function(t.variableName), t.labelName], color: syntax.function },
  { tag: [t.propertyName], color: syntax.attribute },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#00D4AA' },
  { tag: [t.definition(t.name), t.separator], color: '#E8E6E1' },
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
  { tag: t.link, color: '#00D4AA', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#E8E6E1' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: syntax.constant },
  { tag: [t.processingInstruction, t.string, t.inserted], color: syntax.string },
  { tag: t.invalid, color: '#FF6058' },
  { tag: t.number, color: syntax.number }
]);

export const refactoryDark = [refactoryDarkTheme, syntaxHighlighting(refactoryDarkHighlightStyle)];
