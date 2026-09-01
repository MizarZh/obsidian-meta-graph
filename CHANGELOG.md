# Changelog

All notable changes to Meta Graph are documented here.

## [Unreleased]

### Added

- Added configurable link visuals for defaults, overrides, and rules: Line color, width, opacity, and Solid/Dashed/Dotted/Dash-dot patterns; Arrow Filled/Chevron styles with adjustable size. Chevron renders as hollow two-wing arrows.
- Added Paired connections for asymmetric metadata relationships: Ctrl-drag writes a source property and a distinct target property as one atomic, undoable connection, while indexing both halves as one logical edge.
- Added configurable note opacity for workspace defaults, chart overrides, unresolved nodes, and note style rules.

### Changed

- Consolidated settings controls into reusable Svelte sections, rows, grids, sliders, toggles, dropdowns, colors, text inputs, and segmented controls across graph, text, group, node, and link settings.
- Changed note shape selection to an icon-based tiled control for faster visual comparison; shape names remain available through accessible labels and tooltips.
- Reorganized connection controls into a compact left-side action group followed immediately by relationships; single-row mode scrolls overflow, while multi-row mode stays identical until chips actually wrap beneath the actions. Their controls now use one-line and multiple-line icons. The connection editor places Connection type first, groups Source and Target fields, shortens field labels, and widens type options.
- Redesigned the Connection panel with persistent single-row and wrapped multi-row layouts, compact one-click relation chips, wheel and button scrolling, a combined metadata/direction editor, and context-menu management.
- Moved connection Undo to the graph toolbar and made Ctrl-drag guidance follow the pointer instead of occupying the Connection panel.

### Fixed

- Dimmed unrelated group overlays and layout halos to neutral gray while a node is hovered or focused, while keeping the active node's group highlighted.
- Improved reusable settings spacing and slider sizing: controls now use the available panel width, with consistent section gaps, aligned label/control rows, and compact two-column groups for related fields. Compact groups now keep each label and control on one line.
- Improved hollow Chevron arrows with clearer, wider wings and matching preview/Cube rendering.
- Updated Connection chip cursors to use a pointer on hover and a grabbing hand only during reordering.
- Removed duplicate slider readouts in settings; each setting now shows one synchronized value, while the standalone Display control keeps its built-in value.
- Anchored the Add connection editor directly above its `+` button regardless of transformed workspace containers, and kept the collapsed panel button at the same left-side position as its expanded counterpart.
- Prevented the Add connection editor from being clipped by the multi-row panel's scroll boundary.
- Kept single-row and multi-row Connection panel controls visually identical while all relationships still fit on one line.

## [1.5.2] - 2026-09-01

### Added

- Added toolbar zoom controls with smooth 10% step buttons, a continuous slider, editable percentage input, and synchronized zoom levels across 2D, 3D, and Cube views.
- Added `Ctrl+F` / `Cmd+F` shortcut to focus **Find note** and select the current search text.
- Added direction-aware arrows to `Ctrl`-drag connection previews: one-way points to the target, two-way points at both ends, and reverse points to the source.
- Added chart style copy/paste controls for moving node and link styles between charts.
- Added per-rule actions to move note and link style rules between global and chart scopes.
- Added configurable note shapes (circle, square, diamond, triangle, hexagon, and star) for defaults, overrides, and style rules.

### Fixed

- Removed the slider's duplicate built-in zoom readout so the editable percentage input remains the single synchronized zoom value.
- Made Curated note visibility controls respond before graph work, update only affected graph items, keep drag-list identities stable, and defer autosave serialization instead of blocking the click.
- Kept Curated panel contents mounted while collapsed and removed its width animation to avoid rebuilding and repeatedly reflowing large file lists when reopened.
- Kept graph hover state out of workspace updates so expanded Curated panels no longer rebuild their full file list while showing local links.
- Fixed 3D graph nodes staying at the origin instead of following force-layout coordinates.
- Fixed 3D graph note shape changes not rebuilding custom node sprites.
- Query charts now default to showing all configured relations and refresh after connection-field edits.
- Fixed rule-only Arc group updates being discarded.

## [1.5.1] - 2026-07-25

### Added

- Added Large vault mode with cooperative incremental indexing and performance debugging.
- Added explicit, add-only connection-field specifications with one-way, two-way, and reverse link modes.

### Fixed

- Preserved shared and per-view filter root modes when decoding workspace format v2 files.
