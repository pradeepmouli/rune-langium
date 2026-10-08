// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from '../services/instrumentation/core.js';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { studioEditorExtensions } from './editor-theme.js';

export const externalDocumentChange = Annotation.define<boolean>();

/** Shared chrome and read-only enforcement for source and generated views. */
export const editorExtensions = withInstrumentation(
  function editorExtensions(language: Extension, readOnly = false): Extension[] {
    return [
      EditorState.lineSeparator.of('\n'),
      basicSetup,
      EditorView.lineWrapping,
      ...studioEditorExtensions,
      language,
      ...(readOnly
        ? [
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.contentAttributes.of({ tabindex: '0' })
          ]
        : []),
      EditorState.transactionFilter.of((tr) =>
        tr.docChanged && tr.startState.facet(EditorState.readOnly) && !tr.annotation(externalDocumentChange) ? [] : tr
      )
    ];
  },
  { op: 'editorExtensions' }
);
