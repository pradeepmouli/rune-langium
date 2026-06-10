// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AstNode } from 'langium';
import type { Dehydrated } from '../serializer/dehydrated.js';
import { RuneStoreHydrator } from '../services/rune-store-hydrator.js';

const minimalServices = { Grammar: {}, parser: { Lexer: {} }, references: { Linker: {} } } as any;
const hydrator = new RuneStoreHydrator(minimalServices);

export const parsedAdapter = {
  dehydrate<T extends AstNode>(node: T): Dehydrated<T> {
    return hydrator.dehydrateNode(node);
  },
};
