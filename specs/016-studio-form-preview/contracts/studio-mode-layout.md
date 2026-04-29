# Contract: Studio Mode Layout

## Purpose

Defines the user-facing Studio surface groups introduced by this feature. Internal component IDs may remain implementation details, but user-visible labels must follow this contract.

## Mode Groups

| Mode | Position | Surfaces | Notes |
|------|----------|----------|-------|
| Navigate | Full left side | Files, Model Tree | Workspace and model navigation |
| Edit | Middle | Source, Structure | Primary authoring surfaces |
| Visualize | Top-level mode | Graph, relationship filters, graph layout controls | Must not be labelled as generated preview |
| Preview | Full right side | Form, Code | Generated artifacts for selected model/type |
| Utilities | Bottom auto-hide | Problems, Messages | Expands when actionable or explicitly opened |

## Label Requirements

- The graph surface must not be labelled `Preview`.
- Generated code must be labelled `Code` within the Preview group, not as an unrelated bottom tab.
- Generated form must be labelled `Form` within the Preview group.
- Existing Source and Structure editing must remain distinguishable.
- Problems and Messages may remain nouns because they are utility outputs, not primary modes.

## Layout Requirements

- Fresh desktop layout at 1440x900: Navigate left, Edit middle, Preview right, Visualize reachable as top-level mode, Utilities collapsed by default unless actionable.
- Fresh compact desktop layout at 1280x800: no horizontal overflow; Source and Structure remain usable; Preview remains reachable.
- Reset Layout restores this mode arrangement.
- Preserving older customized persisted layouts is out of scope.
