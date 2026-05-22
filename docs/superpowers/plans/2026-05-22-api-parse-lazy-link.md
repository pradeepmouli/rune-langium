# `/api/parse` Lazy/Partial Curated Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/api/parse` from 503-ing (CF error 1102 = Pages Function CPU limit) on curated-bundle requests by deserializing+linking+dep-graphing only the curated namespaces the user's files transitively reference, instead of the whole corpus.

**Architecture:** A pure, Langium-free helper computes the user's referenced-namespace transitive closure by reading `name` + `imports` straight from each curated doc's serialized-model JSON (no link). `parse.ts` then restricts the deserialize+link+dep-graph in `populateDependencyGraph` to that closure, while still passing **all** curated serialized strings + `deferredExports` through to the response unchanged.

**Tech Stack:** TypeScript ESM, Cloudflare Pages Functions, Langium (lazy-imported), `@rune-langium/core` (`collectNamespaceDependencies`/`closeNamespaceDependencies`), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-22-api-parse-lazy-link-design.md`

**Conventions:** New files under `apps/studio/functions/` use the FSL header: `// SPDX-License-Identifier: FSL-1.1-ALv2` then `// Copyright (c) 2026 Pradeep Mouli`. ESM `.js` import extensions. Functions tests are `apps/studio/functions/test/**/*.test.ts`, run with `vitest run`. Commit per task; prefix with `SKIP_SIMPLE_GIT_HOOKS=1`; no `--no-verify`.

**Branch:** `fix/api-parse-lazy-link` (already created off origin/master).

---

## Task 0 (read-only): confirm the deserialize+link seam

