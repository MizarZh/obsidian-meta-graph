# Changelog

All notable changes to Meta Graph are documented here.

## [Unreleased]

- Fixed Node list Group dropdown alignment by keeping the select within its compact frame and centered with its color dot.

- Fixed collapsed side-panel controls to a 32px square with centered icons, removing inherited text-button padding and preventing clipping.

- Collapsed left/right panels now use compact icon-only controls; expanded panel headings retain their names.

- Limited explicit icon-plus-label rendering to panel fold controls and prevented repeated reactive updates from accumulating button labels or icons. Other buttons retain their previous rendering.

- Renamed the Nodes panel to Node list. Fold controls now show the active panel name, including single-panel groups and collapsed side panels; fixed icon buttons replacing their text labels.

- Restored floating side panels with inset margins, rounded corners, and shadows while retaining configurable placement and tab grouping. Collapsed side panels shrink to a compact floating control.

- Added per-view Overlays settings for visibility and placement. Nodes, Details, Pinned notes, and Templates can independently occupy either sidebar and share tabs on the same side. Minimap, Legend, and Trace support all four corners with automatic tab grouping; Timeline supports top or bottom. Positions and active tabs persist, while older views keep their original arrangement.

- Fixed Sigma translucent nodes, ordinary edges, and arrowheads washing out against light backgrounds. WebGL colors now use premultiplied alpha to match Canvas parallel edges, including feathered chevron arrowheads.

- Active Trace results now take priority over Local hover and pinned-neighborhood focus across renderers. Individual selection remains available without revealing neighbors; clearing Trace restores Local focus automatically.

- Made Trace graph picking explicit with an accent-colored endpoint prompt and Cancel action, an accent-colored Cancel picking button, and a crosshair cursor. Picking one node now exits the mode immediately.

- Moved the Trace endpoint swap button between the A and B rows, using vertical arrows to match their order.

- Visually grouped selected Trace relationship fields and their add control with a subtle background, border, and spacing below the relationship mode selector.

- Trace now preserves original node and relationship colors and styles, fading only elements outside its range instead of recoloring traced elements with the selection color.

- Added clear actions for Trace endpoints; emptying an endpoint input cancels its selection. Clearing endpoints no longer starts graph picking. Click an active pick button again or press Escape to cancel picking.

- Removed the separate Close trace action and internal Trace options fold. Relationship fields, direction, and layers now appear directly in the Trace panel.

- Made embedded Minimap fill the corner panel width at a 3:2 aspect ratio. Canvas resolution, drawing, and navigation mapping follow its actual dimensions on resize.

- Added a shared Node status heading above the Empty note and Added context legend icons.

- Simplified the Legend status explanations to Empty note and Added context icons, removing their section headings and Core match text. Existing Nodes / Links style legends remain intact.

- Unified corner overlays with a full-width arrow/title row and an accent-highlighted segmented selector fixed at the bottom. Overlay content expands upward; collapsing or switching panels preserves trace highlights.

- Moved Trace into a compact 330px corner panel with collapsed trace options and a collapsible summary. Trace, Minimap, and Legend now share a tabbed corner area above Timeline. Switching tabs or collapsing Trace preserves highlights; closing Trace clears them.

- Added a per-chart Trace overlay toggle and a bottom trace panel that can be opened before choosing a node. Trace stacks above Timeline and moves the minimap/legend clear of both panels; trace queries and highlights remain transient.

- Reworked Trace into a compact Reachability / Between nodes panel with searchable endpoints, graph picking, temporary A/B badges, metadata relationship-field selection, per-field arrow directions, and a shared reachability layer limit. Undirected fields traverse both ways; path mode still finds one shortest path.

- Added transient upstream/downstream tracing and shortest-path highlighting from node context menus. Tracing respects directed edges and current-view visibility, handles cycles, and leaves layout and saved styles intact. Choose a path destination by clicking a node; use the trace bar or Escape to exit.

