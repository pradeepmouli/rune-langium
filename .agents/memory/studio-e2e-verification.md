---
name: Studio e2e verification in Replit
description: How to browser-verify studio features here — local Playwright can't launch; reference models don't hydrate; use blank workspace + pasted source.
---

# Verifying studio UI features in this environment

1. **Local Playwright e2e specs cannot run**: downloaded Chromium fails with `libglib-2.0.so.0` missing (NixOS lacks system libs). Don't waste time on `npx playwright install` — use the testing subagent (`config: { $kind: "testing" }`) instead.
2. **CDM/FpML reference models won't hydrate locally**: the pages functions fetch `https://www.daikonic.dev/curated/<bundle>/manifest.json`, which 404s (curated bundles not published), so `/api/parse` for bundle loads returns 502 and models stay "(loading…)". This is upstream/infra, not a code bug.
3. **Working test path**: create a blank workspace, paste a small Rune DSL snippet (`namespace demo.model : <"Demo">` / `type Trade: <"…">` with `attr type (1..1)` rows), wait for "No problems detected", then Explore → double-click a Data type → center-pane "Structure" segment (`[data-testid="structure-view-flow"]`).

**Why:** two sessions have burned time rediscovering both dead ends before finding the blank-workspace route.
**How to apply:** any time browser verification of Explore/Structure/Graph features is needed.
