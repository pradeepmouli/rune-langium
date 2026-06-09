<!-- SPDX-License-Identifier: MIT -->
# Editable Domain Model — Phase 1 (TDD Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `test-driven-development`. Read it before touching any code. Every task below is RED → run-to-fail → GREEN → run-to-pass → commit. Do NOT batch tasks; do NOT write implementation before its failing test. Do NOT skip the "run to fail" step — a test that passes before implementation is a broken test.

**Goal:** Evolve the langium-zod domain emitter so it generates an *editable, lossless, round-trippable* domain model, then prove the round-trip in rune via Langium's own `JsonSerializer`. Phase 1 only: define the model + prove it. **No editor cutover.**

**Architecture:** The langium-zod emitter (`packages/langium-zod/src/emitters/domain.ts`, consumed by rune through a `link:` dev-override) is changed to (1) emit cross-refs as editable `{ $refText }` objects on read+write (not flattened `string`, not branded `Ref<T> = string`), (2) retain `$type` as a literal discriminant on every interface, (3) stay lossless (strip only `$`-internals), (4) append additive `extends`/`members` normalizations, and (5) emit a `$type`-dispatched `toAst` inverse. Rune regenerates `packages/visual-editor/src/generated/domain.ts` against the evolved emitter and proves round-trip (`domain → toAst → JsonSerializer → deserialize → toDomain`) for Data/Choice/Enum/Function. View metadata moves into a rune-side `ViewOverlay` type (type-level only this phase).

**Tech stack:** TypeScript 5.9+/ESM. Langium 4.2.x (`JsonSerializer`, generated `ast.ts`, `createRuneDslServices`). langium-zod (the emitter; sibling repo at `../langium-zod`). `@rune-langium/core` (`parse`, `createRuneDslServices`, `serializeRuneModel`, `deserializeRuneModel`, `serializeModel`). `@rune-langium/visual-editor` (the consumer). Vitest for all tests.

---

## Repo geography & invariants

