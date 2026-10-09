# Expression editor production checkout — 2026-10-09

Production matches master `1e83c62dbbb5834bc88c5d3354612622f21b8339`.
Cloudflare Pages canonical and latest deployment `670747fc` succeeded; all 13
endpoint probes passed with telemetry enabled. The checkout verdict is **RED**.

The full J00–J19 Chromium run completed in 8.2 minutes: Playwright reported
31 passed, two failed and two skipped. Both failures repeated on retry. The
manifest distinguishes accessibility degradation from a Playwright pass:
30 PASS, one DEGRADED, two FAIL and two BLOCKED. Screenshot review additionally
found signature and narrow-layout defects in passing tests.

## Findings

1. **P1 — Structural editing locks after adding an attribute.** J8 adds
   `notes string (1..1)` to valid scratch source, then its cardinality picker
   stays disabled with the pending-parse banner and 85 Problems. Both attempts
   time out after 120 seconds. J8 passed in the previous October 7 checkout.
   Investigate parsed-source equality and diagnostic synchronization; retain
   the guard for actually invalid drafts.
2. **P1 — Curated function projections cannot resolve their owner.** Curated
   `cdm.base.math.Abs` rejects read-only edits correctly, but TypeScript shows
   “The function owner is unavailable.” on both attempts. The same function
   imported as workspace source projects successfully. Trace hydrated source
   URI/node identity through the preview worker's canonical document lookup.
   This case does not establish Python or subsequent Source-reveal success.
3. **P2 — Dispatch signature metadata depends on file order.** Variant-first
   `Compute` displays an empty graph signature and “No output type”; base-first
   displays both inputs and `int` output. Both edit/reveal the correct base
   body. Resolve metadata and implementation from the same dispatch base.
4. **P2 — Client completion throws during dispatch editing/source reveal.**
   Both upload orders capture an undefined-length `TypeError` at
   `completionResultRange`. The precise triggering payload is not isolated;
   editing and projections still complete.
5. **P2 — Narrow Inspector clips at large font size.** At 800×800 the
   underlying graph/Inspector and toolbar are clipped. The Builder modal
   itself fits, retains visible Apply/Cancel and returns keyboard focus.

## New coverage and verification

Seven J19 cases cover private Builder draft/Cancel/Apply/Undo, independent Data
conditions, both dispatch upload orders, a continuous ten-operation CDM body
with typed TypeScript/Python projections, curated read-only behavior, and
compact modal accessibility. Shared helpers reuse the pinned fixture integrity
loader and the local expression acceptance setup.

Six new cases pass; the curated projection case reproduces finding 2. All nine
axe scans have zero violations. All recorded operation timings remain within
budget. The curated closure maps three of three declarations and the scratch
closure five of five, matching the previous checkout with no truncation.
Scoped lint, formatting and test TypeScript compilation pass.

Coverage gaps remain: no cancellable curated-load window, fixed dark theme,
local J00 credential variables absent (freshness verified independently through
authenticated Cloudflare MCP), and no Safari or authenticated Git clone.
Telemetry persistence passes its ARIA assertion but its screenshot looks
unchecked; stabilize visual evidence before declaring a storage defect.
Cloudflare's bounded sample contains no Worker exception and cannot establish
the root cause of the client defects.

The local evidence bundle is `apps/studio/test/prod-ux/report/`: `REVIEW.md`,
the unmodified manifest, 85 screenshots, two retry traces, nine raw axe
results, deployment metadata, endpoint output and sampled Cloudflare logs.
The full review records per-journey verdicts and performance comparisons.
Archive: `dist/production-checkout/2026-10-09/evidence.zip`.
No product fixes or redeployment were performed by this checkout. Dirty user
files and existing browser tabs were preserved.
