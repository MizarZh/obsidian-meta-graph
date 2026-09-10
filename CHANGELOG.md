# Changelog

All notable changes to Meta Graph are documented here.

## [Unreleased]

### Added

- Added per-chart Straight/Curved parallel edges for Sigma Graph views. Curved lanes share geometry for drawing, arrows, labels and picking; changing the setting does not rerun layout. Existing charts default to Straight and G6/other chart modes remain unchanged.

- Split G6 force scheduling diagnostics into animation-frame wait and draw-queue wait, retaining the total wait metric.

- Added `simulationSolve` to opt-in Sigma/G6 performance logs, separating actual D3 force evaluation and integration from pointer-driven position publication.

- Extended opt-in G6 performance logs with translation-stage timings, actual position fast-path hit/fallback counts, per-metric totals and compatibility warnings. Instrumentation restores original methods when disabled.

- Added an opt-in global Performance logs setting for Sigma and G6. Five-second console summaries report scene counts, submission/render timings and active redraw intervals without note content or paths; changing the toggle immediately attaches or removes instrumentation on open graphs.

- Added Reset forces and concise guidance for Graph's four force controls. Sigma and G6 share the original ForceAtlas2 placement and D3 interaction simulation.

- Added the global Node hover setting for planar Sigma/G6 views: Emphasize only preserves the surrounding graph, while Local focuses the neighborhood. Changes apply to open views immediately; Space pin always retains local focus.

- Enabled G6 for HEB charts. HEB now publishes one renderer-neutral bundled route per relationship, G6 renders each route as one logical Polyline without bend elements, and radial Group sectors render through the shared viewport layer with selection, hover, focus muting, hit testing, and member halos.

- Added a faint, non-interactive canvas badge showing the active planar rendering engine (Sigma.js or G6), positioned to avoid the Curated and Connection panels.

- Enabled G6 for Flow charts. Curve, Orthogonal, and Bundled layouts now publish one renderer-neutral logical route per relationship; G6 renders that route as one Polyline without bend elements, while Straight keeps its native line representation. Flow container geometry now renders in the G6 Group layer with selection, hover, focus muting, dock highlighting, and member halos.

- Enabled G6 for Arc charts. Arc layout now publishes renderer-neutral logical routes; G6 renders each route as one registered Polyline element without bend nodes or duplicate parallel routing. Arc label rotation/direction map to G6 label transforms and stay live during display-setting updates.

- Enabled G6 selection for Free charts, with graph-coordinate node dragging and canonical manual-position/group-drop commits. G6 refresh now synchronizes changed node positions; manual group frames support movement previews and corner resizing.

- Generalized chart renderer selection and persistence to all planar chart types. New-mode UI choices remain gated until their rendering adapters are complete.
- Added shared graph-coordinate path commands and logical edge placement contracts to layout snapshots, reusing existing layout group geometry. Route producers and renderer consumers will migrate per mode.

- Added per-chart Sigma/G6 selection for Graph views in create/configure dialogs and Graph settings. G6 persists through `charts[].extensions.meta-graph.renderer`; Sigma remains the default and is omitted for backward compatibility.
- Added typed G6 data and style adapters for RuntimeGraph nodes, logical edges, visibility, labels, shapes, line patterns, arrows, parallel-edge metadata, and incremental style patches.
- Added G6 Canvas renderer foundation with layout-free drawing, graph/style refresh, viewport coordinate conversion, zoom controls, fit, focus, resize, stale-render cleanup, and renderer factory support.
- Added G6 node and logical-edge selection, hover neighborhood fading, pinned hover, context menus, and canonical Ctrl/Cmd-drag connection gestures.
- Added G6 Group regions and member halos with selection, focus muting, hit testing, movement callbacks, dock-to-node hit testing, and bundled parallel-edge routing.

### Changed

- Incremental index batches now filter diagnostic lists and sort available tags/domains once per batch instead of once per changed file, preserving diagnostic order, shared value counts and failed-read recovery.

