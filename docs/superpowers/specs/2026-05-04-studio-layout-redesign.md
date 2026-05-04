# Rune Studio Layout Redesign — Design Spec

**Goal:** Reshape the Studio's dockview-based panel layout to match the Daikonic design prototype — a 4-zone IDE (activity rail · explorer+graph · source/inspector · code+form) with a unified top bar, bottom dock, and status bar — while retaining dockview's resize capabilities.

**Reference design:** `/tmp/design-bundle/contents/rune-langium/project/Rune Studio - Daikonic.html`

---

## 1. Overall Layout Grid

The design has five distinct zones. We reconfigure dockview's factory layout to produce this arrangement:

```
┌──────┬──────────────┬─────────────────────┬────────────┐
│      │   Top Bar (full width)                          │
│ Rail ├──────────────┬─────────────────────┬────────────┤
│ 52px │ Explorer     │ Center Stack        │ Right Col  │
│      │ 248px        │ 1fr                 │ 360px      │
│      │              │ [Graph|Source|Insp]  │ [Code|Form]│
│      │              │ pill switcher above  │ tab header │
│      ├──────────────┴─────────────────────┴────────────┤
│      │   Bottom Dock (Problems / Activity / Output)    │
├──────┴─────────────────────────────────────────────────┤
│   Status Bar (full width, 24px)                        │
└────────────────────────────────────────────────────────┘
```

**What changes in dockview:**
- Column 1 becomes explorer-only (graph moves to center stack)
- Column 2 becomes the center workspace stack with graph, source, and inspector as switchable panes behind the 3-segment pill
- Column 3 stays as code + form preview tabs
- Bottom group unchanged (problems + output)
- All panel groups get `border-radius: var(--radius)` (12px at the group level)

## 2. Activity Rail (Left)

The design's left rail is a narrow (52px) icon column outside dockview. The current `ActivityBar.tsx` already exists but uses text labels. Redesign to:

- **Icon-only buttons** using lucide-react icons: `Files`, `Network` (graph), `Search`, `Database` (models), `Settings`
- Active state: accent pip on the left edge + highlighted icon
- Brand mark at top (uses existing `.studio-brand__mark` — the banded gradient in Daikonic theme)
- Notifications + Settings at bottom, separated by a spacer
- Rail is outside dockview (already the case) — no layout changes needed for this

## 3. Top Bar Redesign

Current header is a simple `brand + workspace name + export buttons`. The design expands this to a full IDE top bar.

**Left section:**
- Brand mark + "Rune Studio" wordmark (already styled with Outfit 13.5px / 600)
- Vertical divider
- Workspace switcher button showing `workspaceName · branch` with chevron

**Center section:**
- File tabs strip showing open `.rosetta` files with:
  - Dirty indicator (dot)
  - Error/warning badge (numeric chiclet)
  - Close button (appears on hover)
  - "+" button to add a new file
- This is a future enhancement — currently Studio operates on a single-file-at-a-time model. **Ship the top bar first without file tabs; add them later.**

**Right section:**
- `⌘K` search trigger button (styled as a bordered input with placeholder text + kbd shortcut)
- Vertical divider
- Icon buttons: Validate (checkmark), Export (download), Share
- **Generate** button — primary accent fill, bold text, the most prominent action
- Vertical divider
- Avatar circle (user initials)

**Implementation note:** The ⌘K palette itself is a future enhancement. For now, the trigger button is decorative (or wired to the existing search if available). Generate button triggers codegen worker.

## 4. Center Workspace Stack

This is the biggest structural change. Currently the graph lives in column 1 (below the explorer). In the design, it's the primary content of the center area, switchable with Source and Inspector via the 3-segment pill.

**Structure:**
- **Stack header bar (38px):** contains the paneswitch pill (Graph · Source · Inspector) **left-aligned**, with utility buttons at the right (currently: Fit View, Re-layout, Focus, Grouped, Filter — these become an overflow `···` menu or a toolbar row below the pill when graph is active)
- **Pill font:** `var(--font-sans)` (Inter), not Outfit. Outfit is reserved for the brand wordmark only.
- **Active pane(s):** fills the remaining space. Only one pane active at a time (single-select pill, not multi-select)

**Graph pane:**
- Dot grid background: `radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1.5px)` at 22px spacing
- Graph controls as floating overlay at bottom-right (zoom ±, fit-to-view, lock) — matching the design's glass-panel controls
- Legend overlay at bottom-left
- Layout direction driven by **viewport aspect ratio**: `LR` when pane is wider than tall, `TB` when taller than wide, using a ResizeObserver on the graph container
- Focus mode auto-isolates on selection (already implemented)

**Source pane:**
- The existing SourceEditor (CodeMirror) fills the pane
- A meta bar above shows the file path + line/col info

**Inspector pane:**
- The existing EditorFormPanel, but with **tabbed subsections**: Members · Conditions · Doc · Meta
- Tab bar styled as the design's `rs-insp-tabs` (bottom-border accent underline on active)
- Members tab: attribute list with kind glyph, name input, type reference, cardinality select
- Conditions tab: condition name + expression textarea
- Doc tab: documentation textarea with markdown hint
- Meta tab: read-only metadata grid (namespace, kind, cardinality, references, annotations)
- **Z2F integration for the tab structure:** If `@zod-to-form` can generate a tabbed layout from a discriminated schema, use it. Otherwise, implement tabs directly in `EditorFormPanel.tsx` using shadcn `Tabs` component — this is simpler and more reliable.

