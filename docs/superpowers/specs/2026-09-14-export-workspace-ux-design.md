# Export workspace UX design

Status: proposed interaction details for the user's requested layout; implementation pending.

Companion to the [Prototype workspace UX design](2026-09-14-prototype-workspace-ux-design.md). Both perspectives reuse Explore's shell and panel mechanics with task-specific content.

## Layout

```text
Export · Selection summary · Generate · Download
┌────────────────────────────────┬──────────────────────┐
│ Type explorer                  │ Export settings      │
│ Search · Kind filters          │ Target               │
│ Namespace/type checkboxes      │ Layout               │
│ Selected + required items      │ Target options       │
├────────────────────────────────┴──────────────────────┤
│ Generated files · Code preview · Diagnostics           │
└───────────────────────────────────────────────────────┘
```

The shared type explorer selects what to export. Settings remain visible on the right. Generated output occupies the lower pane, with a file selector and read-only code preview. Reuse Dockview resizing, panel controls, layout persistence, and constrained-width behavior. No separate settings dialog should be required to download the configuration already shown on screen.

## Source selection

Extend the existing type explorer with an export selection mode, preserving its authoritative namespace/type inventory, search, kind filters, and deferred-loading behavior. Keep export inclusion separate from Explore visibility and navigation selection: clicking a row can focus it, while its checkbox changes inclusion.

- Support namespace selection and individual declaration selection, with indeterminate parent checkboxes.
- Distinguish explicitly selected roots from automatically included dependencies. Explain why a required item is included and which selected root requires it.
- Use the existing authoritative dependency closure, including cross-bundle references. Do not implement a second closure approximation in the UI.
- Search/filter does not silently clear selections. Label bulk actions precisely, such as “Select visible results” and “Clear selection.”
- Show a summary of selected roots and required dependencies, accounting for deferred resolution rather than presenting guessed counts as final.
- A focused type and the export selection are different concepts; changing focus must not silently change the exported set.

The current ExportPerspective passes namespaces to the download router. Individual-type selection therefore requires extending the authoritative generation/packaging contract and closure handling. It must not be simulated by showing type checkboxes while exporting entire namespaces, or by deleting generated code after generation. Until supported, disclose namespace-level granularity honestly.

## Settings and output

The right panel owns target, layout, and applicable target options. Reuse existing option schemas and controls. Retain supported settings per target without applying irrelevant settings to other targets.

Preview and download must share one export configuration and the same generated result identity: selected roots, dependency closure, target, settings, and source revision. Changing any input marks the displayed result out of date. An older asynchronous result must never replace a newer result or be downloaded as if it represented current settings.

For large curated selections, explicit Generate provides predictable work and progress. Automatic preview can be considered for small selections later. Download should use the current generated artifact, or explicitly regenerate the current configuration before delivering it; it must never silently download a different selection from the preview.

The lower pane supports browsing generated file paths, viewing code, copying the active file, and inspecting diagnostics. Multi-file output must be navigable rather than showing only the first file. Non-text targets such as Excel need an honest output summary or suitable structured preview, not an empty code editor presented as failure.

Generation failures preserve visible diagnostics and offer retry. Required dependencies, warnings, generation status, and stale results remain distinguishable. Error and activity messages use the shared logging/notification path.

## Navigation

Explore's export action can open this perspective with the current type or namespace explicitly preselected. When type-level export is unavailable, show the namespace expansion before generation. Returning to Explore preserves its previous context. Export selection and settings are scoped to the workspace and restored when switching perspectives.

## Current evidence and acceptance

Live inspection on September 14 showed a target/action table above an empty preview. Source inspection of ExportPerspective confirmed preview is read from the shared codegen snapshot while Download opens a separate DownloadConfigDialog for namespaces/layout/options. This design proposes a unified configuration; no current preview/download mismatch was asserted without reproducing one.

Verify: selecting a namespace; selecting individual types with dependencies; cross-bundle closure; changing filters without losing selection; switching targets/settings; inspecting multiple output files; changing sources during generation; failure/retry; workspace switching; and downloading an artifact that matches the current preview/configuration. Validate actual downloaded code for representative targets, and use a summary appropriate to binary targets. Reuse existing generation and closure implementations throughout.
