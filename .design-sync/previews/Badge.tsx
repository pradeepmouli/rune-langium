// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Badge } from '@rune-langium/design-system';

// J05 inspector: type kind badges.
export const TypeKinds = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="data">data</Badge>
    <Badge variant="choice">choice</Badge>
    <Badge variant="enum">enum</Badge>
    <Badge variant="func">func</Badge>
    <Badge variant="record">record</Badge>
    <Badge variant="typeAlias">typeAlias</Badge>
    <Badge variant="basicType">basicType</Badge>
    <Badge variant="annotation">annotation</Badge>
  </div>
);

// J03 cdm-load / J14 git-sync: status badges.
export const Status = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Connected</Badge>
    <Badge variant="success">Synced</Badge>
    <Badge variant="warning">Unsaved changes</Badge>
    <Badge variant="error">3 errors</Badge>
    <Badge variant="destructive">Disconnected</Badge>
  </div>
);

// J07 source-lsp: neutral counts and outline tags.
export const CountsAndTags = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">142 namespaces</Badge>
    <Badge variant="secondary">1,208 types</Badge>
    <Badge variant="outline">cdm.product.template</Badge>
    <Badge variant="outline">read-only</Badge>
  </div>
);