## 5. Right Column (Code + Form Preview)

Currently code and form preview are tab siblings in a dockview group. The design adds a more polished tab header.

**Tab header (38px):**
- Two tabs: Code · Form Preview, with icon glyphs
- Active tab: accent underline, highlighted text
- When Code is active: target switcher segment (TS · Java · Py · JSON) appears in the header's right area
- Close button at far right

**Content:** Existing `CodePreviewPanel` and `FormPreviewPanel` render below — no content changes.

## 6. Bottom Dock

Existing problems + output panel. The design adds Activity and Terminal tabs but those are non-functional mockups — we keep just Problems + Messages (already present) and add Output tab.

**Tab header styling:**
- Bottom tabs match the design's `rs-bottom-tabs` pattern: text-only, accent underline on active
- Error/warning chiclets appear next to "Problems" label

## 7. Status Bar

Existing `StatusBar.tsx` already shows workspace, git state, LSP, and telemetry toggle. The design adds more detail:

- Left: workspace name · git sync state · LSP connection state with colored dot
- Right: encoding · spaces · rosetta version · diagnostics toggle

We augment the existing component with the additional fields. Font switches to `var(--font-mono)` at 11px.

## 8. Explorer Type Row Redesign

Current type rows use a lucide icon + plain text name. The design uses a **colored single-letter glyph** in a tinted rounded square plus a **kind label text pill** at the right.

**New type row layout:**
```
[visibility toggle] [D] TradableProduct              Record
                    ↑ colored letter glyph            ↑ kind label (plain text pill)
```

- **Glyph:** 18×18px rounded square (`border-radius: 5px`), tinted background using the kind color at 12% opacity, letter in the kind color at full saturation. Letters: `D` (data), `C` (choice), `E` (enum), `F` (func), `R` (record), `A` (annotation/alias), `B` (basic type).
- **Name:** 12px, truncated, clickable (navigates to node).
- **No kind label text** — the colored letter glyph already conveys the kind. Removing the right-aligned label keeps rows compact.
- **Selected row:** Highlighted with accent wash background + accent pip on the left edge (matching the design's `rs-type-row.is-focus` treatment).
- The colored glyph is **explorer-only** — the existing text-pill `ENUM`/`TYPE`/etc. badges used elsewhere in the graph and inspector are retained as-is.

## 9. Panel Group Styling

All panel groups in dockview get:
- `border-radius: var(--rs-r-lg)` (12px)
- `border: 0.5px solid var(--border)`
- `background: var(--card)`
- `overflow: hidden` (so content doesn't bleed past rounded corners)

The dockview theme variables already partially support this. We extend the `.dockview-theme-abyss` overrides in `styles.css`.

## 10. Test Cleanup

Remove these tests that assert rigid viewport-specific layout proportions which will break with the new layout and aren't meaningful behavioral guarantees:

| Test | File | Why remove |
|------|------|-----------|
| `editor column gets ≥70% of horizontal area at 1280px (SC-005)` | layout-factory.test.ts | Rigid percentage assertion |
| `chrome vertical budget at 1280×800 leaves ≥85% of height (SC-006)` | layout-factory.test.ts | Rigid percentage assertion |
| `bottom utilities start collapsed at viewport ≤ 1280px (FR-024)` | layout-factory.test.ts | Viewport-specific behavior |
| `collapses the bottom utilities at viewport ≤ 1280px (FR-024)` | dockview-bridge.test.ts | Duplicate viewport assertion |
| `at 1280px the editor area is the dominant slot` | viewport.test.tsx | Viewport-specific layout |
| Entire `layout proportions at 1280×800` describe block | layout-factory.test.ts | Wraps the two SC tests |

**Keep** all non-viewport tests: panel registration, layout serialization, migration, keyboard shortcuts, ARIA roles, dirty markers.

## 11. What's NOT Changing

- **Form preview content** — too many issues to address now; layout shell changes only
- **Multiple open file tabs** — include if implementation is straightforward. The top bar shows open `.rosetta` files as tabs with dirty indicator, error/warning badge, and close-on-hover. The `activeEditorFile` state and `openFileInSource()` mechanism already exist; the tab strip is pure UI over existing state.
- **⌘K command palette** — future enhancement, trigger button is decorative
- **Activity rail panel switching** — clicking rail icons will eventually switch the explorer panel content; for now they're visual-only
- **Terminal tab** — listed in design but non-functional
- **Graph node visual redesign** — existing `RuneTypeNode` component keeps its current look; the prototype's `rs-gnode` styling is for reference only, not ported
- **Tweaks panel** — dev-only feature from the prototype, not ported

## 12. Font & Color Tokens

No new tokens. The redesign uses the existing design-system tokens:
- `--font-display` (Outfit) for the brand wordmark **only**
- `--font-sans` (Inter) for body text
- `--font-mono` (JetBrains Mono) for code, metadata, and status bar
- All color tokens from `theme.css` / `daikonic.css` — no new values

## 13. Migration Path

The layout version (`LAYOUT_SCHEMA_VERSION`) bumps from 2 → 3. Existing users with saved layouts get a migration notice ("Layout has been updated") and their layout is rebuilt from the new factory shape. The migration sanitizer already handles this case (it rebuilds when the version doesn't match).
