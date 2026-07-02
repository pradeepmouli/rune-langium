# Data-extends-Choice Emission — Design

**Follows:** transpiler & emitter parity (PR #364, merged). Closes the recorded follow-up: a `Data` whose **supertype is a `Choice`** (real corpus case: `BasketConstituent extends Observable`, `.resources/cdm/observable-asset-type.rosetta:211/220`) currently loses all inherited option fields in emitted output, and its conditions referencing inherited options produce `unknown attribute` diagnostics — guarded today by two load-bearing test allowlists.

## Semantics (Rune)

`type Child extends SomeChoice` = the child carries the choice's options (still exactly-one-of) PLUS its own attributes. Chains may be multi-level (`Data extends Data extends Choice`): extras accumulate down to the Choice ancestor.

## Design principle (user-directed)

**Express the inheritance in the emitted artifact — never statically decompose the union.** The child must be visibly *derived from* the Choice's emitted forms, per surface:

### TS type — generic intersection (retains arm narrowing)

**Naming (implemented, post-hoc amendment):** the snippet below names the alias after the Data itself (`BasketConstituent<T> = …`), but the emitted CLASS (see "TS class" below) already owns that bare name — a type alias and a class cannot share an identifier. The collision-free resolution: the generic intersection alias IS the `<Name>Shape` symbol (the same `<Name>Shape` idiom `emitInterface` already uses for every Data, just generic instead of a plain interface for this one case). So the real emitted symbol is `BasketConstituentShape<T extends Observable = Observable> = T & {...}`, not `BasketConstituent<T> = …`:
```ts
export type BasketConstituentShape<T extends Observable = Observable> = T & {
  quantity?: NonNegativeQuantitySchedule[];
  // ...child's own attributes, emitted per existing attribute conventions
};
```
- Default type param = the Choice union → bare `BasketConstituentShape` behaves non-generically; a consumer holding a known arm writes `BasketConstituentShape<{ basket: Basket }>` and keeps narrowing.
- Child's Shape becomes a `type` alias (interfaces cannot extend unions) — documented deviation from the Data-emits-interface norm.
- Referencing sites (attributes typed by the child) use the bare name — unaffected.
- Multi-level: intermediate Data parents contribute their attributes into the extras block; the generic param binds at the Choice ancestor. Concretely, each intermediate Data-extends-Data link whose OWN chain reaches the Choice ancestor also becomes a generic alias, chaining `<Parent>Shape<T>` (not `extends`, which fails to typecheck once the parent's default resolves to a union) — e.g. `ObservableItemShape<T> = T & {...}` then `BasketConstituentShape<T> = ObservableItemShape<T> & {...}`.
- The CLASS cannot `implements <Name>Shape` once `<Name>Shape` is generic (bare form resolves to a union-rooted intersection, and a class may only implement an object type) — see the "TS class" section's amended snippet.

### TS class — generic child class (AMENDED mid-implementation, user-directed — supersedes the original per-Choice-mixin design below the line)

No `ObservableMixin` / no per-Choice mixin at all — TS's `class X<T> extends T`
is not expressible against a type parameter, and a mixin's `class extends
Base {}` shape doesn't fit a Choice's *union* schema anyway (a mixin factory
needs a single base *class* to extend, not a discriminated union of arm
shapes). Instead, the CHILD CLASS ITSELF is generic over the arm, mirroring
the type-side `BasketConstituentShape<T> = T & extras` exactly:

```ts
// NOTE (implemented): no `implements BasketConstituentShape` — once
// BasketConstituentShape is the generic alias, its bare (no-type-argument)
// form resolves to `Observable & {...}` (union-rooted); a class may only
// implement an object type, not a union (real tsc --strict: TS2422). The
// class/alias pairing is enforced by the constructor parameter + emitted-
// runtime tests instead of a structural `implements` clause.
export class BasketConstituent<T extends Observable = Observable> {
  quantity?: NonNegativeQuantitySchedule[];
  // ...own attributes, emitted per existing attribute conventions

  constructor(data: BasketConstituentShape<T>) {
    Object.assign(this, data);
    this.quantity = data.quantity as typeof this.quantity;
    // ...own-attribute assignments per existing emitClass conventions
  }

  static from(json: unknown): BasketConstituent {
    if (!isBasketConstituent(json)) {
      throw new TypeError('not a BasketConstituent: ' + JSON.stringify(json).slice(0, 100));
    }
    // Cast through `unknown`: `json` (typed `unknown`) does not overlap a
    // union-rooted intersection closely enough for a direct `as` (TS2352).
    return new BasketConstituent(json as unknown as BasketConstituentShape);
  }

  validateObservableChoice(): { valid: boolean; errors: string[] } {
    /* exactly-one-of over option keys, reading `(this as unknown as
       Record<string, unknown>).<optionKey>` — the class does not statically
       declare Choice option keys as members (only Object.assign populates
       them at runtime), so a direct `this.<optionKey>` fails tsc --strict
       (TS2339). */
  }
}
```

**Encoding chosen**: constructor-parameter generic + `Object.assign(this, data)`
for the T-surface, own attributes assigned explicitly afterward exactly like
`emitClass` does today for a Data parent's fields — NOT a static `of<T>()`
factory. Rationale: `emitClass`'s real, load-bearing convention is that
`constructor(data: <Name>Shape)` IS the single construction path (`static
from` delegates to `new <Name>(...)` after a type-guard check) — introducing
a second, competing construction path (`static of<T>`) for exactly this one
supertype-kind would fork the convention instead of extending it. Threading
the generic through the constructor keeps `static from`/`new` as the only
entry points for every Data, Choice-extending or not.

- Bare `new BasketConstituent(data)` behaves non-generically (`T` defaults to
  `Observable`, the full union) — same default-narrowing story as the type
  alias.
- A consumer holding a known arm writes `new BasketConstituent<{ basket:
  Basket }>(data)` and keeps that arm's fields typed precisely on `data`
  (though NOT on the resulting instance's declared members — TypeScript
  classes cannot declare members from a type parameter, so arm-specific
  fields are accessible only via a cast, e.g. `(instance as unknown as {
  basket: Basket }).basket`; this is a real, documented limitation of the
  class encoding that the TS **type** alias surface does not share).
- The exactly-one-of validator (`validateObservableChoice` — one shared
  method name derived from the Choice's name, not per-child) is emitted
  ONCE per Choice (same "emit once, reused by every child" principle as the
  original mixin idea intended) and called from each child's own validate
  block, OR — simpler, and what `emitClass`'s existing per-condition-method
  convention favors — inlined as a `runeCheckOneOf([...])` check the same
  way any other condition method body is built, with no separate shared
  function needed (implementer's call, grounded in whichever produces less
  duplication against the real `emitValidateMethods` code path).
- `Constructor` helper type: NOT NEEDED under this encoding (no mixin
  factory function exists to type its `Base` parameter).

<details>
<summary>Original per-Choice-mixin design (SUPERSEDED — kept for history only, do not implement)</summary>

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

</details>

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
2. **emitClass conventions**: what children extend today (a base class? nothing?), how validate methods attach, whether classes are emitted for all Data or conditionally — the generic-child-class encoding (see AMENDED TS class section above) must slot into the real conventions, not invented ones.
3. **Generic-type references**: confirm no emitted reference site needs the type argument (all bare).

## Acceptance gate

Delete BOTH allowlist entries — `'BasketConstituent'`-related entries in `KNOWN_DATA_CONDITION_EXCEPTIONS` (`condition-transpile-corpus.test.ts`) and `"unknown attribute 'Basket'"` in `KNOWN_DIAGNOSTIC_EXCEPTIONS` (`choice-corpus-acceptance.test.ts`) — and the suites MUST pass without them. (The `CurrencyCodeEnum` exception is unrelated; leave it.) Plus: emitted-runtime behavior tests (above), unit tests per surface, multi-level chain test (synthetic fixture — the corpus has no multi-level case; parse-first validate the fixture), whole-monorepo green.

## Non-goals

- No change to plain Data-extends-Data emission, the W2 Choice union itself, or the option-key naming rule.
- No runtime library beyond `runeExtendChoice` (the AMENDED TS class design needs no `Constructor` helper type — no mixin factory function exists to type).
- Renderer/VE/display untouched.