- Rooted neighborhood and curated projections collect candidate edges from source adjacency instead of scanning all vault edges. Index insertion order, traversal limits, filters, parallel/self edges and unresolved context behavior are preserved. Global queries retain their existing full scan.

- G6 now attempts same-frame queue submission for automatic D3 ticks without an additional renderer animation frame. Pointer updates, backpressure, latest-position coalescing and synchronized Group updates retain their existing behavior.

- Compacted the Forces panel by moving guidance into hover tooltips and the Reset button into the section header; slider values and reset behavior are unchanged.

- Tuned Graph dragging with distance-scaled repulsion, softer centering, degree-aware springs, stronger collision handling and bounded node velocity. Dragged nodes publish immediately and remain active while held; release cools smoothly without direct neighbor displacement or an extra return force. Force parameter edits preserve the runtime graph and group references.

### Fixed

- Failed index builds now release their pending promise so later reads can retry without invalidation. Incremental indexing parses a complete batch before applying changes, retains dirty files on read failure, and preserves newer invalidations received during processing.

- Autosave now waits for the host save before marking a document saved, serializes overlapping writes, and keeps the latest pending edits after failures for the next scheduled save or explicit flush. Save failures show a notice; file unload and close await pending saves, and stale callbacks cannot write into a different workspace file.

- Body-only note edits no longer rebuild or refit charts when only file timestamps change. Arc/HEB time sorting retains refreshes; rule-based group membership changes trigger layout, while node style match changes update incrementally. Query filters still reevaluate on metadata refresh.

- Flow group capsule text now shares node-label size, bold/italic and scale-with-zoom settings, using the same resolved screen font size in Sigma/G6. Capsule backgrounds scale with the font, while header anchors stay fixed. Font edits update live without layout or group expansion.

- Flow group capsules keep fixed graph-coordinate header anchors. Removed screen-space relocation and connector lines so zooming does not displace their centers.

- Fixed global Flow layout inflation: stopped passing node-label footprints into ELK, removed the fourfold title reservation, and removed the physical zoom floor that prevented full Fit. Title rendering does not change layout or camera state.

- Flow group capsules use modest ELK header space and measured minimum widths. Circular containers reserve their actual square footprint; edge-only refreshes retain layout-owned frames.

- Flow groups reserve additional layout padding and a dedicated title band. Long titles truncate with their full names available on hover.

- Flow group frames now use layout coordinates in Sigma and G6. Zooming scales the frame with its nodes instead of recomputing bounds from screen padding or title width; layout updates still refresh group bounds.

- Flow Layer spacing and Lane spacing preserve the viewport reference in Sigma and G6, so increasing both expands the layout instead of automatically fitting it back into the canvas. Explicit Fit restores the complete graph and group extent.

- Fixed spacing changes incorrectly triggering auto-fit when chart state setters clone unchanged grouping data. Regression coverage now uses the actual spacing setters and render coordinator.

- G6 translation skips unchanged edge key/halo path writes without caching stale geometry across style or state updates.

- Native G6 nodes now submit only coordinates and transforms during position-only updates, avoiding repeated full-style writes while preserving retained children, rotation/scale and image position notifications. Style changes keep the normal update path.

- G6 batches native non-animated translation updates into one lightweight task, avoiding per-element animation style snapshots. Element updates, labels and Group synchronization are preserved; structural, custom, animated and pre-update-listener cases use the original pipeline.

- G6 reuses retained node labels during translation instead of rebuilding their text and backgrounds after every force tick. Edge labels, style changes, zoom and replacement labels keep their normal updates.

- Sigma keeps node and edge labels visible during dragging and force motion, following the existing label density and visibility settings.

- Group position commits preserve unchanged state references, avoiding a scene rebuild that stopped the running force simulation immediately on release.

- Kept Graph force simulation active while dragging a Group. Members remain pinned as a rigid set under the pointer, connected outside nodes respond continuously, and releasing the Group unpins all members without rebuilding the simulation. Applies to Sigma and G6; Free movement is unchanged.

