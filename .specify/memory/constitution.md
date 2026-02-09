<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles: None
- Added sections: Development Workflow; expanded Workflow & Quality Gates
- Removed sections: None
- Templates requiring updates: ✅ none
- Follow-up TODOs: TODO(RATIFICATION_DATE): initial ratification date not recorded
-->
# rune-langium Constitution

## Core Principles

### I. DSL Fidelity & Typed AST
The Langium grammar MUST parse all valid Rune `.rosetta` files accepted by Xtext
without loss of information. AST nodes MUST be fully typed; expression nodes MUST
never be represented as opaque strings. Cross-references MUST use `Reference<T>`
and resolve according to the Xtext scoping rules.

### II. Deterministic Fixtures
All conformance, parity, and benchmark tests MUST run against vendored, in-repo
fixtures (CDM corpus and rune-dsl sources). Tests MUST be deterministic and not
depend on network access or external tooling at runtime.

### III. Validation Parity
Validation scope MUST stay parity-only with Xtext rules for initial releases.
Diagnostics MUST be structured (line, column, severity, message) and MUST avoid
false positives on valid CDM sources. Parity coverage MUST be tracked and
reported.

### IV. Performance & Workers
Parsing MUST meet latency budgets (<200ms single-file, <5s full corpus) and run
in a web worker for browser integration. Performance regressions MUST be caught
by automated benchmarks.

### V. Reversibility & Compatibility
The editor integration MUST remain backward-compatible via an adapter layer
until the Langium parser is stable. Deprecations MUST include a migration guide
and a staged rollout plan.

## Tooling & Standards

- Language: TypeScript with pnpm workspaces.
- Linting/formatting: oxlint and oxfmt; follow repo config and .editorconfig.
- Tests: vitest for unit/integration; conformance and benchmark suites required
	for DSL changes.
- Public APIs MUST include concise JSDoc. Internal helpers SHOULD remain
	undocumented.

## Development Workflow

### Core Workflow (Feature Development)
1. Feature request initiates with `/speckit.specify <description>`
2. Clarification via `/speckit.clarify` to resolve ambiguities
3. Technical planning with `/speckit.plan` to create implementation design
4. Task breakdown using `/speckit.tasks` for execution roadmap
5. Implementation via `/speckit.implement` following task order

### Extension Workflows
- **Baseline**: `/speckit.baseline` -> baseline-spec.md + current-state.md
- **Bugfix**: `/speckit.bugfix "<description>"` -> bug-report.md + tasks.md
- **Enhancement**: `/speckit.enhance "<description>"` -> enhancement.md
- **Modification**: `/speckit.modify <feature_num> "<description>"` -> modification.md
- **Refactor**: `/speckit.refactor "<description>"` -> refactor.md
- **Hotfix**: `/speckit.hotfix "<incident>"` -> hotfix.md + post-mortem.md
- **Deprecation**: `/speckit.deprecate <feature_num> "<reason>"` -> deprecation.md
- **Review**: `/speckit.review <task_id>` -> review report + tasks.md update
- **Cleanup**: `/speckit.cleanup` -> specs cleanup + doc updates

### Workflow Selection
Development activities SHALL use the appropriate workflow type. The wrong
workflow SHALL NOT be used: features must not bypass specification, bugs must
not skip regression tests, refactors must not alter behavior, and enhancements
that exceed a single-phase plan MUST use the full feature workflow.

## Workflow & Quality Gates

### Quality Gates by Workflow

**Baseline**:
- Comprehensive project analysis MUST be performed.
- All major components MUST be documented in baseline-spec.md.
- Current state MUST enumerate all changes by workflow type.
- Architecture and technology stack MUST be accurately captured.

**Feature Development**:
- Specification MUST be complete before planning.
- Plan MUST pass constitution checks before task generation.
- Tests MUST be written before implementation (TDD).
- Code review MUST verify constitution compliance.

**Bugfix**:
- Bug reproduction MUST be documented with exact steps.
- Regression test MUST be written before fix is applied.
- Root cause MUST be identified and documented.
- Prevention strategy MUST be defined.

**Enhancement**:
- Enhancement MUST be scoped to a single-phase plan with no more than 7 tasks.
- Changes MUST be clearly defined in the enhancement document.
- Tests MUST be added for new behavior.
- If complexity exceeds single-phase scope, full feature workflow MUST be used.

**Modification**:
- Impact analysis MUST identify all affected files and contracts.
- Original feature spec MUST be linked.
- Backward compatibility MUST be assessed.
- Migration path MUST be documented if breaking changes.

**Refactor**:
- Baseline metrics MUST be captured before changes unless explicitly exempted.
- Tests MUST pass after every incremental change.
- Behavior preservation MUST be guaranteed (tests unchanged).
- Target metrics MUST show improvement unless explicitly exempted.

**Hotfix**:
- Severity MUST be assessed (P0/P1/P2).
- Rollback plan MUST be prepared before deployment.
- Fix MUST be deployed and verified before writing tests.
- Post-mortem MUST be completed within 48 hours of resolution.

**Deprecation**:
- Dependency scan MUST be run to identify affected code.
- Migration guide MUST be created before Phase 1.
- All three phases MUST complete in sequence (warnings -> disabled -> removed).
- Stakeholder approvals MUST be obtained before starting.

### General Gates

- Changes to grammar, scoping, or validation MUST include tests and updated
  parity/conformance data.
- Performance benchmarks MUST be executed for parser changes.
- Lint and test SHOULD pass before completion; failures MUST be reported with
  rationale if deferred.

## Governance

- This constitution supersedes all other practices for this project.
- Amendments require a documented rationale, impact analysis, and version bump
	(semantic versioning).
- Every plan and task list MUST include a constitution check section that
	references relevant principles.
- Compliance is reviewed during planning and before implementation completion.

**Version**: 1.1.0 | **Ratified**: TODO(RATIFICATION_DATE): initial ratification date not recorded | **Last Amended**: 2026-02-09