- **rune repo root:** `/Users/pmouli/GitHub.nosync/active/ts/rune-langium` (branch `feat/phase3d-domain-surface` — carries the committed Tasks 4–6 + the Phase-1 spec; PRs target `master`).
- **langium-zod repo root:** `/Users/pmouli/GitHub.nosync/active/ts/langium-zod` (sibling, currently on `develop` @ base #68 emitter).
- **Dev-link is already wired:** `pnpm-workspace.yaml` in rune has `langium-zod: link:../langium-zod/packages/langium-zod` (verified). The link consumes `dist/`, so **after every emitter source change you MUST run `pnpm --filter langium-zod run build`** before rune tests that consume the link will see it.
- **Commits:** prefix env `SKIP_SIMPLE_GIT_HOOKS=1` (NOT `--no-verify`). Body ends EXACTLY with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **SPDX:** new langium-zod `.ts` files and rune `packages/**` `.ts` files get `// SPDX-License-Identifier: MIT` as line 1 (+ `// Copyright (c) 2026 Pradeep Mouli` line 2 to match rune convention). New `.md` files use the HTML-comment form `<!-- SPDX-License-Identifier: MIT -->`.
- **Never `git add reference-design/`** (untracked working-tree dir).
- Search with `rg`, not `grep`.
- **Commands per repo:**
  - langium-zod tests: from `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && npx vitest run <path>`
  - langium-zod type-check: `pnpm --filter langium-zod run type-check`
  - langium-zod build (refresh dist for the dev-link): `pnpm --filter langium-zod run build`
  - rune VE tests: `pnpm --filter @rune-langium/visual-editor test`
  - rune VE type-check: `pnpm --filter @rune-langium/visual-editor run type-check`

## Reference: the set-aside branch

A near-identical implementation of `$type`-retention + normalizations already exists on langium-zod branch `feat/domain-discriminant-repository` (commits `e98699b`, `042a729`, `097188d`, `a5abc84`, `a53849a`). You MAY read those diffs for reference. **The ONE crucial divergence:** that branch emits cross-refs as a *branded string* (`Ref<T> = string & {...}`, read `node.x?.$refText`, type `Ref<'Target'>`). **Phase 1 instead emits an editable `{ $refText }` OBJECT** (`DomainRef = { $refText: string }`, read `node.x` passing the object through). Do NOT copy the branded-string ref handling. The `$type`-retention, normalization pass, collision guard, config wiring, and shebang split are copied verbatim from that branch.

## Verified base-emitter facts (do not rediscover)

- `domain.ts:135` — `planObject` filters `$type` out (`properties.filter((p) => p.name !== '$type')`). Base does NOT retain `$type`.
- `domain.ts` `domainTsType` crossReference arm returns `'string'`; `domainReadExpr` crossReference arm returns `` `${access}?.$refText` ``; `domainWriteType` crossReference arm returns `'string'`.
- `emitAccessors` crossReference arm already WRITES `{ $refText: value }` (lines ~219-227). Keep that.
- `DomainGenerationOptions` (`domain.ts:32`) has `projection`/`stripInternals`/`overlays` only — NO `normalizations`.
- `generateDomainCode` is at `domain.ts:312`; `emitMasterDispatch` (~251) builds `AnyDomain` + `toDomain`; `emitUnion` (~264) builds per-union `toDomainX`; `emitReadFn` (~295) builds `toDomainX` bodies; `emitInterface` (~286).
- `ZodTypeExpression` crossReference shape: `{ kind: 'crossReference'; targetType: string }` (`types.ts:33`).
- `parseProjectionConfig` (`projection.ts:45`) parses `defaults`+`types` only; drops any `normalizations` key. `ProjectionConfig` (`projection.ts:4`) has no `normalizations`.
- `generateDomainSchemas` (`api.ts:257`) forwards `projection`/`stripInternals`/`overlays` to `generateDomainCode`, NOT `normalizations`.
- `index.ts:31` re-exports `generate` from `./cli.js` (which has a `#!` shebang). No `generate.ts` exists on `develop`. This is the live shebang gotcha.
- `INTERNAL_METADATA_FIELDS` (`projection.ts:15`) = `$container`/`$containerProperty`/`$containerIndex`/`$document`/`$cstNode`. (`$refNode`/`$nodeDescription` are not in the list; `--strip-internals` is sufficient for Phase 1 since refs become `{ $refText }` and `$refNode` never lands on the projected surface anyway.)
- rune `domain-surfaces.json` (`packages/visual-editor/domain-surfaces.json`) ALREADY contains a `normalizations` block (`inheritance`→`extends`, `members`→`members`) — but the base `parseProjectionConfig` silently drops it. Task 5 makes it live.
- rune VE `generate:domain` script (`packages/visual-editor/package.json:30`):
  `langium-zod generate --config ../core/langium-config.json --domain-only --domain-out src/generated/domain.ts --projection domain-surfaces.json --strip-internals --ast-types ../core/src/generated/ast.ts`
  NOTE: this uses `--domain-only`, which only exists on the set-aside branch (`e00ab76`). Task 1 must port `--domain-only` (or run domain emission via the non-`--domain-only` path) — see Task 1.
- Harness service path: `@rune-langium/core` exports `createRuneDslServices`, `serializeRuneModel(serializer, model)`, `deserializeRuneModel(services, json)`. The JsonSerializer lives at `services.RuneDsl.serializer.JsonSerializer`. The `.rosetta` text serializer is `serializeModel` (Data/Choice/Enum only; drops Function).

---

## Task list (titles)

- **Task 0** — Pre-flight: branch + dev-link + shebang split + `--domain-only` port + baseline green
- **Task 1** — Emitter: editable `{ $refText }` cross-refs (un-flatten read type + read expr + write type)
- **Task 2** — Emitter: retain `$type` literal discriminant (interface field + read body + `AnyDomain` narrowable)
- **Task 3** — Emitter: lossless guard test (full-surface keeps `references`/`labels`/`ruleReferences`/`typeCallArgs`/`enumSynonyms`)
- **Task 4** — Emitter: additive normalizations pass + option + collision-throw
- **Task 5** — Emitter: `parseProjectionConfig` preserves `normalizations` + `generateDomainSchemas` forwards it
- **Task 6** — Emitter: `$type`-dispatched `toAst` inverse (+ `AnyDomain` master + per-union)
- **Task 7** — rune: `ViewOverlay` type (domain/view split) + type-level test
- **Task 8** — rune: regenerate `domain.ts` against the evolved emitter (via dev-link)
- **Task 9** — rune: conformance harness — lossless JSON round-trip + editable-ref survival + `$type`/normalization/object-ref shape assertions (Data/Choice/Enum/Function)
- **Task 10** — rune: `.rosetta`-text round-trip for Data/Choice/Enum (Function out-of-scope, asserted as a documented gap)
- **Task 11** — Final: dual type-check + full VE suite + plan self-review

---

## Task 0 — Pre-flight: branch + dev-link + shebang split + `--domain-only` port + baseline green

**Why:** Establish the Phase-1 emitter branch in langium-zod, eliminate the shebang gotcha so rune's vite/test pipeline can consume the linked package, and ensure the `--domain-only` CLI path the rune `generate:domain` script depends on exists. End on a green baseline before any behavior change.

**Files:**
- `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/src/generate.ts` (NEW — shebang-free)
- `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/src/cli.ts` (re-export from generate.ts)
- `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/src/index.ts` (re-export `generate` from `./generate.js`)

### Steps

0.1 — Create the Phase-1 emitter branch in langium-zod:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git checkout develop && git pull --ff-only 2>/dev/null; git checkout -b feat/editable-domain-phase1
```

0.2 — Verify the dev-link override exists in rune (it should from prior work):
```bash
rg -n "langium-zod: link" /Users/pmouli/GitHub.nosync/active/ts/rune-langium/pnpm-workspace.yaml
```
Expected output: `  langium-zod: link:../langium-zod/packages/langium-zod`. If ABSENT, add that line under `overrides:` in `pnpm-workspace.yaml` and run `pnpm install` in the rune root.

0.3 — Port the shebang split (verbatim from set-aside `a53849a`). The package main (`index.ts`) re-exports `generate` from `cli.ts`, which carries `#!/usr/bin/env node`. rolldown-vite (rune's bundler) follows the linked-package ESM graph and fails to parse the shebang. Fix: move the programmatic `generate` core into a shebang-free `generate.ts`.

Read the exact split to replicate:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && git show feat/domain-discriminant-repository:packages/langium-zod/src/generate.ts > /dev/null 2>&1 && echo "ref exists"
git show a53849a -- packages/langium-zod/src/generate.ts packages/langium-zod/src/cli.ts packages/langium-zod/src/index.ts
```
Apply that diff to `develop`'s files: create `generate.ts` holding `generate`/`GenerateOptions`/`LangiumZodConfig`/`getUnknownFilterNames` WITHOUT a shebang; trim `cli.ts` to keep the `#!` line + argv parsing and re-export the moved symbols (`export { generate, type GenerateOptions, type LangiumZodConfig } from './generate.js';`); change `index.ts:31` from `export { generate } from './cli.js';` to `export { generate } from './generate.js';` and the type re-export at `index.ts:32` from `'./cli.js'` to `'./generate.js'`. (If the set-aside `generate.ts` references symbols not yet present on `develop`, port only what compiles; the goal is "main entry never transitively re-exports the `#!` module".)

0.4 — Port `--domain-only` to the CLI (set-aside `e00ab76`) so the rune `generate:domain` script works. Read it:
```bash
git show e00ab76 -- packages/langium-zod/src/cli.ts packages/langium-zod/src/generate.ts
```
Apply: add a `--domain-only` flag that calls `generateDomainSchemas` and skips `generateZodSchemas`. (If porting `--domain-only` is non-trivial against the base, the fallback is: keep the existing combined CLI and have the rune `generate:domain` script call a tiny node script that imports `generateDomainSchemas` directly — but prefer the flag for parity with the committed script.)

0.5 — Build + run the full existing langium-zod suite to confirm a green baseline (no behavior change yet):
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
pnpm --filter langium-zod run build
npx vitest run
pnpm --filter langium-zod run type-check
```
Expected: build succeeds; all existing tests pass (the `domain-emitter.test.ts` still asserts the OLD `string`-flattened, `$type`-dropped behavior — that's expected, it changes in Tasks 1–2); type-check clean.

0.6 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/generate.ts packages/langium-zod/src/cli.ts packages/langium-zod/src/index.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
fix(langium-zod): split shebang-free generate core + port --domain-only

Phase 1 pre-flight: the package main re-exported `generate` from the
shebang-bearing cli.ts, breaking rune's rolldown-vite dev-link. Move the
programmatic core to a shebang-free generate.ts and add the --domain-only
CLI flag the rune generate:domain script depends on.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 1 — Emitter: editable `{ $refText }` cross-refs

**Why:** Cross-refs must be editable objects (`{ $refText: string }`) on both the read TYPE and read EXPRESSION — not flattened to plain `string`, and not the branded-string `Ref<T>` of the set-aside branch. The write side already builds `{ $refText: value }`; the write param TYPE becomes `string` (the raw ref text the caller supplies). Emit a single `DomainRef` alias.

**Files:** `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/src/emitters/domain.ts`, `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/test/unit/domain-emitter.test.ts`

### Steps

1.1 — RED. The existing test at `domain-emitter.test.ts` asserts `superType?: string;`. Replace that assertion and add explicit object-ref + alias assertions. Find the existing block:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
rg -n "superType\?: string;|flattening cross-refs to string|reading \\\$refText for cross-refs" packages/langium-zod/test/unit/domain-emitter.test.ts
```
Edit the first `it(...)` (the "flat interfaces" one) — change the cross-ref assertion and add the alias + read-expr assertions:
```ts
  it('emits a header, a DomainRef alias, and per-object read interface with object refs', () => {
    const source = generateDomainCode(flatObject);
    expect(source).toContain('// @ts-nocheck');
    expect(source).toContain('export interface DomainRef { $refText: string }');
    expect(source).toContain('export interface DataDomain {');
    expect(source).toContain('name: string;');
    expect(source).toContain('order?: number;');
    // Cross-references are EDITABLE OBJECTS, not flattened strings, not branded Ref<T>.
    expect(source).toContain('superType?: DomainRef;');
    expect(source).not.toContain('superType?: string;');
    expect(source).not.toContain("Ref<'");
    // Read expression passes the ref object through (no `.$refText` projection on the read side).
    expect(source).toContain('superType: node.superType,');
  });
```
Also update the read-projection test (the "emits toDomain<Name> reading $refText for cross-refs" one): its expectation `` `superType: node.superType?.$refText` `` (or similar) must change to `superType: node.superType,`. Find and fix:
```bash
rg -n "\\\$refText" packages/langium-zod/test/unit/domain-emitter.test.ts
```
For each read-side `$refText` projection assertion on a single cross-ref, change the expected to pass the object through (`node.<field>`). For ARRAY cross-refs, the read maps `(item) => item` (object through), so update any `.map((item) => item?.$refText)` expectations to `.map((item) => item)`.

1.2 — Run to fail:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
```
Expected: FAILS — source still emits `superType?: string;`, `node.superType?.$refText`, and no `DomainRef` alias.

1.3 — GREEN. Edit `domain.ts`:

(a) `domainTsType` crossReference arm (currently `return 'string';`):
```ts
    case 'crossReference':
      return 'DomainRef';
```

(b) `domainReadExpr` crossReference arm (currently `` return `${access}?.$refText`; ``):
```ts
    case 'crossReference':
      // Pass the editable ref OBJECT through (resolution stays external/derived).
      return access;
```

(c) `domainWriteType` crossReference arm (currently `return 'string';`) — KEEP `'string'`: the write accessor takes the raw ref text and wraps it in `{ $refText }` (the existing `emitAccessors` crossReference body already does `{ $refText: value }`). No change needed, but confirm it still reads:
```ts
    case 'crossReference':
      return 'string';
```

(d) The array read of a cross-ref: in `domainReadExpr`'s `array` arm the element read is `domainReadExpr(expression.element, 'item', ctx)`; with (b) above, a cross-ref element now yields `item` (object through) instead of `item?.$refText`. No code change beyond (b).

(e) Emit the `DomainRef` alias once in the header. In `generateDomainCode`, the `lines` initializer currently is:
```ts
  const lines: string[] = [
    '// @ts-nocheck — generated domain surface; edit the grammar / domain-surfaces.json to regenerate',
    ''
  ];
```
Change to:
```ts
  const lines: string[] = [
    '// @ts-nocheck — generated domain surface; edit the grammar / domain-surfaces.json to regenerate',
    '',
    '/** Editable cross-reference: the runtime ref shape. Resolution stays derived/external. */',
    'export interface DomainRef { $refText: string }',
    ''
  ];
```

1.4 — Run to pass:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
pnpm --filter langium-zod run type-check
```
Expected: PASSES. Type-check clean.

1.5 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/emitters/domain.ts packages/langium-zod/test/unit/domain-emitter.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(domain): editable {$refText} object cross-refs (un-flatten read)

Cross-ref read TYPE becomes `DomainRef` (`{ $refText: string }`) and the read
EXPRESSION passes the ref object through (no `.$refText` projection), so an edit
to `$refText` survives a round-trip. Write accessors keep wrapping the raw ref
text in `{ $refText: value }`. Emits the `DomainRef` alias once in the header.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Emitter: retain `$type` literal discriminant

**Why:** Each interface must carry `$type: 'X'` as a literal, and each `toDomainX` body must set it from `node.$type`, so `AnyDomain` is a discriminated union (narrowable on `$type`) and `toAst` (Task 6) can dispatch. Copied verbatim from set-aside `e98699b`, minus its branded-ref handling (already done in Task 1).

**Files:** `domain.ts`, `domain-emitter.test.ts`

### Steps

2.1 — RED. Add a test asserting `$type` is RETAINED as a literal field and read verbatim, and that `AnyDomain` narrows. Append to `domain-emitter.test.ts`:
```ts
describe('generateDomainCode — $type discriminant retention', () => {
  it('keeps $type as a literal interface field and reads node.$type', () => {
    const source = generateDomainCode(flatObject);
    expect(source).toContain("$type: 'Data';");
    expect(source).toContain('$type: node.$type,');
    // No setter is emitted for $type (it is the discriminant, not an editable field).
    expect(source).not.toContain('export function setDataType');
    expect(source).not.toContain('export function set$type');
  });

  it('emits AnyDomain as a union and a $type-dispatched toDomain', () => {
    const source = generateDomainCode([
      ...flatObject,
      {
        name: 'Choice',
        kind: 'object',
        properties: [
          { name: '$type', zodType: { kind: 'literal', value: 'Choice' }, optional: false },
          { name: 'name', zodType: { kind: 'primitive', primitive: 'string' }, optional: false }
        ]
      }
    ]);
    expect(source).toContain('export type AnyDomain = DataDomain | ChoiceDomain;');
    expect(source).toContain('export function toDomain(node: any): AnyDomain {');
    expect(source).toContain("case 'Data': return toDomainData(node);");
  });
});
```
The base test currently asserts `expect(source).not.toContain('$type:')` in the flat-interfaces block — that assertion is now WRONG. Remove/replace it (Task 1 already rewrote that block; ensure no `not.toContain('$type:')` remains):
```bash
rg -n "not.toContain\('\\\$type" packages/langium-zod/test/unit/domain-emitter.test.ts
```
Delete any such line.

2.2 — Run to fail:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
```
Expected: FAILS — no `$type: 'Data';` field, no `$type: node.$type,` in the read body.

2.3 — GREEN. In `planObject`, the `fields` array initializer currently is:
```ts
  const properties = descriptor.properties.filter((property) => property.name !== '$type');
  const fields: DomainFieldPlan[] = [];
  const accessors: AccessorPlan[] = [];
```
Change the `fields` initializer to seed the literal `$type` field first (verbatim from `e98699b`):
```ts
  const properties = descriptor.properties.filter((property) => property.name !== '$type');
  const fields: DomainFieldPlan[] = [
    // $type is always first — the literal discriminant for the union; no write accessor.
    { name: '$type', tsType: `'${descriptor.name}'`, optional: false, readExpr: 'node.$type' }
  ];
  const accessors: AccessorPlan[] = [];
```
The `$type` field is excluded from `accessors` because the `properties` filter already drops it before the accessor loop, so no setter is emitted. `emitInterface`/`emitReadFn` iterate `plan.fields` and will now emit the `$type` field + `$type: node.$type,`. No other change.

2.4 — Run to pass:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
pnpm --filter langium-zod run type-check
```
Expected: PASSES.

2.5 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/emitters/domain.ts packages/langium-zod/test/unit/domain-emitter.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(domain): retain $type literal discriminant on every interface

Seed each XDomain interface with `$type: 'X'` and set `$type: node.$type` in
toDomainX, making AnyDomain a properly narrowable discriminated union and
enabling the $type-dispatched toAst inverse (next task). No setter for $type.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Emitter: lossless guard test

**Why:** The full-surface (no per-type `fields` whitelist; strip only `$`-internals) must keep the semantic fields the editor's `node.data` currently drops: `references`/`labels`/`ruleReferences`/`typeCallArgs`/`enumSynonyms`. The emitter already keeps non-stripped fields; this is a guard test against future regression (and confirms the projection wiring is `$`-internals-only).

**Files:** `domain-emitter.test.ts`

### Steps

3.1 — RED (guard). Add a descriptor with all five lossy fields + `$`-internals and assert the semantic fields survive while `$`-internals are stripped. Append to `domain-emitter.test.ts`:
```ts
describe('generateDomainCode — lossless surface (strip $-internals only)', () => {
  const lossyDescriptor: ZodTypeDescriptor[] = [
    {
      name: 'Attribute',
      kind: 'object',
      properties: [
        { name: '$type', zodType: { kind: 'literal', value: 'Attribute' }, optional: false },
        { name: '$container', zodType: { kind: 'primitive', primitive: 'string' }, optional: true },
        { name: '$cstNode', zodType: { kind: 'primitive', primitive: 'string' }, optional: true },
        { name: 'name', zodType: { kind: 'primitive', primitive: 'string' }, optional: false },
        { name: 'references', zodType: { kind: 'array', element: { kind: 'primitive', primitive: 'string' } }, optional: true },
        { name: 'labels', zodType: { kind: 'array', element: { kind: 'primitive', primitive: 'string' } }, optional: true },
        { name: 'ruleReferences', zodType: { kind: 'array', element: { kind: 'primitive', primitive: 'string' } }, optional: true },
        { name: 'typeCallArgs', zodType: { kind: 'array', element: { kind: 'primitive', primitive: 'string' } }, optional: true },
        { name: 'enumSynonyms', zodType: { kind: 'array', element: { kind: 'primitive', primitive: 'string' } }, optional: true }
      ]
    }
  ];

  it('keeps references/labels/ruleReferences/typeCallArgs/enumSynonyms and strips $-internals', () => {
    const source = generateDomainCode(lossyDescriptor, { stripInternals: true });
    for (const field of ['references', 'labels', 'ruleReferences', 'typeCallArgs', 'enumSynonyms']) {
      expect(source).toContain(`${field}?: string[];`);
    }
    expect(source).not.toContain('$container');
    expect(source).not.toContain('$cstNode');
  });
});
```

3.2 — Run to fail/pass:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
```
Expected: This test likely PASSES immediately (the emitter already keeps non-stripped fields). That is acceptable for a guard test — its value is regression protection. If it unexpectedly fails, the `stripInternals` projection is stripping a semantic field: inspect `INTERNAL_METADATA_FIELDS` and fix the projection to strip only `$`-prefixed names.

3.3 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/test/unit/domain-emitter.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
test(domain): guard lossless surface keeps semantic fields, strips $-internals

Regression guard: references/labels/ruleReferences/typeCallArgs/enumSynonyms
survive the full surface; only $-prefixed internals are stripped.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Emitter: additive normalizations pass + option + collision-throw

**Why:** Append read-derived alias fields (`extends` ← `Data.superType`/`RosettaFunction.superFunction`/`RosettaEnumeration.parent`; `members` ← `attributes`/`enumValues`/`inputs`/`features`) that reuse the SOURCE field's projected `tsType`+`readExpr` verbatim (so they inherit the `{ $refText }` ref handling from Task 1). Additive (source fields retained), read-only (no setter), with a duplicate-name collision guard that THROWS. Copied verbatim from set-aside `042a729` + `097188d`.

**Files:** `domain.ts`, `domain-emitter.test.ts`

### Steps

4.1 — RED. Append to `domain-emitter.test.ts`:
```ts
describe('generateDomainCode — additive normalizations', () => {
  const dataDesc: ZodTypeDescriptor[] = [
    {
      name: 'Data',
      kind: 'object',
      properties: [
        { name: '$type', zodType: { kind: 'literal', value: 'Data' }, optional: false },
        { name: 'name', zodType: { kind: 'primitive', primitive: 'string' }, optional: false },
        { name: 'superType', zodType: { kind: 'crossReference', targetType: 'Data' }, optional: true },
        { name: 'attributes', zodType: { kind: 'array', element: { kind: 'primitive', primitive: 'string' } }, optional: true }
      ]
    }
  ];

  it('appends extends/members aliases reusing the source field projected type + readExpr', () => {
    const source = generateDomainCode(dataDesc, {
      normalizations: {
        inheritance: { as: 'extends', from: { Data: 'superType' } },
        members: { as: 'members', from: { Data: 'attributes' } }
      }
    });
    // Source fields retained.
    expect(source).toContain('superType?: DomainRef;');
    expect(source).toContain('attributes?: string[];');
    // Aliases reuse the SOURCE projected type (DomainRef object, not branded/string).
    expect(source).toContain('extends?: DomainRef;');
    expect(source).toContain('members?: string[];');
    // Aliases reuse the SOURCE readExpr verbatim (object passthrough for the ref).
    expect(source).toContain('extends: node.superType,');
    expect(source).toContain('members: (node.attributes ?? []).map((item) => item),');
    // No write accessor for an alias (writes go through the source field's accessor).
    expect(source).not.toContain('export function setDataExtends');
    expect(source).not.toContain('export function addDataMembers');
  });

  it('throws when a normalization `as` collides with an existing field', () => {
    expect(() =>
      generateDomainCode(dataDesc, {
        normalizations: { dup: { as: 'name', from: { Data: 'superType' } } }
      })
    ).toThrow(/normalization "name" for Data: target collides/);
  });

  it('silently skips a kind whose source field is absent', () => {
    const source = generateDomainCode(dataDesc, {
      normalizations: { inheritance: { as: 'extends', from: { Choice: 'superType' } } }
    });
    expect(source).not.toContain('extends');
  });
});
```

4.2 — Run to fail:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
```
Expected: FAILS — `normalizations` is not a recognized option; no alias fields emitted.

4.3 — GREEN. Edit `domain.ts`:

(a) Add `NormalizationConfig` after `DomainOverlayConfig` (verbatim from `042a729`/`097188d`):
```ts
export interface NormalizationConfig {
  /** Canonical field name to add (e.g. `'extends'` or `'members'`). */
  as: string;
  /**
   * Per-kind source field: `{ TypeName: 'sourceFieldName' }`.
   * The alias reuses the source field's already-projected `tsType` and `readExpr` verbatim.
   * Values match the **post-rename domain field name**, not the raw AST field name — if an
   * overlay also renames the source field, use the renamed (domain) name here.
   * If the source field is absent on a kind's planned fields, the alias is silently skipped for that kind.
   */
  from: Record<string /* typeName */, string /* sourceField */>;
}
```

(b) Add `normalizations` to `DomainGenerationOptions`:
```ts
export interface DomainGenerationOptions {
  /** Reuses the Zod projection for `defaults.strip` + per-type `fields`. */
  projection?: ProjectionConfig;
  /** Drop `$`-internal metadata fields (`$container`, `$cstNode`, …). */
  stripInternals?: boolean;
  overlays?: DomainOverlayConfig;
  /**
   * Additive read-only normalizations: each entry appends a canonical alias field
   * to every kind that maps to a source field via `from`. The alias reuses the source
   * field's projected `tsType` and `readExpr` — no raw AST access, no type widening.
   * No setter is emitted for alias fields (writes go through the source field's accessor).
   */
  normalizations?: Record<string /* id */, NormalizationConfig>;
}
```

(c) Add `readOnly?: boolean` to `DomainFieldPlan`:
```ts
interface DomainFieldPlan {
  name: string; // surface (domain) field name
  tsType: string;
  optional: boolean;
  readExpr: string; // expression in terms of `node`
  /** True for additive normalization aliases — no write accessor should be emitted. */
  readOnly?: boolean;
}
```

(d) Thread `normalizations` into `planObject`'s signature:
```ts
function planObject(
  descriptor: ZodObjectTypeDescriptor,
  overlay: DomainOverlayTypeConfig | undefined,
  ctx: DomainCtx,
  normalizations?: Record<string, NormalizationConfig>
): DomainObjectPlan {
```

(e) Insert the normalization pass immediately BEFORE `return { name: descriptor.name, fields, accessors };` at the end of `planObject` (verbatim from `042a729` + `097188d` collision guard):
```ts
  // Additive normalization pass: for each normalization whose `from` maps this kind,
  // find the already-planned source field and append a read-only alias using its
  // projected `tsType` and `readExpr` verbatim (no raw AST access, no type widening).
  // If the source field is not present in the plan (e.g. stripped by projection), skip silently.
  if (normalizations) {
    for (const norm of Object.values(normalizations)) {
      const sourceFieldName = norm.from[descriptor.name];
      if (!sourceFieldName) continue; // this kind not mapped

      const sourcePlan = fields.find((f) => f.name === sourceFieldName);
      if (!sourcePlan) continue; // source field absent or stripped — skip silently

      // Guard the alias name (mirrors the merge-collision guard). Throw — never silently
      // skip — so a config typo can't drop the canonical field and erode the lossless surface.
      // Catches both a real/source field and a prior normalization with the same `as`.
      if (fields.some((f) => f.name === norm.as)) {
        throw new Error(
          `domain normalization "${norm.as}" for ${descriptor.name}: target collides with an existing field`
        );
      }

      fields.push({
        name: norm.as,
        tsType: sourcePlan.tsType,
        optional: sourcePlan.optional,
        readExpr: sourcePlan.readExpr,
        readOnly: true
      });
    }
  }

  return { name: descriptor.name, fields, accessors };
```

(f) Pass `options.normalizations` at the `planObject` call site in `generateDomainCode`:
```ts
    const plan = planObject(object, overlayTypes[object.name], ctx, options.normalizations);
```
(Alias fields produce no accessors because the normalization pass only pushes to `fields`, never `accessors` — so `emitWriteAccessors` never emits a setter for them. ✓)

4.4 — Run to pass:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
pnpm --filter langium-zod run type-check
```
Expected: PASSES.

4.5 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/emitters/domain.ts packages/langium-zod/test/unit/domain-emitter.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(domain): additive extends/members normalizations with collision throw

Each normalization appends a read-only alias (extends/members) reusing the
source field's projected tsType + readExpr verbatim, so aliases inherit the
editable {$refText} ref handling. Source fields retained, no setter for aliases,
absent-source skipped silently, name collision throws.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Emitter: `parseProjectionConfig` preserves `normalizations` + `generateDomainSchemas` forwards it

**Why:** rune's `domain-surfaces.json` supplies `normalizations` via `--projection`, but the base `parseProjectionConfig` drops the key and `generateDomainSchemas` never forwards it — so config-file normalizations are silently ignored. Copied verbatim from set-aside `a5abc84`.

**Files:** `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/src/projection.ts`, `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/src/api.ts`, and a NEW test `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/test/unit/projection-normalizations.test.ts`

### Steps

5.1 — RED. Create `test/unit/projection-normalizations.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseProjectionConfig } from '../../src/projection.js';

