# Prototype workspace UX design

Status: agreed interaction direction; implementation pending.

This design follows the September 14 production review of commit `8c267ab3` and the subsequent layout discussion. It updates the workspace composition and navigation in the [Phase 1 design](2026-07-13-prototype-workspace-phase1-design.md). Existing persistence and shared codegen contracts remain authoritative; historical implementation descriptions must be checked against current source.

## Purpose

Prototype supports finding saved instances, editing and validating them, and trying functions with explicit inputs. Reuse Explore's shell and layout mechanics rather than maintaining a separate sidebar-and-tabs shell.

## Layout

```text
Type selector · New instance · Import · Export
┌──────────────────────┬──────────────────────────┐
│ Graph (optional)     │ Inspector                │
│                      │ Instance name/type/status│
│                      │ Form / Functions         │
│                      ├──────────────────────────┤
│                      │ Payload / Result         │
├──────────────────────┴──────────────────────────┤
│ Instance grid · Search · Filters                │
└─────────────────────────────────────────────────┘
```

The default is Inspector above and grid below. Graph can join Inspector in the center or occupy that area independently using Explore's pane controls. Reuse Dockview resizing, layout persistence, reset controls, and responsive behavior. The grid is resizable and collapsible; no separate instance sidebar is needed.

Keep workspace-wide diagnostics and activity in shared utilities. Payload belongs with the Inspector and must identify whether it represents the instance, function inputs, or a result.

## Selection and discovery

- Reuse the shared type selector for the creation picker and grid type filter, with appropriate supported-kind filtering.
- Mixed-type grid columns show instance name, type, validation, and save/update state. Filtering to a type permits relevant field columns.
- Grid and graph share instance selection. Selecting either focuses the same Inspector; form edits update the grid, payload, and any graph summary.
- Preserve selected instance, active Inspector tab, and layout per workspace when navigating away and back.
- Filtering does not silently discard the inspected instance. Indicate when it is outside the active filter.
- Graph edges must represent actual instance relationships. A payload's nested-object graph must be identified as such; schema dependencies must not masquerade as links between saved instances. Detailed reference semantics are follow-on work.

## Inspector

Keep instance name, type, save status, and validation summary visible across Form and Functions. Offer record actions such as rename, duplicate, delete, and JSON import/export through consistent controls. Link validation errors to fields and use domain-level required/cardinality hints rather than exposing validator internals as the primary guidance.

Form edits the persistent instance through the existing authoritative schema and validation pipeline. Display saving, saved, and failed states accurately. Do not describe persisted values as an in-memory sample.

Functions has an explicit function selector and input ownership. Prefer applicable functions while allowing broader search. Show the parameter bound to the selected instance, with editors for other inputs. Execution results are separate from the instance; saving a supported result as an instance is explicit. Do not inherit an unrelated Explore preview selection.

Payload is collapsible and resizable. Form mode shows instance JSON; Functions distinguishes Inputs and Result. Provide copy/export without duplicating the same JSON in another Inspector tab.

## Navigation from Explore and previews

**Create instance…** in Form Preview carries the selected type and current values into a naming step with a sensible default. Confirmation creates and persists an instance, opens Prototype, selects its grid row, and focuses the Inspector.

- A blank preview creates an empty instance.
- Invalid values are preserved with their diagnostics so editing can continue in Prototype.
- Type explorer/type Inspector offers **New instance…** using that type.
- A function result offers **Save as instance…** when its output resolves to a supported instance type.
- **Open in Prototype** is reserved for values already associated with a saved instance, preventing navigation from creating duplicates.
- **View type in Explore** beside the instance type provides the return path. Each perspective retains its own selection and layout.

## Correctness prerequisites

The production review reproduced a saved curated Address that retained its values after reload but could not render or validate until its type was visited in Explore. Selecting an instance must load its type/dependencies without that detour, expose a recoverable loading/error state, and revalidate when schema availability changes. Previously unavailable validation must not remain stale until another edit.

The review also observed Function rendering Explore's independent Address sample. Function selection and values must be explicit and independent of unrelated Explore state. Reuse shared form, execution, hydration, and persistence services; do not implement parallel semantics to repair these UI boundaries.

## Implementation order and acceptance

1. Fix curated reload/hydration/revalidation and function-context ownership.
2. Reuse the shell with Inspector above and grid below; add shared type selection, stable instance identity, lifecycle actions, and truthful save feedback.
3. Add preview-to-instance and return navigation, preserving values and perspective state.
4. Add graph presentation once its instance relationship semantics are defined.

Verify complete journeys: preview→create→edit→reload→resume; invalid preview→instance→correct; grid/graph selection synchronization; filter while inspecting; leave/return without losing context; function binding→execute→save result; save failure and retry. Include curated types and nested data, not only a fully loaded one-type fixture. Verify both wide and constrained layouts using the production checkout guidance.
