// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { DefaultWorkspaceManager, URI, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';
import { BASE_TYPE_FILES } from '../stdlib/base-types.js';

/** Load the shared language library under Langium's workspace build lock. */
export class RuneWorkspaceManager extends DefaultWorkspaceManager {
  constructor(private readonly services: LangiumSharedCoreServices) {
    super(services);
  }

  override async loadAdditionalDocuments(
    _folders: readonly unknown[],
    collector: (document: LangiumDocument) => void
  ): Promise<void> {
    const { LangiumDocuments, LangiumDocumentFactory } = this.services.workspace;
    for (const file of BASE_TYPE_FILES) {
      const uri = URI.parse(file.path);
      collector(LangiumDocuments.getDocument(uri) ?? LangiumDocumentFactory.fromString(file.content, uri));
    }
  }
}
