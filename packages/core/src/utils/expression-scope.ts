// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { AstUtils } from 'langium';
import {
  isRosettaFunction,
  isRosettaExternalFunction,
  isAttribute,
  isShortcutDeclaration,
  type RosettaExpression
} from '../generated/ast.js';
import type { RuneDslServices } from '../services/rune-dsl-module.js';
import { getFunctionSignature, getFunctionInputs, getFunctionOutput } from './expression-utils.js';
import { toConstraintString } from './cardinality-utils.js';

export interface ExpressionScopeEntry {
  name: string;
  declarationId: string;
  kind: 'input' | 'output' | 'alias' | 'attribute' | 'callable' | 'enum';
  typeName?: string;
  cardinality?: string;
  argumentCount?: number;
}

/** Describe the existing language-service scope at an expression, without a second resolver. */
export function getExpressionScope(expression: RosettaExpression, services: RuneDslServices): ExpressionScopeEntry[] {
  const probe = {
    $type: 'RosettaSymbolReference',
    $container: expression.$container,
    symbol: { $refText: '', ref: undefined },
    args: [],
    rawArgs: [],
    explicitArguments: false
  };
  const scope = services.references.ScopeProvider.getScope({
    container: probe,
    property: 'symbol',
    reference: probe.symbol
  });
  const owner = AstUtils.getContainerOfType(expression, isRosettaFunction);
  const declarations = services.shared.workspace.LangiumDocuments.all
    .flatMap((doc) => {
      const root = doc.parseResult.value;
      return root.$type === 'RosettaModel' && 'elements' in root
        ? (root.elements as unknown[]).filter(isRosettaFunction)
        : [];
    })
    .toArray();
  const signature = owner ? getFunctionSignature(owner, declarations) : undefined;
  const currentAlias = AstUtils.getContainerOfType(expression, isShortcutDeclaration);
  const entries: ExpressionScopeEntry[] = [];
  const names = new Set<string>();
  for (const description of scope.getAllElements()) {
    if (names.has(description.name)) continue;
    const root = services.shared.workspace.LangiumDocuments.getDocument(description.documentUri)?.parseResult.value;
    const node =
      description.node ?? (root ? services.workspace.AstNodeLocator.getAstNode(root, description.path) : undefined);
    let kind: ExpressionScopeEntry['kind'];
    if (node && isShortcutDeclaration(node)) {
      if (
        currentAlias &&
        owner &&
        owner.shortcuts.includes(node) &&
        owner.shortcuts.indexOf(node) >= owner.shortcuts.indexOf(currentAlias)
      )
        continue;
      kind = 'alias';
    } else if (node && isAttribute(node)) {
      kind =
        signature && getFunctionOutput(signature) === node
          ? 'output'
          : signature && getFunctionInputs(signature).includes(node)
            ? 'input'
            : 'attribute';
    } else if (description.type === 'RosettaFunction' || description.type === 'RosettaExternalFunction')
      kind = 'callable';
    else if (description.type === 'RosettaEnumValue') kind = 'enum';
    else continue;
    names.add(description.name);
    const typed = node && isAttribute(node) ? node : undefined;
    entries.push({
      name: description.name,
      kind,
      declarationId: `${description.documentUri.toString()}#${description.path}`,
      ...(typed ? { typeName: typed.typeCall.type.$refText, cardinality: toConstraintString(typed.card) } : {}),
      ...(node && isRosettaFunction(node)
        ? { argumentCount: getFunctionInputs(node, new Set(), declarations).length }
        : node && isRosettaExternalFunction(node)
          ? { argumentCount: node.parameters.length }
          : {})
    });
  }
  return entries;
}
