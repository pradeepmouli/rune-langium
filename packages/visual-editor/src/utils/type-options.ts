// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { resolveNodeKind } from '../adapters/model-helpers.js';
import type { NodeRepository } from '../store/node-repository.js';
import { BUILTIN_TYPES, type TypeOption } from '../types.js';

/**
 * Projects the editor's canonical node repository into type-selector options.
 *
 * Node ids stay qualified so same-named declarations from separate namespaces
 * remain independently selectable. Deferred repository entries are included
 * because they are valid workspace reference targets before hydration.
 */
export function buildTypeOptions(repository: NodeRepository, includeBuiltins = true): TypeOption[] {
  const builtinOptions: TypeOption[] = includeBuiltins
    ? BUILTIN_TYPES.map((name) => ({ value: `builtin::${name}`, label: name, kind: 'builtin' }))
    : [];
  const graphOptions: TypeOption[] = repository.all().map((node) => ({
    value: node.id,
    label: node.data.name,
    kind: resolveNodeKind(node) as TypeOption['kind'],
    namespace: node.meta.namespace
  }));

  return [...builtinOptions, ...graphOptions];
}