- Automatically collapse Workspace default when chart note or link overrides are present. It remains manually expandable and reopens when overrides are removed.

- Updated note and link Chart overrides to the current style preview cards and popover editors, matching Workspace default. Adding an override opens its editor; removing it restores inherited styles.

- Smoothed Sigma Flowchart parallel Curve edges with tapered lane spacing, endpoint joins outside node boundaries, and adaptive curve sampling shared by drawing and hit testing.

- Renamed chart types in the UI: Graph → Network, Flow → Flowchart, 3D graph → 3D network, and Free → Canvas. Other chart names, saved type identifiers, and existing chart titles are unchanged.

- Added an automatic blank-document badge for existing notes without body content, including whitespace-only and properties-only notes. Empty status takes priority over related context; unresolved status retains its question mark.

- Matched unresolved links’ default appearance to plain links while preserving their independent style controls and existing custom overrides. Unresolved nodes retain the `?` badge.

- Added a `?` badge for unresolved nodes in query and curated charts, independent of related-context expansion. Unresolved status takes priority over the context badge, with a matching legend entry.

- Replaced the context badge plus sign with a chain-link glyph and matching legend icon to avoid suggesting an expand action.

- Synchronized context badges with renderer paint completion instead of an independent animation loop, reducing drag/zoom lag across Sigma, G6, Graph 3D, and Cube. Old scene listeners are removed on replacement and teardown.

- Replaced `[Context]` label prefixes and automatic dimming with a small upper-right `+` badge for expanded nodes. Added a per-chart Show context badges toggle; badges track pan, zoom, and node movement across Sigma, G6, Graph 3D, and Cube without changing user styles or pointer interaction.

- Tightened relationship rows to a 4px gap and reduced padding, removing inherited section margins.

- Compacted relationship expansion into wrapping single-row controls: direction dropdown, 1–3 layer slider with a visible value, and per-field removal.

- Added per-relationship direction and layer controls in Selected fields, using individual cards with segmented choices. All relationship fields keeps shared controls. Both modes retain their settings, and older selections inherit their previous shared values.

- Added 8px spacing between selected relationship fields and the field input.

- Removed explanatory paragraphs from Related context settings, keeping controls, scope, and node counts.

- Reused the node-shape segmented setting for related-context layers, making the selected depth visibly highlighted.

- Fixed shared dropdowns losing their native Obsidian class. Select controls now retain visible input-style borders, a native arrow, and hover/focus/disabled states, including settings popovers.

- Fixed selected relationship fields showing only a remove icon. Field chips now render their names separately from the remove button and wrap long names.

- Made related-context membership explicit with a `[Context]` graph-label prefix, a legend key, and Core match/Added context status in node Details. The expansion panel now labels its scope as This view and explains that All views filters constrain both sets.

- Added per-chart Related context controls below Filters: searchable relationship field selection, both/incoming/outgoing traversal, and 1–3 layers. Expands current-view matches beyond their filter using configured metadata relationships, keeps All views filters and node limits, shows core/added counts, dims added nodes, and persists choices in workspace files.

- Minimap wheel zoom now anchors to the graph position under the pointer, preserving that point's main-viewport position instead of zooming around the view center. Supports Sigma and G6.

- Added mouse-wheel/trackpad zoom over the Minimap. Zoom changes are batched per animation frame, preserve the main view center, and use the shared 25%–400% range without scrolling the surrounding UI.

- Node context menus now offer explicit Open in split and Open in new tab actions, independent of the default note-opening preference. Direct node opening still follows the preference.

- Renamed node/link style context actions to Edit node/link style settings and moved them to the bottom, separated from other actions like Edit group.

- Added Edit current node/link style to graph context menus. Opens the last matching chart/global rule (using rendering precedence), falls back to chart overrides or workspace defaults, and routes unresolved objects/plain links to their dedicated settings. Editing changes the shared style, not only the clicked object.

