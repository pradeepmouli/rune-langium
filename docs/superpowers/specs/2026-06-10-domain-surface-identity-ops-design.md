# Domain Surface — Config-Declared Identity Ops + editor-store Cutover

## Goal

Add a config-declared, identity-keyed `removeX` operation to the langium-zod-generated domain surface, and cut the visual-editor `editor-store` member-container mutations over to the generated `DomainOps` namespace. Identity (the field that names an element) is declared explicitly in a new `domain-surface.config.json`, not heuristically inferred.

## Context

Phase 2 (MERGED, rune `d684cb47`) shipped the single-barrel `domain.ts`: `import * as ast` + `export * from './ast.js'` + per-namespaced-type `export type Foo = ast.Foo` + `export namespace Foo { ...ops... }`, so `Foo` is both the interface type and the ops namespace (`DomainOps.Foo.addBar`). The generated ops today are: `getX`, `addX` (append), `insertXAt`, `removeXAt`, `setXAt`, `moveXAt` (array fields); `setX`/`clearX` (single-node + cross-ref fields).

`editor-store.ts` still mutates member-container arrays by hand (~20 operations, lines ~1311–2146) via `mutateGraph` over loosely-cast `node.data`. Several removals are **name-keyed** (`removeAttribute(nodeId, attrName)`), which the index-based `removeXAt` cannot express. The user wants:
1. An identity-keyed `removeX(node, item)` generated op, matching by a **field value** (name / `$refText`), not by JS object identity (so it survives a serialize→deserialize round-trip).
2. The identity field declared in config (`domain-surface.config.json`) so codegen uses an authored mapping rather than a `has a name field` heuristic.
3. editor-store to delegate to the generated ops ("whatever the current editor operations need" — no speculative inserts/upserts).

### Decisions (settled during brainstorming)

