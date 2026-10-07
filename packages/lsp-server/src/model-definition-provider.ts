// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { AstUtils, CstUtils, type CstNode, type AstNodeWithTextRegion } from 'langium';
import { DefaultDefinitionProvider } from 'langium/lsp';
import { LocationLink, type DefinitionParams } from 'vscode-languageserver';

/** Canonical serialized declaration ranges replace CST ranges for dependencies. */
export class RuneModelDefinitionProvider extends DefaultDefinitionProvider {
  protected override async collectLocationLinks(
    source: CstNode,
    params: DefinitionParams
  ): Promise<LocationLink[] | undefined> {
    const targets = this.references.findDeclarations(source);
    const links = targets.flatMap((target) => {
      if (target.$cstNode) return [];
      const region = (target as AstNodeWithTextRegion).$textRegion;
      const name = region?.assignments?.name?.[0];
      if (!region || !name) return [];
      return [
        LocationLink.create(
          AstUtils.getDocument(target).uri.toString(),
          region.range,
          name.range,
          (CstUtils.getDatatypeNode(source) ?? source).range
        )
      ];
    });
    return links.length
      ? [...((await super.collectLocationLinks(source, params)) ?? []), ...links]
      : super.collectLocationLinks(source, params);
  }
}