describe('parseProjectionConfig — normalizations', () => {
  it('preserves a well-formed normalizations block', () => {
    const cfg = parseProjectionConfig({
      defaults: { strip: ['$container'] },
      types: {},
      normalizations: {
        inheritance: { as: 'extends', from: { Data: 'superType', RosettaEnumeration: 'parent' } },
        members: { as: 'members', from: { Data: 'attributes' } }
      }
    });
    expect(cfg.normalizations).toBeDefined();
    expect(cfg.normalizations!.inheritance.as).toBe('extends');
    expect(cfg.normalizations!.inheritance.from.Data).toBe('superType');
    expect(cfg.normalizations!.members.from.Data).toBe('attributes');
  });

  it('skips malformed entries (missing as / non-object from)', () => {
    const cfg = parseProjectionConfig({
      normalizations: {
        bad1: { from: { Data: 'x' } },
        bad2: { as: 'extends' },
        good: { as: 'extends', from: { Data: 'superType' } }
      }
    });
    expect(cfg.normalizations).toBeDefined();
    expect(cfg.normalizations!.bad1).toBeUndefined();
    expect(cfg.normalizations!.bad2).toBeUndefined();
    expect(cfg.normalizations!.good.as).toBe('extends');
  });

  it('leaves normalizations undefined when the block is absent', () => {
    const cfg = parseProjectionConfig({ defaults: { strip: [] }, types: {} });
    expect(cfg.normalizations).toBeUndefined();
  });
});
```

5.2 — Run to fail:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/projection-normalizations.test.ts
```
Expected: FAILS — `cfg.normalizations` is `undefined` (base drops the key).