- Synchronized G6 Group bounds and member halos with submitted node positions during force and manual movement. Group geometry now reads the G6 position model and commits with the node batch instead of using newer simulation coordinates on a separate animation frame.

- Added geometry-only translation updates for native G6 straight and quadratic edges. Moving edges reuse arrow markers and label shapes; unchanged single-line text layouts reuse their measured geometry, while wrapping, truncation, styling and interaction changes retain full updates. Labels remain visible during force motion; loops, badges and custom routed edges keep the existing pipeline.

- Avoided rebuilding native G6 node child shapes for position-only movement. An instance-local translate adapter preserves G6 transforms and position events, keeps labels visible, and retains full rendering for style changes and custom nodes. Hooks are restored on removal and teardown.

- Reduced G6 force-motion overhead with frame-coalesced, latest-position-only submissions and one in-flight position draw. Unchanged nodes are skipped; batched non-animated translations bypass G6's full style recomputation while preserving connected edges and the fixed coordinate adapter. Pending force frames are cancelled on teardown.

- Reduced G6 Local-hover work with an instance-scoped G6 5.1 state-transform adapter: compute styles only for updated elements and discard automatically added edges when node geometry is unchanged. Hover labels now merge owner-only membership/placement deltas, and an 80 ms leave grace avoids full Local resets across brief gaps. Real G6 runtime tests cover sparse computation, endpoint updates, and adapter teardown.

- Made G6 connected-edge emphasis 1.5 times the configured width and hovered/selected edges twice that width instead of adding fixed screen pixels. Dimmed edges retain their original width so focus cannot thicken fine lines.

- Removed G6's excessive 1.7 minimum edge width so thin link settings take effect. Link width controls now allow 0.1 increments from 0.1, while G6 retains a separate generous hit target.

- Trimmed layout-owned G6 edge bends covered by source or target nodes before endpoint clipping, preventing Flow arrows from reversing through node interiors when rendered node sizes exceed their terminal route segments.

- Created every visible G6 Group element through the background layer's own scene document and commits complete scenes for G6's automatic presentation frame. This prevents cross-Canvas ownership from dropping Group regions on the first frame in static Flow, Free, Arc, and HEB views.

- Unified Graph, Free, and Flow container corners, titles, regions, focus states, and member halos across Sigma and G6 while retaining Arc bands and HEB sectors as specialized shapes. Flow containers now use Graph's membership-driven overlay path instead of depending on an ELK container region being available on the first frame. G6 commits complete Group scenes after graph draws, calculates dynamic bounds from canonical RuntimeGraph positions, keeps stable Canvas roots, renders Arc bands, and deduplicates member halos.

- Moved visible G6 Group regions, titles, resize handles, and member halos into G6's background Canvas scene, so they share the exact camera and presentation frame with nodes and edges during zoom and pan. The external SVG now contains only transparent manual-movement hit targets.

- Matched G6 node hover to Sigma's temporary focus behavior: unrelated nodes and edges dim immediately, connected edges remain emphasized, and persistent Space-pin state remains unchanged.

- Reduced G6 hover switching latency by applying node focus locally before workspace propagation, deduplicating repeated pointer samples, serializing state-stage draws with latest-state replacement, updating only neighborhood differences, and limiting transient label work to changed owners. Ordinary hover no longer refreshes Group overlays; pinned focus retains Group dimming.

- Made G6 node and edge labels follow every zoom transform through cached label-shape scaling. Label size now changes continuously without full label-style resolution or a delayed post-zoom jump.

- Invalidated cached G6 Group geometry when the initial fit baseline becomes available, so Groups render on first entry instead of waiting for a manual refresh.

- Kept G6 Group titles upright and consistently sized after moving Group geometry into graph-coordinate SVG. Titles now compensate for the inverted graph Y-axis and coordinate-domain conditioning, and remain on the visual top edge in Graph and Flow.

- Cleared Arc/HEB label transforms and routed-edge geometry when G6 returns to Graph, Free, or Flow. Ordinary edge payloads now overwrite route-only fields, label refreshes discard stale layout-owned placement, and G6 recreates its owned renderer host when the planar view mode changes.