- Replaced Delete group in the main graph context menu with Edit group, which opens the matching group editor in toolbar settings. The Details edit shortcut now targets the selected group as well; deletion remains in group settings.

- Changed Minimap navigation from node focus to viewport dragging. Drag the viewport frame with its grab offset preserved, click outside to recenter, or use arrow keys; Sigma/G6 retain zoom and layout.

- Added an opt-in per-chart Minimap overlay for Sigma/G6 planar charts. Shows visible nodes, simplified logical links, and the viewport footprint; click to focus the nearest node. Refreshes at 5 Hz without relayout, retains hidden-node bounds during timeline playback, and supports collapse. Graph 3D/Cube are not included.

- Unified left Nodes and right dock panel shells: shared card border, radius, shadow, inset collapse controls, and header background. Nodes drag-target highlighting now applies to the complete card.

- Enabled Timeline in Cube using the shared playback controls and existing visibility refresh. Face placement and manual positions remain stable; the renderer still rebuilds graph objects per visibility update, so playback performance needs real-world evaluation.

- Enabled Timeline for Graph 3D with shared date/Per node playback, speed, range, and progress controls. Visibility updates use the existing 3D data synchronization and cached positions without workspace rebuilds or auto-fit; visible force simulation data changes may move the layout. Cube remains unsupported.

- Grouped Legend and Timeline toggles on one row under an Overlays heading in Graph settings.

- Removed the duplicate Renderer control from Graph settings. Renderer selection remains available in Configure view; saved renderer choices are unchanged.

- Fixed Flow curves falling back to right-angle routes during timeline playback in Sigma. The layout route cache now retains hidden edges; visibility changes reuse the original routes without relayout or revealing hidden links.

- Fixed empty dynamic Groups leaving overlapping titles at the origin during timeline playback. Sigma and G6 now omit their regions, titles, and hit targets until a member is visible again, without changing layout or saved Group data.

- Separated timeline transport controls from settings: Jump to start, Play/Pause, and Jump to end now lead the toolbar. Replaced the ambiguous range-reset icon with standard skip controls that pause and save progress while preserving From/To.

- Added per-chart timeline playback speed (0.25×–4×, default 1×). Date and Per node playback share the control; changing speed while playing preserves the cursor and continues playback.

- Removed the timeline settings popup and undated-node toggle. Nodes without timestamps now appear at To in date playback, or individually after dated nodes in Per node mode; existing hidden nodes remain hidden. Old undated-toggle values are ignored.

- Per node progress now displays the node's local date and time, including seconds, alongside the node count.

- Per node playback sorts by the exact selected timestamp, then node display name for time ties; node IDs only break remaining name ties.

- Added Per node timeline playback. Each tick reveals one dated node within From/To, with stable ID tie-breaking for identical timestamps. The slider scrubs integer node counts and displays count plus date; hidden nodes are excluded and the independent node cursor is saved with the chart.

- Moved timeline From/To dates onto the action toolbar; the progress slider and its current date remain on a separate row. Controls wrap only when space is limited.

- Separated timeline From/To bounds from the saved current-date cursor. Progress displays its own date and scrubs only within the selected range; cumulative playback reveals nodes from From through the cursor, stops at To, and never changes either bound.

- Added one timeline progress slider alongside From/To date controls. Scrubbing pauses playback and previews the To date while keeping From fixed; releasing saves the final range. Playback and date edits keep the slider synchronized.

- Timeline playback skips empty date intervals and keeps playing when unrelated updates clone unchanged timeline settings, preventing long apparent stalls after the first node.

- Timeline now uses two directly editable From/To date controls instead of sliders. Sources are limited to file creation/modification time; retired metadata sources fall back to creation time with a reset range.

- Added an opt-in per-chart timeline for Sigma/G6 Graph, Free, Flow, Arc, and HEB. Choose creation/modification time or an ISO date property; preview a date range, include/exclude undated nodes, and play cumulatively by day/week/month. Timeline visibility is combined with existing hidden nodes/links through incremental renderer updates, without relayout or auto-fit. Range previews/playback do not save every frame; committed settings persist with each chart. Legend positioning accounts for the timeline. Graph 3D/Cube and historical snapshots are not included.

