// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEditorStore, selectNodeRepository } from '@rune-langium/visual-editor';

export interface TypeGraphNodeSnapshot {
  /** = the node's qualified name (makeNodeId(ns, name)). */
  id: string;
  /**
   * The node's raw domain payload (a lossless Dehydrated<T> per the
   * generated domain model — not a synthesized projection). Deliberately
   * NOT pre-extracted into an attribute/type-ref shape here: callers that
   * need to walk a specific node kind's members (Data.attributes,
   * Choice.attributes, Function.inputs, etc.) do their own kind-specific
   * extraction, keeping this bridge stable across domain-model shape
   * changes instead of duplicating that knowledge into production code.
   */
  data: unknown;
}

export interface RuneStudioTypeGraphBridge {
  snapshot(): TypeGraphNodeSnapshot[];
}

declare global {
  interface Window {
    __runeStudioTypeGraph?: RuneStudioTypeGraphBridge;
  }
}

/**
 * Installs an always-on, read-only window global exposing the currently
 * loaded graph nodes' raw domain data — unlike `test-api.ts`, this is NOT
 * gated by `import.meta.env.MODE`, so it works against the real production
 * build. It exposes nothing beyond what the graph/explorer already render;
 * there is no write method.
 */
export function installTypeGraphWindowBridge(): void {
  window.__runeStudioTypeGraph = {
    snapshot: () => {
      const nodesById = useEditorStore.getState().nodesById;
      const repo = selectNodeRepository(nodesById);
      return repo.all().map((node) => ({ id: node.id, data: node.data }));
    }
  };
}