- Aligned radial-sector Group hit testing with HEB's angular coordinate origin, so visual sectors and pointer targets cover the same notes.

- Prevented routed Flow bend nodes, which are absent from the G6 element model, from entering viewport, style, label, or hover state patches and causing `Node not found` errors.

- Reconciled the live renderer instance with the active chart renderer on every workspace update, so an interrupted or failed renderer transition cannot leave G6 active after the chart has switched back to Sigma.

- Matched G6's internal Y-axis conversion to Sigma's graph coordinate orientation, so Arc **Up** and **Down** directions, routed edges, Groups, focus, and pointer hit conversion are no longer vertically mirrored.

- Conditioned compact G6 coordinate domains before rendering, matching Sigma's internal normalization while keeping RuntimeGraph and persisted Free positions unchanged. This prevents Free charts from requiring extreme native zoom values that inflate label backgrounds, edge markers, and endpoint geometry; viewport conversion, dragging, focus, Groups, and hit testing all map through the same reversible coordinate space.
- Restored G6 canvas panning for drag events synthesized from pointer movement (`button: -1`). Free node and Group movement now use G6's element model as the live position source; overlays, hit testing, runtime coordinates, and persisted snapshots read back the same applied positions without a redundant full-graph draw.
- Fixed Free/G6 dragging against G6's forwarded pointer-event objects, whose prototype event methods are stripped during forwarding. Drag coordinates now use G6's camera-adjusted canvas point directly, with viewport conversion retained only as a fallback.

- Delayed G6 viewport event binding until its initial draw completes, preventing initialization-time `getZoom()` failures.
- Isolated every renderer in an owned DOM host and tears down renderer changes before measuring the next view, preventing G6 Canvas container styles from collapsing Sigma into an off-screen one-pixel viewport after switching back.
- Replaced G6 rendered-bounds fitting with Sigma-compatible coordinate fitting, so both renderers fill the same 30px-padded frame at logical 100% regardless of labels, arrows, node sizes, Groups, or parallel edges. G6 rebases the frame across resize and graph-extent changes and keeps the shared 25%-400% range.
- Moved live G6 label appearance edits onto lightweight label-subshape updates. Label priority and visibility are cached, density and viewport-capacity changes patch only entering or leaving label IDs, and Arc/HEB rotation work is limited to visible or interaction-forced labels. Large G6 scenes temporarily suppress ordinary edge labels during viewport transforms while keeping selected, hovered, and globally forced labels visible.
- Prevented display-only chart edits from cloning unrelated grouping, manual-layout, and style state, which had caused false graph rebuilds. Reused renderers now retain a live lifetime token across legitimate same-kind rebuilds instead of becoming permanently stale.
- Made G6 labels follow every camera frame when **Scale text with zoom** is enabled by disabling G6's label billboard compensation. Fixed-size labels retain billboard behavior, and neither mode requires per-frame label reconstruction.
- Aligned G6 pinned focus visuals with Sigma: non-neighbor nodes remain visible in the muted color, connected edges and arrowheads remain visible, and unrelated connections are fully hidden.
- Replaced G6's throttled 20% wheel animations with one camera RAF. High-resolution trackpad deltas accumulate proportionally and reach the target in the next frame. Discrete mouse-wheel steps use a bounded 72ms interpolation that lands exactly on the target without an exponential tail. Labels remain frozen during camera frames and receive one exact update after zoom settles.

### Changed

- Standardized project imports on the `@/` alias rooted at `src`, with matching TypeScript, esbuild, Vitest, Svelte, and ESLint resolution.

- Removed unused G6 route tiers, duplicate label caches and patch builders, redundant element metadata, legacy Group geometry branches, hidden SVG visual replicas, and manual background-Canvas render scheduling. Group scene commits now coalesce once per microtask independently of graph draw work.

