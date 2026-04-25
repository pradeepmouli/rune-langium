# Deferred Feature Scope: Inspector form migration to `@zod-to-form`

**Status**: Deferred — not yet a feature branch.
**Origin**: Phase 7 of feature `012-studio-workspace-ux` set up the
`@zod-to-form/vite` build pipeline, but stopped short of migrating any
real forms. T102 (roundtrip test) and T107 (HMR e2e) were carried into
this scope because they only make sense once a real form has been
migrated.

When ready, hand the **Intent Summary** below to `/speckit.specify` to
turn this into a numbered feature.

---

## Intent Summary

**Feature**: Replace hand-authored Inspector form components in
`packages/visual-editor/src/components/forms/` with components emitted
at build time by `@zod-to-form/vite` from canonical Zod schemas.

**Problem being solved**:
- The Inspector currently renders AST nodes via TSX form components
  written by hand against `MapFormRegistry`. Adding or renaming a Rune
  AST attribute today means a TSX edit, a registry update, and a test
  rewrite — three places, one logical change.
- The `?z2f` pipeline already runs at build time (Phase 7 wired it),
  but no production form actually consumes it. We're paying for the
  plugin without the leverage.

**Chosen approach**:
1. Treat the canonical Zod schemas in
   `packages/visual-editor/src/generated/zod-schemas.ts` (already
   regenerated from Langium grammar in CI) as the **source of truth**
   for Inspector form shape.
2. Replace each per-AST-type TSX form (`TypeForm`, `AttrForm`,
   `EnumForm`, etc.) with a thin shell that imports the matching
   schema via `?z2f` and lets `@zod-to-form/react` render fields.
3. Keep `MapFormRegistry`'s public surface (registry → component for
   `$type`) so the Inspector wiring at the call site doesn't move.
4. Hand-author overrides only where the Zod schema is too generic —
   e.g. constrained-enum widgets, cross-field validation, custom
   labels/help text — via z2f's `meta()` extension points.

**Success criteria**:
- [ ] Inspector renders the same fields, in the same order, with the
      same validation rules, before vs. after migration (asserted by
      the deferred T102 roundtrip test against a pinned set of AST
      fixtures)
- [ ] Editing a Zod schema field updates the live Inspector via Vite
      HMR within 2s, no full reload (SC-011 from feature 012)
- [ ] No regressions in the existing 638 visual-editor tests
- [ ] `git status` on a fresh checkout still shows zero committed
      `forms/generated/*` files (Phase 7 invariant; .gitignore stays)
- [ ] The number of hand-authored TSX form files drops by ≥80%; the
      survivors are documented overrides with a one-line "why kept"

**Out of scope (explicit)**:
- The Source Editor surface (CodeMirror) — its own LSP-driven
  rendering, unrelated to z2f.
- The Visual Preview graph — node styling lives in
  `@xyflow/react`-rendered components, not forms.
- Adding new Zod schemas. We migrate against the schemas Langium
  already emits.
- Replacing `MapFormRegistry` — the registry pattern stays; only the
  values it returns change.
- Any visual / a11y redesign of the Inspector. Pixel parity is the
  bar; a redesign is a separate spec.

**Open questions for the spec**:
- How do we handle the few AST node types whose hand-rolled TSX
  encodes derived values (e.g. computed labels, conditional fields)?
  Two candidates: keep them as overrides, or extend the Langium
  grammar so the derivation is part of the schema. The spec should
  make this call after a one-day spike on 2-3 sample types.
- Form layout decisions (sectioning, headers, ordering): are these
  part of the schema's `meta()`, a separate layout file, or an
  override? Spec should pick one and document.
- HMR latency: SC-011 says ≤2s; current Phase 7 wiring is untested
  end-to-end. The deferred T107 e2e covers it but needs a real
  migrated form to assert against.

---

## Carried-over tasks from feature 012

These belong to *this* deferred feature, not 012:

- **T102** — Failing test
  `packages/visual-editor/tests/forms/dataform-roundtrip.test.tsx`
  importing `schemas/data.schema.ts?z2f` and asserting the rendered
  form has the same fields + behaviours as the pre-migration `DataForm`
  baseline.
- **T107** — Playwright e2e at `apps/studio/tests/e2e/z2f-hmr.spec.ts`:
  start dev server, open a schema file, add a field, assert the
  inspector updates within 2s (SC-011 verification).

Both should be regenerated as proper RED tests under the new feature's
TDD plan when it's specced.

---

## Pre-spec checklist

When picking this up:

1. Run `/speckit.clarify` against this doc first — open questions need
   decisions before `/speckit.plan` can produce a sane build order.
2. Audit `packages/visual-editor/src/components/forms/` to count the
   migration surface (file count, lines, tests touching each).
3. Confirm `@zod-to-form/vite` is still ≥ `^0.2.2` and the upstream
   API hasn't drifted; rerun the Phase 7 audit at
   `specs/012-studio-workspace-ux/z2f-audit.md` against the latest.
4. Check for any post-012 work in the area that may have changed
   `MapFormRegistry`'s shape; spec target should match what's in
   `master` at branch time.