5.3 — GREEN. Edit `projection.ts`:

(a) Extend `ProjectionConfig`:
```ts
export interface ProjectionConfig {
  defaults?: { strip?: string[] };
  types?: Record<string, { fields?: string[] }>;
  /** Optional normalizations forwarded to the domain emitter; see `NormalizationConfig`. */
  normalizations?: Record<string, { as: string; from: Record<string, string> }>;
}
```

(b) In `parseProjectionConfig`, extend the `source` cast and add the parse block before `return` (verbatim from `a5abc84`):
```ts
  const source = value as {
    defaults?: { strip?: unknown };
    types?: Record<string, { fields?: unknown }>;
    normalizations?: Record<string, { as?: unknown; from?: unknown }>;
  };
```
Then immediately before the final `return { defaults, types };`:
```ts
  // Preserve `normalizations` (additive read-only aliases) so the domain emitter
  // receives them via the projection config file, not only the programmatic options arg.
  let normalizations: ProjectionConfig['normalizations'];
  if (source.normalizations && typeof source.normalizations === 'object' && !Array.isArray(source.normalizations)) {
    normalizations = {};
    for (const [id, rule] of Object.entries(source.normalizations)) {
      if (!rule || typeof rule !== 'object' || typeof rule.as !== 'string' || !rule.from || typeof rule.from !== 'object') {
        continue;
      }
      const from: Record<string, string> = {};
      for (const [kind, field] of Object.entries(rule.from as Record<string, unknown>)) {
        if (typeof field === 'string') from[kind] = field;
      }
      normalizations[id] = { as: rule.as, from };
    }
  }

  return {
    defaults,
    types,
    normalizations
  };
```

