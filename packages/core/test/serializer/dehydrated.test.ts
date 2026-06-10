// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expectTypeOf, it } from 'vitest';
import type { Dehydrated } from '../../src/serializer/dehydrated.js';
import type { Data } from '../../src/generated/ast.js';

describe('Dehydrated<T> $namespace', () => {
  it('has optional $namespace string field', () => {
    expectTypeOf<Dehydrated<Data>['$namespace']>().toEqualTypeOf<string | undefined>();
  });

  it('$type and $namespace are both present on the type', () => {
    expectTypeOf<Dehydrated<Data>>().toHaveProperty('$type');
    expectTypeOf<Dehydrated<Data>>().toHaveProperty('$namespace');
  });
});
