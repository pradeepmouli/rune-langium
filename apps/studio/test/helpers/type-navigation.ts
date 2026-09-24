// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Locator, Page } from '@playwright/test';
import { makeNodeId, splitNodeId } from '@rune-langium/visual-editor';

/** Build the graph id used by the explorer and type-graph bridge. */
export function declarationNodeId(qualifiedName: string, kind = 'Data'): string {
  const { namespace, name } = splitNodeId(qualifiedName);
  return makeNodeId(namespace, name, kind);
}

/** Select a declaration by its qualified Rune name and AST kind. */
export function typeNavigationButton(root: Page | Locator, qualifiedName: string, kind = 'Data'): Locator {
  return root.getByTestId(`ns-type-nav-${declarationNodeId(qualifiedName, kind)}`);
}

/** The type name and its arrow share the same navigation action. */
export function typeNameButton(root: Page | Locator, qualifiedName: string, kind = 'Data'): Locator {
  return root.getByTestId(`ns-type-link-${declarationNodeId(qualifiedName, kind)}`);
}

/** Select the same declaration as an export root. */
export function typeSelectionCheckbox(root: Page | Locator, qualifiedName: string, kind = 'Data'): Locator {
  return root.getByTestId(`ns-type-checkbox-${declarationNodeId(qualifiedName, kind)}`);
}