No code. Read `apps/studio/functions/api/parse.ts:482-541` (`populateDependencyGraph`) and `:160-225` (the handler's curated loop + the `populateDependencyGraph` call site). Confirm:
- Curated entries are deserialized at `:515` (`JsonSerializer.deserialize`) and linked at `:527` (`builder.build([...userDocs, ...curatedDocs])`) — this is the CPU hotspot; the closure filter goes in the `:512-522` loop.
- `documentsForHydration` (the response payload) is assembled separately (handler `:189`) and must keep receiving **all** curated docs.
- Curated entries carry `bundleId` (set at `:189`) and `serializedModel`; they do NOT carry a `namespace` field — so the closure filter must read the namespace from `serializedModel` cheaply.

(This task is just verification; no commit.)

---

## Task 1: `serialized-model-meta.ts` + `computeCuratedClosure` (pure, no Langium)

**Files:**
- Create: `apps/studio/functions/lib/serialized-model-meta.ts`
- Create: `apps/studio/functions/lib/curated-closure.ts`
- Test: `apps/studio/functions/test/curated-closure.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readSerializedModelMeta } from '../lib/serialized-model-meta.js';
import { computeCuratedClosure } from '../lib/curated-closure.js';

function doc(namespace: string, imports: string[]): { namespace: string; serializedModel: string } {
  return {
    namespace,
    serializedModel: JSON.stringify({
      $type: 'RosettaModel',
      name: namespace,
      imports: imports.map((n) => ({ $type: 'Import', importedNamespace: n })),
      elements: []
    })
  };
}

describe('readSerializedModelMeta', () => {
  it('reads namespace (string name) + imports', () => {
    const meta = readSerializedModelMeta(doc('cdm.base.datetime', ['cdm.base.math']).serializedModel);
    expect(meta).toEqual({ namespace: 'cdm.base.datetime', imports: ['cdm.base.math'] });
  });

  it('joins a segmented name and tolerates missing imports', () => {
    const raw = JSON.stringify({ $type: 'RosettaModel', name: { segments: ['cdm', 'base'] } });
    expect(readSerializedModelMeta(raw)).toEqual({ namespace: 'cdm.base', imports: [] });
  });

  it('returns null on malformed JSON (never throws)', () => {
    expect(readSerializedModelMeta('{ not json')).toBeNull();
  });
});

describe('computeCuratedClosure', () => {
  const docs = [
    doc('cdm.trade', ['cdm.base.datetime']),
    doc('cdm.base.datetime', ['cdm.base.math']),
    doc('cdm.base.math', []),
    doc('cdm.unrelated', [])
  ];

  it('closes transitively from the seed; excludes unreferenced namespaces', () => {
    const closure = computeCuratedClosure(['cdm.trade'], docs);
    expect([...closure].sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
    expect(closure.has('cdm.unrelated')).toBe(false);
  });

  it('expands a wildcard import to all namespaces under the prefix', () => {
    const wdocs = [doc('app', ['cdm.base.*']), doc('cdm.base.datetime', []), doc('cdm.base.math', []), doc('other', [])];
    const closure = computeCuratedClosure(['app'], wdocs);
    expect(closure.has('cdm.base.datetime')).toBe(true);
    expect(closure.has('cdm.base.math')).toBe(true);
    expect(closure.has('other')).toBe(false);
  });

  it('is cycle-safe', () => {
    const cyc = [doc('a', ['b']), doc('b', ['a'])];
    expect([...computeCuratedClosure(['a'], cyc)].sort()).toEqual(['a', 'b']);
  });

  it('ignores seeds that are not curated namespaces and returns only curated ones', () => {
    const closure = computeCuratedClosure(['user.ns'], docs); // user.ns not in docs
    expect(closure.size).toBe(0);
  });

  it('empty seeds → empty closure', () => {
    expect(computeCuratedClosure([], docs).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- curated-closure`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `apps/studio/functions/lib/serialized-model-meta.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cheap reader for a serialized Langium RosettaModel's namespace + import
 * declarations — JSON only, NO Langium deserialize/link. Used to compute the
 * curated dependency closure without paying the link cost.
 *
 * Serialized shape (see packages/core/src/serializer/rosetta-serializer.ts):
 *   { $type:'RosettaModel', name: string | { segments: string[] },
 *     imports?: Array<{ importedNamespace?: string }> }
 * `importedNamespace` is a QualifiedNameWithWildcard, e.g. `cdm.base.datetime`
 * or `cdm.base.*`.
 */
export interface SerializedModelMeta {
  namespace: string;
  imports: string[]; // raw importedNamespace strings (may end with '.*')
}

function nameToNamespace(name: unknown): string | undefined {
  if (typeof name === 'string') return name.replace(/^"|"$/g, '');
  if (name && typeof name === 'object' && 'segments' in (name as object)) {
    const segs = (name as { segments?: unknown }).segments;
    if (Array.isArray(segs)) return segs.join('.');
  }
  return undefined;
}

/** Parse + read namespace/imports. Returns null on malformed JSON or no name. */
export function readSerializedModelMeta(serializedModel: string): SerializedModelMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedModel);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const m = parsed as { name?: unknown; imports?: unknown };
  const namespace = nameToNamespace(m.name);
  if (!namespace) return null;
  const imports: string[] = [];
  if (Array.isArray(m.imports)) {
    for (const imp of m.imports) {
      const ns = (imp as { importedNamespace?: unknown })?.importedNamespace;
      if (typeof ns === 'string' && ns.length > 0) imports.push(ns);
    }
  }
  return { namespace, imports };
}
```

- [ ] **Step 4: Implement `apps/studio/functions/lib/curated-closure.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readSerializedModelMeta } from './serialized-model-meta.js';

export interface ClosureDoc {
  /** Cheap to supply if the caller already knows it; else derived from serializedModel. */
  namespace?: string;
  serializedModel: string;
}

/**
 * Transitive closure of `seedNamespaces` over the curated docs' import graph,
 * read from serialized JSON (no Langium link). Wildcard imports (`a.b.*`)
 * expand to every curated namespace `== a.b` or starting `a.b.`. Cycle-safe.
 * Returns ONLY curated namespaces (seeds not present in `curatedDocs` are not
 * included in the result).
 */
export function computeCuratedClosure(
  seedNamespaces: Iterable<string>,
  curatedDocs: ReadonlyArray<ClosureDoc>
): Set<string> {
  // Build namespace -> raw import strings, and the set of all curated namespaces.
  const nsImports = new Map<string, string[]>();
  const allNs = new Set<string>();
  for (const d of curatedDocs) {
    const meta = d.namespace !== undefined ? { namespace: d.namespace, imports: readImports(d) } : readSerializedModelMeta(d.serializedModel);
    if (!meta) continue;
    allNs.add(meta.namespace);
    nsImports.set(meta.namespace, meta.imports);
  }

  const expand = (raw: string): string[] => {
    if (raw.endsWith('.*')) {
      const prefix = raw.slice(0, -2);
      return [...allNs].filter((ns) => ns === prefix || ns.startsWith(prefix + '.'));
    }
    return allNs.has(raw) ? [raw] : [];
  };

  const visited = new Set<string>();
  const queue: string[] = [...seedNamespaces];
  while (queue.length > 0) {
    const ns = queue.shift()!;
    // Only curated namespaces enter the result + get expanded.
    if (!allNs.has(ns) || visited.has(ns)) continue;
    visited.add(ns);
    for (const raw of nsImports.get(ns) ?? []) {
      for (const target of expand(raw)) {
        if (!visited.has(target)) queue.push(target);
      }
    }
  }
  return visited;
}

function readImports(d: ClosureDoc): string[] {
  const meta = readSerializedModelMeta(d.serializedModel);
  return meta?.imports ?? [];
}
```

> Note: seeds (user-file imports) may name curated namespaces directly; if a seed isn't a curated namespace it's skipped (the BFS guard `allNs.has(ns)`). Wildcard seeds aren't expected (user imports are concrete), but if one appears it simply won't match `allNs` and is skipped — acceptable.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio test -- curated-closure`
Expected: all pass.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/functions/lib/serialized-model-meta.ts apps/studio/functions/lib/curated-closure.ts apps/studio/functions/test/curated-closure.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(api/parse): curated closure helper (serialized-import based, no langium link)"
```

---

## Task 2: seed extraction — user files' imported namespaces

**Files:**
- Modify: `apps/studio/functions/api/parse.ts` (add a small helper; no behavior change yet)
- Test: `apps/studio/functions/test/user-seeds.test.ts`

User docs are parsed into `workspaceContext.userDocs` (LangiumDocuments, `parseResult.value` = RosettaModel). Reading `model.imports[].importedNamespace` from a PARSED model needs no linking. Add a helper that collects the seed namespaces from the user docs.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { collectUserSeedNamespaces } from '../api/parse.js';

describe('collectUserSeedNamespaces', () => {
  it('collects importedNamespace from parsed user models', () => {
    const userDocs = [
      { parseResult: { value: { $type: 'RosettaModel', name: 'app', imports: [
        { importedNamespace: 'cdm.trade' }, { importedNamespace: 'cdm.base.*' }
      ] } } }
    ] as never;
    expect([...collectUserSeedNamespaces(userDocs)].sort()).toEqual(['cdm.base.*', 'cdm.trade']);
  });

  it('returns empty for docs with no imports', () => {
    const userDocs = [{ parseResult: { value: { $type: 'RosettaModel', name: 'app' } } }] as never;
    expect(collectUserSeedNamespaces(userDocs).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- user-seeds`
Expected: FAIL — `collectUserSeedNamespaces` not exported.

- [ ] **Step 3: Add + export the helper in `parse.ts`** (near `populateDependencyGraph`):

```ts
/**
 * Seed namespaces for the curated closure = the namespaces the user files
 * import. Read from the already-parsed user models (no link needed).
 * Exported for unit testing.
 */
export function collectUserSeedNamespaces(
  userDocs: ReadonlyArray<{ parseResult?: { value?: unknown } }>
): Set<string> {
  const seeds = new Set<string>();
  for (const doc of userDocs) {
    const model = doc.parseResult?.value as { imports?: Array<{ importedNamespace?: unknown }> } | undefined;
    if (!model || !Array.isArray(model.imports)) continue;
    for (const imp of model.imports) {
      if (typeof imp.importedNamespace === 'string' && imp.importedNamespace.length > 0) {
        seeds.add(imp.importedNamespace);
      }
    }
  }
  return seeds;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- user-seeds`
Expected: pass.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/functions/api/parse.ts apps/studio/functions/test/user-seeds.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(api/parse): collectUserSeedNamespaces (user import seeds for closure)"
```

---

## Task 3: restrict deserialize+link+dep-graph to the closure

**Files:**
- Modify: `apps/studio/functions/api/parse.ts` (`populateDependencyGraph` signature + loop; the handler call site)

- [ ] **Step 1: Add a `closureNamespaces` parameter to `populateDependencyGraph`** and use it to skip non-closure curated entries BEFORE deserializing. Replace the curated loop (currently `:512-522`):

```ts
async function populateDependencyGraph(
  documentsForHydration: ReadonlyArray<{ uri: string; serializedModel: string; bundleId?: string }>,
  workspaceContext: WorkspaceContext | undefined,
  dependencyGraph: Record<string, string[]>,
  closureNamespaces: ReadonlySet<string>   // NEW
): Promise<void> {
  // ... unchanged setup (try, context, factory, builder) ...

    const curatedDocs: LangiumDocument[] = [];
    for (const entry of documentsForHydration) {
      if (entry.bundleId === undefined) continue;
      // Lazy-link: only deserialize+link curated docs in the user's reference
      // closure. Reading the namespace from the serialized JSON is cheap
      // (no Langium deserialize) — skip out-of-closure docs before paying the
      // deserialize+link cost that was tripping CF's CPU limit (error 1102).
      const meta = readSerializedModelMeta(entry.serializedModel);
      if (!meta || !closureNamespaces.has(meta.namespace)) continue;
      try {
        const model = context.RuneDsl.serializer.JsonSerializer.deserialize(entry.serializedModel) as RosettaModel;
        const doc = factory.fromModel(model, URI.parse(entry.uri));
        curatedDocs.push(doc);
      } catch {
        // Skip individual malformed entries.
      }
    }
  // ... unchanged: builder.build([...userDocs, ...curatedDocs]); collectNamespaceDependencies; etc.
}
```
Add the import at the top of parse.ts: `import { readSerializedModelMeta } from '../lib/serialized-model-meta.js';`

- [ ] **Step 2: Compute the closure in the handler and pass it in.** At the `populateDependencyGraph` call site (handler `:223-225`), before calling it:

```ts
import { computeCuratedClosure } from '../lib/curated-closure.js'; // top of file

// ... after the curated fetch loop, before populateDependencyGraph:
if (documentsForHydration.length > 0) {
  const seeds = collectUserSeedNamespaces(workspaceContext?.userDocs ?? []);
  // Closure docs = the curated hydration entries (have bundleId + serializedModel).
  const curatedForClosure = documentsForHydration
    .filter((d) => d.bundleId !== undefined)
    .map((d) => ({ serializedModel: d.serializedModel }));
  const closure = computeCuratedClosure(seeds, curatedForClosure);
  await populateDependencyGraph(documentsForHydration, workspaceContext, dependencyGraph, closure);
}
```
Leave the rest of the handler (the curated fetch loop pushing ALL docs into `documentsForHydration`, `mergeCuratedDocIntoDeferredExports`, and the response assembly) UNCHANGED — all curated serialized strings + deferredExports still pass through.

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: exit 0.

- [ ] **Step 4: Run the existing parse tests (no regression)**

Run: `pnpm --filter @rune-langium/studio test -- parse`
Expected: existing `functions/test/parse.test.ts` still passes. If a test asserted the dep-graph contained namespaces that are now outside the closure for its fixture, update the fixture so the user file imports them (the closure now correctly reflects references) — do NOT weaken the closure logic; adjust the test's seed.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/parse.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(api/parse): deserialize+link+dep-graph only the user's curated closure (fixes 503/1102 CPU limit)"
```

---

## Task 4: integration test + curated-repro regression

**Files:**
- Test: `apps/studio/functions/test/parse-lazy-link.test.ts`

- [ ] **Step 1: Read `apps/studio/functions/test/parse.test.ts`** to reuse its harness — how it invokes the handler (`onRequestPost`/the exported handler), how it stubs `env.CURATED_MIRROR` / `fetchCuratedBundle` (or the curated artifact fetch), and how it builds the request.

- [ ] **Step 2: Write the integration test** that proves closure-scoping. Provide a curated bundle (via the same stub the existing tests use) with three namespaces — `cdm.trade` (imports `cdm.base.datetime`), `cdm.base.datetime` (imports `cdm.base.math`), `cdm.base.math` — plus an UNRELATED `cdm.other`. POST a user file that `import cdm.trade` + `curatedBundles:[{id:'cdm',version:'...'}]`.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
// (adapt the harness/stubs to match parse.test.ts)
```
Assert:
- Response `status === 200`, `ok: true` (the repro that previously 503'd now succeeds).
- `hydrationState.documents` still contains ALL curated namespaces incl. `cdm.other` (passthrough preserved).
- `deferredExports` still lists all curated namespaces (unchanged).
- `dependencyGraph` keys cover the closure (`cdm.trade`, `cdm.base.datetime`, `cdm.base.math`) and NOT `cdm.other` (closure-scoped) — this is the proxy for "only the closure was linked", since CPU can't be asserted directly.
- A second request with a user file importing NOTHING curated → `dependencyGraph` is empty / has no curated entries (no curated linked).

Use the real `parse.ts` handler + real `computeCuratedClosure` (do not mock them). Stub only the curated fetch (network), matching `parse.test.ts`.

- [ ] **Step 3: Run + iterate to green**

Run: `pnpm --filter @rune-langium/studio test -- parse-lazy-link`

- [ ] **Step 4: Full functions suite + type-check + commit**

```bash
pnpm --filter @rune-langium/studio test && pnpm --filter @rune-langium/studio run type-check
git add apps/studio/functions/test/parse-lazy-link.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test(api/parse): closure-scoped linking + passthrough; curated-repro no longer 503s"
```

---

## Final verification
- [ ] `pnpm --filter @rune-langium/studio test` (full suite green)
- [ ] `pnpm --filter @rune-langium/studio run type-check` (exit 0)
- [ ] `pnpm run lint` (0 errors)
- [ ] Final code review over the branch; then **superpowers:finishing-a-development-branch** → push + PR (do NOT merge to master locally). After merge + Cloudflare Pages deploy, manually re-probe prod: `POST /api/parse` with `curatedBundles:[{id:'cdm',…}]` + a user file → expect 200 (was 503/1102).

## Notes / risks
- **CPU can't be unit-asserted** — the closure-scoped dep-graph (`cdm.other` excluded) is the proxy for "only the closure linked." The true confirmation is the post-deploy prod re-probe.
- **Closure correctness** (spec §7): a cross-namespace ref not expressed as an `import` would be missed → that type resolves unresolved (graceful; valid Rosetta requires imports for cross-ns refs).
- **Read `populateDependencyGraph` first** (Task 0): the exact line numbers (~512-527) may shift; match the current code.
- The deserialize is now gated on `readSerializedModelMeta` returning a namespace in the closure; a malformed serialized entry (meta null) is skipped from linking but still passes through in the response (unchanged) — consistent with the existing per-entry try/catch fail-soft.
