# Expression editor checkout fixes — 2026-10-09

PR [579](https://github.com/pradeepmouli/rune-langium/pull/579) fixes the five
findings in the [production checkout](2026-10-09-expression-editor-production-checkout.md).
The verification below uses the changed local frontend, an isolated local LSP
Worker and the public production curated APIs. It is not deployment proof.

| Finding | Cause and fix | Regression evidence |
| --- | --- | --- |
| F1: structural editing locks | Namespace source synchronization rewrote read-only standard-library files, producing invalid declarations. Exclude read-only/reference-only files from serialization baselines and writeback; retain invalid-source guards. Namespace routing also prefers a writable target regardless of reference-file order, so writeback cannot silently lose user edits. | Regression covers writable and protected files in the same namespace, both `readOnly`/`refOnly` flags and both file orders; J8 adds an attribute, changes cardinality, renames and reloads successfully. |
| F2: curated owner unavailable | Raw bracketed/spaced file URIs did not match Langium's canonical encoded URI. Canonicalize lookup while retaining the editor binding in replies. Both projection targets use the existing declaration-selection closure so unrelated broken functions do not block the selected declaration. | Serialized URI variants pass for both languages; a selected broken Python function still errors; hosted curated Abs projects and reveals read-only source. |
| F3: dispatch signature lost | Deferred linking republished a user model already included in the routed response. The duplicate base made canonical dispatch ownership ambiguous. Track published user URIs and suppress duplicate publication. | Worker test still publishes curated documents; both browser upload orders retain two inputs and the output after editing and projection. |
| F4: completion exception | Langium returns vscode response errors, while lspeasy expects its own error type to be thrown. The shared adapter now converts returned/thrown errors before transport. | Real LSP client receives cancellation code -32800 as a rejected request; adapter tests preserve error data; browser dispatch journeys capture no completion exception. |
| F5: narrow panes clip | Responsive grid tracks retained intrinsic content width and the center selector stayed on one line. Constrain tracks and wrap the selector at narrow widths. | Bounds checks pass at 800 and 1280 pixels with large pane fonts. The portal dialog independently receives verified 125% text scaling before axe/bounds checks. |

The local J8/J19 run passed all eight cases, with eight PASS manifest verdicts
and no retries. The local expression acceptance suite passed all nine cases,
including Source/Inspector document ownership over a real network LSP connection.
Both Builder and Text dialog accessibility scans passed at enlarged font sizes.
Pre-fix production evidence remains archived separately from local follow-up
evidence under `dist/production-checkout/2026-10-09/`.

Additional verification: 243 Studio worker/source-sync and related panel tests
passed, with two existing skips; all 33 visual-editor source-sync/adapter tests
and all 74 LSP tests passed. Studio/LSP type checks passed, along with
standalone TypeScript compilation of the changed browser helpers/journeys;
scoped Oxlint, CSS lint, formatting, LSP build and Studio production build.
Lint retains existing adapter `any` warnings; the build retains existing
dependency/browser-external and generated-CSS warnings.

The namespace-routing review regression failed for both protected-file flags
when the writable file appeared first. Preferring a writable target made all
four flag/order cases pass. The follow-up page/import suite passed 76 tests
with two existing skips; Studio type checks, scoped lint and formatting passed.

J8 now waits for the specific rename save and checks the renamed source before
and after reload. Its old assertions expected a lost rename and did not prove
graph undo/redo; those unsupported assertions were removed. The local expression
suite scopes full-source selectors to the Source pane because the Inspector
also reuses SourceEditor.

One separate corpus gap is tracked in [issue 580](https://github.com/pradeepmouli/rune-langium/issues/580):
curated ToDateTime references a pinned Rune built-in document absent from the
preview snapshot. Both manifests declare that dependency, but the snapshot has
only the local system built-ins under a different URI. Selecting that affected
function still fails visibly; the fix here prevents it from blocking unrelated
valid functions. This report does not claim full curated-corpus projection parity.

No merge or redeployment was performed. Dirty user guides, the `.resources`
symlink, primary checkouts and existing browser tabs were preserved.