(c) Edit `api.ts` `generateDomainSchemas` — forward `config.projection?.normalizations`:
```ts
  const source = generateDomainCode(descriptors, {
    projection: config.projection,
    stripInternals: config.stripInternals,
    overlays: config.domainOverlays,
    // Forward config-file normalizations to the emitter (additive extends/members aliases).
    normalizations: config.projection?.normalizations
  });
```

5.4 — Run to pass:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/projection-normalizations.test.ts
pnpm --filter langium-zod run type-check
```
Expected: PASSES.

5.5 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/projection.ts packages/langium-zod/src/api.ts packages/langium-zod/test/unit/projection-normalizations.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
fix(domain): preserve + forward config-file normalizations to the emitter

parseProjectionConfig dropped `normalizations` and generateDomainSchemas never
forwarded it, so --projection-supplied extends/members aliases were silently
ignored. Parse (skipping malformed entries) and forward to generateDomainCode.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Emitter: `$type`-dispatched `toAst` inverse

**Why:** Round-trip needs the inverse `toAst(domainObj)` that drops the additive normalizations (`extends`/`members` and any `readOnly` alias) and yields an AST-shaped object Langium's `JsonSerializer` can serialize. Because refs are already `{ $refText }` objects and child fields mirror the AST, the inverse is near-identity per field: copy each non-alias source field, recursing into rich children. Emit per-object `toAstX`, per-union `toAstX`, and a master `toAst` switch alongside `toDomain`.

**Design (deterministic emit):**
- For an object plan, `toAstX(node)` returns `{ $type: 'X', <sourceField>: <invReadExpr>, ... }` over the NON-`readOnly` fields, EXCLUDING the `$type` field itself from the iteration (it is emitted as the literal head). The `extends`/`members` aliases have `readOnly: true` → skipped. ✓
- The inverse read expression mirrors `domainReadExpr` but in reverse — and since the domain shape mirrors the AST for everything except rich-child recursion and unions, `toAst` per field is:
  - primitive/literal/crossReference: `node.<field>` (the value/ref-object passes straight through),
  - reference (rich): `node.<field> ? toAst<TypeName>(node.<field>) : undefined`,
  - reference (non-rich datatype): `node.<field>`,
  - array: `(node.<field> ?? []).map((item) => <elementInverse>)`,
  - union/lazy: pass through / recurse on inner (same documented limitation as `domainReadExpr`).
- Field NAME on the AST object = the SOURCE field name (`plan` field `name` for non-alias fields IS the source name, since base projection doesn't rename and Phase 1 adds no renames). For renamed overlays the inverse would need the source name — out of Phase-1 scope (rune uses no renames; assert via the harness).

**Files:** `domain.ts`, `domain-emitter.test.ts`

### Steps

6.1 — RED. Append to `domain-emitter.test.ts`:
```ts
describe('generateDomainCode — toAst inverse', () => {
  const desc: ZodTypeDescriptor[] = [
    {
      name: 'Data',
      kind: 'object',
      properties: [
        { name: '$type', zodType: { kind: 'literal', value: 'Data' }, optional: false },
        { name: 'name', zodType: { kind: 'primitive', primitive: 'string' }, optional: false },
        { name: 'superType', zodType: { kind: 'crossReference', targetType: 'Data' }, optional: true },
        { name: 'attributes', zodType: { kind: 'array', element: { kind: 'reference', typeName: 'Attribute' } }, optional: true }
      ]
    },
    {
      name: 'Attribute',
      kind: 'object',
      properties: [
        { name: '$type', zodType: { kind: 'literal', value: 'Attribute' }, optional: false },
        { name: 'name', zodType: { kind: 'primitive', primitive: 'string' }, optional: false }
      ]
    }
  ];

  it('emits per-object toAstX, a master toAst dispatch, and drops normalization aliases', () => {
    const source = generateDomainCode(desc, {
      normalizations: { inheritance: { as: 'extends', from: { Data: 'superType' } } }
    });
    expect(source).toContain('export function toAstData(node: any): any {');
    expect(source).toContain("$type: 'Data',");
    expect(source).toContain('name: node.name,');
    // Ref object passes straight through.
    expect(source).toContain('superType: node.superType,');
    // Rich-child arrays recurse via toAst<Child>.
    expect(source).toContain('attributes: (node.attributes ?? []).map((item) => item ? toAstAttribute(item) : undefined),');
    // The `extends` alias is NOT written back to the AST.
    expect(source).not.toContain('extends: node');
    // Master dispatch.
    expect(source).toContain('export function toAst(node: any): any {');
    expect(source).toContain("case 'Data': return toAstData(node);");
  });
});
```

6.2 — Run to fail:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
```
Expected: FAILS — no `toAst*` functions emitted.

6.3 — GREEN. Edit `domain.ts`.

(a) Add an inverse-read helper next to `domainReadExpr`:
```ts
/** Inverse-projection expression: domain value at `access` back to an AST-shaped value. */
function domainToAstExpr(expression: ZodTypeExpression, access: string, ctx: DomainCtx): string {
  switch (expression.kind) {
    case 'primitive':
    case 'literal':
    case 'crossReference':
      // Primitives, literals, and {$refText} ref objects pass straight through.
      return access;
    case 'reference':
      return ctx.richTypeNames.has(expression.typeName)
        ? `${access} ? toAst${expression.typeName}(${access}) : undefined`
        : access;
    case 'array':
      return `(${access} ?? []).map((item) => ${domainToAstExpr(expression.element, 'item', ctx)})`;
    case 'union':
      // Same documented limitation as domainReadExpr: inline property-level unions pass through.
      return access;
    case 'lazy':
      return domainToAstExpr(expression.inner, access, ctx);
  }
}
```

(b) Carry the source expression onto the field plan so `toAst` can re-derive the inverse. Extend `DomainFieldPlan`:
```ts
interface DomainFieldPlan {
  name: string; // surface (domain) field name
  tsType: string;
  optional: boolean;
  readExpr: string; // expression in terms of `node`
  /** True for additive normalization aliases — no write accessor / no toAst write-back. */
  readOnly?: boolean;
  /** Source expression + source field name, for the toAst inverse. Absent on aliases. */
  sourceName?: string;
  sourceExpr?: ZodTypeExpression;
}
```
In `planObject`, where non-merge source fields are pushed (the `fields.push({ name: domainName, ... })` block), add `sourceName: property.name` and `sourceExpr: property.zodType`:
```ts
      fields.push({
        name: domainName,
        tsType: domainTsType(property.zodType, ctx),
        optional: property.optional,
        readExpr: domainReadExpr(property.zodType, `node.${property.name}`, ctx),
        sourceName: property.name,
        sourceExpr: property.zodType
      });
```
(The `$type` seed field and alias/merge fields leave `sourceExpr` undefined → they are emitted specially / skipped in `toAst`.)

