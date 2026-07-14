// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import type { Data } from '@rune-langium/core';
import { buildNamespaceIndexes, type NamespaceIndex } from '../preview-schema.js';

function findDataByFqn(namespaces: NamespaceIndex[], typeFqn: string): Data | undefined {
  const lastDot = typeFqn.lastIndexOf('.');
  if (lastDot < 0) return undefined;
  const ns = typeFqn.slice(0, lastDot);
  const name = typeFqn.slice(lastDot + 1);
  const namespace = namespaces.find((n) => n.namespace === ns);
  return namespace?.dataByName.get(name)?.node;
}

/**
 * Look up the `Data` AST node for `typeFqn` — needed by callers (the studio
 * codegen worker's `instance:validate` handler) that must pass the AST node
 * itself to `getActiveConditionPredicates`, not just its generated preview
 * schema.
 */
export function findDataNode(typeFqn: string, documents: LangiumDocument[]): Data | undefined {
  return findDataByFqn(buildNamespaceIndexes(documents), typeFqn);
}
