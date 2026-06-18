# Phase 4 — Generated Typed Domain Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a typed domain repository (`Repository<T>` + `createRepository` + `DomainRepository`/`createDomainRepository` + `AnyDomain` union + `DomainTypeMap`) from the grammar via langium-zod into `@rune-langium/core`'s `domain.ts`, then route the editor's ad-hoc node lookups through it.

**Architecture:** Two streams, mirroring Phase 2. **Stream A (cross-repo, langium-zod):** extend the `namespace-ops` emitter to emit the repository, driven by a new `repository.elementTypes` list in `domain-surface.config.json`; publish a new version. **Stream B (rune):** bump the override, regenerate `domain.ts`, add core runtime tests, re-source the editor's `AnyDomain`, and cut the editor's `nodes.find(...)` scans over to a single repository surface. The repository is a **pure derived snapshot** over the editor's `nodesById` Map-as-SoT — never a second source of truth.

**Tech Stack:** TypeScript 5.9+ strict ESM, Langium 4.2.x, langium-zod (`packages/langium-zod` at `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/`), Zod v4, vitest, pnpm workspaces. `SKIP_SIMPLE_GIT_HOOKS=1` on every commit (NOT `--no-verify`).

---

## Repos & key paths

- **langium-zod repo:** `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/`
  - Emitter: `packages/langium-zod/src/emitters/namespace-ops.ts`
  - Emitter tests: `packages/langium-zod/test/unit/namespace-ops.test.ts`
  - Config type: `packages/langium-zod/src/config.ts` (`ZodGeneratorConfig`, ~line 185)
  - API: `packages/langium-zod/src/api.ts` (`generateNamespaceOpsSchemas`, line 296; call at line 310)
  - CLI: `packages/langium-zod/src/cli.ts` (`--domain-surface-config` parse at line 277–283)
  - Generate driver: `packages/langium-zod/src/generate.ts` (destructure line 248; call line 277–283)
- **rune repo:** `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/` (current branch `feat/phase4-domain-repository`)
  - Config: `packages/core/domain-surface.config.json`
  - Generated: `packages/core/src/generated/domain.ts` (emitted whole by the emitter)
  - Core barrel: `packages/core/src/index.ts` (already `export * from './generated/domain.js'`)
  - Editor union: `packages/visual-editor/src/types.ts` (`DomainNodeData`/`AnyGraphNode`/`RootAstElement`, ~lines 60–95)
  - Editor store: `packages/visual-editor/src/store/editor-store.ts`
  - `makeNodeId`: `packages/visual-editor/src/store/node-projection.ts:24` (`= qualifiedExportPath(ns, name)`)

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `langium-zod/.../src/emitters/namespace-ops.ts` | Modify | Emit `Repository<T>`/`createRepository` + `AnyDomain`/`DomainTypeMap`/`DomainRepository`/`createDomainRepository` |
| `langium-zod/.../test/unit/namespace-ops.test.ts` | Modify | Assert emitted repository source |
| `langium-zod/.../src/config.ts` | Modify | Add `namespaceOpsRepository?: { elementTypes?: string[] }` |
| `langium-zod/.../src/cli.ts` | Modify | Parse `repository` from `--domain-surface-config` JSON |
| `langium-zod/.../src/generate.ts` | Modify | Thread `namespaceOpsRepository` through |
| `langium-zod/.../src/api.ts` | Modify | Pass `repository` into `generateNamespaceOps` |
| `langium-zod/.../.changeset/*.md` | Create | Version bump |
| `rune/.../packages/core/domain-surface.config.json` | Modify | Add `repository.elementTypes` |
| `rune/.../pnpm-workspace.yaml` | Modify | Bump `langium-zod` override |
| `rune/.../packages/core/src/generated/domain.ts` | Regenerate | Repository lands here |
| `rune/.../packages/core/test/generated/domain-repository.test.ts` | Create | Core runtime tests |
| `rune/.../packages/visual-editor/src/types.ts` | Modify | Re-source `DomainNodeData` from core `AnyDomain` |
| `rune/.../packages/visual-editor/src/store/node-repository.ts` | Create | Memoized node-repository selector + `NodeOf<K>` |
| `rune/.../packages/visual-editor/test/store/node-repository.test.ts` | Create | Memoization + lookup tests |
| `rune/.../packages/visual-editor/src/store/editor-store.ts` | Modify | Cut scans over to the repository surface |

---

# Stream A — langium-zod

> All Stream A work is in `/Users/pmouli/GitHub.nosync/active/ts/langium-zod/`. Use a feature branch, e.g. `feat/namespace-ops-repository`.