- Fixed graph content collapsing into a corner after returning from another Obsidian file tab. The canvas size observer now remembers zero-size hidden states, so returning to the same visible dimensions still restores and repaints the renderer without resetting the camera.
- Fixed Sigma nodes remaining offscreen after drag simulation releases held bounds. Releasing bounds now reprocesses normalized coordinates before painting, without resetting the camera or rerunning layout; Flow spacing bounds remain held until fit or scene reset.
- Fixed exported group titles: SVG now includes centered, group-colored capsule backgrounds and borders, with Flow title-band positioning and label scaling. PNG captures DOM capsule text with the loaded document font before image composition, preserving fractional widths and export resolution instead of reflowing titles into ellipses.

- Fixed PNG export changing light-theme labels into white text or dark label boxes. Transparent offscreen rendering now retains the source chart's label theme, including custom text colors and label background opacity, independently of the output background.

- Added export v2: editable SVG for all five planar chart types with Sigma/G6, plus JSON, CSV, and Markdown entry exports for every chart type. Entry exports support filtered-chart or node/relationship/group selection scope, independent node/relationship inclusion, and optional metadata. Logical relationships exclude layout segments; CSV escapes spreadsheet formulas. All formats share collision-safe vault saving and cancellation.

- Added PNG export from the chart toolbar, including read-only workspaces. Export the current view or the complete filtered planar graph at 1×/2×/3× resolution, with theme/white/transparent backgrounds and an optional legend. Graph 3D and Cube export the current camera. Images are saved in the vault root with collision-safe names; export preserves the live layout and camera, omits transient emphasis, checks image limits, and cancels stale renderer generations.

- Added a per-chart Show legend toggle in Graph settings, enabled by default. Visibility is saved with the chart and updates without rebuilding or relaying out the graph.

- Group, Node, and Link settings now close when clicking outside both the settings panel and its floating editor. Removed the extra panel close button; the editor's close button still closes only the current entry.

- Graph/Free group reordering skips graph reconstruction and relayout when definitions and resolved node ownership are unchanged; group overlays still synchronize. Rule-priority ownership changes and Flow/Arc/HEB ordering retain their existing rebuild behavior.

- Group cards support drag-to-reorder with before/after drop indicators, applying each drop as one state update. Read-only and fixed system groups remain locked.

- Group settings use compact cards with name, color, member count, and membership mode. Clicking a card opens one adjacent floating editor; ordering stays on the cards, with existing group permissions and settings preserved.

- Fixed the legend touching the right panel by accounting for the panel's own inset before adding the legend gap.

- Added a collapsible canvas legend for default and Global/Chart node/link styles. Previews match style cards; custom rule names take priority, with matching conditions used as automatic names and hover details. Legend updates live without affecting the graph.

- Node hover reveals full names despite the text-width limit. Local hover/pinned focus also reveals neighbor names; leaving focus restores truncation, using label-only updates.

- Removed the Max text width subtitle; usage details remain in its hover tooltip.

- Setting rows with descriptions reserve space for their controls and wrap help text; the label-length setting uses a shorter description.

- Text settings include a per-chart maximum node/link text width in pixels (0 = unlimited), replacing the character-count limit. Font-aware measurement includes `...` inside the width budget; the width scales with text. Original names and layout stay unchanged, with live updates in Sigma, G6, and 3D.

- Node/link rule editors place the Name field and scope/delete actions on one compact row above the matching condition.

- Node/link rules support optional saved names. Unnamed cards use their matching condition, including the operator, as the title; named cards retain the condition in their summary. Names do not affect matching or rule order.

- Node style cards preview the configured shape and color for Workspace default and Global/Chart rules.

- Link style cards now preview line color, width, opacity, and pattern instead of a color dot, including Workspace default and Global/Chart rules.

