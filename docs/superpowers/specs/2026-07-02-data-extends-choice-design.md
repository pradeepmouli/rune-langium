# Data-extends-Choice Emission — Design

**Follows:** transpiler & emitter parity (PR #364, merged). Closes the recorded follow-up: a `Data` whose **supertype is a `Choice`** (real corpus case: `BasketConstituent extends Observable`, `.resources/cdm/observable-asset-type.rosetta:211/220`) currently loses all inherited option fields in emitted output, and its conditions referencing inherited options produce `unknown attribute` diagnostics — guarded today by two load-bearing test allowlists.

## Semantics (Rune)

`type Child extends SomeChoice` = the child carries the choice's options (still exactly-one-of) PLUS its own attributes. Chains may be multi-level (`Data extends Data extends Choice`): extras accumulate down to the Choice ancestor.

## Design principle (user-directed)

**Express the inheritance in the emitted artifact — never statically decompose the union.** The child must be visibly *derived from* the Choice's emitted forms, per surface:

### TS type — generic intersection (retains arm narrowing)
```ts
export type BasketConstituent<T extends Observable = Observable> = T & {
  quantity?: NonNegativeQuantitySchedule[];
  // ...child's own attributes, emitted per existing attribute conventions
};
```
- Default type param = the Choice union → bare `BasketConstituent` behaves non-generically; a consumer holding a known arm writes `BasketConstituent<{ basket: Basket }>` and keeps narrowing.
- Child becomes a `type` alias (interfaces cannot extend unions) — documented deviation from the Data-emits-interface norm.
- Referencing sites (attributes typed by the child) use the bare name — unaffected.
- Multi-level: intermediate Data parents contribute their attributes into the extras block; the generic param binds at the Choice ancestor.

### TS class — per-Choice mixin
```ts
export const ObservableMixin = <TBase extends Constructor>(Base: TBase) =>
  class extends Base {
    asset?: Asset;
    basket?: Basket;
    // ...one optional field per option
    validateObservableChoice(): { valid: boolean; errors: string[] } { /* exactly-one-of over option keys */ }
  };

export class BasketConstituent extends ObservableMixin(/* today's base — see verification */) {
  quantity?: NonNegativeQuantitySchedule[];
  // ...own attributes + own validate methods per existing conventions
}
```
- Emitted ONCE per Choice (alongside the Choice's union type), reused by every child of that Choice; the mixin is the class-side analog of the zod helper.
- Shape precision: a child *holds* an option field (`basket?: Basket`), it is not *a* Basket — the mixin adds the option surface, it does not extend an arm class.
- `Constructor` helper type: emit once via the existing runtime-helper mechanism if not already present.

### Zod — `runeExtendChoice` runtime helper (derivation, not decomposition)
```ts
// runtime helper (emitted once, via the existing helper mechanism):
const runeExtendChoice = <T extends z.ZodUnion<any>>(choice: T, shape: z.ZodRawShape) =>
  z.union(choice.options.map((arm: z.ZodObject<any>) => arm.extend(shape)) as any);

export const BasketConstituentSchema = runeExtendChoice(ObservableSchema, {
  quantity: z.array(NonNegativeQuantityScheduleSchema).optional(),
  // ...
});
```
- `ObservableSchema` remains the runtime source of truth; distribution happens at module-init, centralized in one helper.
- Strict arms (`z.strictObject`, from #364) + `.extend` = each distributed arm admits exactly one option key plus the extras — exactly-one-of enforced structurally.

### Transpiler
`buildAttributeTypesMap` (and any sibling attribute-resolution path) resolves a Choice supertype via `choiceByName` and contributes the option names (camelCased per the W2 naming rule) as known attributes — killing the `unknown attribute 'Basket'` diagnostics. Multi-level chains resolve through Data parents to the Choice ancestor (the multi-level extends walk from #364's `buildAttributeTypesMap` fix is the starting point; extend it, keep its cycle guard).

## Verification points (ground truth, not assumption — implementer MUST check)

1. **Zod v4 behavior**: `.extend()` preserves `strictObject` strictness; `z.union` accepts mapped options (typing may need the helper-local cast). Verify with **emitted-runtime behavior tests**: evaluate emitted schema text against real zod — `{basket:…, quantity:…}` parses; `{basket:…, asset:…}` fails (multi-option); `{quantity:…}` alone fails (no option); extras validate per their own schemas.
2. **emitClass conventions**: what children extend today (a base class? nothing?), how validate methods attach, whether classes are emitted for all Data or conditionally — the mixin must slot into the real conventions, not invented ones.
3. **Generic-type references**: confirm no emitted reference site needs the type argument (all bare).

## Acceptance gate

Delete BOTH allowlist entries — `'BasketConstituent'`-related entries in `KNOWN_DATA_CONDITION_EXCEPTIONS` (`condition-transpile-corpus.test.ts`) and `"unknown attribute 'Basket'"` in `KNOWN_DIAGNOSTIC_EXCEPTIONS` (`choice-corpus-acceptance.test.ts`) — and the suites MUST pass without them. (The `CurrencyCodeEnum` exception is unrelated; leave it.) Plus: emitted-runtime behavior tests (above), unit tests per surface, multi-level chain test (synthetic fixture — the corpus has no multi-level case; parse-first validate the fixture), whole-monorepo green.

## Non-goals

- No change to plain Data-extends-Data emission, the W2 Choice union itself, or the option-key naming rule.
- No runtime library beyond the two small helpers (`Constructor` if needed, `runeExtendChoice`).
- Renderer/VE/display untouched.
