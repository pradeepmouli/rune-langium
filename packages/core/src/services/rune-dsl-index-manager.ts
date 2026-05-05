// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { DefaultIndexManager } from 'langium';
import type { AstNodeDescription, URI } from 'langium';
import type { LangiumSharedCoreServices } from 'langium';

/**
 * Extended IndexManager that supports external registration of exported
 * symbols without requiring a full document build. Used for deferred
 * deserialization of curated model artifacts (ADR 007 Phase 4).
 */
export class RuneDslIndexManager extends DefaultIndexManager {
  constructor(services: LangiumSharedCoreServices) {
    super(services);
  }

  /**
   * Register exported symbol descriptions for a document URI without
   * requiring the document to be parsed or built. The descriptions are
   * added directly to the symbol index, making them discoverable via
   * `allElements()` and cross-reference resolution.
   *
   * Call `clearExports(uri)` or `remove(uri)` before re-registering
   * to avoid duplicates.
   */
  registerExports(uri: URI, descriptions: AstNodeDescription[]): void {
    this.symbolIndex.set(uri.toString(), descriptions);
    this.symbolByTypeIndex.clear();
  }

  /**
   * Clear previously registered exports for a document URI.
   */
  clearExports(uri: URI): void {
    this.symbolIndex.delete(uri.toString());
    this.symbolByTypeIndex.clear();
  }
}
