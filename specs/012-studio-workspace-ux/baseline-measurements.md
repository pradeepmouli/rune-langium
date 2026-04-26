# Baseline measurements (T084)

Captured before Phase 6 lands cross-app design-token wiring + chrome
reduction. Re-measured after T091 / T077 land to verify SC-005 / SC-006.

## Chrome-vertical-pixel budget at 1280×800 (Studio)

Measured against `master` at commit `109353e` (pre-Phase-1) using the
following methodology:

1. Open `https://www.daikonic.dev/rune-studio/` at 1280×800.
2. From DevTools, measure the y-coordinate of the bottom edge of the
   topmost editor pane and the top edge of the bottom-most non-editor
   chrome.
3. `chrome_vertical = top_chrome_height + bottom_chrome_height`.
4. `editor_vertical_ratio = (800 - chrome_vertical) / 800`.

| Metric | Baseline | Target (post-T091) |
|---|---|---|
| Top chrome (header / nav) | ~64 px | ≤ 48 px |
| Bottom chrome (status / footer) | ~32 px | ≤ 24 px |
| Total chrome | **~96 px (12.0%)** | ≤ 72 px (9.0%) |
| Editor vertical | ~704 px (88.0%) | ≥ 728 px (91.0%) |

SC-006 requires a ≥ 25% drop in chrome budget — `96 → ≤72` satisfies that
(96 × 0.75 = 72).

## Editor horizontal share at 1280×800

| Metric | Baseline | Target |
|---|---|---|
| File tree width | ~280 px | 240 px (default) |
| Inspector width (when expanded) | ~360 px | 320 px (default), collapsed at 1280px |
| Editor horizontal | ~640 px (50.0%) | ≥ 896 px (70.0%) |

SC-005 requires editor area to be ≥ 70% of horizontal at 1280×800. The
small-viewport defaults from layout-factory.ts already encode this:
inspector starts collapsed at ≤ 1280px so the editor + file tree + ~40px
splitters add up to roughly 1240px usable, leaving editor ≈ 1000px ÷ 1280
= 78%.

## Notes

These numbers are approximations from manual DevTools inspection of the
deployed app at `master`. Phase 8 verification will re-measure with a
Playwright-driven harness (T117–T119) so the comparison is reproducible.
