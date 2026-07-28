# Editable-Surface Rendering (B2) — Design

**Date:** 2026-06-28
**Status:** Proposed (awaiting review)
**Author:** Pradeep Mouli (with Claude)
**Builds on:** `2026-06-27-rosetta-ast-source-cst-reuse-design.md` (Plan A — the CST-reuse renderer). B2 is the first of a two-part follow-up (B2 then B1).

## Problem

Plan A made the visual editor's source write-back lossless for the constructs the
renderer (`render-core` / the CST-reuse driver) structurally covers:
`Data`/`Choice`/`RosettaEnumeration` and their attributes/enum-values/options.
Everything else `render-core` returns `null` for → the driver reuses the original
CST bytes (correct for *unchanged* nodes).

But the inspector lets users edit/add/delete constructs `render-core` does **not**
cover, so those edits are lost (an inspector survey produced the gap map):

- **Conditions** (add/edit name/definition/expression) on a Data — edit lost; a
  newly-added condition is dropped (post-hotfix: skip+warn, not crash).
- **Functions** — `FunctionForm` fully edits inputs/output/body/conditions, but
  `render-core` has no `RosettaFunction` case, so every function edit re-emits the
  original verbatim (silent loss of the edit).
- **TypeAlias** — rename lost; wrapped-type edit has **no store action at all**.
- **Annotations** (`AnnotationRef`) and **synonyms** (add/remove on Data/Choice/
  Enum) — a newly-added one is dropped.
- **Deletion of a type** (`deleteType`) — does **not** persist: the renderer's
  top-level assembly copies a removed node's original range verbatim as an
  inter-element "gap," so the deleted type reappears on reparse. (Attribute /
  enum-value / option deletes already work — the parent regenerates and omits
  them.)

A safety hotfix already landed in Plan A so these never **crash** the editor (the
renderer degrades: skip+warn, plus a per-namespace try/catch backstop). B2 turns
"degrade" into "persist."

## Goals

- Every construct the inspector can **edit / add / delete** round-trips to source
  losslessly: `Condition`, `RosettaFunction`, `RosettaTypeAlias`, `AnnotationRef`,
  and the synonym types (`RosettaClassSynonym`/`RosettaSynonym`/`RosettaEnumSynonym`).
- `deleteType` persists to source.
- Every inspector edit flows through the single change-tracking chokepoint so the
  renderer's dirty signal sees it (close the bypasses).
- Adopt **`render`** terminology (reserve `serialize` for JSON).

## Non-Goals (deferred to B1, the second part)

- **Native structural rendering of expression bodies.** In B2, condition and
  function bodies render via the **`$cstText` the editor already commits**
  (verbatim — lossless for unchanged; for an edit it is exactly the text the user
  typed). B1 replaces this passthrough with a structural `renderExpression`
  (full grammar, correct precedence) + a first-class `parseExpression` core API,
  and collapses the editor preview + the Zod transpiler's precedence table onto
  that one renderer (DRY). B2 has **no dependency on B1** and B1 is a swap-in.
- **Comments.** `updateComments` writes `meta.comments` (CST trivia); rendering
  edited comments back to a source position is a separate hard problem. Existing
  comments already ride CST on untouched nodes; B2 does not render edited comments.
- **Doc references / labels / rule references.** Not inspector-editable, so they
  cannot be newly-added and never hit the degrade path; they ride CST unchanged.
  B2 does not add structural cases for them.

## Decision

Sequence **B2 then B1**. B2 delivers user-facing editability now, rendering
expression bodies from `$cstText`; B1 later upgrades bodies to native structural
rendering. The split is safe because B2's body rendering does not depend on B1's
renderer.

## Architecture

### Naming → `render`

Rename the AST→`.rosetta` path so it is never conflated with Langium's JSON
`serialize`: `serializeNamespaceToSource`→`renderNamespace`,
`emitNode`/`emitModelText`→`renderNode`/`renderModel`, the module → `render-core`,
the `@rune-langium/codegen/rosetta` exports updated, "the serializer" → "the
renderer". `serialize` stays reserved for JSON (`JsonSerializer`,
`serializeRuneModel`). This renames Plan A symbols; it churns once, in B2.

