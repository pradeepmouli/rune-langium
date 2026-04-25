// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * MapFormRegistry — Map-backed implementation of ZodFormRegistry.
 *
 * Provides an imperative add/get/has API for mapping Zod schema instances
 * to FormMeta metadata entries.
 *
 * Usage:
 *   const reg = new MapFormRegistry();
 *   reg.add(MySchema, { component: 'TypeSelector' });
 *   const meta = reg.get(MySchema); // { component: 'TypeSelector' }
 */

import type { ZodType } from 'zod';
import type { FormMeta } from '@zod-to-form/core';

/**
 * Structural-shape registry compatible with the upstream
 * `ZodFormRegistry`'s public surface (`add` / `get` / `has`). The
 * upstream type itself is generic over a Zod-internal `$ZodType`
 * parameter, so an `implements` declaration would force us to
 * import from `zod/v4/core`. Structural compatibility is sufficient
 * for the prop sites (`useZodForm` / `<ZodForm>`); the upstream
 * accepts any object with this shape.
 */
export class MapFormRegistry {
  private readonly map = new Map<ZodType, FormMeta>();

  /** Register metadata for a schema instance. */
  add(schema: ZodType, meta: FormMeta): this {
    this.map.set(schema, meta);
    return this;
  }

  get(schema: ZodType): FormMeta | undefined {
    return this.map.get(schema);
  }

  has(schema: ZodType): boolean {
    return this.map.has(schema);
  }
}