- Unified G6 wheel zoom and canvas pan under one viewport animation-frame scheduler. Starting a canvas pan cancels pending wheel interpolation and prevents wheel input from reclaiming the camera until the drag ends. Zoom frames perform no label shape, graph data, or full draw updates; one delayed label sync restores final sizing and exact Arc/HEB placement after zoom settles.

- Moved G6 node picking onto the scene grid index with one pointer-to-graph conversion and exact graph-space radius checks. Node hover leave now has a 32 ms handoff grace. Transient hover updates only changed parts of the two local neighborhoods through G6's state draw stage and does not refresh the Group layer; pinned focus retains full-scene dimming and Group focus.

- Added one per-scene G6 cache for rendered nodes, logical/runtime edges, incident neighborhoods, visible and rotated labels, graph extent, route point tiers, style signatures, and node spatial lookup. Style refreshes now submit only changed element IDs, hover reuses cached neighborhoods, fit/capture reuse the cached extent, routed-edge adapters reuse one logical index, and pointer hit tests no longer scan every node.

- Replaced G6's per-member Group halo DOM with one graph-coordinate SVG overlay. Viewport transforms now update one root matrix, dynamic bounds and halo geometry are cached until graph geometry changes, large scenes cull offscreen halos, and very large scenes draw halos only for active Groups.

- Reorganized the test suite into source-aligned core, graph, layout, interaction, settings, UI, and workspace domain directories, with documented category-level test commands.
- Added renderer-neutral planar, Group overlay, and external 2D force-simulation contracts so future 2D renderers can share interaction, refresh, layout-motion, and Group orchestration without inheriting Sigma internals.
- Removed full G6 data/style rebuilds from pan-only viewport transforms and coalesced repeated draw requests into latest-state rendering, preventing pointer movement from accumulating obsolete Canvas draws.
- Standardized Sigma and G6 wheel zoom at fixed 20% reciprocal steps. G6 also matches Sigma's 250 ms quadratic-out animation, pointer-centered origin, 50 ms same-direction throttle, and no double-click zoom; touch pinch remains continuous.
- Coalesced G6 hover transitions by animation frame, suppresses hover churn while dragging the canvas, and updates only affected neighborhoods and logical-edge segments. G6 zoom now leaves node, edge, and arrow geometry on the camera transform path, updates only visible label shapes, and rebases full canvas-unit styles only when the fit coordinate frame changes.
- Replaced G6's built-in canvas drag delta with frame-coalesced CSS-pixel `dx`/`dy`, keeping viewport movement 1:1 with the pointer across zoom and display scaling.
- Changed Sigma and G6 node, edge, arrow, and Group base geometry to shared linear physical scaling: 25% renders at 0.25x, 100% at 1x, and 400% at 4x. Hover/selection emphasis remains fixed in screen pixels, while optional label scaling uses a gentler square-root curve.
- Namespaced G6 interaction states to prevent built-in theme selection styles from overriding Meta Graph label sizes and borders. Edge emphasis now matches Sigma without a wide halo, and node hover/selection halos use compact fixed-pixel widths.
- Aligned G6 label controls with their workspace semantics: offset now scales from rendered font size, density uses a stable monotonic label budget without G6's quadratic collision scan, and **Always show labels** includes labeled edges.
- Moved G6 parallel-edge routing from the runtime transform into deterministic data-adapter geometry, preserving stable lanes without rerouting every edge after unrelated style changes.

## [1.7.0] - 2026-09-04

### Added

- Added context-aware graph menus for nodes, logical edges, groups, and blank canvas areas across Sigma, 3D, and Cube views. Menus expose safe navigation, focus, details, grouping, visibility, clipboard, and viewport actions while preserving right-click target selection.
- Added a Query-to-Curated source switch choice that copies the current Query notes into Curated, either on the duplicated view or the current view.
- Added a **Duplicate view** action to the active view configuration.
- Added one Group capability model across Graph, Free, Flow, Arc, HEB, Cube, and Graph 3D, separating membership policy from spatial behavior. Cube faces are now fixed System groups in the canonical group definitions, and every supported 2D layout shares group selection, hover, context-menu hit testing, and explicit node assignment.
- Added dedicated relationship and Group views to the right-side Details panel. Relationship details keep the selected metadata relationship prominent and list the other indexed links between the same notes separately; Group details show capabilities, rule summaries, visible members, assignment sources, geometry, and conflicts.

