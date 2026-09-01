# Changelog

All notable changes to Meta Graph are documented here.

## [1.5.2] - 2026-09-01

### Added

- Added Paired connections for asymmetric metadata relationships: Ctrl-drag writes a source property and a distinct target property as one atomic, undoable connection, while indexing both halves as one logical edge.
- Added toolbar zoom controls with smooth 10% step buttons, a continuous slider, editable percentage input, and synchronized zoom levels across 2D, 3D, and Cube views.
- Added `Ctrl+F` / `Cmd+F` shortcut to focus **Find note** and select the current search text.
- Added direction-aware arrows to `Ctrl`-drag connection previews: one-way points to the target, two-way points at both ends, and reverse points to the source.
- Added chart style copy/paste controls for moving node and link styles between charts.
- Added per-rule actions to move note and link style rules between global and chart scopes.
- Added configurable note shapes (circle, square, diamond, triangle, hexagon, and star) for defaults, overrides, and style rules.

### Changed

- Reorganized the connection editor with Connection type first, grouped Source and Target fields, shorter field labels, and wider connection-type options.
- Redesigned the Connection panel with persistent single-row and wrapped multi-row layouts, compact one-click relation chips, wheel and button scrolling, a combined metadata/direction editor, and context-menu management.
- Moved connection Undo to the graph toolbar and made Ctrl-drag guidance follow the pointer instead of occupying the Connection panel.

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