### Task A1: Thread `repository` config through the pipeline

**Files:**
- Modify: `packages/langium-zod/src/config.ts:185`
- Modify: `packages/langium-zod/src/emitters/namespace-ops.ts:149` (`NamespaceOpsOptions`)
- Modify: `packages/langium-zod/src/api.ts:310`
- Modify: `packages/langium-zod/src/generate.ts:248,282`
- Modify: `packages/langium-zod/src/cli.ts:283`

- [ ] **Step 1: Add the config field**

In `config.ts`, immediately after the `namespaceOpsIdentity?` field (line 185), add:

```ts
  /**
   * Top-level element types included in the generated domain repository
   * (`AnyDomain` union + `DomainTypeMap`). e.g. `{ elementTypes: ['Data', 'Choice'] }`.
   */
  namespaceOpsRepository?: { elementTypes?: string[] };
```

- [ ] **Step 2: Extend `NamespaceOpsOptions`**

In `namespace-ops.ts`, replace the `NamespaceOpsOptions` interface (line 149):

```ts
export interface NamespaceOpsOptions {
  /** element type name → identity field path (e.g. "name", "typeCall.type.$refText"). */
  identity?: Record<string, string>;
  /** top-level element types for the generated domain repository. */
  repository?: { elementTypes?: string[] };
}
```

- [ ] **Step 3: Pass config → emitter in api.ts**

In `api.ts:310`, replace the `generateNamespaceOps` call:

```ts
  const source = generateNamespaceOps(descriptors, {
    identity: config.namespaceOpsIdentity,
    repository: config.namespaceOpsRepository,
  });
```

- [ ] **Step 4: Thread through generate.ts**

In `generate.ts`, add to the destructure near line 248 (alongside `namespaceOpsIdentity: _namespaceOpsIdentity,`):

```ts
    namespaceOpsRepository: _namespaceOpsRepository,
```

and in the `generateNamespaceOpsSchemas({ ... })` call (near line 282), add after `namespaceOpsIdentity: userConfig.namespaceOpsIdentity`:

```ts
      namespaceOpsRepository: userConfig.namespaceOpsRepository
```

- [ ] **Step 5: Parse it from the config JSON in cli.ts**

In `cli.ts:283`, replace the `userConfig` assignment:

```ts
    userConfig = {
      ...userConfig,
      namespaceOpsIdentity: parsed.identity ?? {},
      namespaceOpsRepository: parsed.repository ?? undefined,
    };
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter langium-zod run type-check` (or the repo's type-check script — check `package.json`)
Expected: PASS (no emitter behavior change yet; only plumbing compiles).

- [ ] **Step 7: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/config.ts packages/langium-zod/src/emitters/namespace-ops.ts packages/langium-zod/src/api.ts packages/langium-zod/src/generate.ts packages/langium-zod/src/cli.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(namespace-ops): thread repository.elementTypes config through pipeline"
```

---

### Task A2: Emit the generic `Repository<T>` primitive

**Files:**
- Modify: `packages/langium-zod/test/unit/namespace-ops.test.ts`
- Modify: `packages/langium-zod/src/emitters/namespace-ops.ts`

- [ ] **Step 1: Write the failing test**

Append to `namespace-ops.test.ts` (it already imports `generateNamespaceOps` and defines `dataType`/`attributeType`):

```ts
describe('repository emission', () => {
  it('emits the generic Repository<T> primitive + createRepository with throw-on-dup', () => {
    const source = generateNamespaceOps([dataType, attributeType], {
      repository: { elementTypes: ['Data'] },
    });
    expect(source).toContain('export interface Repository<T> {');
    expect(source).toContain('byId(id: string): T | undefined;');
    expect(source).toContain('byType<K extends string>(type: K): readonly T[];');
    expect(source).toContain('export function createRepository<T>(');
    expect(source).toContain('if (byIdMap.has(k)) throw new DuplicateKeyError(k);');
    expect(source).toContain('export class DuplicateKeyError extends Error {');
  });

  it('emits NOTHING repository-shaped when elementTypes is absent', () => {
    const source = generateNamespaceOps([dataType, attributeType]);
    expect(source).not.toContain('export interface Repository<T>');
    expect(source).not.toContain('createRepository');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter langium-zod test -- namespace-ops`
Expected: FAIL — `source` does not contain `Repository<T>`.

- [ ] **Step 3: Add the emitter function**

In `namespace-ops.ts`, add this function (place it just above `generateNamespaceOps`, after `emitNamespace`):

```ts
/** Emits the grammar-invariant generic repository primitive (interface + runtime). */
function emitRepositoryPrimitive(): string {
  return [
    'export class DuplicateKeyError extends Error {',
    '  constructor(public readonly key: string) {',
    '    super(`Duplicate repository key: ${key}`);',
    "    this.name = 'DuplicateKeyError';",
    '  }',
    '}',
    '',
    'export interface Repository<T> {',
    '  byId(id: string): T | undefined;',
    '  byType<K extends string>(type: K): readonly T[];',
    '  all(): readonly T[];',
    '}',
    '',
    'export function createRepository<T>(',
    '  items: Iterable<T>,',
    '  opts: { key: (t: T) => string; type: (t: T) => string },',
    '): Repository<T> {',
    '  const byIdMap = new Map<string, T>();',
    '  const byTypeMap = new Map<string, T[]>();',
    '  const allItems: T[] = [];',
    '  for (const item of items) {',
    '    const k = opts.key(item);',
    '    if (byIdMap.has(k)) throw new DuplicateKeyError(k);',
    '    byIdMap.set(k, item);',
    '    const t = opts.type(item);',
    '    let bucket = byTypeMap.get(t);',
    '    if (bucket === undefined) {',
    '      bucket = [];',
    '      byTypeMap.set(t, bucket);',
    '    }',
    '    bucket.push(item);',
    '    allItems.push(item);',
    '  }',
    '  return {',
    '    byId: (id) => byIdMap.get(id),',
    '    byType: <K extends string>(type: K) => (byTypeMap.get(type) ?? []) as readonly T[],',
    '    all: () => allItems,',
    '  };',
    '}',
  ].join('\n');
}
```

- [ ] **Step 4: Wire it into `generateNamespaceOps`**

In `generateNamespaceOps`, after the `for (const descriptor of objectTypes)` loop and before `return parts.join('\n') + '\n';`, add:

```ts
  const repositoryElementTypes = options?.repository?.elementTypes ?? [];
  if (repositoryElementTypes.length > 0) {
    parts.push('');
    parts.push(emitRepositoryPrimitive());
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter langium-zod test -- namespace-ops`
Expected: PASS (both new tests; existing tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add packages/langium-zod/src/emitters/namespace-ops.ts packages/langium-zod/test/unit/namespace-ops.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(namespace-ops): emit generic Repository<T> primitive with throw-on-dup"
```

---

### Task A3: Emit `AnyDomain` + `DomainTypeMap` + `DomainRepository` + `createDomainRepository`

**Files:**
- Modify: `packages/langium-zod/test/unit/namespace-ops.test.ts`
- Modify: `packages/langium-zod/src/emitters/namespace-ops.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('repository emission', …)` block:

```ts
  it('emits AnyDomain union, DomainTypeMap, and createDomainRepository from elementTypes', () => {
    const source = generateNamespaceOps([dataType, attributeType], {
      repository: { elementTypes: ['Data', 'RosettaFunction'] },
    });
    expect(source).toContain('export type AnyDomain =');
    expect(source).toContain('| Dehydrated<ast.Data>');
    expect(source).toContain('| Dehydrated<ast.RosettaFunction>');
    expect(source).toContain('export interface DomainTypeMap {');
    expect(source).toContain('Data: Dehydrated<ast.Data>;');
    expect(source).toContain('RosettaFunction: Dehydrated<ast.RosettaFunction>;');
    expect(source).toContain('export interface DomainRepository {');
    expect(source).toContain('byType<K extends keyof DomainTypeMap>(type: K): readonly DomainTypeMap[K][];');
    expect(source).toContain('export function createDomainRepository(');
    expect(source).toContain('type: (e) => e.$type');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter langium-zod test -- namespace-ops`
Expected: FAIL — no `AnyDomain`.

- [ ] **Step 3: Add the emitter function**

In `namespace-ops.ts`, below `emitRepositoryPrimitive`, add:

```ts
/** Emits the domain-typed repository surface from the configured element types. */
function emitDomainRepository(elementTypes: string[]): string {
  const union = elementTypes.map((t) => `  | Dehydrated<ast.${t}>`).join('\n');
  const mapEntries = elementTypes.map((t) => `  ${t}: Dehydrated<ast.${t}>;`).join('\n');
  return [
    'export type AnyDomain =',
    `${union};`,
    '',
    'export interface DomainTypeMap {',
    mapEntries,
    '}',
    '',
    'export interface DomainRepository {',
    '  byId(qn: string): AnyDomain | undefined;',
    '  byType<K extends keyof DomainTypeMap>(type: K): readonly DomainTypeMap[K][];',
    '  all(): readonly AnyDomain[];',
    '}',
    '',
    'export function createDomainRepository(',
    '  elements: Iterable<AnyDomain>,',
    '  key: (e: AnyDomain) => string = (e) => (e.$namespace ? `${e.$namespace}.${e.name}` : e.name),',
    '): DomainRepository {',
    '  return createRepository(elements, { key, type: (e) => e.$type }) as DomainRepository;',
    '}',
  ].join('\n');
}
```

- [ ] **Step 4: Wire it in**

In `generateNamespaceOps`, extend the repository block from Task A2 Step 4:

```ts
  const repositoryElementTypes = options?.repository?.elementTypes ?? [];
  if (repositoryElementTypes.length > 0) {
    parts.push('');
    parts.push(emitRepositoryPrimitive());
    parts.push('');
    parts.push(emitDomainRepository(repositoryElementTypes));
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter langium-zod test -- namespace-ops`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/langium-zod/src/emitters/namespace-ops.ts packages/langium-zod/test/unit/namespace-ops.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(namespace-ops): emit AnyDomain + DomainTypeMap + createDomainRepository"
```

---

### Task A4: Changeset, build, publish prep

**Files:**
- Create: `packages/langium-zod/../.changeset/phase4-domain-repository.md` (repo-root `.changeset/`)

- [ ] **Step 1: Full langium-zod test + type-check**

Run: `pnpm --filter langium-zod test && pnpm --filter langium-zod run type-check`
Expected: PASS (all suites green).

- [ ] **Step 2: Add a changeset**

Create `.changeset/phase4-domain-repository.md` at the langium-zod repo root:

```markdown
---
'langium-zod': minor
---

namespace-ops: emit a generated typed domain repository — generic `Repository<T>` + `createRepository` (throws `DuplicateKeyError` on duplicate key), plus `AnyDomain` union, `DomainTypeMap`, `DomainRepository`, and `createDomainRepository`, driven by a new `repository.elementTypes` list in the domain-surface config.
```

- [ ] **Step 3: Commit + open PR**

```bash
git add .changeset/phase4-domain-repository.md
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "chore: changeset for namespace-ops domain repository"
git push -u origin feat/namespace-ops-repository
gh pr create --fill
```

- [ ] **Step 4: Merge + publish**

After PR merge, the changeset release workflow publishes a new `langium-zod` minor (record the exact version — call it `<NEW_VERSION>` for Stream B). If the repo publishes manually, run its release script. **Do not proceed to Stream B Task B1 until `<NEW_VERSION>` is on npm.**

---

# Stream B — rune

> All Stream B work is in `/Users/pmouli/GitHub.nosync/active/ts/rune-langium/` on branch `feat/phase4-domain-repository`. **Blocked on Stream A `<NEW_VERSION>` being published.**

### Task B1: Bump override, add config, regenerate `domain.ts`

**Files:**
- Modify: `packages/core/domain-surface.config.json`
- Modify: `pnpm-workspace.yaml` (langium-zod override)
- Regenerate: `packages/core/src/generated/domain.ts`

- [ ] **Step 1: Add `repository.elementTypes` to the config**

Replace `packages/core/domain-surface.config.json` with:

```json
{
  "identity": {
    "Attribute": "name",
    "RosettaEnumValue": "name",
    "ChoiceOption": "typeCall.type.$refText"
  },
  "repository": {
    "elementTypes": [
      "Data",
      "Choice",
      "RosettaEnumeration",
      "RosettaFunction",
      "RosettaRecordType",
      "RosettaTypeAlias",
      "RosettaBasicType",
      "Annotation"
    ]
  }
}
```

> The 8 types mirror the editor's existing `DomainNodeData`/`RootAstElement` union in `packages/visual-editor/src/types.ts`.

- [ ] **Step 2: Bump the langium-zod override**

In `pnpm-workspace.yaml`, set the `langium-zod` override to `<NEW_VERSION>` (see [[project_langium_zod_domain_target]] / memory `project_pnpm_overrides_location`: overrides live in `pnpm-workspace.yaml`, NOT `package.json`). If the fresh-publish `minimumReleaseAge` gate blocks install, add `<NEW_VERSION>` to `minimumReleaseAgeExclude` for the install, then drop it.

Run: `pnpm install`
Expected: lockfile updates to `<NEW_VERSION>`; no `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.

- [ ] **Step 3: Regenerate**

Run: `pnpm --filter @rune-langium/core run generate:domain`
Expected: `packages/core/src/generated/domain.ts` regenerates and now ends with the `Repository<T>`/`createRepository`/`AnyDomain`/`DomainTypeMap`/`DomainRepository`/`createDomainRepository` block (oxfmt-normalized).

- [ ] **Step 4: Verify generation is deterministic + type-checks**

Run: `pnpm --filter @rune-langium/core run generate:domain && git diff --exit-code packages/core/src/generated/domain.ts`
Expected: exit 0 (re-running produces no diff — the `check-generated` invariant).

Run: `pnpm --filter @rune-langium/core run type-check`
Expected: PASS — the generated repository compiles against `Dehydrated` and `ast.*`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/core/domain-surface.config.json pnpm-workspace.yaml pnpm-lock.yaml packages/core/src/generated/domain.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(core): regenerate domain.ts with generated domain repository (langium-zod <NEW_VERSION>)"
```

---

### Task B2: Core runtime tests for the repository

**Files:**
- Create: `packages/core/test/generated/domain-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/generated/domain-repository.test.ts`:

```ts
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  createRepository,
  createDomainRepository,
  DuplicateKeyError,
  type AnyDomain,
} from '@rune-langium/core';

// Minimal AnyDomain-shaped fixtures ($type + name + $namespace are all that the repo reads).
const data = (ns: string, name: string) =>
  ({ $type: 'Data', $namespace: ns, name, attributes: [] }) as unknown as AnyDomain;
const enumEl = (ns: string, name: string) =>
  ({ $type: 'RosettaEnumeration', $namespace: ns, name, enumValues: [] }) as unknown as AnyDomain;

describe('createRepository', () => {
  it('byId returns the element for an exact key, undefined otherwise', () => {
    const repo = createRepository([data('a', 'Foo')], { key: (e) => `${e.$namespace}.${e.name}`, type: (e) => e.$type });
    expect(repo.byId('a.Foo')?.name).toBe('Foo');
    expect(repo.byId('a.Bar')).toBeUndefined();
  });

  it('byType buckets by the type selector and preserves insertion order', () => {
    const repo = createRepository([data('a', 'Foo'), enumEl('a', 'E'), data('a', 'Bar')], {
      key: (e) => `${e.$namespace}.${e.name}`,
      type: (e) => e.$type,
    });
    expect(repo.byType('Data').map((e) => e.name)).toEqual(['Foo', 'Bar']);
    expect(repo.byType('RosettaEnumeration').map((e) => e.name)).toEqual(['E']);
    expect(repo.byType('Nope')).toEqual([]);
  });

  it('all() returns every item in insertion order', () => {
    const repo = createRepository([data('a', 'Foo'), data('a', 'Bar')], { key: (e) => e.name, type: (e) => e.$type });
    expect(repo.all().map((e) => e.name)).toEqual(['Foo', 'Bar']);
  });

  it('throws DuplicateKeyError on a duplicate key', () => {
    expect(() =>
      createRepository([data('a', 'Foo'), data('a', 'Foo')], { key: (e) => `${e.$namespace}.${e.name}`, type: (e) => e.$type }),
    ).toThrow(DuplicateKeyError);
  });

  it('handles an empty collection', () => {
    const repo = createRepository<AnyDomain>([], { key: (e) => e.name, type: (e) => e.$type });
    expect(repo.all()).toEqual([]);
    expect(repo.byId('x')).toBeUndefined();
    expect(repo.byType('Data')).toEqual([]);
  });
});

describe('createDomainRepository', () => {
  it('keys by qualified name by default', () => {
    const repo = createDomainRepository([data('com.foo', 'Money')]);
    expect(repo.byId('com.foo.Money')?.name).toBe('Money');
  });

  it('falls back to the bare name when $namespace is absent', () => {
    const bare = { $type: 'Data', name: 'Loose', attributes: [] } as unknown as AnyDomain;
    const repo = createDomainRepository([bare]);
    expect(repo.byId('Loose')?.name).toBe('Loose');
  });

  it('byType returns the typed bucket', () => {
    const repo = createDomainRepository([data('a', 'Foo'), enumEl('a', 'E')]);
    expect(repo.byType('Data').map((e) => e.name)).toEqual(['Foo']);
  });
});
```

- [ ] **Step 2: Run to verify it fails (then passes)**

Run: `pnpm --filter @rune-langium/core test -- domain-repository`
Expected: PASS if Task B1 generated correctly (these test the generated runtime). If a symbol is missing, fix the emitter (Stream A) — the generated code is the implementation.

- [ ] **Step 3: Add a type-level assertion**

Append to the test file:

```ts
import { expectTypeOf } from 'vitest';
import type { Dehydrated, Data as DataT } from '@rune-langium/core';

it('byType is type-safe via DomainTypeMap', () => {
  const repo = createDomainRepository([]);
  expectTypeOf(repo.byType('Data')).toEqualTypeOf<readonly Dehydrated<DataT>[]>();
});
```

> `Data` is re-exported from core as `type Data = ast.Data` (the single-barrel form). Import it aliased as `DataT` to avoid colliding with the local `data` fixture factory.

- [ ] **Step 4: Run full core suite**

Run: `pnpm --filter @rune-langium/core test && pnpm --filter @rune-langium/core run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/generated/domain-repository.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test(core): runtime + type tests for generated domain repository"
```

---

### Task B3: Re-source the editor's `AnyDomain` from core (DRY)

**Files:**
- Modify: `packages/visual-editor/src/types.ts` (lines ~60–95)

- [ ] **Step 1: Verify the unions match**

Confirm `packages/core/src/generated/domain.ts`'s `AnyDomain` lists exactly the same 8 `Dehydrated<ast.*>` arms as the editor's `DomainNodeData` (Data, Choice, RosettaEnumeration, RosettaFunction, RosettaRecordType, RosettaTypeAlias, RosettaBasicType, Annotation). They do by construction (the config list = the editor union).

- [ ] **Step 2: Replace the hand-maintained union**

In `packages/visual-editor/src/types.ts`, change the import to bring in `AnyDomain` from core, and redefine `DomainNodeData` as an alias:

```ts
import type { AnyDomain } from '@rune-langium/core';

// Domain payload of an editor graph node — sourced from the generated core
// `AnyDomain` union (single source of truth; no hand-maintained arm list).
export type DomainNodeData = AnyDomain;

/** @deprecated use {@link DomainNodeData}. */
export type AnyGraphNode = DomainNodeData;
```

Leave `RootAstElement` (the non-`Dehydrated` AST union) unchanged — it is a different type used elsewhere.

- [ ] **Step 3: Type-check all packages**

Run: `pnpm run type-check`
Expected: PASS across core, visual-editor, studio, lsp-server, cli. If a consumer relied on `DomainNodeData` being structurally distinct from `AnyDomain`, fix at that site (they are identical unions, so this should be clean).

- [ ] **Step 4: Run the visual-editor suite**

Run: `pnpm --filter @rune-langium/visual-editor test`
Expected: PASS (no behavior change — type-only re-source).

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/types.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(visual-editor): source DomainNodeData from core AnyDomain (DRY)"
```

---

### Task B4: Add the memoized node-repository selector

**Files:**
- Create: `packages/visual-editor/src/store/node-repository.ts`
- Create: `packages/visual-editor/test/store/node-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/visual-editor/test/store/node-repository.test.ts`:

```ts
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { selectNodeRepository } from '../../src/store/node-repository.js';
import type { TypeGraphNode } from '../../src/types.js';

const node = (id: string, $type: string, name: string): TypeGraphNode =>
  ({
    id,
    type: 'data',
    position: { x: 0, y: 0 },
    data: { $type, name, attributes: [] } as TypeGraphNode['data'],
    meta: { namespace: 'a', errors: [], hasExternalRefs: false },
  }) as TypeGraphNode;

describe('selectNodeRepository', () => {
  it('byId returns the node (id = qualified name)', () => {
    const map = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    const repo = selectNodeRepository(map);
    expect(repo.byId('a.Foo')?.id).toBe('a.Foo');
    expect(repo.byId('a.Bar')).toBeUndefined();
  });

  it('byType buckets nodes by data.$type', () => {
    const map = new Map([
      ['a.Foo', node('a.Foo', 'Data', 'Foo')],
      ['a.E', node('a.E', 'RosettaEnumeration', 'E')],
    ]);
    const repo = selectNodeRepository(map);
    expect(repo.byType('Data').map((n) => n.id)).toEqual(['a.Foo']);
  });

  it('returns the SAME repository instance for the same Map reference (memoized)', () => {
    const map = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    expect(selectNodeRepository(map)).toBe(selectNodeRepository(map));
  });

  it('rebuilds when the Map reference changes', () => {
    const a = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    const b = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    expect(selectNodeRepository(a)).not.toBe(selectNodeRepository(b));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-repository`
Expected: FAIL — `Cannot find module '../../src/store/node-repository.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/visual-editor/src/store/node-repository.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRepository, type Repository } from '@rune-langium/core';
import type { Node } from '@xyflow/react';
import type { DomainTypeMap } from '@rune-langium/core';
import type { GraphNodeMeta, TypeGraphNode } from '../types.js';

/** A graph node whose domain payload is narrowed to the `$type` named by `K`. */
export type NodeOf<K extends keyof DomainTypeMap> = Node<DomainTypeMap[K]> & { meta: GraphNodeMeta };

/**
 * Typed, read-only lookup surface over the editor's nodes. Built as a PURE
 * derived snapshot from the `nodesById` Map-as-SoT — never a second source of
 * truth. `byId` keys on `node.id` (= `makeNodeId(ns, name)` = qualified name).
 */
export interface NodeRepository extends Repository<TypeGraphNode> {
  byType<K extends keyof DomainTypeMap>(type: K): readonly NodeOf<K>[];
}

let cacheKey: ReadonlyMap<string, TypeGraphNode> | null = null;
let cacheValue: NodeRepository | null = null;

/**
 * Returns a node repository derived from `nodesById`, memoized on the Map's
 * identity. The store swaps the Map reference on every `mutateGraph`, so a new
 * reference (post-reconciliation) yields a fresh repository; an unchanged
 * reference returns the cached instance.
 */
export function selectNodeRepository(nodesById: ReadonlyMap<string, TypeGraphNode>): NodeRepository {
  if (nodesById === cacheKey && cacheValue !== null) return cacheValue;
  const repo = createRepository(nodesById.values(), {
    key: (n) => n.id,
    type: (n) => n.data.$type,
  }) as NodeRepository;
  cacheKey = nodesById;
  cacheValue = repo;
  return repo;
}
```

> `createRepository` throws `DuplicateKeyError` on a duplicate `node.id`. The store builds the repository only from a reconciled `nodesById` (`nodeIdSet` in `ast-to-model.ts` already dedupes by node id), so duplicates cannot reach it — see Task B5 Step 1.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/store/node-repository.ts packages/visual-editor/test/store/node-repository.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(visual-editor): memoized node-repository selector over nodesById"
```

---

### Task B5: Cut editor-store lookups over to the repository

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (lines 1324, 1386, 1411, 1477, 1594, 1767, 1880)

> **Read-before-edit:** open each site and confirm the surrounding `get()`/`state`/`current` binding name before editing — they differ per action (`get()`, `const current = get()`, `const { nodes } = get()`).

- [ ] **Step 1: Confirm the no-transient-duplicate invariant**

Read `packages/visual-editor/src/adapters/ast-to-model.ts:185–201` and confirm `nodeIdSet` skips duplicate `makeNodeId` results (`if (nodeIdSet.has(nodeId)) continue;`). This guarantees `nodesById` never holds two nodes with the same qualified id, so `selectNodeRepository` cannot throw `DuplicateKeyError` in normal operation. No code change — this step is a verification gate. If the invariant does not hold, STOP and reconcile before proceeding.

- [ ] **Step 2: Add a `qualify` import**

At the top of `editor-store.ts`, ensure `makeNodeId` is imported from `./node-projection.js` (it likely already is — verify; if not, add it) and add:

```ts
import { selectNodeRepository } from './node-repository.js';
```

- [ ] **Step 3: Cut over the node-id scans (`:1386`, `:1411`, `:1477`)**

These three `nodes.find((n) => n.id === <id>)` calls become `nodesById.get(<id>)` — the Map is already on state. Replace each:

```ts
// :1386  updateAttributeType — `const current = get();`
const node = current.nodesById.get(nodeId);
```
```ts
// :1411  (same action) — target lookup
const target = current.nodesById.get(targetTypeId);
```
```ts
// :1477  renameAttribute — `const current = get();`
const node = current.nodesById.get(nodeId);
```

- [ ] **Step 4: Cut over the name scans (`:1324`, `:1594`, `:1767`, `:1880`)**

These `nodes.find((n) => n.data.name === typeName)?.id` calls resolve a target node id by **bare** name. Replace each with a qualified `nodesById` lookup using the **source node's namespace**, falling back to the existing scan only if the namespace is unavailable. For the canonical case (source namespace `ns` in scope as `node.meta.namespace`):

```ts
// Pattern — replace `get().nodes.find((n) => n.data.name === typeName)?.id`:
const targetId = get().nodesById.has(makeNodeId(ns, typeName))
  ? makeNodeId(ns, typeName)
  : undefined;
```

Per-site `ns` source:
- `:1324` (`addAttribute`-style): use the editing node's `meta.namespace` (the node being mutated, already in scope as `node`/`current.nodesById.get(nodeId)`); read `const ns = node.meta.namespace;` first.
- `:1594` (`renameAttribute`): `const ns = node.meta.namespace;` (node already resolved at :1477 cutover).
- `:1767`: the action resolves `targetId` before the recipe; read the source node first — `const ns = get().nodesById.get(nodeId)?.meta.namespace;` then guard `ns ? makeNodeId(ns, typeName) : undefined`.
- `:1880`: keep the existing `targetNode?.id ??` fallback; replace only the trailing scan: `targetNode?.id ?? (ns ? (nodesById.has(makeNodeId(ns, typeName)) ? makeNodeId(ns, typeName) : undefined) : undefined)` where `ns` is the source node's namespace in scope.

> **Scope note (from the spec):** this qualifies bare names within the **source namespace** only. A bare ref that resolves cross-namespace via imports is a pre-existing ambiguity the old linear scan also mishandled; it is out of scope and not regressed. When `typeName` is already qualified (contains a `.` that matches a node id), `nodesById.has(typeName)` short-circuits — add `nodesById.has(typeName) ? typeName : <qualified-lookup>` if any site passes pre-qualified names (grep the call sites of these actions to confirm).

- [ ] **Step 5: (Optional) expose `byType` via the repository for future consumers**

No current caller needs `byType`; do **not** add speculative call sites (YAGNI). The repository is available via `selectNodeRepository(get().nodesById)` when a consumer arrives. This step is a no-op placeholder to document the decision — leave it unchecked-then-checked with no code change.

- [ ] **Step 6: Run the full visual-editor suite**

Run: `pnpm --filter @rune-langium/visual-editor test`
Expected: PASS — in particular `editor-store-actions`, `editor-store-identity-ops`, ref-cascade/rename, `map-substrate`, `undo-maps`, `update-graph-view`, `load-models-one-shot`, `degraded-reparse-guard`.

- [ ] **Step 7: Round-trip determinism check**

Run the conformance/round-trip suites: `pnpm --filter @rune-langium/visual-editor test -- roundtrip`
Expected: PASS — parse → load → serialize → reparse byte-stable; the lookup change is resolution-only and must not alter emitted edges/AST.

- [ ] **Step 8: Commit**

```bash
git add packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(visual-editor): route node lookups through nodesById/node-repository"
```

---

### Task B6: Final gates + holistic review

**Files:** none (verification + review)

- [ ] **Step 1: All five package type-checks**

Run: `pnpm run type-check`
Expected: PASS — core, visual-editor, studio, lsp-server, cli.

- [ ] **Step 2: Lint**

Run: `pnpm run lint`
Expected: PASS.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Holistic seam review**

Request an Opus review over the three interacting invariants: (a) build-ordering — the repo is only built from a reconciled `nodesById` (no transient duplicates → no `DuplicateKeyError`); (b) memoization — `selectNodeRepository` returns a fresh instance exactly when the Map reference changes; (c) name-scan qualification — same-namespace only, cross-namespace ambiguity neither fixed nor regressed. Confirm the round-trip is byte-stable.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/phase4-domain-repository
gh pr create --fill
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- §1 two-stream architecture → Stream A (A1–A4) + Stream B (B1–B6). ✅
- §2.1 generic `Repository<T>` + `createRepository` (throw-on-dup) → A2 + B2. ✅
- §2.2 `AnyDomain` + `DomainTypeMap` from **config-driven `repository.elementTypes`** → A1 (config), A3 (emit), B1 (config value). ✅
- §2.3 `DomainRepository` + `createDomainRepository` (default qualified key, `$namespace` fallback) → A3 + B2. ✅
- §3 one editor lookup surface; node-id→`nodesById.get`, name→qualified `nodesById`/repo, `AnyGraphNode`→`AnyDomain`, `NodeOf<K>` editor-side → B3, B4, B5. ✅
- §4 pure-snapshot, memoized, built post-reconciliation → B4 (memoization) + B5 Step 1 (build-ordering gate). ✅
- §5 throw-on-dup + bare-collision-impossible + `$namespace` fallback + curated nodes + empty → B2 tests. ✅
- §6 verification gates (langium-zod unit + type-level; core runtime + tsd; VE suites + round-trip; 5 type-checks; check-generated) → A2/A3, B2, B5, B6. ✅
- §7 sequencing → Stream A blocks B1; B-order B1→B6. ✅

**2. Placeholder scan:** `<NEW_VERSION>` is an intentional handoff token (the published version from A4), defined at first use and referenced consistently — not a TODO. No other placeholders.

**3. Type consistency:** `Repository<T>`, `createRepository(items, {key, type})`, `DuplicateKeyError`, `AnyDomain`, `DomainTypeMap`, `DomainRepository`, `createDomainRepository(elements, key?)`, `NodeRepository`, `NodeOf<K>`, `selectNodeRepository(nodesById)` are named identically across every task that references them. `byId`/`byType`/`all` signatures match between the generic interface (A2) and the domain specialization (A3) and the tests (B2/B4).