### `render-core` completeness (the core work)

Add `renderNode` cases, each emitting its scalar scaffold and **delegating
composite children via the existing IoC `renderChild` callback** (so unchanged
children still ride their CST slice — only the edited part regenerates):

- **`Condition`** → `condition <name>:` (or the post-condition keyword when
  `postCondition`) + `<"definition">` + the expression **body from `$cstText`**
  (fallback `expression.$cstNode?.text`), verbatim.
- **`RosettaFunction`** → `func <name>:` + `inputs:` block (each input is a
  structured `Attribute` — render via the existing attribute logic: name/type
  `$refText`/cardinality) + `output:` (structured) + operation/shortcut bodies
  from **`$cstText`** + conditions (via the `Condition` case). Read-only
  shortcuts/aliases ride their `$cstText`/CST.
- **`RosettaTypeAlias`** → `typeAlias <name>:` + wrapped type (`typeCall` `$refText`).
- **`AnnotationRef`** → `[ <annotation> <attribute?> <qualifiers*> ]`
  (`annotation.$refText`, optional `attribute.$refText`, qualifiers).
- **Synonyms** — `RosettaClassSynonym` (Data/Choice), `RosettaSynonym`
  (Attribute/Choice-option/Enum), `RosettaEnumSynonym` (enum value): render the
  `[ synonym <sources> … ]` shape covering the fields the inspector produces;
  richer parsed-only sub-content rides CST when unchanged. Exact field coverage is
  fixed at plan time against the AST shapes.

Expression bodies are `$cstText` passthrough in B2 (the B1 swap point). All
cross-references render `$refText` (never `.ref`), consistent with Plan A.

### Deletion (lossless `deleteType`) — native, via Mutative inverse patches

