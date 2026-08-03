// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEditorStore, selectNodeRepository } from '@rune-langium/visual-editor';
import { withInstrumentation } from './instrumentation/core.js';

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

export const installTypeGraphWindowBridge = withInstrumentation(
  function installTypeGraphWindowBridge(): void {
    window.__runeStudioTypeGraph = {
      snapshot: () => {
        const nodesById = useEditorStore.getState().nodesById;
        const repo = selectNodeRepository(nodesById);
        return repo.all().map((node) => ({ id: node.id, data: node.data }));
      }
    };
    // The bridge's own snapshot() closure (exposed on window, not itself
    // wrapped) returns raw domain node data (see TypeGraphNodeSnapshot's doc
    // comment) — deliberately outside instrumentation's capture; this installer
    // call itself takes no args and returns void.
  },
  { op: 'installTypeGraphWindowBridge' }
);