### Changed

- Batched Sigma Force ticks into one Graphology position update and one scheduled render, removed the extra drag refresh, suppresses ordinary labels and Canvas hit-grid rebuilding while nodes move, and restores a final full-quality frame after alpha or displacement settling.
- Cached normalized Canvas text widths across Sigma node, hover, native-edge, parallel-edge, and Group labels, avoiding repeated measurements during camera and hover redraws while keeping the cache bounded.
- Coalesced Sigma node, pinned-neighborhood, and native-edge hover changes to one animation-frame update and refreshes only changed neighborhood nodes and logical-edge segments without rebuilding render indices.
- Reused Sigma's node and native-edge hover events when resolving pointer target priority, removing the extra GPU node pick and all-node nearest-target scan from passive mouse movement.
- Removed the duplicate Sigma parallel-edge Canvas redraw after renderer refreshes; `afterRender` now owns normal Canvas synchronization, with one scheduled initial paint retained for new layers.
- Split workspace state subscriptions, index/query refresh, connection writes, and template-note orchestration out of `WorkspaceController` into focused collaborators while preserving its public API.
- Replaced settings-panel prop drilling with typed graph, label, query, style, suggestion, and group view/action ports; settings UI no longer receives the workspace controller or complete workspace state.
- Moved workspace renderer refresh decisions into a pure render plan and fixed-order coordinator, keeping rebuild, display, style, visibility, group, force-layout, and selection updates explicit.
- Reduced large-graph rebuild work by indexing initial-position adjacency, batching Group ownership resolution, caching query filter results, and resolving each link style rule set once per edge.
- Reorganized renderer construction, capability policy, and refresh operations behind typed options and small adapter modules without changing renderer behavior.
- Captured full runtime graph diagnostics only while Debug is open, avoiding normal-render serialization and redundant workspace notifications.
- Consolidated plain and unresolved link classification and removed obsolete metadata-index and legacy label-control paths.
- Unified non-Cube Group visuals around persistent member halos, faint layout-specific regions, horizontal pill titles, and group-colored hover/selection states. Cube keeps its face-based visual language and emphasizes the whole face on hover or selection.
- Renamed Group **Mode** to **Membership** and clarified its values as **Manual assignment**, **Rule-based**, and **System**.
- Moved Cube face membership out of manual node placements into canonical group overrides. Legacy Cube placements are migrated on load and materialized only at the renderer compatibility boundary.

### Fixed

- Kept each mounted workspace bound to its own persistence context through autosave cleanup, and serialized overlapping render/unmount operations to prevent startup persistence errors.
- Kept theme-aware black/white label profiles when reading obsolete label color fields, and stopped writing those obsolete fields.
- Released Cube node and label Canvas textures during graph rebuilds and renderer teardown.
- Kept focused and pinned Sigma arrows at their base size while applying emphasis to line width.
- Replaced Details focus buttons' pin icons with the crosshair icon used by Fit graph.
- Fixed Group and relationship details cards inheriting dock flex sizing, which could create large blank areas, overlap member/conflict rows, and stretch the delete action across the panel.
- Simplified relationship summary rows to show only direction and property, keeping hidden plain body links out of the list.
- Added bounded filename labels with ellipsis and full-name hover tooltips throughout the details inspectors.
- Switched details filename tooltips to Obsidian's native tooltip surface and constrained long relationship directions.
- Kept visible Other links rows on one compact line, reserving a second line only for hidden-state badges.
- Kept Group deletion in Group settings and context menus, and anchored the Details edit button to the toolbar Group settings position.

## [1.6.0] - 2026-09-03

### Added