Deletion is just another tracked change in the domain change log; **no baseline
index and no identity heuristic.** `deleteType` does `draft.nodes.delete(id)`,
which Mutative records as a **`remove` patch at `['nodes', <id>]`**. Its
**inverse patch carries the deleted node value** — including `.data.$cstRange`
(the element's original byte range).

Today `mutateGraph` discards inverse patches (`const [next, patches] =
mutativeCreate(...)`); B2 captures the third tuple element and threads it to the
renderer alongside `pendingEditPatches`. The renderer then, instead of copying
every inter-element gap verbatim, **drops the range of any element whose `remove`
patch deleted it** (range read from the inverse patch's old value) while still
copying genuine gaps (header, comments, non-graph elements). Present nodes
render/slice as today; additions (new nodes, no `$cstRange`) append at the tail.

### Change-tracking comprehensiveness

Render's dirty signal is the Mutative patches produced at the `mutateGraph`
chokepoint (Plan A). DomainOps are pure/Mutative-agnostic; they "hook into"
Mutative only by being run against the draft Proxy `mutateGraph` creates — the
Proxy intercepts their plain mutations as patches (+ inverse patches). So any
edit expressed as DomainOps-on-the-draft is tracked automatically, including
deletes (`remove` patches). B2:

- **Capture inverse patches** in `mutateGraph` (currently dropped) — needed for
  deletion (above) and useful for undo.
- Add the missing **TypeAlias wrapped-type store action** (today the form has no
  op) routed through `mutateGraph`, so its edits become patches.
- Audit inspector actions for any that mutate outside an op / bypass `mutateGraph`
  and route them through it. (Comments are explicitly out of scope — they write
  `meta` directly and remain unrendered.)

## Data flow

```
parse → AST(+CST) → dehydrate (stamp $cstRange)
inspector edit/add/delete → mutateGraph → Mutative patches + INVERSE patches
renderNamespace(nodes, baselineSource, dirty, removals):
  - present node, subtree clean → slice baseline ($cstRange)         [Plan A]
  - present node, dirty/new     → renderNode (Condition/Function/… cases;
                                   bodies via $cstText; children reuse if clean)
  - removed node ('remove' patch at ['nodes',id]) → DROP its range,  [B2 deletion]
        range read from the inverse patch's old value (.data.$cstRange)
  - new node (no $cstRange)     → append at tail                     [Plan A]
```

## Correctness constraints

- Expression bodies emit `$cstText` verbatim (no parsing, no reformatting) in B2.
- Unchanged children always ride their CST slice (Plan A invariant preserved).
- Deletion ranges come from the **inverse patch's** old node value
  (`.data.$cstRange`), captured in the same edit batch as the `remove` patch — so
  they are baseline-consistent with the frozen parse-baseline source by
  construction. Inverse patches (like `pendingEditPatches`) accumulate since the
  last parse and clear on reparse — never mix epochs.
- A range is dropped only for an actual `remove` patch at `['nodes', <id>]`; no
  inference/heuristic, so no accidental deletion.
- `$cstRange` is read-only post-parse; dirtiness and removals come only from
  patches / inverse patches.

## Error handling

- The Plan A degrade (skip+warn) + per-namespace try/catch backstop remain — B2
  removes the *reasons* to degrade for the covered constructs, but the safety net
  stays for anything still unimplemented.
- Deletion never deletes on uncertain identity mapping (preserve-on-doubt).

## Testing

Per construct, drive the **actual inspector store action** then render → re-parse,
asserting byte-exact preservation of untouched siblings and correct emission of
the change:

- Condition: add / edit (name, definition, expression text) / delete.
- Function: rename / add+update input / change output / edit body / add condition.
- TypeAlias: rename / wrapped-type change (the new action).
- Annotation: add / remove. Synonym (each of the three kinds): add / remove.
- Deletion: `deleteType` → the type is gone from re-parsed source; sibling types
  and inter-element comments survive byte-intact.
- Regression: the existing Plan A round-trip + cascade + inheritance tests stay
  green; the hotfix's blank-line-on-skipped-condition quirk self-heals once the
  `Condition` case lands.

## Rollout / phasing (within B2)

1. **Render rename** (mechanical; isolated commit).
2. **render-core cases** for Condition / Function / TypeAlias / AnnotationRef /
   synonyms (bodies via `$cstText`), with per-construct round-trip tests.
3. **Inverse-patch capture + deletion**: `mutateGraph` captures inverse patches;
   the assembly drops removed elements' ranges, with deletion tests.
4. **Change-tracking comprehensiveness**: TypeAlias wrapped-type action + bypass
   audit.

Each phase is independently testable; phase 2 is the bulk.

## Risks

- **Synonym field coverage** — the synonym grammar is rich; B2 covers what the
  inspector produces, leaving richer parsed-only content on CST. If the inspector
  later edits richer synonym fields, extend the case. Mitigation: plan-time field
  audit against the AST shapes + the degrade backstop.
- **`RosettaFunction` AST shape** — inputs/output/operations/shortcuts field names
  fixed at plan time against `generated/ast.ts`; body stays `$cstText`.
- **Inverse-patch capture** — `mutateGraph` must start capturing the inverse
  patches it currently discards, and thread them to the renderer. The deleted
  node's `.data.$cstRange` must be present on the pre-delete value (it is — the
  node carried it from parse); a node deleted before ever being parsed (created
  then deleted in-session) has no `$cstRange` and was never in source, so there is
  nothing to drop — a no-op, correct.
- **Range-drop assembly** — dropping a removed element's range must still copy the
  surrounding gaps (a deleted element's leading/trailing whitespace handling) so
  the result stays well-formed; covered by deletion tests.

## Relationship to B1 (next spec)

B1 replaces the `$cstText` body passthrough with a structural
`renderExpression(Dehydrated<RosettaExpression>)` (full grammar, correct
precedence), adds a first-class `parseExpression` core API (bare-expression parse
of the grammar's non-entry `Expression` rule) for the dirty-edit path, and
collapses the editor preview (`expression-node-to-dsl`) and the Zod transpiler's
copied precedence table onto the one shared renderer. B2's `Condition`/`Function`
cases are the swap site.