(c) Add `emitToAstFn`:
```ts
function emitToAstFn(plan: DomainObjectPlan, ctx: DomainCtx): string[] {
  const out = [`export function toAst${plan.name}(node: any): any {`, '  return {', `    $type: '${plan.name}',`];
  for (const field of plan.fields) {
    if (field.name === '$type') continue; // emitted as the literal head
    if (field.readOnly) continue; // additive normalization alias — not written back
    if (!field.sourceExpr || !field.sourceName) continue; // merge-target etc. — no AST source
    out.push(`    ${field.sourceName}: ${domainToAstExpr(field.sourceExpr, `node.${field.sourceName}`, ctx)},`);
  }
  out.push('  };', '}', '');
  return out;
}
```

(d) Add `emitToAstUnion` (mirrors `emitUnion`):
```ts
function emitToAstUnion(descriptor: ZodUnionTypeDescriptor): string[] {
  const out = [
    `export function toAst${descriptor.name}(node: any): any {`,
    '  switch (node.$type) {'
  ];
  for (const member of descriptor.members) {
    out.push(`    case ${JSON.stringify(member)}: return toAst${member}(node);`);
  }
  out.push(
    '  }',
    `  throw new Error(\`Unknown ${descriptor.name} member: \${node.$type}\`);`,
    '}',
    ''
  );
  return out;
}
```
NOTE: a union name collides between `toDomain<Union>` and `toAst<Union>` only on the `toAst`/`toDomain` prefix — distinct, no collision.

(e) Add `emitToAstMaster` (mirrors `emitMasterDispatch`):
```ts
function emitToAstMaster(objects: ZodObjectTypeDescriptor[]): string[] {
  if (objects.length === 0) {
    return [];
  }
  const out = ['export function toAst(node: any): any {', '  switch (node.$type) {'];
  for (const object of objects) {
    out.push(`    case ${JSON.stringify(object.name)}: return toAst${object.name}(node);`);
  }
  out.push('  }', '  throw new Error(`Unknown node type: ${node.$type}`);', '}', '');
  return out;
}
```

(f) Wire the emitters into `generateDomainCode`. In the per-object loop, after `emitWriteAccessors`:
```ts
  for (const object of objects) {
    const plan = planObject(object, overlayTypes[object.name], ctx, options.normalizations);
    lines.push(...emitInterface(plan));
    lines.push(...emitReadFn(plan));
    lines.push(...emitToAstFn(plan, ctx));
    lines.push(...emitWriteAccessors(plan, ctx));
  }
```
In the union loop:
```ts
  for (const union of unions) {
    lines.push(...emitUnion(union));
    lines.push(...emitToAstUnion(union));
  }
```
After `emitMasterDispatch`:
```ts
  lines.push(...emitMasterDispatch(objects));
  lines.push(...emitToAstMaster(objects));
```

6.4 — Run to pass:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run packages/langium-zod/test/unit/domain-emitter.test.ts
pnpm --filter langium-zod run type-check
```
Expected: PASSES. Then run the FULL langium-zod suite to catch any other emitter-snapshot test:
```bash
npx vitest run
```
Expected: all green. (If an integration/snapshot test asserts old emitter output, update it to the new editable/`$type`/`toAst` shape — it is asserting the behavior this plan intentionally changes.)

6.5 — **Commit (langium-zod):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/emitters/domain.ts packages/langium-zod/test/unit/domain-emitter.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(domain): $type-dispatched toAst inverse (drops normalization aliases)

Emit per-object toAstX, per-union toAstX, and a master toAst switch. Near-identity
per field (refs are already {$refText} objects); recurses into rich children, drops
the additive extends/members aliases. Enables the domain->AST->JsonSerializer
round-trip proven in the rune conformance harness.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — rune: `ViewOverlay` type (domain/view split)

**Why:** Define the type-level boundary that separates pure-domain data from view metadata (`position`/`errors`/`isReadOnly`), keyed by node id, so Phase 3 can cleanly split `node.data`. Type-level + a small test; NO editor cutover. `namespace` is intentionally NOT in the overlay (it is identity-derived).

**Files:** NEW `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/visual-editor/src/view-overlay.ts`, NEW `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/visual-editor/test/view-overlay.test.ts`

### Steps

7.1 — RED. Create `test/view-overlay.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ViewMetadata, ViewOverlay } from '../src/view-overlay.js';

describe('ViewOverlay', () => {
  it('keys view metadata by node id with position/errors/isReadOnly only', () => {
    const overlay: ViewOverlay = {
      'ns.Foo': { position: { x: 1, y: 2 }, errors: [], isReadOnly: false }
    };
    expect(overlay['ns.Foo'].position).toEqual({ x: 1, y: 2 });
    expect(overlay['ns.Foo'].errors).toEqual([]);
    expect(overlay['ns.Foo'].isReadOnly).toBe(false);
  });

  it('ViewMetadata has exactly position/errors/isReadOnly (no namespace, no domain fields)', () => {
    expectTypeOf<keyof ViewMetadata>().toEqualTypeOf<'position' | 'errors' | 'isReadOnly'>();
  });
});
```

7.2 — Run to fail:
```bash
pnpm --filter @rune-langium/visual-editor test view-overlay
```
Expected: FAILS — `../src/view-overlay.js` does not exist.

7.3 — GREEN. Create `src/view-overlay.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * View overlay — the domain/view split point (Editable Domain Model, Phase 1).
 *
 * The generated domain object (langium-zod `XDomain`) is PURE SEMANTIC: it carries
 * no `position`/`errors`/`isReadOnly`/`namespace`. The view-only metadata that the
 * editor needs lives here instead, keyed by node id (`qualifiedExportPath(namespace, name)`),
 * so a later phase can split `TypeGraphNode.data` into `{ domain object } + { overlay }`
 * without mixing view state into the round-trippable domain model.
 *
 * `namespace` is intentionally NOT part of the overlay — it is identity-derived (it is
 * part of the node-id key), not a stored field.
 */

import type { ValidationError } from './types.js';

/** Pure view metadata for a single node (no domain/semantic fields). */
export interface ViewMetadata {
  /** Canvas position for the node. */
  position: { x: number; y: number };
  /** Validation errors attributed to the node (view concern, not domain). */
  errors: ValidationError[];
  /** Whether the node is read-only in the editor (e.g. a system/base-type node). */
  isReadOnly: boolean;
}

/** View overlay: view metadata keyed by node id (`namespace.name`, the dot-form qualified path). */
export type ViewOverlay = Record<string, ViewMetadata>;
```

7.4 — Run to pass:
```bash
pnpm --filter @rune-langium/visual-editor test view-overlay
pnpm --filter @rune-langium/visual-editor run type-check
```
Expected: PASSES.

7.5 — **Commit (rune):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/visual-editor/src/view-overlay.ts packages/visual-editor/test/view-overlay.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(visual-editor): ViewOverlay type — domain/view split point (Phase 1)

Type-level boundary separating pure-domain data from view metadata
(position/errors/isReadOnly) keyed by node id. namespace stays identity-derived
(not stored). No editor cutover this phase.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — rune: regenerate `domain.ts` against the evolved emitter

**Why:** The committed `packages/visual-editor/src/generated/domain.ts` is the OLD set-aside output (branded `Ref<T> = string`, read `?.$refText`). Regenerate it against the Phase-1 emitter (via the dev-link) so it has editable `{ $refText }` objects, retained `$type`, additive `extends`/`members`, and `toAst`. This is a generated artifact — regenerate, don't hand-edit.

**Files:** `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/visual-editor/src/generated/domain.ts` (regenerated)

### Steps

8.1 — Refresh the linked dist so the rune CLI invocation uses the evolved emitter:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && pnpm --filter langium-zod run build
```

8.2 — Regenerate the domain surface from the rune side:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor run generate:domain
```
Expected: `packages/visual-editor/src/generated/domain.ts` is rewritten. Sanity-check the new shape:
```bash
rg -n "export interface DomainRef|superType\?: DomainRef|extends\?: DomainRef|export function toAstData|export function toAst\(node|\\\$type: 'Data'" packages/visual-editor/src/generated/domain.ts | head
rg -n "Ref<'|export type Ref" packages/visual-editor/src/generated/domain.ts | head
```
Expected: `DomainRef` interface present; `superType?: DomainRef;`, `extends?: DomainRef;`, `toAstData`, `toAst(node`, `$type: 'Data'` present; and NO `Ref<'` / `export type Ref` (branded ref gone).

8.3 — Type-check the regenerated artifact in context (it has `// @ts-nocheck`, so this mainly checks importers):
```bash
pnpm --filter @rune-langium/visual-editor run type-check
```
Expected: clean (or only pre-existing unrelated diagnostics). If an existing rune file imports `Ref` from the generated domain, that import is now dead — fix the importer (Phase 1 has no runtime consumer of the generated domain except the new harness, so this is unlikely; grep to confirm):
```bash
rg -n "from.*generated/domain|import.*\bRef\b.*domain" packages/visual-editor/src packages/visual-editor/test | rg -v generated/domain.ts
```

8.4 — **Commit (rune):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/visual-editor/src/generated/domain.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
chore(visual-editor): regenerate domain surface against editable emitter

Regenerated via the langium-zod dev-link: editable {$refText} object cross-refs
(DomainRef), retained $type discriminant, additive extends/members, and the
toAst inverse. Replaces the prior branded-Ref<T> read-projection output.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — rune: conformance harness (JSON round-trip + ref survival + shape)

**Why:** Prove the keystone. For Data/Choice/Enum/Function: (a) lossless JSON round-trip `domain → toAst → JsonSerializer → deserialize → toDomain` equals the original domain object; (b) an edit via a generated write-accessor survives the round-trip; (d) `$type` present + narrowable, `extends`/`members` present, refs are `{ $refText }` objects, lossless fields present. (The `.rosetta`-text round-trip — §6.3 / spec item (c) — is Task 10.)

**Files:** NEW `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/visual-editor/test/conformance/domain-roundtrip.test.ts`

**Harness mechanism (SAME as repo):** parse with `@rune-langium/core` `parse`, reach the JsonSerializer via `createRuneDslServices().RuneDsl.serializer.JsonSerializer` (the same service `parser-worker.ts:153` and `hydrate-model-document.ts` use), serialize with `serializeRuneModel`, deserialize with `deserializeRuneModel`. `toDomain`/`toAst`/`setDataSuperType` come from the regenerated `../../src/generated/domain.js`.

### Steps

9.1 — RED. Create `test/conformance/domain-roundtrip.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Editable-domain-model Phase 1 conformance harness.
 *
 * Proves, for Data/Choice/Enum/Function:
 *  (a) lossless JSON round-trip: domain -> toAst -> JsonSerializer -> deserialize -> toDomain
 *  (b) an editable {$refText} edit via a generated write-accessor survives the round-trip
 *  (d) shape: $type present + narrowable, extends/members normalizations present,
 *      cross-refs are {$refText} OBJECTS, lossless fields present.
 *
 * Mechanism mirrors the repo: createRuneDslServices() -> RuneDsl.serializer.JsonSerializer,
 * serializeRuneModel / deserializeRuneModel (the same path parser-worker + hydrate use).
 */

import { describe, it, expect } from 'vitest';
import { URI, type AstNode } from 'langium';
import {
  parse,
  createRuneDslServices,
  serializeRuneModel,
  deserializeRuneModel,
  type RuneDslServices
} from '@rune-langium/core';
import {
  toDomain,
  toAst,
  setDataSuperType,
  type AnyDomain
} from '../../src/generated/domain.js';

const services: RuneDslServices = createRuneDslServices();
const serializer = services.RuneDsl.serializer.JsonSerializer;

const DATA_SOURCE = `
namespace test.domain.data
version "1.0.0"

type Base:
  id string (1..1)

type Trade extends Base:
  notional number (1..1)
`;

const CHOICE_SOURCE = `
namespace test.domain.choice
version "1.0.0"

type Cash:
  amount number (1..1)

type Security:
  isin string (1..1)

choice Payment:
  Cash
  Security
`;

const ENUM_SOURCE = `
namespace test.domain.enum
version "1.0.0"

enum Color:
  Red
  Green
`;

const FUNCTION_SOURCE = `
namespace test.domain.func
version "1.0.0"

type Money:
  amount number (1..1)

func Add:
  inputs:
    a number (1..1)
  output:
    result number (1..1)
  set result:
    a
`;

/** Pull the first top-level element of a given name from a parsed model. */
function elementByName(model: unknown, name: string): AstNode {
  const elements = (model as { elements?: AstNode[] }).elements ?? [];
  const found = elements.find((e) => (e as { name?: string }).name === name);
  if (!found) throw new Error(`element ${name} not found`);
  return found;
}

/** domain -> toAst -> JsonSerializer -> deserialize -> toDomain. */
function jsonRoundtrip(domainObj: AnyDomain): AnyDomain {
  const astLike = toAst(domainObj);
  const json = serializeRuneModel(serializer, astLike as AstNode);
  const reAst = deserializeRuneModel(
    {
      RuneDsl: services.RuneDsl,
      shared: services.shared
    } as never,
    json
  );
  return toDomain(reAst as never);
}

describe('Domain round-trip conformance (Phase 1)', () => {
  it('Data: lossless JSON round-trip equals the original domain object', async () => {
    const parsed = await parse(DATA_SOURCE);
    const ast = elementByName(parsed.value, 'Trade');
    const domainObj = toDomain(ast as never);
    const back = jsonRoundtrip(domainObj);
    expect(back).toEqual(domainObj);
  });

  it('Data: $type present + narrowable, refs are {$refText} objects, extends/members present', async () => {
    const parsed = await parse(DATA_SOURCE);
    const ast = elementByName(parsed.value, 'Trade');
    const d = toDomain(ast as never);
    expect(d.$type).toBe('Data');
    if (d.$type === 'Data') {
      // narrowed
      expect(typeof d.superType === 'object' && d.superType !== null).toBe(true);
      expect((d.superType as { $refText?: string }).$refText).toBe('Base');
      // additive normalizations present alongside source fields.
      expect((d as { extends?: { $refText?: string } }).extends?.$refText).toBe('Base');
      expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    }
  });

  it('Data: editable-ref edit via setDataSuperType survives the round-trip', async () => {
    const parsed = await parse(DATA_SOURCE);
    const ast = elementByName(parsed.value, 'Trade');
    const d = toDomain(ast as never) as { $type: 'Data'; superType?: { $refText: string } };
    // Edit the ref through the generated accessor.
    setDataSuperType(d as never, 'SomethingElse');
    expect(d.superType?.$refText).toBe('SomethingElse');
    const back = jsonRoundtrip(d as AnyDomain) as { superType?: { $refText?: string } };
    expect(back.superType?.$refText).toBe('SomethingElse');
  });

  it('Choice: lossless JSON round-trip + members normalization present', async () => {
    const parsed = await parse(CHOICE_SOURCE);
    const ast = elementByName(parsed.value, 'Payment');
    const d = toDomain(ast as never);
    expect(d.$type).toBe('Choice');
    expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    expect(jsonRoundtrip(d)).toEqual(d);
  });

  it('Enum: lossless JSON round-trip + members normalization present', async () => {
    const parsed = await parse(ENUM_SOURCE);
    const ast = elementByName(parsed.value, 'Color');
    const d = toDomain(ast as never);
    expect(d.$type).toBe('RosettaEnumeration');
    expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    expect(jsonRoundtrip(d)).toEqual(d);
  });

  it('Function: lossless JSON round-trip + members normalization present', async () => {
    const parsed = await parse(FUNCTION_SOURCE);
    const ast = elementByName(parsed.value, 'Add');
    const d = toDomain(ast as never);
    expect(d.$type).toBe('RosettaFunction');
    expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    expect(jsonRoundtrip(d)).toEqual(d);
  });
});
```

9.2 — Run to fail:
```bash
pnpm --filter @rune-langium/visual-editor test domain-roundtrip
```
Expected: FAILS initially if the regenerated `domain.ts` (Task 8) isn't present/correct, or if a `toEqual` mismatch surfaces. Investigate failures via systematic-debugging — the most likely real divergences:
- **`$cstNode`/text-region noise:** `RUNE_SERIALIZE_OPTIONS` sets `textRegions: true`. If the deserialized AST gains/loses non-`$`-semantic fields, that is fine because `toDomain` strips them. But if a `toEqual` fails on a `$`-field leaking into the domain object, fix by confirming `--strip-internals` covered it during generation, OR narrow the harness compare to the non-`$` projection (preferred: the domain object should already be `$`-free except `$type`/`$refText`).
- **`undefined` vs missing key:** `toAst` emits `field: undefined` for absent optionals; after JSON serialize→parse those keys vanish, and `toDomain` re-reads them as `undefined`. `toEqual` treats `{a: undefined}` and `{}` as equal in Vitest, so this is usually fine; if a deep array element differs, normalize by JSON-cloning both sides: `expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(domainObj)))`.

9.3 — GREEN. The implementation is the regenerated emitter (Tasks 1–6/8) — the harness is the proof, not new product code. If a genuine round-trip gap is found (e.g. a field that `toAst` drops but `toDomain` reads), fix the emitter (`domain.ts`), rebuild langium-zod dist, regenerate rune `domain.ts`, and re-run. Iterate until all six `it`s pass. Do NOT weaken the `toEqual` to paper over a real loss — that defeats the keystone.

9.4 — Run to pass:
```bash
pnpm --filter @rune-langium/visual-editor test domain-roundtrip
```
Expected: all 6 PASS.

9.5 — **Commit (rune):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/visual-editor/test/conformance/domain-roundtrip.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
test(visual-editor): domain JSON round-trip + ref-survival conformance (Phase 1)

Proves domain -> toAst -> JsonSerializer -> deserialize -> toDomain is lossless for
Data/Choice/Enum/Function, that an editable {$refText} edit survives the round-trip,
and asserts $type/extends/members shape via the same serializer the worker uses.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — rune: `.rosetta`-text round-trip (Data/Choice/Enum) + Function gap

**Why:** Spec §6.3 — additionally prove `.rosetta`-TEXT round-trip for Data/Choice/Enum via the existing serializer. Function's text render is an out-of-scope downstream gap (the hand-written `serializeModel` drops Function) — assert it as a documented limitation, not a pass.

**Files:** extend `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/visual-editor/test/conformance/domain-roundtrip.test.ts`

### Steps

10.1 — RED. Append a `describe` block. This reuses the existing `roundtrip.test.ts` text-serializer idiom but drives it from the domain object via `toAst`. The simplest faithful path: `domain → toAst → wrap in a single-namespace model → serializeModel → parse → assert text + parserErrors`. Use core `serializeModel` (the existing `.rosetta` renderer; Data/Choice/Enum only).
```ts
import { serializeModel } from '@rune-langium/core';

describe('Domain .rosetta-text round-trip (Data/Choice/Enum; Function = downstream gap)', () => {
  /** Wrap a single AST element back into a minimal RosettaModel for the text serializer. */
  function wrapModel(namespace: string, astEl: unknown) {
    return {
      $type: 'RosettaModel',
      name: namespace,
      version: '1.0.0',
      imports: [],
      configs: [],
      elements: [astEl]
    } as never;
  }

  it('Data: domain -> toAst -> serializeModel -> parse re-parses cleanly', async () => {
    const parsed = await parse(DATA_SOURCE);
    const ast = elementByName(parsed.value, 'Trade');
    const d = toDomain(ast as never);
    const text = serializeModel(wrapModel('test.domain.data', toAst(d)));
    expect(text).toContain('type Trade extends Base');
    const reparsed = await parse(text);
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('Choice: domain -> toAst -> serializeModel -> parse re-parses cleanly', async () => {
    const parsed = await parse(CHOICE_SOURCE);
    const ast = elementByName(parsed.value, 'Payment');
    const d = toDomain(ast as never);
    const text = serializeModel(wrapModel('test.domain.choice', toAst(d)));
    expect(text).toContain('choice Payment');
    const reparsed = await parse(text);
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('Enum: domain -> toAst -> serializeModel -> parse re-parses cleanly', async () => {
    const parsed = await parse(ENUM_SOURCE);
    const ast = elementByName(parsed.value, 'Color');
    const d = toDomain(ast as never);
    const text = serializeModel(wrapModel('test.domain.enum', toAst(d)));
    expect(text).toContain('enum Color');
    const reparsed = await parse(text);
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('Function: .rosetta text-render is a documented downstream gap (serializeModel drops it)', async () => {
    const parsed = await parse(FUNCTION_SOURCE);
    const ast = elementByName(parsed.value, 'Add');
    const d = toDomain(ast as never);
    const text = serializeModel(wrapModel('test.domain.func', toAst(d)));
    // The hand-written .rosetta serializer does NOT emit `func` (out of scope; own later spec).
    // The domain model + JSON round-trip (Task 9) DO cover Function — only TEXT rendering is the gap.
    expect(text).not.toContain('func Add');
  });
});
```
NOTE: confirm `serializeModel`'s expected model shape before finalizing `wrapModel` — read its signature:
```bash
rg -n "export function serializeModel|function serializeModel" packages/core/src/serializer/rosetta-serializer.ts
```
Adjust `wrapModel`'s field names (`elements`/`name`/`version`) to whatever `serializeModel` reads. If `serializeModel` takes a `ModelOutput`-like object, match the `modelsToAst` `ModelOutput` shape used in `roundtrip-edits.test.ts` (`{ name, elements }`).

10.2 — Run to fail/iterate:
```bash
pnpm --filter @rune-langium/visual-editor test domain-roundtrip
```
Expected: the three Data/Choice/Enum text round-trips pass; the Function assertion confirms the gap. If `serializeModel` needs a different wrapper shape, fix `wrapModel` per its signature and re-run.

10.3 — **Commit (rune):**
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/visual-editor/test/conformance/domain-roundtrip.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
test(visual-editor): .rosetta-text round-trip for Data/Choice/Enum (Phase 1)

Drives the existing text serializer from the domain object via toAst and asserts
clean re-parse for Data/Choice/Enum. Function text-render is asserted as a known
downstream gap (serializeModel drops func) — its own later spec; JSON round-trip
already covers Function.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — Final: dual type-check + full suites + plan self-review

**Why:** Guard against cross-file regressions (sibling tests asserting old emitter output, stale importers of the removed `Ref`), per the "run full package suite" lesson.

### Steps

11.1 — langium-zod: full suite + type-check:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
pnpm --filter langium-zod run build
npx vitest run
pnpm --filter langium-zod run type-check
```
Expected: all green. Fix any snapshot/integration test asserting old emitter output (update to editable/`$type`/`toAst` shape).

11.2 — rune VE: full suite + type-check:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
```
Expected: all green, including the pre-existing `roundtrip.test.ts` and `roundtrip-edits.test.ts` (Phase 1 does NOT touch the editor substrate, so these must still pass unchanged). If a pre-existing test imports `Ref` from the regenerated domain, fix the importer.

11.3 — Confirm no `reference-design/` was staged anywhere:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium && git status --porcelain | rg "reference-design" || echo "clean"
```
Expected: `clean`.

11.4 — Self-review the plan's spec coverage (see section below). No commit.

---

## Self-review notes — spec coverage mapping

Mapping each Phase-1 spec requirement to the task(s) that satisfy it:

| Spec ref | Requirement | Task(s) |
| --- | --- | --- |
| §3.1 bullet 1 | Cross-refs as editable `{$refText}` objects (read+write), un-flatten the `string` read type | Task 1 |
| §3.1 bullet 2 | `$type` literal discriminant retained on every interface | Task 2 |
| §3.1 bullet 3 | Lossless: keep `references`/`labels`/`ruleReferences`/`typeCallArgs`/`enumSynonyms`; strip only `$`-internals | Task 3 (guard); config = `--strip-internals` + `domain-surfaces.json` no-whitelist (Task 8) |
| §3.1 bullet 4 | Additive `extends`/`members` normalizations (originals retained, read-derived) | Task 4 (emitter) + Task 5 (config wiring) |
| §3.1 bullet 5 | Pure-semantic (no position/errors/namespace/isReadOnly in domain object) | Task 7 moves them to `ViewOverlay`; emitter never emits them (no source field for them) |
| §3.1 bullet 6 | `toDomain` + inverse `toAst`; inverse drops normalizations | Task 6 |
| §3.2 | Round-trip via Langium `JsonSerializer` (no new serializer); `.rosetta` text serializer stays separate | Task 9 (JsonSerializer) + Task 10 (text) |
| §3.3 | `ViewOverlay` type for position/errors/isReadOnly keyed by node id; namespace identity-derived | Task 7 |
| §4 | Data flow: `domain → edit → toAst → JsonSerializer → deserialize → toDomain` proven | Task 9 |
| §6.1 | Lossless JSON round-trip equals original (Data/Choice/Enum/Function) | Task 9 |
| §6.2 | Editable-ref survival via a generated write-accessor | Task 9 (`setDataSuperType`) |
| §6.3 | `.rosetta`-text round-trip Data/Choice/Enum; Function = downstream gap | Task 10 |
| §6.4 | Shape: `$type` narrowable, `extends`/`members` present, refs are objects, lossless fields present | Task 9 (+ Task 3 emitter guard) |
| §9 langium-zod branch state | Reconcile base #68 start; dev-link + shebang handling | Task 0 |
| §9 `toAst` faithfulness | inverse drops normalizations without losing source fields; harness is the guard | Task 6 + Task 9 |
| Non-goals §8 | branded-`Ref` / ref-centralization NOT done; curated adapter, editor cutover, consumer cutover deferred | Phase 1 explicitly emits `{$refText}` objects (not branded `Ref`); no editor/consumer changes |

### Spec ambiguities encountered (flagged, with the resolution I baked in)

1. **`domainWriteType` for cross-refs — `string` vs `DomainRef`.** The spec says refs are editable objects on "both read and write." The base write ACCESSOR already wraps a raw `string` into `{ $refText: value }`. I kept the write-accessor PARAM as `string` (the raw ref text the caller supplies) and the read TYPE as `DomainRef` object — this matches the existing accessor body and the set-aside branch's accessor signature. If the intent was a `DomainRef`-typed setter param, that's a trivial follow-up, but `string` is the more ergonomic editor surface (callers pass a name, not an object).

2. **`--domain-only` provenance.** The rune `generate:domain` script uses `--domain-only`, which exists only on the set-aside branch (`e00ab76`), not on `develop`. Task 0.4 ports it. If porting proves heavy against the base CLI, I noted a fallback (a tiny node script importing `generateDomainSchemas`).

3. **`toEqual` strictness vs serializer text-region noise.** `RUNE_SERIALIZE_OPTIONS` enables `textRegions`/`refText`. The domain object should be `$`-free (except `$type`/`$refText`) so `toEqual` is exact, but Task 9.2 documents a JSON-clone normalization fallback if a deep optional/`undefined` asymmetry surfaces — without weakening the losslessness claim.

4. **`serializeModel` wrapper shape.** Task 10's `wrapModel` is written against the `RosettaModel` element shape inferred from `roundtrip.test.ts`; Task 10.1 instructs reading the actual `serializeModel` signature to confirm field names before finalizing (the existing `roundtrip-edits.test.ts` uses `serializeModel(models[0])` where `models[0]` is a `ModelOutput` `{ name, elements }`, so the wrapper may need that exact shape).

5. **`ViewMetadata.isReadOnly` optionality.** `GraphMetadata.isReadOnly` is optional today; I made `ViewMetadata.isReadOnly` REQUIRED (the overlay is an explicit split target — a missing value should be a deliberate `false`, not absent). The `expectTypeOf<keyof ViewMetadata>` test pins exactly the three keys.
