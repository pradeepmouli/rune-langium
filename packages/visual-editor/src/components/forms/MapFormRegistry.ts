/**
 * MapFormRegistry — Map-backed implementation of ZodFormRegistry (T032).
 *
 * Provides an imperative add/get/has API for mapping Zod schema instances to
 * FormMeta metadata entries. Satisfies the ZodFormRegistry structural interface
 * required by @zod-to-form/react's useZodForm and ZodForm props.
 *
 * Usage:
 *   const reg = new MapFormRegistry();
 *   reg.add(MySchema, { fieldType: 'TypeSelector' });
 *   const meta = reg.get(MySchema); // { fieldType: 'TypeSelector' }
 *
 * @module
 */

import type { ZodType } from 'zod';
import type { FormMeta } from '@zod-to-form/react';

/**
 * Structural equivalent of ZodFormRegistry from @zod-to-form/core.
 * Defined locally to avoid a direct dep on @zod-to-form/core (not listed
 * as a direct dependency of this package). The class satisfies the
 * interface structurally, so it is assignable to the formRegistry prop
 * of useZodForm / ZodForm without an explicit cast.
 */
interface ZodFormRegistryLike {
  get(schema: ZodType): FormMeta | undefined;
  has(schema: ZodType): boolean;
}

/**
 * Map-backed registry that implements the ZodFormRegistry structural interface.
 *
 * Use this instead of `z.registry<FormMeta>()` when you need the imperative
 * `.add()` method with explicit type visibility in editor contexts.
 */
export class MapFormRegistry implements ZodFormRegistryLike {
  private readonly map = new Map<ZodType, FormMeta>();

  /**
   * Register metadata for a schema instance.
   *
   * @param schema - The Zod schema to annotate.
   * @param meta   - FormMeta to associate (fieldType, order, hidden, etc.).
   * @returns `this` for chaining.
   */
  add(schema: ZodType, meta: FormMeta): this {
    this.map.set(schema, meta);
    return this;
  }

  /** Returns the FormMeta registered for `schema`, or `undefined`. */
  get(schema: ZodType): FormMeta | undefined {
    return this.map.get(schema);
  }

  /** Returns `true` if a FormMeta entry exists for `schema`. */
  has(schema: ZodType): boolean {
    return this.map.has(schema);
  }
}
