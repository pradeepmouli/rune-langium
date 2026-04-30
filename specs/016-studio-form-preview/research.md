# Research: Studio Form Preview

## Decision: Use a serializable preview schema snapshot, not generated-source execution

**Rationale**: The existing Studio codegen worker returns generated source text through `codegen:result`. The generated Zod target is TypeScript source with imports and helper code, not an in-memory schema object. Executing that source in the browser would require dynamic module loading or `eval`-style behavior, creating security, bundling, and debugging risks. A serializable `FormPreviewSchema` derived in the codegen worker from the same Langium documents keeps generated Form and Code in sync without executing generated code.

**Alternatives considered**:
- Execute generated Zod source in a worker: rejected due to browser module/import complexity and avoidable code-execution risk.
- Parse generated TypeScript source back into a schema model: rejected as brittle and indirect.
- Hand-author form definitions in Studio: rejected because the spec requires generated-schema-derived behavior.

## Decision: Keep Form and Code as sibling surfaces under Preview

**Rationale**: Clarification selected a mode layout where Preview owns the full right side and contains generated artifacts. Form Preview and generated Code are both outputs of the model and should share target/status state where useful.

**Alternatives considered**:
- Put Form Preview in the bottom diagnostics group: rejected because it hides the primary feature behind utility tabs.
- Make Form Preview a fourth permanent column: rejected because Source and Structure must remain primary and usable.

## Decision: Treat Visualize as its own top-level graph mode

**Rationale**: The current `Preview` dock tab is actually the model graph. It is not a generated artifact like Form or Code. A top-level Visualize mode keeps graph exploration, relationship filters, and layout controls distinct from generated preview output.

**Alternatives considered**:
- Rename `Preview` to `Graph`: accurate but does not establish the clarified mode model.
- Put Visualize under Navigate: rejected because graph exploration is a modelling lens, not just file/model navigation.

## Decision: Use Navigate/Edit/Visualize/Preview mode language, with Problems/Messages as bottom utilities

**Rationale**: Clarification selected a spatial model: Navigate full left, Edit middle, Preview full right. Problems and Messages should not permanently consume editing space, but must be easy to surface when actionable.

**Alternatives considered**:
- Keep plain dock panel labels only: simpler but scales poorly as the number of surfaces grows.
- Use verbs for every panel: rejected because Problems and Messages are naturally utility surfaces and because Source/Structure are clearer as submodes.

## Decision: Include Code Preview readability and Source Editor usability as planning risks

**Rationale**: Playwright inspection showed generated code rendered in a plain `<pre>` surface with poor wrapping/formatting, and source typing behavior looked suspicious while LSP retry failures were active. The plan should include verification and targeted fixes so Form Preview does not land on an unstable editing surface.

**Alternatives considered**:
- Defer both as unrelated bugs: rejected because the new Preview mode places Code beside Form, and Source is the primary input surface for preview refresh.
