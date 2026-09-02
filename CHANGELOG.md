# Changelog

All notable changes to Meta Graph are documented here.

## [Unreleased]

### Added

- Added a per-chart **Scale text with zoom** option for Sigma views. Node and edge label fonts now use Sigma's same zoom-to-size rule without inheriting each node's individual size.
- Added unified transient node, logical-edge, and group selection. Native Sigma edge picking and the parallel-edge Canvas hit grid now select the same logical edge, including every segment of a Flow route; native and Canvas edge hover use the same zoom-aware emphasis.
- Added deterministic parallel lanes for multiple relationships between the same two notes. Directed, reverse, and undirected links now keep separate paths, labels, arrows, and 2D/3D/Cube/Flow/Arc/HEB rendering without changing the underlying metadata.
- Added a DPR-aware Canvas overlay for Sigma parallel edges, including compact endpoint routes, rounded solid/patterned lines, arrows, labels, hover/click hit testing, viewport culling, and cached paths.
- Added centralized graph actions with Obsidian command-palette entries, shortcut help, viewport shortcuts, selected-node open/focus shortcuts, and consistent keyboard behavior across note lists.
- Added transaction-safe connection Redo with toolbar, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y` access.

### Changed

- Renamed **Text style** to **Label settings**, moved Arc **Label angle** out of Graph settings, and centralized **Always show labels** in the label panel for every chart type.
- Changed graph node interaction to single-click selection and double-click open across 2D, 3D, and Cube renderers. Existing `Ctrl`/`Cmd`-drag connection editing remains available; no Connection tool mode was added.

### Fixed

- Kept pinned and hovered Sigma labels above the highlighted-node WebGL layer, so centered labels remain readable while a neighborhood is pinned.
- Fixed Sigma **Text position: Center** falling through to the right-side layout. Graph and Flow labels now center both their text and background box on the node.
- Prevented Sigma's synchronous constructor render from reading the renderer instance before assignment when **Scale text with zoom** is enabled, including transitions back from 3D views.
- Unified Sigma parallel-edge Canvas line widths and arrow bounds with native Sigma's pixel geometry and visible ink coverage. Canvas now uses Sigma's zoom scaling, minimum edge thickness, inward feather compensation, and full device pixel ratio; native solid and patterned arrow lines share the same antialiasing feather. Arrow geometry, dash spacing, compact lane spacing, deterministic Chevron fills, and independent hit widths remain consistent.
- Replaced the keyboard shortcut overlay with a grouped side-by-side reference panel that keeps the graph interactive while open.
- Made `Space` pin or unpin the hovered node's neighborhood; with no hovered node it clears the current pinned focus.
- Kept Flow arrows on the final flow-axis corridor segment when parallel lanes use endpoint branches, preventing RL/LR arrows from pointing vertically into nodes.
- Reduced direct Graph parallel-lane spacing so two-way links stay visually compact while remaining distinguishable.
- Fixed Flow Orthogonal routes that became diagonal at node ports or inside the parallel-edge Canvas overlay. ELK routes are normalized into axis-aligned segments, parallel lanes reuse the normalized route, and arrows/labels/hit testing follow the same geometry.
- Fixed the Flow corner-radius setting not reaching parallel-edge Canvas routes. Parallel lanes now reuse the sampled rounded base route and offset its local tangents, so their corners keep the configured radius.
- Fixed parallel Curve routes falling back to orthogonal Canvas geometry. Flow segments now carry a route kind, and Curve lanes reuse the sampled curve route with tangent-based offsets.
- Fixed parallel Curve endpoints acquiring a right-angle hook and vertical arrows. Curve lanes now use smooth endpoint transitions and the saved Flow direction for arrow orientation.
- Fixed parallel Flow lanes entering node tops or bottoms when lane offsets approached node radii. All Flow route kinds now use side-center ports with external fan-out/fan-in branches.
- Kept Orthogonal and Rounded parallel lanes on the configured Flow axis for undirected edges too, so RL/LR routes cannot fall back to vertical node ports when node spacing is diagonal.
- Restored Sigma's native programs for ordinary single edges and moved only multi-edge pairs to the compact Canvas overlay, avoiding custom-shader aliasing and seam artifacts without expanding graph coordinates or layout bounds.

## [1.5.3] - 2026-09-02

### Added

- Added configurable link visuals for defaults, overrides, and rules: Line color, width, opacity, and Solid/Dashed/Dotted/Dash-dot patterns; Arrow Filled/Chevron styles with adjustable size. Chevron renders as hollow two-wing arrows.
- Added topology-safe Bundled Flow line routing, which shares corridors only for same-source fan-out or same-target fan-in edges and keeps unrelated crossings separate.
- Added Curve Flow line routing with ELK polyline avoidance and deterministic smooth bend approximations.
- Added configurable Orthogonal Flow corner radius; zero keeps sharp corners while larger values soften 90-degree turns without changing ELK's routing.
- Bundled Flow now uses the same corner radius setting for shared corridors and endpoint branches.
- Added Paired connections for asymmetric metadata relationships: Ctrl-drag writes a source property and a distinct target property as one atomic, undoable connection, while indexing both halves as one logical edge.
- Added configurable note opacity for workspace defaults, chart overrides, unresolved nodes, and note style rules.

### Changed

- Refreshed the workspace UI with a unified Quiet Workbench visual system: polished flat toolbar settings, consistent surfaces and controls across dock, curated, inspector, and connection panels, plus container-aware narrow-pane behavior.
- Refined Curated workspace file rows with non-clipping controls and a compact inline Group picker that keeps ownership clear without adding a second line.
- Consolidated settings controls into reusable Svelte sections, rows, grids, sliders, toggles, dropdowns, colors, text inputs, and segmented controls across graph, text, group, node, and link settings.
- Changed note shape selection to an icon-based tiled control for faster visual comparison; shape names remain available through accessible labels and tooltips.
- Reorganized connection controls into a compact left-side action group followed immediately by relationships; single-row mode scrolls overflow, while multi-row mode stays identical until chips actually wrap beneath the actions. Their controls now use one-line and multiple-line icons. The connection editor places Connection type first, groups Source and Target fields, shortens field labels, and widens type options.
- Redesigned the Connection panel with persistent single-row and wrapped multi-row layouts, compact one-click relation chips, wheel and button scrolling, a combined metadata/direction editor, and context-menu management.
- Moved connection Undo to the graph toolbar and made Ctrl-drag guidance follow the pointer instead of occupying the Connection panel.

### Fixed

- Restored the toolbar zoom slider after the visual refresh and kept it aligned with the zoom buttons and editable percentage input.
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
