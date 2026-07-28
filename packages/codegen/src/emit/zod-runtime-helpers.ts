// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Zod-only runtime helper source text — sibling to `../helpers.ts`
 * (RUNTIME_HELPER_SOURCE), but kept SEPARATE because it depends on the
 * `z` namespace. `../helpers.ts`'s helpers are inlined into BOTH the Zod
 * and TypeScript targets (ts-emitter documents "zero Zod dependency" as a
 * hard invariant — see ts-emitter.ts's file doc comment), so a `z`-typed
 * helper cannot live there without breaking that invariant.
 *
 * `runeExtendChoice` backs Data-extends-Choice emission (a `Data` whose
 * `superType` is a `Choice` — real corpus case: `BasketConstituent extends
 * Observable`). Per docs/superpowers/specs/2026-07-02-data-extends-choice-
 * design.md: the child is DERIVED from the Choice's emitted union schema
 * at module-init (distributing the child's own attributes across every
 * arm), not statically decomposed into a hand-unrolled union — the Choice
 * schema remains the single runtime source of truth.
 *
 * `.extend()` on a `z.strictObject` arm preserves strictness (verified
 * empirically against zod v4.4.3 — see the design spec's Verification
 * point 1), so distributing across `z.strictObject` arms keeps the
 * exactly-one-of-plus-extras shape structurally enforced with no extra
 * runtime check needed here.
 */
export const RUNE_EXTEND_CHOICE_HELPER_SOURCE: string =
  `const runeExtendChoice = <T extends z.ZodUnion<readonly z.ZodObject[]>>(choice: T, shape: z.ZodRawShape) =>\n` +
  `  z.union(choice.options.map((arm) => arm.extend(shape)));`;

/**
 * `export const` variant for the shared `runtime.zod.ts` sidecar (mirrors
 * how `zod-profile.ts`'s `RUNTIME_SIDECAR_SOURCE` re-declares `../helpers.ts`'s
 * helpers with `export const` so per-namespace files can import them when
 * `suppressBoilerplate: true`).
 */
export const RUNE_EXTEND_CHOICE_HELPER_SIDECAR_SOURCE: string =
  `export const runeExtendChoice = <T extends z.ZodUnion<readonly z.ZodObject[]>>(choice: T, shape: z.ZodRawShape) =>\n` +
  `  z.union(choice.options.map((arm) => arm.extend(shape)));`;
