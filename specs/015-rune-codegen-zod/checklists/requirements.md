# Specification Quality Checklist: Rune-Langium Native Code Generators

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-26
**Updated**: 2026-04-26 (post-clarify, four locked-in answers folded in)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *Caveat:
      Zod, Langium, JSON Schema 2020-12, and TypeScript class syntax appear
      in FR / SC where they are part of the user-facing contract (output
      file shape, generator targets, Studio panel surface). Internal
      architecture is kept out.*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — *with caveats: the audience
      is developer-leads and product-engineering. A Rune codegen feature
      inherently involves DSL terminology.*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic — *with caveats: SC-002 and
      SC-005 reference `tsc --noEmit` and the Rosetta TS generator. Both
      are authoritative comparison anchors that cannot be made fully
      agnostic without losing the spec's grounding.*
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified (10 cases including the new
      legacy-package downstream-rewiring case)
- [x] Scope is clearly bounded (5 user stories, 27 FRs, 8 SCs, 9
      assumptions)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (CLI, Studio multi-target
      preview, JSON Schema, full TypeScript class emission)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — *with the
      caveats above*

## Clarifications Folded In (2026-04-26 via /speckit.superb.clarify)

- **Q1 / B — Package rename**: New generator takes the canonical
  `packages/codegen` name. Existing JVM-bridge package renamed to
  `packages/codegen-legacy` *in this feature*. Downstream consumers
  (`apps/codegen-worker`, `apps/codegen-container`) re-wired in the
  same change set. Codified in FR-026, FR-027, and the new
  legacy-package edge case.
- **Q2 / A — Two-tier testing**: Small fixtures get committed expected
  outputs and byte-identical diffs (FR-022, FR-023 split). Full CDM
  smoke runs `tsc --noEmit` + a parse-valid / reject-invalid JSON
  battery; no committed CDM snapshot. SC-007 enforces re-run
  determinism in CI.
- **Q3 / A — Inline runtime helpers**: `runeCheckOneOf` / `runeCount`
  / `runeAttrExists` are inlined into each emitted file. No
  `@rune-langium/runtime` companion package. FR-021 rewritten;
  Runtime-helpers entity rephrased; the runtime-helpers assumption
  removed.
- **Q4 / B + Q4b / C — Studio multi-target preview + class-style TS**:
  Studio live preview supports all three targets via a target
  switcher; FR-018 mandates source mapping for all three (not just
  Zod). The TypeScript target is full-class — class declarations,
  type guards, discriminator predicates, constructor methods, and
  condition methods — with no Zod dependency. US4 acceptance scenarios
  extended to cover target switching; US5 fully rewritten; FR-020
  rewritten; SC-005 rephrased; Target entity updated to use
  `typescript` (not `ts-interfaces`).

## Notes

- Items marked incomplete require spec updates before `/speckit.plan`.
- The original `Studio offline` edge case is retained; the new
  legacy-package downstream-rewiring edge case is added.
- Implementation tech (Langium runtime, Zod, MIT licensing,
  `packages/codegen` directory, `tsc --noEmit`) appears in FR-015 /
  FR-016 / FR-021 / FR-026 / FR-027 / Assumptions because it
  constitutes the user-facing contract (consumers install an
  MIT-licensed npm package; generators run in browser + node).
- Open question logged in the clarify intent summary: source-mapping
  mechanics for the JSON-Schema target (JSON Pointers vs. sidecar)
  are a Phase-1 implementation detail and don't gate this spec.