- Link Pattern controls now show solid, dashed, dotted, and dash-dot line previews, with accessible names and hover tooltips in all shared link style editors.

- Node/link rule drag handles can transfer rules between Global and Chart sections. Drop on a section heading to append (including empty sections), or on a card to insert before/after it.

- Style rule ordering controls now live on the compact cards. Drag handles reorder rules within their Global/Chart section, with above/below drop indicators; workspace defaults remain unsortable.

- Floating node/link rule editors keep field, operator, and value on one row, with ordering and rule actions above.

- Fixed floating style editor offsets in shifted/scaled workspaces and prevented the full-card click target from squeezing rule summaries into narrow columns.

- Style cards now open directly on click, including compact Workspace default cards for nodes and links. Floating editors align beside the clicked card rather than the settings panel header.

### Added

- Node and link style rules use compact summaries with one floating rule editor at a time. Style settings remain open while interacting with the graph; rule editors preserve live controls and adapt to available window space. Other override sections remain inline.

## [1.8.0] - 2026-09-11

### Added

- ForceAtlas layout now preserves edge visibility, including style-hidden edges and links to hidden nodes. Manual refresh entries are explicitly labeled Refresh and relayout; their existing forced-layout behavior is unchanged.

- Fixed Sigma Flow's initial centering: custom group-title bounds now invalidate coordinate normalization, and resize/fit read current container dimensions before calculating bounds. No window resize is required to correct the view.

- Sigma Graph force dragging stops inside the viewport with node-size-aware padding. Force motion holds the coordinate bounds to prevent repeated extent expansion; Free dragging and Ctrl connection gestures are unchanged.

- Node list filter dialog uses an aligned, muted subtitle instead of an unpadded paragraph, reducing excess vertical space.

- Query's Nodes sidebar now supports local node filtering and single/batch group assignment. List filters do not change graph queries or membership; grouping uses one batch state update and preserves Cube/Graph 3D restrictions.

- Query and Workspace charts share a Nodes sidebar with search, counts, single/range/multiple selection, focus, and note opening. Query rows follow the final projection without member editing or drag/drop; Workspace retains its saved-member actions, including hidden/missing entries. Chart changes clear transient list selection and result refresh prunes departed nodes.

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

- Shared dropdowns now preserve unchanged options and skip redundant Obsidian value/width updates, avoiding repeated forced browser layouts during curated selection and hover. Workspace clicks no longer steal focus from focusable rows or buttons.

- Workspace UI preserves immutable controller snapshot references, allowing selection changes to skip graph-wide style comparisons. Selection and hover no longer schedule document serialization or session persistence.

- Curated selection no longer rebuilds file row data or reruns list filters. List focus starts without an extra animation-frame delay; Sigma node selection recomputes only the previous and next selected nodes and schedules rendering instead of synchronously refreshing the entire graph.

- Workspace files use row highlighting without checkboxes. Click selects a single row, Ctrl/Cmd-click toggles individual rows, Shift-click selects a visible range, and Ctrl/Cmd+Shift-click adds a range. Inline actions remain independent.

- Removed the unused direct-parallel bend pipeline, old UI/shortcut/connection helpers and debounce scheduler. Connection previews now resolve all link visuals in one pass; Flow routes use only `flowRouteKind`. Simplified the internal Graphology constructor and shared renderer option projection, migrating regression tests to active APIs while retaining workspace-file migration and stale-render guards.

- Removed unused display/settings components, their private display CSS, unused exports and an unused renderer type import. Consolidated filter-tree operations, rule IDs, runtime link-style resolution, layout bend nodes, active-chart selection, layout hashes, set comparisons and shared Arc/radial geometry. Chart behavior, persisted formats and renderer-specific layout/label policies are unchanged.

- Renderer type guards now use each engine's explicit capability declaration without importing implementation classes. The factory loads only the selected engine and checks for stale creation requests before and after loading. The release remains a single bundled file.

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