- Added a per-chart **Scale text with zoom** option for Sigma views. Node and edge label fonts now use Sigma's same zoom-to-size rule without inheriting each node's individual size.
- Added unified transient node, logical-edge, and group selection. Native Sigma edge picking and the parallel-edge Canvas hit grid now select the same logical edge, including every segment of a Flow route; native and Canvas edge hover use the same zoom-aware emphasis.
- Added deterministic parallel lanes for multiple relationships between the same two notes. Directed, reverse, and undirected links now keep separate paths, labels, arrows, and 2D/3D/Cube/Flow/Arc/HEB rendering without changing the underlying metadata.
- Added a DPR-aware Canvas overlay for Sigma parallel edges, including compact endpoint routes, rounded solid/patterned lines, arrows, labels, hover/click hit testing, viewport culling, and cached paths.
- Added the **Text offset** setting to HEB labels, so radial note labels can be moved farther from their nodes.
- Added centralized graph actions with Obsidian command-palette entries, shortcut help, viewport shortcuts, selected-node open/focus shortcuts, and consistent keyboard behavior across note lists.
- Added transaction-safe connection Redo with toolbar, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y` access.

### Changed

- Lowered the Label settings **Font size** minimum to 4 and aligned **Scale text with zoom** with **Always show labels** in one row on Sigma charts.
- Renamed **Text style** to **Label settings**, moved Arc **Label angle** out of Graph settings, and centralized **Always show labels** in the label panel for every chart type.
- Changed graph node interaction to single-click selection and double-click open across 2D, 3D, and Cube renderers. Existing `Ctrl`/`Cmd`-drag connection editing remains available; no Connection tool mode was added.

### Fixed

- Made `Space` show the selected node's local neighborhood when no node is hovered.
- Kept pin/hover neighborhood links above unrelated Sigma and Canvas edges, including routed Flow, Arc, and HEB segments; continuous logical strokes and crossing masks prevent visual artifacts and seams at bends.
- Suppressed hover emphasis for unrelated Sigma edges while a node neighborhood is pinned; pinned-neighborhood links remain hoverable.
- Moved HEB group labels inside the outer radial boundary, preventing outside note labels from obscuring them.
- Preserved smooth layout-owned curves for parallel Arc links.
- Preserved smooth layout-owned bundled paths for parallel HEB links.
- Kept pinned and hovered Sigma labels above the highlighted-node WebGL layer, so centered labels remain readable while a neighborhood is pinned.
- Centered Graph and Flow node text and background boxes when **Text position: Center** is selected.
- Prevented Sigma's synchronous constructor render from reading the renderer instance before assignment when **Scale text with zoom** is enabled, including transitions back from 3D views.
- Unified Sigma parallel-edge Canvas line widths and arrow bounds with native Sigma's pixel geometry and visible ink coverage. Canvas now uses Sigma's zoom scaling, minimum edge thickness, inward feather compensation, and full device pixel ratio; native solid and patterned arrow lines share the same antialiasing feather. Arrow geometry, dash spacing, compact lane spacing, deterministic Chevron fills, and independent hit widths remain consistent.
- Replaced the keyboard shortcut overlay with a grouped side-by-side reference panel that keeps the graph interactive while open.
- Made `Space` pin or unpin the hovered node's neighborhood; with no hovered or selected node it clears the current pinned focus.
- Kept Flow arrows on the final flow-axis corridor segment when parallel lanes use endpoint branches, preventing RL/LR arrows from pointing vertically into nodes.
- Kept direct Graph parallel lanes compact while remaining distinguishable.
- Kept parallel Flow Orthogonal routes axis-aligned at node ports and through the Canvas overlay; arrows, labels, and hit testing follow the same geometry.
- Applied the configured Flow corner radius to parallel Canvas routes by reusing the sampled rounded route and offsetting local tangents.
- Kept parallel Curve lanes on sampled curve routes with tangent-based offsets.
- Kept parallel Curve endpoints smooth and arrows aligned with the Flow direction.
- Kept parallel Flow lanes on side-center ports with external fan-out/fan-in branches.
- Kept undirected Orthogonal and Rounded parallel lanes on the configured Flow axis, including RL/LR routes.

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
