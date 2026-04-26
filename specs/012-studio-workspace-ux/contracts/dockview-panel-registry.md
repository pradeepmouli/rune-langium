# Contract — Dockview Panel Registry

**Surface**: in-process. No HTTP. The contract is between the layout
serializer and saved `WorkspaceRecord.layout` blobs.
**Spec hooks**: FR-020–FR-026, FR-A01–FR-A05.

---

## Component names (locked v1 set)

```
workspace.fileTree           # left primary
workspace.editor             # centre tabbed editor (Monaco)
workspace.inspector          # right secondary; hosts z2f forms (US5)
workspace.problems           # bottom panel — diagnostics
workspace.output             # bottom panel — codegen output
workspace.visualPreview      # bottom panel — visual editor preview
```

Adding a new panel requires:

1. A new entry here with `since: <studio-version>`.
2. A default position in the layout-builder code so legacy
   `WorkspaceRecord.layout` blobs without it open in a sensible place.
3. An entry in the keyboard-shortcut table (FR-A02).

Removing or renaming a panel requires bumping
`WorkspaceRecord.layout.version` and writing an upgrade transformer that
either drops the panel or maps it to a successor.

---

## Layout JSON envelope

```ts
interface PanelLayoutRecord {
  /** Bumps on any breaking change to the dockview JSON shape. */
  version: 1;
  /** Studio version that wrote this layout (display only). */
  writtenBy: string;
  /** Raw dockview `api.toJSON()` output. */
  dockview: DockviewJSON;
}
```

`DockviewJSON` is whatever `dockview-react`'s `api.toJSON()` returns; we do
not redefine its shape. We DO assert that every `componentName` referenced
in it is in the registry above; unknown names are dropped with a console
warning.

---

## Reset-layout default

The "Reset layout" action (FR-023) replaces `layout` with a freshly-built
default produced by the layout-builder factory. The factory is also what
produces a layout for a brand-new workspace and what runs when a saved
layout's `version` is older than the current.

The factory output for the v1 baseline:

- Activity bar: workspace switcher + curated registry + settings (always present, not in dockview).
- Primary side panel: `workspace.fileTree`, expanded.
- Centre: `workspace.editor`, no tabs initially open.
- Secondary side panel: `workspace.inspector`, expanded *iff viewport ≥ 1280px* (FR-024).
- Bottom panel group: `workspace.problems` (active), `workspace.output`, `workspace.visualPreview` — collapsed by default on viewports ≤ 1280px.

---

## Keyboard contract (FR-A02)

Every component name above MUST register the following shortcuts (mac /
non-mac variants):

| Action | Mac | Other |
|---|---|---|
| Focus next panel | `⌃⌥→` | `Ctrl+Alt+→` |
| Focus prev panel | `⌃⌥←` | `Ctrl+Alt+←` |
| Resize active panel splitter (-) | `⌃⌥-` | `Ctrl+Alt+-` |
| Resize active panel splitter (+) | `⌃⌥=` | `Ctrl+Alt+=` |
| Toggle active panel collapse | `⌃⌥B` | `Ctrl+Alt+B` |
| Reorder editor tab left/right | `⌥⇧←/→` | `Alt+Shift+←/→` |
| Close editor tab | `⌃W` | `Ctrl+W` |
| Reset layout | command palette only | command palette only |

The resize step is one token (`spacing.4` = 16px) at a time; holding the
shortcut auto-repeats.

---

## Accessibility roles (FR-A03)

| Element | role | name source |
|---|---|---|
| Activity bar | `navigation` aria-label "Studio activity bar" | static |
| Side / bottom panel groups | `region` aria-label = first panel's title | dynamic |
| Tab strip | `tablist` orientation horizontal | static |
| Tab | `tab`, `aria-selected`, `aria-controls` | dynamic |
| Tab panel | `tabpanel`, `aria-labelledby` | dynamic |
| Splitter | `separator` aria-orientation horizontal/vertical | dynamic |

`axe-core` is run in CI with these roles asserted; missing roles fail merge.

---

## Backwards compatibility

The layout JSON's `version` field is the contract surface. Bumping it
requires a transformer in code that takes the old shape and produces the
new. We do NOT promise to *preserve* the user's customisations across
version bumps if a panel is renamed — the transformer drops them in favour
of the default position. We DO promise the user never sees an empty or
broken layout (FR-025).
