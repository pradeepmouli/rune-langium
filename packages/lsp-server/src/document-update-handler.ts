// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Extends Langium's default document-update handling to actually remove a
 * closed document from the workspace index.
 *
 * @remarks
 * `DefaultDocumentUpdateHandler` (langium/lsp) does not implement
 * `didCloseDocument` — closing a document in the client only clears it from
 * `TextDocuments`' own tracked map (vscode-languageserver's plain text
 * buffer), never from `LangiumDocuments`' workspace index (the cross-file
 * scoping/reference store). Left unfixed, every file a client ever opens —
 * even briefly — stays indexed, and memory-resident, for the life of the
 * server. This override deletes the closed document from the index and
 * fires a proper rebuild pass so anything that referenced it re-resolves
 * correctly instead of holding a stale reference.
 */

import { DefaultDocumentUpdateHandler } from 'langium/lsp';
import type { TextDocumentChangeEvent } from 'vscode-languageserver';
import { URI, type TextDocument } from 'langium';

export class RuneDocumentUpdateHandler extends DefaultDocumentUpdateHandler {
  // Not `override` — DefaultDocumentUpdateHandler doesn't implement
  // didCloseDocument at all (it's optional on the DocumentUpdateHandler
  // interface the base class satisfies); this class adds a real
  // implementation, it doesn't override an existing one.
  didCloseDocument(event: TextDocumentChangeEvent<TextDocument>): void {
    const uri = URI.parse(event.document.uri);
    // Do NOT also call `this.langiumDocuments.deleteDocument(uri)` here —
    // `fireDocumentUpdate`'s underlying `DocumentBuilder.update([], [uri])`
    // already deletes it internally (via `LangiumDocuments.deleteDocuments`)
    // and only reports a URI in the `deleted` array passed to `onUpdate`
    // listeners if ITS OWN delete call actually found something to remove.
    // Pre-deleting it here left that internal delete with nothing to find,
    // so `onUpdate` listeners (e.g. a storage-mirror cleanup hook) never
    // saw the URI as deleted.
    this.fireDocumentUpdate([], [uri]); // protected on the base class
  }
}