- **Backing store stays an array** (not a Set/Map). Collections are ordered (round-trip to ordered `.rosetta` source; the editor has drag-reorder/`moveAt`), AST-aligned (Langium containment is array + `$containerIndex`), and JSON-serializable (round-trip is `JsonSerializer`). A `Set` dedups by object reference (useless) and can't reorder; a `Map` keyed by name would break on duplicate names and lose order-as-index.
- **One new op only: `removeX`.** The editor's real operations are name-keyed removes, appends, index reorders, and index removes — no relative inserts, no upserts. YAGNI: do not emit `insertXBefore/After` or upsert variants.
- **`removeX` matches by a config-declared identity path, not object reference.** Object-reference matching dies across a reparse (new objects); value matching by `name`/`$refText` survives.
- **`removeX` takes the element object** (`Dehydrated<E>`), reading its identity path for the match. (Future-aligned: Phase 3's store holds domain objects; for now the cutover supplies an identity-bearing object.)
- **zod-schemas already match the domain shape** (`ReferenceSchema = { $refText }`, `$type` discriminant, `z.looseObject` tolerates `$namespace`, no runtime fields). No change. Hardening `curatedAdapter` to validate via these schemas is a separate, additive effort — **out of scope**.

---

## §1 Architecture

```
domain-surface.config.json  (NEW, rune packages/core/, beside langium-config.json)
   { "identity": { "<ElementType>": "<field path>", ... } }
        │  read by langium-zod CLI via --domain-surface-config
        ▼
langium-zod namespace-ops emitter (0.8.2)
   generateNamespaceOps(descriptors, { identity })
      └─ for each array field of element type E with identity[E] defined:
            emit removeX(node, item) matching elem.<path> === item.<path>
        │
        ▼
packages/core/src/generated/domain.ts  (regenerated; barrel unchanged)
        │
        ▼
visual-editor editor-store cutover
   name/$refText-keyed removes → looped DomainOps.<T>.removeX(node, item)
        (Attribute·input by name, ChoiceOption by typeCall.type.$refText)
   appends             → DomainOps.<T>.addX(node, item)
   index reorders      → DomainOps.<T>.moveXAt(node, from, to)
   index removes       → DomainOps.<T>.removeXAt(node, index)
        (condition, synonym, annotation)
```

Three units, each independently testable: the **config** (data), the **emitter** (codegen, unit-tested on descriptor fixtures), the **cutover** (behavior-preserving consumer edits, characterization-tested).

---

## §2 `domain-surface.config.json`

**Location:** `packages/core/domain-surface.config.json` (rune-side; the grammar's identity declarations belong with the grammar, beside `langium-config.json`).

**Schema:**
```json
{
  "identity": {
    "Attribute": "name",
    "RosettaEnumValue": "name",
    "ChoiceOption": "typeCall.type.$refText"
  }
}
```

- Keyed by **element type name** (identity is a property of the element, independent of which container array holds it). One entry drives `removeX` for **every** array with that element type — `Attribute` covers `Data.attributes` (`removeAttribute`), `Annotation.attributes` (`removeAttribute`), and `RosettaFunction.inputs` (`removeInput`).
- Value is a **field path**: a single segment (`name`) or a dotted nested path (`typeCall.type.$refText`). Path segments may include `$refText`.
- Element types **absent** from `identity` get only the existing `...At` ops (no `removeX`).
- **YAGNI — this set is exactly what the cutover consumes** (the name/`$refText`-keyed editor removes: `removeAttribute`, `removeInputParam`, `removeEnumValue`, `removeChoiceOption`). Index-keyed removes (`removeCondition`, `removeSynonym`, `removeAnnotation`) use `removeXAt` and need no identity entry. The config is extensible — add `Condition`/`RosettaRecordFeature`/`AnnotationRef` only when an identity-keyed op for them is actually needed. The three entries are confirmed against `ast.ts` during implementation.

**Validation:** the emitter warns (does not throw) if a configured element type is unknown, or if the declared path's first segment is not a property of the element type. Unknown entries are ignored.

---

## §3 Emitter changes (langium-zod 0.8.2)

### §3.1 `generateNamespaceOps` signature

```ts
interface NamespaceOpsOptions {
  /** element type name → identity field path (e.g. "name", "typeCall.type.$refText") */
  identity?: Record<string, string>;
}
export function generateNamespaceOps(types: ZodTypeDescriptor[], options?: NamespaceOpsOptions): string;
```

Backward-compatible: `options` optional; absent → no `removeX` ops emitted (current behavior).

### §3.2 `removeX` emission

For an array field `fieldName` of element type `E` where `options.identity[E]` is defined as `path`:

```ts
export function removeAttribute(node: Dehydrated<ast.Data>, attribute: Dehydrated<ast.Attribute>): boolean {
  const __k = attribute.name;
  const i = node.attributes.findIndex((e) => e.name === __k);
  if (i < 0) return false;
  node.attributes.splice(i, 1);
  return true;
}
```

Nested path (`ChoiceOption` → `typeCall.type.$refText`) uses optional chaining on both sides:

```ts
export function removeAttribute(node: Dehydrated<ast.Choice>, attribute: Dehydrated<ast.ChoiceOption>): boolean {
  const __k = attribute.typeCall?.type?.$refText;
  const i = node.attributes.findIndex((e) => e.typeCall?.type?.$refText === __k);
  if (i < 0) return false;
  node.attributes.splice(i, 1);
  return true;
}
```

Rules:
- Op name follows the existing singularization (`add${Singular}` → `remove${Singular}` — e.g. `removeAttribute`, `removeEnumValue`, `removeInput`, `removeFeature`). It is the identity sibling of `removeXAt` (kept).
- Match reads only the identity path; the parameter is the full element object (type `Dehydrated<ast.E>` via the `astRef` binding, consistent with §Phase-2 `ast.`-qualified signatures).
- Returns `boolean` (removed?) so callers can loop to drain duplicate-keyed elements.
- Single-segment paths use direct access; multi-segment paths use optional chaining on every intermediate segment.
- Emitted **only** when `identity[E]` is defined; otherwise unchanged.

### §3.3 CLI plumbing (`generate.ts`)

- Add CLI flag `--domain-surface-config <path>` and config key `domainSurfaceConfig`/`domainSurfaceConfigPath`.
- In the `namespaceOps` block, read + `JSON.parse` the file if present, extract `identity`, and pass it through `generateNamespaceOpsSchemas({ ..., identity })` → `generateNamespaceOps(descriptors, { identity })`.
- Missing file with the flag set → error with a clear message; flag unset → `identity` undefined (no `removeX`).

### §3.4 Release

Patch bump → `langium-zod@0.8.2` via changeset (`develop` → version PR → publish), same flow as 0.8.1.

---

## §4 rune regeneration

1. `packages/core/domain-surface.config.json` created (§2).
2. `generate:domain` script gains `--domain-surface-config domain-surface.config.json`:
   `langium-zod generate --namespace-ops --namespace-ops-out src/generated/domain.ts --domain-surface-config domain-surface.config.json && oxfmt src/generated/domain.ts`
3. Override + `minimumReleaseAgeExclude` bumped `0.8.1` → `0.8.2` (transient: exclude both during `pnpm install`, then drop the old — known fresh-publish age-gate dance).
4. Regenerate `domain.ts` (barrel unchanged — purely additive ops). `check-generated` determinism preserved.

---

## §5 editor-store cutover

| editor-store op | keys on | element type / container | delegates to |
|---|---|---|---|
| `removeAttribute(nodeId, attrName)` | name | Attribute / Data·Annotation | looped `DomainOps.<Data\|Annotation>.removeAttribute(d, {name})` |
| `removeEnumValue(nodeId, valueName)` | name | RosettaEnumValue / RosettaEnumeration | looped `removeEnumValue` |
| `removeInputParam(nodeId, paramName)` | name | Attribute / RosettaFunction.inputs | looped `removeInput` |
| `removeChoiceOption(nodeId, typeName)` | `typeCall.type.$refText` | ChoiceOption / Choice | looped `removeAttribute` (config identity) |
| `removeCondition(nodeId, index)` | index | Condition | `removeXAt` |
| `removeSynonym(nodeId, index)` | index | (synonym) | `removeXAt` |
| `removeAnnotation(nodeId, index)` | index | AnnotationRef | `removeXAt` |
| `addAttribute`/`addEnumValue`/`addInputParam`/`addCondition`/`addSynonym`/`addAnnotation` | append | — | `DomainOps.<T>.addX(node, item)` |
| `reorderAttribute`/`reorderEnumValue`/`reorderInputParam`/`reorderCondition` | from/to index | — | `DomainOps.<T>.moveXAt(node, from, to)` |

**Behavior-preservation (HARD GATE).** This is the exact `loop-splice → find/splice` swap class that regressed in Phase 3C (`splice(-1)` deletes last; `find` stops at first). Every cutover op must be characterization-tested **before** the edit:
- The current `removeAttribute` removes **every** attribute sharing the name. The looped `removeX` (`while (removeX(node, key)) {}`) reproduces this exactly — assert identical end-state for the duplicate-name fixture.
- The element-object argument is supplied by the store as a minimal identity-bearing object (e.g. `{ name: attrName } as Dehydrated<Attribute>`) or the resolved row; the op reads only the identity path. The plan picks the per-call form; either must pass the characterization test.
- `mutateGraph`/Mutative draft semantics are unchanged — ops mutate the draft array in place (`push`/`splice`), which Mutative drafts support.
- Edge cases retained: empty/absent array guard (`if (!Array.isArray(d.attributes)) d.attributes = []` before `addX`), no-op when key absent, index-bounds for `...At`.

**Stays bespoke:** anything whose key the config does not (or cannot) declare — e.g. operations that also touch edges (`removeAttribute` drops `attribute-ref` edges; that edge bookkeeping stays in the store and wraps the delegated array mutation), and any op mixing array mutation with cross-field updates (`updateAttributeType`, `renameAttribute`, `updateCardinality`).

---

## §6 zod-schemas

No change. Schemas already emit the dehydrated wire shape (refs `{ $refText }`, `$type` discriminant, `looseObject`, no runtime fields), so a `Dehydrated<T>` passes its type's schema. Wiring `curatedAdapter.parse` to validate against them is a separate additive task, explicitly **out of scope** here.

---

## §7 Testing

- **Emitter unit tests** (`langium-zod/test/unit/namespace-ops.test.ts`): `removeX` emitted for configured single-segment identity; `removeX` with optional-chained nested path; **no** `removeX` when element type absent from config; returns `boolean`; balanced braces; `astRef` qualification preserved.
- **rune domain determinism**: `generate:domain` reproduces `domain.ts` byte-for-byte (check-generated gate).
- **editor-store characterization tests**: for each cutover op, a test that asserts pre- and post-cutover end-state equality, including the duplicate-name drain, empty-array init, and absent-key no-op.
- **Consumer type-checks**: core, visual-editor, lsp-server, cli, studio all clean (the Phase 2 consumer set).
- **Final holistic review** (memory: per-task review misses inverse-pair/seam bugs): one reviewer over the whole cutover diff, specifically checking each `removeX` against the behavior it replaced.

---

## §8 Build sequence & dispatch

```
8a. langium-zod 0.8.2 (cross-repo)
    • generateNamespaceOps(types, { identity }) + removeX emission (TDD)
    • --domain-surface-config CLI plumbing
    • emitter unit tests
    PR → develop → version PR → publish; rune 8c blocked until live
8b. rune config + script (unblocked)
    • packages/core/domain-surface.config.json
    • generate:domain gains --domain-surface-config
8c. rune regen (requires 8a published)
    • bump override/minReleaseAge → 0.8.2, install
    • regenerate domain.ts (barrel unchanged)
8d. rune editor-store cutover (requires 8c)
    • characterization tests FIRST, then delegate per §5
    • final holistic review
```

**Model dispatch:** plan authored with Opus. Mechanical implementer tasks (emitter `removeX`, config file, regen, per-op cutover) dispatched to **Fable** via subagent-driven-development. Spec-compliance + code-quality reviews and the final holistic review on Opus. (Per memory: cheap/fast model for mechanical implementers, reserve Opus for review/architecture/complex-fix.)

---

## Out of scope

- `curatedAdapter` zod validation (§6).
- Phase 3 (`nodesById` cutover) / Phase 4 (consumer reads).
- Any `insertXBefore/After` / upsert ops (no editor operation needs them).
- Changing the array backing store.
