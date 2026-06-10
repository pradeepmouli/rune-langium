// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AstNode } from 'langium';
import type { Dehydrated } from '../serializer/dehydrated.js';

export const curatedAdapter = {
  parse<T extends AstNode>(json: unknown): Dehydrated<T> {
    return json as Dehydrated<T>;
  },
};
