# `/api/parse` lazy/partial curated linking — design

Status: **DRAFT for discussion** · 2026-05-22 · Task #301

## 1. Problem

`POST /api/parse` returns **503 in production** when a request includes
curated bundles. Reproduced:

| Request | Result |
|---|---|
| user files only | 200 (~0.3s) |
| empty | 200 |
| `curatedBundles: [{ id: 'cdm', … }]` | **503, CF error `1102`** (~2s) |

CF error `1102` = the Pages Function **exceeded its CPU budget** (a
Cloudflare-generated response, not the function's own JSON error path).

**Root cause:** `apps/studio/functions/api/parse.ts` deserializes + **links the
entire curated corpus** (CDM = hundreds of docs) and computes the namespace
dependency-graph (#246) over the full combined workspace, every request. For
a large bundle that single invocation blows the CPU limit. The likely
"anymore" trigger: #246 added the server-side dep-graph walk over the corpus.

A companion resilience fix already shipped (PR #233): the in-browser fallback
now degrades to user-file-only parsing instead of dead-ending. This spec
addresses the underlying 503 so curated parsing works in prod.

## 2. Goal / Non-goals

**Goal:** Bound the expensive per-request work (deserialize + link +
dep-graph) to **only the curated namespaces the user's files actually
reference** (transitive closure), so a cold request fits under the CF CPU
limit — while preserving the response shape and studio UX.

**Non-goals**
- Changing the curated-mirror publisher/manifest (rejected: needs a
  republish — see §3 alternatives).
- Pre-linking bundles server-side or moving to a higher-CPU Worker.
- Changing what the studio receives (response stays a superset).

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Approach | **Closure from serialized imports, in `parse.ts`** (self-contained; no mirror changes) |
| Closure source | Read `name` + `imports[].importedNamespace` from each curated doc's serialized JSON — **no Langium link** |
| What gets linked | **Only the closure** (user docs + referenced curated namespaces) |
| Dep-graph scope | The **linked subset** only |
| Response payload | **Pass through ALL** curated docs' serialized strings + full `deferredExports` (cheap); `dependencyGraph` is closure-scoped |

**Feasibility note:** `collectNamespaceDependencies(documents: LangiumDocument[])`
requires *linked* docs, so it cannot compute the closure. The closure is
computed instead from the **serialized import declarations**, which a
serialized `RosettaModel` carries verbatim:
`{ name, imports?: Array<{ importedNamespace?: string }> }`
(`packages/core/src/serializer/rosetta-serializer.ts:299`). `importedNamespace`
is a `QualifiedNameWithWildcard` (e.g. `cdm.base.datetime` or `cdm.base.*`).

**Alternatives considered + rejected:** (B) manifest-driven closure
(curated-mirror precomputes per-namespace deps) — cleaner/authoritative but
needs publisher + manifest schema changes + a republish; (C) skip server link
entirely + lazy on-demand — biggest behavior change (the modal cross-bundle
cascade would need a new dep-graph source).

## 4. Architecture & data flow (curated path)

```
hydrateUserWorkspace(userFiles)  → live user docs + user imported namespaces (seeds)
fetchCuratedBundle(id,version)   → ALL curated docs (serializedModel str + namespace + exports)   [unchanged]
        │
computeCuratedClosure(seeds, curatedDocs)   ← NEW: read name+imports from serialized JSON (no link)
        │                                      → Set<namespace> = transitive closure of seeds
deserialize + link  ONLY closure curated docs  (+ user docs)  → user→curated $refs resolve
        │
populateDependencyGraph(linked subset)   → dependencyGraph (closure-scoped)
        │
Response: hydrationState.documents = user docs + ALL curated docs (serialized strings, passthrough)
          deferredExports = all (unchanged);  dependencyGraph = closure-scoped
```

The expensive steps (deserialize + link + dep-graph) operate on the closure
subset; the whole-bundle fetch (one gzip) and serialized-string passthrough
stay (they are the cheap parts — network + JSON, not Langium linking).

## 5. New unit: `computeCuratedClosure`

Pure, Langium-free, unit-testable. Lives beside `parse.ts` (e.g.
`apps/studio/functions/lib/curated-closure.ts`).

```ts
export interface SerializedCuratedDoc {
  namespace: string;        // doc's RosettaModel.name (segments joined with '.')
  serializedModel: string;  // JSON string of the serialized RosettaModel
}

/**
 * Transitive closure of `seedNamespaces` over the curated docs' import graph,
 * read cheaply from each doc's serialized JSON (no Langium deserialize/link).
 * Handles wildcard imports (`a.b.*` → every curated namespace under `a.b`).
 * Cycle-safe (BFS with a visited set). Returns the set of curated namespaces
 * that must be linked.
 */
export function computeCuratedClosure(
  seedNamespaces: Iterable<string>,
  curatedDocs: ReadonlyArray<SerializedCuratedDoc>
): Set<string>;
```

Algorithm:
1. Build `nsImports: Map<namespace, string[]>` by `JSON.parse`-ing each
   `serializedModel` and reading `name` + `imports[].importedNamespace`
   (strip a trailing `.*`; record wildcard prefixes separately).
2. Build the set of all curated namespaces (`allNs`).
3. BFS from `seedNamespaces`: for each namespace, add its concrete imports
   that exist in `allNs`; for a wildcard prefix `p`, add every `allNs` entry
   equal to `p` or starting with `p + '.'`. Skip already-visited.
4. Return the visited set ∩ `allNs` (only curated namespaces; user seeds that
   aren't curated are not returned).

Seeds = the namespaces the **user files** import. Read these from the user
files the same cheap way (their serialized models, produced by
`hydrateUserWorkspace`, carry the same `imports` shape) — or from the parsed
user models already in `workspaceContext`.

## 6. parse.ts changes

- After `hydrateUserWorkspace` + `fetchCuratedBundle`: collect user seed
  namespaces, call `computeCuratedClosure(seeds, allCuratedDocs)`.
- Deserialize + link only the curated docs whose namespace ∈ closure (plus the
  user docs) — i.e. restrict whatever currently feeds the deserialize+link
  step (today inside `populateDependencyGraph`) to the closure subset.
- `populateDependencyGraph` runs over the linked subset only.
- `documentsForHydration` still receives **every** curated doc (serialized
  strings) — passthrough unchanged — so the response/explorer/on-demand-link
  behavior is preserved.
- `mergeCuratedDocIntoDeferredExports` still runs for every curated doc
  (cheap; reads `exports`).

The internal restructuring (separating "which docs to link" from "which docs
to return") should keep `parse.ts` readable — likely a small helper that takes
the closure set and returns the subset to link, leaving the response assembly
untouched.

## 7. Edge cases

| Situation | Behavior |
|---|---|
| Closure incomplete (a cross-ns ref not via an `import`) | The type stays unresolved — degrades gracefully (studio shows unresolved; recoverable). Valid Rosetta requires imports for cross-ns refs, so this is rare. |
| Wildcard import `a.b.*` | Include every curated namespace `== a.b` or starting `a.b.` |
| User file with no imports | No curated docs linked — only user docs (still 200) |
| Multiple curated bundles | Union the docs into one namespace map; one closure across all |
| Cycle in imports | BFS visited-set is cycle-safe |
| Empty request | Unchanged early-return (no langium import) |
| Seed namespace not present in curated set | Ignored (user-only namespace) |

## 8. Testing

- **`computeCuratedClosure` unit (no Langium):** transitive multi-hop closure;
  wildcard prefix expansion; multi-bundle union; cycle-safe; seed-not-in-curated
  ignored; empty seeds → empty.
- **`parse.ts` integration (functions/test/parse.test.ts):** a request with a
  user file importing ONE curated namespace that transitively imports another
  → assert (a) only the closure namespaces are deserialized+linked (spy/instrument
  the link/deserialize call, or assert via a small seam), (b) the response still
  contains ALL curated docs' serialized strings + full deferredExports, (c)
  `dependencyGraph` covers the closure. A user file importing nothing curated →
  no curated linked.
- **Regression:** the repro request (`curatedBundles:[{id:'cdm'}]` + a user file)
  parses without exceeding limits in the test harness; the previously-linked
  full-corpus path is no longer taken. (CPU can't be asserted directly; assert
  the link subset = closure as the proxy.)

## 9. Build sequence (for the plan)

0. Read `populateDependencyGraph` (and any helper it calls) to locate exactly
   where curated docs are deserialized + linked today, and confirm the seam
   for restricting that to the closure subset (the spec assumes it lives there
   per `parse.ts:130-132`'s comment — verify before wiring).
1. `computeCuratedClosure` + unit tests (pure, no Langium).
2. Cheap seed extraction (user files' imported namespaces) + helper to read
   `{namespace, imports}` from a serialized model (shared by seed + closure).
3. Wire into `parse.ts`: compute closure, restrict deserialize+link to the
   closure subset, keep response passthrough; scope the dep-graph to the subset.
4. Integration test (parse.test.ts) + regression for the curated repro.

## 10. Open questions / deferred

- Manifest-driven closure (alternative B) remains a cleaner long-term option if
  the per-request closure read ever becomes a cost itself; deferred.
- If even the closure is occasionally large (a user file importing a huge
  subtree), a follow-up could cache the linked closure per (bundle set + seed
  set); deferred — not needed for the common case.
