# Domain Substrate — Phase 2: Source Adapters + Namespace-Merged domain.ts

## Goal

Make the generated domain surface the single authoritative substrate for all mutations across both the parsed (Langium AST) and curated (`/api/parse` JSON) paths. Phase 1 established `Dehydrated<T>` and a hand-authored `domain-ops.ts` placeholder. Phase 2 replaces the placeholder with a langium-zod-generated `domain.ts` that namespace-merges ops onto the AST type names, adds `$namespace` to `Dehydrated<T>`, fixes the curated serializer to emit `$type`, and ships the `parsedAdapter` / `curatedAdapter` boundary.

## Context

Phase 1 (merged, PR #322): `Dehydrated<T>` type, `domain-ops.ts` placeholder (flat functions), `RuneStoreHydrator`.

Phase 2 is cross-repo: langium-zod emitter lands first (2a), then rune-side work (2b–2f).

---

## §1 Architecture

```
langium-zod emitter
  └─ generates packages/core/src/generated/domain.ts
       ├─ re-exports every interface from ast.ts (no breaking change for consumers)
       └─ adds merged namespace per member-container type:
            export namespace Data {
              getAttributes / addAttribute / insertAttributeAt /
              removeAttributeAt / setAttributeAt / moveAttributeAt
              setSuperType / clearSuperType  (single-node / ref fields)
            }
            export namespace Choice { ... }
            export namespace RosettaEnumeration { ... }
            export namespace RosettaFunction { ... }
            export namespace RosettaRecordType { ... }

core/index.ts: export * from './generated/domain.js'   ← replaces ast.js

SourceAdapters (new, in @rune-langium/core):
  parsedAdapter   — wraps RuneStoreHydrator.dehydrate()
  curatedAdapter  — JSON cast (safe after serializer fix)

Curated serializer fix:
  /api/parse serializer: typeKind → $type, add $namespace
  model-helpers.ts: remove dead typeKind fallback (lspeasy rename)
```

One cross-repo commit gates step 2e: the langium-zod `domain.ts` emitter. Steps 2b–2d (including the curated serializer fix) are rune-side and can proceed immediately.

---

## §2 langium-zod `domain.ts` emitter

The emitter walks the existing `NamespaceWalkResult`. For each AST type it emits:

**File header** — re-exports every interface from `ast.ts`:
```typescript
export type { Data, Annotation, Choice, RosettaEnumeration, RosettaFunction, RosettaRecordType, ... } from './ast.js';
```

**Array member-container fields** — 6-op set per field (no casts needed; `Dehydrated<T>` types array fields as `Dehydrated<E>[]` already):

```typescript
export namespace Data {
  export function getAttributes(node: Dehydrated<Data>): Dehydrated<Attribute>[] {
    return node.attributes;
  }
  export function addAttribute(node: Dehydrated<Data>, attr: Dehydrated<Attribute>): void {
    node.attributes.push(attr);
  }
  export function insertAttributeAt(node: Dehydrated<Data>, index: number, attr: Dehydrated<Attribute>): void {
    node.attributes.splice(index, 0, attr);
  }
  export function removeAttributeAt(node: Dehydrated<Data>, index: number): void {
    node.attributes.splice(index, 1);
  }
  export function setAttributeAt(node: Dehydrated<Data>, index: number, attr: Dehydrated<Attribute>): void {
    node.attributes[index] = attr;
  }
  export function moveAttributeAt(node: Dehydrated<Data>, from: number, to: number): void {
    const [item] = node.attributes.splice(from, 1);
    node.attributes.splice(to, 0, item);
  }
}
```

**Single contained node fields** — `setXxx` (required) or `setXxx` + `clearXxx` (optional):

```typescript
export namespace RosettaFunction {
  export function setOutput(node: Dehydrated<RosettaFunction>, output: Dehydrated<Attribute>): void {
    node.output = output;
  }
}
```

**Reference fields** (`{ $refText: string }`) — pass `Dehydrated<T>` (not raw string); emitter uses `getContainerOfType` namespace logic to build refText:

```typescript
export namespace Data {
  export function setSuperType(node: Dehydrated<Data>, ref: Dehydrated<Data>): void {
    node.superType = { $refText: ref.$namespace ? `${ref.$namespace}.${ref.name}` : ref.name };
  }
  export function clearSuperType(node: Dehydrated<Data>): void {
    node.superType = undefined;
  }
}
```

**Primitive fields** (string, number, boolean) — no wrappers generated; direct mutation via `Dehydrated<T>` is the idiom.

**Emitter derivation rules** (no grammar annotation needed):
- `Array<AstNode>` field → 6-op set
- `AstNode` field (required) → `setXxx`
- `AstNode | undefined` field → `setXxx` + `clearXxx`
- `Reference<T>` → `setXxxRef`-style (pass `Dehydrated<T>`, extract qualified refText)
- `Reference<T> | undefined` → + `clearXxxRef`
- Primitive → no op generated

**File location**: `packages/core/src/generated/domain.ts` (replaces `domain-ops.ts`, which is deleted).

---

## §3 Curated serializer fix

`/api/parse` currently emits `typeKind` (lowercase, e.g. `'data'`, `'choice'`) on each element. Fix: emit `$type` (AST type string, e.g. `'Data'`, `'Choice'`) and `$namespace` (the containing `RosettaModel.name`).

After the fix, `curatedAdapter` is a safe cast — no field mapping needed.

**`model-helpers.ts`** already has a dual fallback:
```typescript
NODE_KIND_LOOKUP[d?.$type ?? ''] ??
NODE_KIND_LOOKUP[d?.typeKind ?? ''] ??  // ← dead after fix
```

lspeasy rename removes the dead `typeKind` fallback line.

**Scope**: `StructureRow['typeKind']` (PascalCase UI classifier: `'Data' | 'Choice' | 'Enum' | ...`) is a separate concept and is **not touched**.

---

## §4 `$namespace` in `Dehydrated<T>`

Namespace is derived from containment (`$container: RosettaModel`), which is stripped during dehydration. `RuneStoreHydrator` stamps it before stripping:

```typescript
// Dehydrated<T> gains one new field:
export type Dehydrated<T extends AstNode> = {
  readonly $type: T['$type'];
  readonly $namespace?: string;   // populated by RuneStoreHydrator; absent for non-namespace-scoped nodes
} & {
  -readonly [K in Exclude<keyof T, LangiumRuntimeFields | '$type'>]: DehydratedField<T[K]>;
};
```

`RuneStoreHydrator.dehydrate()` uses Langium's `getContainerOfType` to walk the `$container` chain (which may have intermediate nodes) and find the enclosing `RosettaModel`:

```typescript
import { getContainerOfType } from 'langium';
import { isRosettaModel } from '../generated/ast.js';

const model = getContainerOfType(node, isRosettaModel);
if (model) dehydrated.$namespace = model.name;
```

`RosettaModel.name` is `QualifiedName | string` — the fully qualified namespace name (e.g. `"rosetta.base.staticnode"`).

The curated serializer stamps `$namespace` from the same source (each element knows its `RosettaModel`).

---

## §5 SourceAdapter pair

Both adapters live in `packages/core/src/adapters/` and are exported from `core/index.ts`.

```typescript
// parsed-adapter.ts — wraps RuneStoreHydrator
export const parsedAdapter = {
  dehydrate<T extends AstNode>(node: T): Dehydrated<T> {
    return hydrator.dehydrate(node) as Dehydrated<T>;
  }
};

// curated-adapter.ts — safe cast after §3 serializer fix
export const curatedAdapter = {
  parse<T extends AstNode>(json: unknown): Dehydrated<T> {
    return json as Dehydrated<T>;
  }
};
```

Neither adapter owns store mutation or node identity — they only produce `Dehydrated<T>`.

---

## §6 Barrel switch + CI

`core/index.ts` flips one line:
```typescript
// before
export * from './generated/ast.js';
// after
export * from './generated/domain.js';
```

`domain.ts` re-exports all interfaces from `ast.ts` so all existing consumers see no breaking change. They additionally gain the namespace ops.

`domain-ops.ts` is **deleted** (not renamed — content changes significantly to namespace-merged form).

`check-generated` CI gains a new step:
```yaml
- name: Regenerate domain surface from Langium grammar
  run: pnpm --filter @rune-langium/core generate:domain

- name: Assert no drift in generated domain surface
  run: git diff --exit-code -- packages/core/src/generated/domain.ts
```

`generate:domain` script added to `packages/core/package.json`.

---

## §7 Build sequence

Steps 2b–2d are independent and can be parallelised across PRs. Step 2e requires 2a merged. Step 2f requires 2e.

```
2a. langium-zod (cross-repo) — domain.ts emitter target
    • walks NamespaceWalkResult for array / single-node / ref fields
    • emits namespace-merged ops (no casts)
    • re-exports all interfaces from ast.ts at file top
    PR → merge first; rune 2e is blocked until this lands

2b. Rune — Dehydrated<T> + hydrator
    • Add $namespace?: string to Dehydrated<T>
    • RuneStoreHydrator: getContainerOfType → stamp $namespace
    • Tests: dehydrated node carries correct $namespace

2c. Rune — curated serializer fix
    • /api/parse serializer: typeKind → $type, add $namespace
    • lspeasy: remove dead typeKind fallback in model-helpers.ts
    • Tests: resolveNodeKind works from $type alone

2d. Rune — SourceAdapters
    • packages/core/src/adapters/parsed-adapter.ts
    • packages/core/src/adapters/curated-adapter.ts
    • Export both from core/index.ts

2e. Rune — domain.ts (requires 2a merged)
    • Run langium-zod emitter → generate packages/core/src/generated/domain.ts
    • Delete domain-ops.ts
    • Flip core/index.ts barrel: ast.js → domain.js
    • Add generate:domain script to packages/core/package.json
    • Update check-generated CI: new generate:domain step on @rune-langium/core

2f. Rune — consumer cutover (visual-editor + studio)
    • lspeasy: getAttributes(node) → Data.getAttributes(node) etc. at all import sites
```
