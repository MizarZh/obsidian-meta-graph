# Meta Graph

## Minimap

Enable **Graph settings -> Overlays -> Minimap** for Sigma/G6 planar charts.
The lower-left overview shows visible nodes, simplified straight links (up to
4,000 logical relationships), and the current viewport. Drag the viewport frame
to pan, or click outside it to center the view there, keeping zoom unchanged.
Scroll over the minimap to zoom the main graph (25%–400%) around the graph
position under the pointer; that point stays fixed in the main viewport.
The minimap's own size stays fixed.
Arrow keys pan the viewport while the minimap is focused. Click the
Minimap heading to collapse it. It updates five times per second without layout
work; timeline-hidden nodes retain their space but are not drawn or clickable.
The toggle is saved per chart and defaults off. 3D network/Cube are not supported.

## Timeline

Enable **Graph settings -> Overlays -> Timeline** in Cube, 3D network, or a Sigma/G6 chart
(Network, Canvas, Flowchart, Arc, or HEB). The bottom bar selects creation time or modification time.
Metadata properties do not participate. Missing file timestamps count as undated.

Choose the From/To dates directly on the bar. Dates use local time; the To date
includes the entire day when selected through the date control. From/To are
fixed bounds. The Progress slider has its own current-date display and moves
only within those bounds; cumulative visibility runs from From through this
current date. Dragging pauses playback, previews the cursor, and releasing
saves it. Playback updates the cursor, stops at To, and does not change From/To.
Undated nodes (such as links to files not yet created) appear at To in date
playback, and after all dated nodes in Per node playback. There is no separate
undated-node option. Play advances the current date
every half-second at 1×, by day, week, or month, skipping intervals with no
new dated nodes. Starting when the cursor is at To
restarts from From. The toolbar starts with Jump to start, Play/Pause, and
Jump to end, followed by playback settings and From/To. Both jump buttons pause
and save progress without changing the range; in Per node mode they reveal zero
or all eligible nodes. Pause saves the current date.
Switching charts or closing the view stops playback
and discards uncommitted playback previews. Each chart stores its own settings.

Playback speed offers 0.25×, 0.5×, 1×, 2×, and 4× for both date and Per node
playback. Speed changes take effect while playing without resetting progress,
and are saved per chart. The default 1× advances two steps per second.

Choose **Per node** in the playback step selector to reveal exactly one dated
node per tick. Nodes are ordered by the selected file time, then by display name
only for exactly equal timestamps. IDs break remaining name ties. From/To still
bound the sequence; manually hidden nodes are
excluded. Progress becomes an integer node-count slider and shows **count / total**
beside the current node date. Nodes without timestamps are appended at the end,
ordered by name, and also appear one per tick. Their placement at To is only a
playback convention; no creation time is invented or written to the note.

Filtering changes visibility only: it does not change Query/Curated membership,
write notes, or auto-fit. Planar charts do not restart layout. Existing hidden nodes and links stay
hidden. Positions and layout-owned group regions remain stable, so empty space
can remain; dynamic Network group outlines follow visible members. An already
running force simulation is not paused by the timeline. This is **not historical
replay**: modification time is the latest file timestamp, and links always
represent current relationships. 3D network uses the same playback controls;
visibility updates reuse cached node positions but update the visible force
simulation data, so newly revealed nodes can cause the layout to move.
Cube also supports the same controls and keeps its face assignments, manual
positions, rotation, and camera. This initial Cube integration rebuilds node,
label, and edge objects on visibility updates; high-speed playback on larger
charts may be costly. Hiding the timeline disables its visibility filter.

Meta Graph creates Markdown-backed graph workspaces from semantic relationships
stored in Obsidian note properties. A graph workspace is an ordinary Markdown
file with `meta-graph: workspace` frontmatter and YAML chart settings in the
body.

## Export a chart

Click **Export** in the chart toolbar and choose **PNG**, **SVG**, **JSON**, **CSV**, or **Markdown**. Files are saved in the vault root; existing files are preserved by adding a numeric suffix. Read-only workspaces also support export.

- **Current view** preserves the current camera. **Complete graph** fits the current filtered graph, including groups and routed relationships. 3D network and Cube support the current view only.
- Choose **1×**, **2×**, or **3×** resolution, a theme/white/transparent background, and whether to include the legend. The dialog shows the output pixel dimensions.
- Export keeps the live layout and camera unchanged and omits selection, hover, connection previews, and workspace panels. It does not rerun layout or include filtered-out notes.
- PNG images are limited to 8192 pixels per side and 16 megapixels. Complete-graph PNG export checks for clipped content; unusually wide labels may require a wider workspace or a smaller **Max text width** setting. Closing the dialog cancels pending generation. Switching charts or replacing the renderer also cancels it.
- **SVG** supports Network, Canvas, Flowchart, Arc, and HEB with either Sigma or G6. It exports editable vector shapes, routed relationships, groups, text, and an optional legend, without embedded bitmap images. Choose current view or complete graph; resolution settings apply only to PNG. SVG uses a separate vector drawing path, so label density and group styling can differ slightly from the live renderer; font appearance depends on the viewer. Use PNG for rendered-image fidelity.
- **JSON**, **CSV**, and **Markdown** export nodes, relationships, or both from the filtered chart in every view mode. Choose **Selection** to export a selected node, a selected relationship with its endpoints, or a selected group's members and internal relationships. Hidden notes, layout bend nodes, and temporary edge segments are excluded; distinct parallel and reverse relationships remain separate.
- Entry exports include note paths and relationship source fields, with optional note metadata (off by default), but never note body text. JSON preserves structured values; CSV uses a UTF-8 BOM and escapes spreadsheet formulas; Markdown produces a linked, readable list. The entry JSON schema is version 1, independent of workspace persistence versions.

## Metadata

### Network layout algorithms

Choose **Graph settings -> Layout -> Algorithm**:

- **ForceAtlas2** remains the default, with the existing optional **Stable** switch.
- **Multilevel stress** is experimental: deterministic coarse placement followed by
  full-graph stress refinement. Both Sigma and G6 use the same layout. Refreshes
  and topology rebuilds recompute from current IDs and links, discarding temporary
  dragging. Only the algorithm choice is saved; no baseline coordinates are saved.

Multilevel stress treats links as undirected, collapses parallel relationships for
layout, and retains the plugin's Group compaction. A deterministic spacing pass
separates nearby nodes, compresses long peripheral tails and packs disconnected
subgraphs by translation. Explicit Groups stay together during packing. This
reduces wasted peripheral space but is not a guarantee against long-label overlap.
Link distance controls initial
scale; force controls still affect temporary D3 interaction. Coarsening can change
when links change, so cluster stability is not guaranteed. Its all-pairs solver
uses quadratic memory and cubic factorization time; large graphs take longer,
with calculation yielding periodically to keep the interface responsive.

### Stable ForceAtlas2 initialization (experimental)

Enable **Graph settings -> Layout -> Stable** to keep ForceAtlas2's full-graph
layout while using fixed initial conditions. Node IDs determine seed coordinates;
nodes and edges are sorted, and every solve runs exactly 250 iterations. The same
graph IDs, structure, Groups, and settings produce repeatable initial coordinates.
**Recalculate layout** recomputes those coordinates after temporary force dragging.
Only the switch is saved, not the current layout.

This mode works with Sigma and G6 and defaults to off. Graph rebuilds recompute
from the same seeds. Adding nodes does not reseed existing nodes, but ForceAtlas2
can still move clusters as the graph changes. Stable currently uses a synchronous
solve, including in large-vault mode; large graphs may briefly pause the UI.

### Flow layout algorithms

Choose **Graph settings -> Layout -> Algorithm -> ELK fully interactive** to
try the experimental Flow alternative. **ELK** remains the default.

The interactive option starts with model-order ELK, then uses the last automatic
layout from the current session to guide cycle breaking, layering, crossing
minimization and node placement. Node/link edits (including undo) run interactive
layout even when **Relayout Flow after connecting nodes** is off. The default
ELK option retains the existing setting and position-preservation behavior.

Only the algorithm choice is saved. Dragged positions are not used as the
interactive reference; reopening the workspace starts without automatic history.
Refresh restores the session's automatic result exactly when layout inputs are unchanged; changed inputs run interactive ELK. Sigma and G6 share the same
layout and logical routes. Cycles and component merges can still cause substantial
movement. This option does not enable the separate shared-port experiment.

### Sigma Network parallel edges

In **Graph settings -> Edges -> Parallel edges**, choose **Straight** or
**Curved** when the renderer is Sigma. This affects multiple relationships
between the same two nodes, including reverse-direction links. The choice is
saved per chart; existing charts default to Straight. Switching does not rerun
the force layout. Single edges, G6, and layout-owned Flowchart/Arc/HEB routes are
unchanged. Curved edges retain arrows, labels, selection and hit testing.

### Performance diagnostics

Enable **Settings -> Community plugins -> Meta Graph -> Diagnostics -> Performance logs**.
Reproduce the problem for 10–15 seconds with each renderer, then copy the console
lines prefixed `[Meta Graph performance]`. Disable the setting afterward.
The switch applies immediately to open Sigma/G6 views and defaults to off.
Summaries contain counts/timings only, never note text or paths; idle windows do
not log. A final partial summary is emitted when an instrumented view closes.

`simulationSolve` measures D3's force evaluation and velocity/position integration
on actual timer ticks, before position publication; it excludes alpha adjustment,
scheduling waits and rendering. Pointer-only publication does not increment it.
It is available for both Sigma and G6, following the global logging toggle.
`simulationPublish` measures copying simulation positions to the runtime graph,
not the force solver itself. G6 `translateSync` measures synchronous element
submission; `forceBatch` includes Group sync and completion, and `forceQueueWait`
is scheduling delay. Sigma `render` includes `process`, so do not add those
times. Canvas `mainDraw` is CPU drawing work, not GPU completion.
G6 splits scheduling into `forceFrameWait` (request to rAF callback) and
`forceDrawQueueWait` (callback to queued task start). Their durations sum to
`forceQueueWait` for a completed batch, but window counts can differ at boundaries.
These waits are elapsed time, not CPU work. `edgePathWriteSkipped` counts unchanged
key/halo paths that avoid redundant writes; moving paths still update normally.
Automatic D3 ticks now enqueue G6 positions without requesting an extra rAF;
`forceSameFrameRequest` counts this path. It does not guarantee same-frame painting.
Pointer bursts and follow-up submissions after busy batches still use rAF, and
all submissions retain draw-queue ordering and latest-position coalescing.
`activePaintInterval` excludes idle gaps of one second or more and is not monitor
FPS. G6 label counts are eligible labels; Sigma's edge-label count excludes its
custom Canvas edge layer. Samples are capped at 4096 per metric/window; full
counts, averages and maxima remain available. Each view has an anonymous session
number. Diagnostics add some overhead and do not require a full browser trace.

Schema 2 adds `totalMs` and G6 synchronous translation breakdowns:
`g6ModelPosition` (per-node model writes), `g6PrepareChanges` (change preparation),
`g6ScheduleElement` (per-element task creation), and `g6ExecuteTasks` (synchronous
task execution). `nodeFastHit`/`edgeFastHit` count actual fast-path calls;
`*FallbackAttributes`, `*FallbackGeometry`, `*Unsupported` and `*Missing` explain
non-hits. Node/edge update and edge path/marker/label timings are nested within
task execution, not additive. Unsupported types are counted but their individual
update duration is not isolated. Missing internal hooks emit `*Unavailable`.
Per-element averages are not per-frame costs: compare `totalMs` over the same
window, or divide by `g6TranslateTotal.count`. Detailed instrumentation adds
overhead; disable Performance logs after collecting a few summaries.

`lightweightTranslateBatch` counts native non-animated batches that bypass
per-element animation task creation and style snapshots. Such batches do not
increment `g6ScheduleElement`; `g6ExecuteTasks` and node/edge update timings still
apply. Custom elements, structural changes and pre-update listeners retain the
original path. Compare `translateSync` and redraw intervals, not just task counts.
`nodeMinimalPositionHit` counts native nodes updated by writing only coordinates
and their transform; retained styles and children are not resubmitted. Mixed
style updates retain the full update path.

Add relationship properties to note frontmatter, then add those metadata field
names in the workspace connection panel. Each property accepts a single string
or an array. Meta Graph only parses connection metadata fields that the
workspace lists explicitly. Charts show every configured relationship by
default. Set `content.query.relations` only to show a subset; an empty list
means all configured relationships.

```yaml
---
domain:
    - astronomy
type: concept

up:
    - '[[Hydrostatic equilibrium]]'

leads-to:
    - '[[Stellar evolution]]'

related:
    - '[[Hertzsprung–Russell diagram]]'
---
```

Parsed metadata relationship directions are:

- Configured connection fields: current note → linked note.
- Two-way and reverse connection modes affect how new links are written from the
  connection panel. Paired mode writes different source and target properties
  and indexes both metadata halves as one logical relationship.

Unresolved links are ignored. Enable **Debug unresolved links** in the plugin
settings to report them in the developer console.

## Usage

1. Enable **Meta Graph** in **Settings → Community plugins**.
2. Run **Create graph** from the command palette.
3. Add or select a chart in the graph toolbar. Network, 3D network, Cube, Canvas, Flowchart,
   Arc, and HEB (hierarchical edge bundling) layouts each keep
   their own source, query, layout, display, and style settings. Network, Canvas, Flowchart, Arc, and HEB views can
   use Sigma or G6; choose the renderer while creating/configuring the view or
   under **Graph settings → Renderer**. Existing and new views default to Sigma.
4. Use the flat toolbar settings buttons to edit graph settings, filters, note
   styles, link styles, and groups in one panel.
5. Use **Source → Query** for filter-driven charts, or **Source → Workspace**
   to manually add a fixed set of notes. Workspace source shows workspace files,
   including isolated notes, and existing metadata links between them.
   Both sources share the **Node list** panel. Query lists the current graph result;
   Workspace lists saved members, including hidden and missing files. Panel
   search and **Filter node list** only narrow the list and do not change the graph.
   Both sources support single-node and batch group assignment (except 3D network;
   Cube requires a group). Adding, removing, hiding, and manual ordering remain
   Workspace-only list actions.
   Click a node row to select only that row. `Ctrl`/`Cmd`-click toggles
   individual rows; `Shift`-click selects a range in the visible list, and
   `Ctrl`/`Cmd`+`Shift`-click adds a range. Selected rows are highlighted.
   Group, visibility, open, and remove controls
   act independently of row selection.
   Selection is temporary: switching charts clears it, and Query refresh removes
   selections that have left the result. Unresolved links can be located but
   cannot be opened as existing notes.
6. Set workspace default note/link styles, then optionally add one chart
   override card. If no chart override exists, the chart inherits the workspace
   default.
7. Add filters and style rules for **All views** or **This view**. File
   filters support file name, path, folder, extension, tags, links, and
   frontmatter property presence.
8. **Text -> Max text width** limits node/link text width in pixels, not characters.
   `0` keeps full text (default). Text is measured using its font and size;
   the `...` suffix fits inside the limit. Width is specified at 100% zoom
   and scales with text. Original names and search remain unchanged;
   changing this setting does not rerun layout.
   Hovering a node reveals its full name. Local hover and pinned focus reveal
   full names for the focused node and its neighbors; leaving restores the limit.
   The collapsible **Legend** at the bottom-right lists configured node/link
   styles for the active chart, including defaults and Global/Chart rules.
   It uses custom rule names or matching conditions and updates live. Hover an
   entry for its condition; rules can overlap, and the legend is not a count of
   currently matched nodes or links.
   Rules can have an optional **Name** in their editor. Without a name, the card
   title shows the matching condition including its operator (for example,
   **Source field is related**). Named rules keep that condition in the summary.
   Names are saved with rules and do not change matching or priority.
   Note/link conditional style rules and Workspace default appear as compact
   summaries. Click a card to open one floating editor beside it. Changes apply live;
   the graph remains interactive. Close the editor with **×** or **Esc**;
   switching charts closes the editor. Use the card's arrows or drag handle to
   reorder rules or transfer them between Global and Chart sections. Drop on a
   section heading to append, including empty sections, or on a card to choose
   an insertion position. Other override sections remain inline.
   Move note/link style rules between global and chart scopes with each rule's
   move action. Open the view menu → **Apply configuration…** to reuse settings
   from another view or import a configuration JSON file. Styles are selected by
   default; optionally include layout (same view type only), panels, or groups.
   Groups are added with unique names; existing manual assignments are preserved.
   Query, note selection, and node positions are not transferred. Use **Duplicate
   view** for a complete copy. The dialog's **Export** action saves selected
   settings to a new JSON file in the vault root for transfer to another workspace.
   Exported styles include workspace defaults and rules as local view settings;
   importing never changes the destination workspace defaults.
9. Add link style rules by relation or source frontmatter field. Choose circle,
   square, diamond, triangle, hexagon, or star note shapes in workspace
   defaults, chart overrides, and note style rules. Note and link colors, sizes,
   line style, labels, and hidden
   state update the visible graph without rerunning layout. Color inputs are
   throttled while dragging so changes preview live without rebuilding the graph
   for every pointer event.
   When two or more relationships connect the same notes (for example `pre` and
   `related`), Meta Graph assigns stable parallel lanes and draws them on a
   dedicated Canvas layer. Short endpoint stubs and lanes only a few pixels
   apart keep paths, arrows, and labels distinct without widening the layout.
10. Use **Group** settings to add chart-local groups, set priority, colors,
    padding, and Manual assignment or Rule-based membership in Network, Canvas,
    Flowchart, Arc, and Hierarchical edge bundling. Each note belongs to at most one
    group. Rule-based membership is authoritative. When several rules match,
    a manual choice between those matching groups resolves ownership. Nodes with
    no matching rules can move between Manual groups or become ungrouped.
    Group controls show No group and are disabled when no destinations exist; batch moves list only
    destinations valid for every selected node. Incompatible saved overrides
    are removed when the index refreshes. Network, Arc, Hierarchical edge bundling, Flowchart, Canvas, and Cube render
    groups according to their layout. Every non-Cube layout uses the same colored
    member halo, faint region, horizontal title pill, and interaction states.
    Network regions follow their members automatically; Canvas frames keep editable
    size and position; Flowchart, Arc, and HEB retain layout-specific region shapes.
    Use **Shape** on Network or Canvas groups to choose Auto, Circle, or Rectangle;
    Auto uses circles in Network and rectangles in Canvas. Canvas circles keep a square
    diameter while resizing. Groups are saved in the workspace file, not note
    frontmatter.
11. Increase **Label density** in **Graph** settings when Sigma samples too few
    labels while zoomed out. Use **Label settings** for **Always show labels** and
    the shared font controls. In 3D network and Cube layouts, use **3D text clarity**
    there to increase label texture resolution; higher settings use more GPU
    memory. In Arc views, **Label angle** is also under **Label settings** and
    supports Auto, 0°, 45°, or 90°. Auto keeps Right/Left labels horizontal and
    rotates Up/Down labels vertically.
12. Use the bottom connection panel to select the metadata field and direction
    used for new links. Switch between a horizontally scrolling single row and
    a wrapped multi-row layout. Select **+** to open the combined metadata and
    direction editor; right-click a connection to edit, move, or remove it.
13. Use **Details** for quick connections, or drag the link button on a pinned
    note or template to a graph node. `Ctrl`/`Cmd`-drag between graph nodes remains
    an advanced shortcut. One-way writes the source note only; two-way writes both
    notes so each note links to the other. Paired writes the selected source
    property on the source note and a distinct target property on the target
    note; both writes share one Undo operation.
14. In Sigma Network, force dragging stops inside the visible canvas with a
    node-size-aware margin; the coordinate bounds stay fixed during motion.
    Canvas dragging and Ctrl connection gestures are unchanged.
    In Network views, enable **Force layout** in **Graph** settings to drag nodes
    through the force-directed layout. Nearby nodes can move with the graph
    forces, and the layout keeps settling briefly after release. Use
    **Link distance** first to adjust spacing, **Center force** for compactness,
    **Repel force** for separation, and **Link force** for connected-node response.
    **Reset forces** restores the recommended defaults. Dragging stays active
    while the pointer is held, and release cools smoothly. Neighbors move through
    springs; no direct neighbor shifts or extra return pull are applied.
    Both Sigma and G6 use the selected Network layout and D3 simulation.
    With the default ForceAtlas2 algorithm and Stable disabled, the Network view
    runs ForceAtlas placement on first layout and when **Recalculate layout**
    is explicitly requested. That action recalculates positions for the current graph
    using current settings. Ordinary data refreshes, force setting changes, added
    notes, and added links keep existing positions.
    New nodes are placed near positioned neighbors when possible, then Force
    layout can move them through the force field. `Ctrl`/`Cmd`-drag still creates
    links.
15. In Canvas views, drag nodes directly to place them by hand. Canvas views do not
    run an automatic layout after the first placement, and dragged node
    positions are saved in the workspace file.
16. Drag a group title to move the group. Network pins its members while connected
    outside nodes continue simulating, then releases the members on drop;
    Canvas saves the frame and member positions. In Canvas, use any edge
    or corner handle to resize the region without changing membership.
17. In Canvas, drag a node into an eligible group frame to assign it.
    Rule-based nodes can only switch between overlapping matching groups;
    nodes without matching rules can move into Manual groups or out into empty space. Use
    **Automatic** in Details to return the note to rule-based ownership.
18. In Cube views, each cube face is a locked System group. Cube keeps its
    face-based colors instead of adding member halos. Select or right-click a face
    for Group details; drag the background to
    rotate the cube, drag nodes within their face to save their placement, use
    `Shift`-click for local relationship focus, right-click for a contextual menu,
    and `Ctrl`/`Cmd`-drag between nodes to add links. Use **Face opacity** in
    **Graph** settings to control cube face transparency.
19. Use **Details**, **Pinned notes**, and **Templates** in the right panel. Only
    one tab is shown at a time. Pinned notes use the same searchable, filterable
    **Add notes** picker as the Workspace Node list panel. Template editing opens in a modal;
    drag a row to the graph or use its explicit **Create** and link buttons.
    Selecting a relationship keeps that metadata link prominent and lists other
    indexed links between the same notes separately. Selecting a Group shows its
    membership policy, spatial behavior, visible members, rules, and conflicts.
20. Click a graph node to select it; double-click or press `Enter` to open it.
    Press `Space` while hovering a node to pin or unpin its relationship focus.
    With no hovered node, `Space` clears the current pinned focus. `Esc` closes
    the active graph popup first, then clears list or graph selection.
21. Use **Undo connection** / **Redo connection** in the graph toolbar. While the
    workspace is focused, `Ctrl+Z` / `Cmd+Z` undoes and
    `Ctrl+Shift+Z` / `Cmd+Shift+Z` (or `Ctrl+Y` / `Cmd+Y`) redoes connection edits
    from the current session. New connection edits clear redo history.
22. Keyboard graph controls: `Ctrl+F` / `Cmd+F` finds a note, `0` fits the graph,
    `1` resets zoom, `+` and `-` zoom, `Shift+R` refreshes notes and links, and `?`
    toggles a side-by-side shortcut reference panel that remains visible while
    operating the graph. These actions are also available in Obsidian's command
    palette, where users can assign custom hotkeys. In the Node list panel, `Enter`
    opens the focused note and `Space` selects it with the same Ctrl/Cmd/Shift
    modifiers as clicking. In Pinned notes and Templates, `Space` toggles selection.
23. Choose **Open notes in** under **Settings -> Meta Graph** to open notes in a
    new tab or a reused right split. Use the fold/unfold button in **Details** to show
    read-only note content below its metadata. **After creating a note** controls whether
    template-created notes stay on the graph or open with the same policy.
24. Select **Debug** to inspect or copy the current query, projection,
    canonical index, adjacency maps, unresolved links, and performance timings
    as JSON.
25. Choose **Large vault mode** under **Settings -> Meta Graph**. **Auto**
    enables cooperative rendering and layout workers at 5,000 Markdown files.
    When active, metadata edits use incremental per-file indexing; file create,
    delete, and rename operations use a conservative full rebuild to preserve
    link resolution correctness.

Style fallback is field-by-field:

```text
chart matching rule
→ workspace global matching rule
→ chart override card, when present
→ workspace default
→ built-in default
```

Markdown files with this frontmatter open as graph workspaces:

```yaml
---
meta-graph: workspace
meta-graph-version: 2
---
# Chart names can change; references use stable chart IDs.
defaultChart: knowledge-map

shared:
    filters:
        nodes: { id: shared-root, kind: group, mode: all, children: [] }
        relations: []
    # Workspace style defaults stay explicit so upgrades do not restyle old files.
    style:
        node: { color: '#7c6ff0', size: 7 }
        link:
            color: '#888888'
            size: 1.5
            lineStyle: solid
            label: ''
            showLabel: false
            hidden: false
        nodeRules: []
        linkRules: []

connections:
    default: prerequisite:paired:next
    # Runtime IDs are property:mode, or property:paired:reverseProperty.
    fields:
        - property: leads-to
          mode: directed
        - property: prerequisite
          mode: paired
          reverseProperty: next

resources:
    # Pins are shared across every chart and store paths directly.
    pinnedNotes:
        - Projects/Index.md
    templates:
        - id: concept
          label: Concept
          template: Templates/Concept.md
          targetFolder: Notes

charts:
    - id: knowledge-map
      name: Knowledge map
      type: graph
      # Optional. Older plugin versions ignore this extension and use Sigma.
      extensions:
          meta-graph:
              renderer: g6
      # Query configuration remains available while curated is active. Source only
      # selects which projection runs.
      content:
          source: curated
          links: { plain: false, unresolved: false }
          query:
              roots: [Projects/Index.md]
              traversal: { depth: 2, direction: both }
              # Empty means all configured connection metadata fields.
              relations: []
              limit: 500
              includeIsolated: true
              filter: { id: query-root, kind: group, mode: all, children: [] }
      # One registry owns curated membership, visibility, positions, and explicit
      # group assignments. Entries without curated: true only retain layout data
      # for query-derived nodes.
      nodes:
          Projects/Index.md:
              curated: true
              x: -0.72
              y: 1.14
          Concepts/Graph.md:
              curated: true
              hidden: true
              group: concepts
      layout:
          spacing: 1
          forces:
              center: 1
              repel: 10
              link: 1
              dragLink: 1
              return: 1
              linkDistance: 250
      groups:
          # Manual mode is valid only for Network and Canvas. Flowchart, Arc, and HEB
          # groups use Rule. Cube system groups omit mode.
          - id: concepts
            name: Concepts
            color: '#7c6ff0'
            mode: manual
            shape: rectangle
            padding: 0.32
            frame:
                x: -1
                y: -1
                width: 4
                height: 3
      display:
          fadeDistance: 1.5
          labels:
              size: 14
              threeResolution: standard
              bold: false
              italic: false
              position: auto
              offset: 1
              color: ''
              lightTextColor: '#111111'
              lightBackgroundColor: '#ffffff'
              lightBackgroundOpacity: 0.82
              darkTextColor: '#ffffff'
              darkBackgroundColor: '#000000'
              darkBackgroundOpacity: 0.62
              backgroundOpacity: 0.82
              density: 0.8
              force: false
          forceLayout: false
      # File-authored initial UI values. Personal overrides live in data.json.
      presentation:
          panels: { filters: true, inspector: true }
          widths: { dock: 280, curated: 300 }
          focusOnSelect: true
      templateOverrides:
          concept: { defaultGroup: concepts }
      style:
          node: {}
          unresolvedNode: {}
          link: {}
          plainLink: {}
          unresolvedLink: {}
          nodeRules: []
          linkRules: []
```

The example comments are explanatory; generated YAML does not preserve comments.
The serializer also omits default values and empty chart structures.
Node `group` remains the canonical membership field. For Cube charts it contains a
fixed system group such as `cube-front`; those groups omit `mode` because they are
neither user-created Manual groups nor Rule groups.
Use **Open graph as Markdown** to edit the backing YAML directly. Opening a v1 file
migrates it in memory. The plugin writes v2 only after the first semantic edit. Files
with a newer version open read-only and are never overwritten by the v2 serializer.

Personal state lives under `workspaceSessions` in the plugin's `data.json`: active
chart, active connection, right-panel tab, panel widths and visibility, collapse
states, and focus preference. Selection, hover, projections, layout revisions, undo,
and renderer state are runtime-only.

## Flowchart layout behavior

Flowchart charts use ELK layered layout. By default, adding or undoing connection
links refreshes the visible edges without relaying out existing nodes. This
keeps editing stable while you add multiple links. Select **Recalculate layout** to run the
Flowchart layout manually.

Flowchart layout has two spacing controls. **Layer spacing** controls distance along
the flow direction. **Lane spacing** controls distance across parallel lanes.
For left-to-right and right-to-left flows, layer spacing is horizontal and lane
spacing is vertical.

The **Line** setting supports **Straight**, **Curve**, **Orthogonal**, and
**Bundled**.
Curve follows ELK's layer-aware polyline route and smooths its bends into a
continuous path. Direct links receive a small deterministic bow so parallel
links remain easier to distinguish.
All relationships between the same pair of notes also receive deterministic
parallel lanes. Sigma keeps rendering ordinary single edges with its native
programs, while a DPR-aware Canvas overlay renders only multi-edge pairs with
compact screen-pixel routes, rounded joins, arrows, patterns, labels, and edge
hit testing. Off-screen routes are culled and route geometry is cached. Lane
metadata remains runtime-only, so frontmatter and the semantic projection are
unchanged.
G6 renders each Curve, Orthogonal, and Bundled relationship as one logical
Polyline using the route produced by the Flowchart layout; bend nodes and runtime
segments are not added to the G6 element model. Straight relationships retain
the native G6 line/parallel-edge representation. Selection, hover, focus,
labels, arrows, and context menus continue to use the logical relationship ID.
Edge-only Flowchart refreshes keep node positions while separating newly added
links. Flowchart arrows stay on the final flow-axis segment instead of pointing
along a perpendicular endpoint branch.
When **Orthogonal** or **Bundled** is selected, **Corner radius** controls how
much each right-angle turn is softened. A value of `0` keeps sharp corners;
larger values add a short curve approximation without changing ELK's
layer-aware routing or bundled corridors.
Bundled routing shares clear channels only for same-source fan-out or same-target
fan-in edges, then fans each edge out near its source or target. Unrelated
many-to-many crossings stay on separate orthogonal routes, and separate bundles
reserve different corridors. This can reduce repeated long routes in dense charts
while keeping each connection traceable. Labels remain attached to each edge's
target branch.

Flowchart keeps normal ELK node sizes, with modest group padding and a 40-unit title
band (80 for circles). Short group titles reserve their measured nominal width;
node text does not inflate every layout node. Fit includes the complete node and
group bounds without enforcing a physical zoom floor.

Group capsules share the existing text size, bold, italic, and scale-with-zoom
settings with node labels. Capsule text uses the same resolved on-screen font
size; padding, border and background scale with it. Their graph-coordinate
anchor stays fixed in the header. Font changes update live without rerunning
layout or enlarging groups. There is no sidebar, relocation or connector line.
Hover a shortened title for its full name.

Flowchart groups participate in ELK layout as compound containers. Group rules and
explicit assignments keep notes inside one colored container while preserving
cross-group links. Changing group membership, priority, or padding reruns Flowchart
layout. Edge-only refreshes still preserve existing node positions and update
the group bounds without forcing a new layout. G6 maps the same layout-owned
container bounds through its viewport transform, including selection, hover,
focus muting, dock highlighting, and member halos.

Use **Graph settings → Flowchart details → Relation placement** to control layout by
metadata relation. **Default** follows the visible edge direction. **Before**
and **After** place the linked note relative to the note that owns the metadata
field. **Parallel** keeps connected notes in the same layer. These rules affect
layout only; they do not change frontmatter, edge direction, or arrows.

Enable **Relayout Flowchart after connecting nodes** in the plugin settings if you
want Flowchart charts to rerun layout immediately after each new connection.

Style-only edits such as note/link colors, sizes, line style, labels, and
hidden state do not run ELK layout. They update the existing runtime graph and
refresh the renderer in place, including Flowchart routed edge segments.

## Development

This project uses pnpm, TypeScript, Svelte, Sigma.js, Graphology, D3,
ForceAtlas2, ELK.js, esbuild, and Vitest.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm dev` runs the esbuild watcher. The production build writes `main.js` at
the plugin root; generated build artifacts are not committed.

## Architecture

```text
Obsidian MetadataCache
  -> MetadataIndexer
  -> KnowledgeIndex
  -> GraphQueryEngine or CuratedProjectionEngine
  -> GraphProjection
  -> GraphologyAdapter
  -> LayoutEngine
  -> SigmaRenderer
```

The canonical knowledge model uses plain TypeScript maps and sets. Graphology is
created from each projection and is only the runtime container used by the
layout and rendering layers. Hierarchical edge bundling uses D3 hierarchy for
layout calculation, then renders the positioned graph through Sigma.js or G6.
G6 receives one layout-owned logical Polyline per bundled relationship instead
of HEB bend nodes and segments. Radial Group sectors use the same layout
geometry, viewport transform, selection, hover, focus, and hit-testing rules as
Sigma.

Workspace rendering separates structural changes from display changes. Query,
projection, source, mode, and layout changes rebuild the runtime graph. Display
settings and style-only edits update the existing renderer or runtime graph in
place, avoiding unnecessary layout work while users tune visual settings.

Large vault mode keeps startup indexing behind Obsidian layout readiness and
shares one index service across open workspaces. Metadata edits replace one
cached file record and patch affected nodes, edges, tag/domain counts, and
unresolved-link ownership in place. Large first renders publish provisional
positions before layout completes, yield between render stages, and run large
ForceAtlas layouts in a Web Worker when the host supports workers. The Debug
panel records index, projection, runtime graph, layout, renderer application,
and total render timings.

### Related context

In a query chart, open **Filters -> Related context** below **This view** and enable it to include connected notes outside the current view's filter. Choose all configured relationship fields or search and select individual fields, then choose **Both**, **Outgoing**, or **Incoming**, and **1–3 layers**. All relationship fields shares one direction and layer setting. Selected fields shows a compact row with a direction dropdown and layer slider for each field; switching modes retains those choices. Layers count distance from the core, including paths that mix selected relationships. Direction follows graph arrows at each step; undirected relationships work both ways.

For example, filter for economics and expand `related` plus a custom mathematics relationship to include surrounding knowledge. Fields must be configured as workspace connection fields and contain note relationships; ordinary metadata text values do not create connections. Plain and unresolved links are not used for expansion.

**This view** filters select the core notes. Added notes can fail those filters, while **All views** filters remain a boundary. Put exclusions that must also apply to added notes in **All views**. Link filters and the chart's node limit still apply. Added nodes carry a small upper-right chain-link badge. Their names, colors, shapes, and opacity stay unchanged. Use **Show context badges** to hide the markers. The legend explains the badge, and node Details always shows Core match or Added context. The panel reports visible core and added counts. Expansion defaults to off; settings are saved per chart. Curated charts retain their explicit file selection.

Visible unresolved nodes display a `?` badge in query and curated charts. This status marker is independent of the related-context badge toggle and takes priority if both statuses apply.

**Unresolved links** use the same default appearance as plain links. Both retain independent style settings; existing custom overrides continue to apply. The `?` node badge distinguishes unresolved destinations.

Existing notes without body content show a blank-document badge, including notes containing only properties or whitespace. The badge updates with the metadata index when content changes and remains visible independently of context badges.

Sigma Flowchart parallel Curve edges taper their spacing near nodes and join outside node boundaries. Endpoint sampling adapts to screen-space curvature, with the same geometry used for drawing and hit testing.

### Trace paths and reachability

Enable **Overlays -> Trace** to show the compact Trace panel in the lower-right graph corner. The toggle is saved per chart and defaults off. Trace, Minimap, and Legend can occupy any corner. Panels in the same corner share tabs; Timeline occupies the top or bottom, and corner panels leave space for it. Switching tabs or collapsing Trace preserves the active highlight; a dot on the Trace tab indicates an active trace. Relationship fields, direction, and layers are directly visible in the panel. Choose a start node to begin. Clear an endpoint with its × button or by emptying its input. Click the active graph-pick button again or press Escape to cancel picking; otherwise Escape clears the trace. Use the Trace overlay toggle to hide the panel.

Right-click a node and choose **Trace upstream**, **Trace downstream**, or **Find shortest path from here**. The Trace panel offers **Reachability** and **Between nodes** modes. Search for start/end nodes or use their pick buttons to select them in the graph; temporary **A** and **B** badges identify the endpoints. While picking, an accent-colored prompt identifies the endpoint, the active pick button says **Cancel picking**, and the graph cursor becomes a crosshair. Selecting one node exits picking; use the prompt’s **Cancel** button or **Esc** to cancel. Swap endpoints to reverse a path search.

Choose **All relationship fields** or **Selected fields** to trace metadata relationships. All fields share a direction; selected fields each use **Follow arrows**, **Against arrows**, or **Both**. Undirected fields always traverse both ways. Ordinary metadata values and body links are not relationship-field choices. Reachability offers a shared 1–10 layer limit or **All**; path mode finds one shortest path without that range limit.

Tracing uses the current visible graph and does not expand filters. Nodes and links within the trace retain their original colors and styles; only elements outside the trace fade temporarily. While a trace result is active, Local hover and pinned-neighborhood focus cannot change that range. Individual nodes and links remain selectable; clearing Trace restores Local focus. Layout positions and saved styles remain intact. Clear the start node or press **Esc** outside graph picking to restore the normal appearance. Switching charts, refreshing the projection, or previewing the timeline clears the trace.

### Overlay layout

Open **Overlays** in the toolbar to set each panel’s visibility and position for the current view.

- **Node list**, **Details**, **Pinned notes**, and **Templates** can each be placed on the left or right. Panels on the same side share tabs and a resize handle.
- **Minimap**, **Legend**, and **Trace** can occupy any of the four corners. Panels in the same corner share tabs. Top panels expand downward; bottom panels expand upward.
- **Timeline** can be placed at the top or bottom.

Positions, visibility, and active tabs are saved per view. Hiding a panel preserves its contents and position. Existing workspaces retain Node list on the left, Details / Pinned notes / Templates on the right, small overlays at the bottom right, and Timeline at the bottom.

Graph settings → Node badges controls visibility, relative size (25–200%), and corner position for status and Trace endpoint badges. Settings are saved per view; badges continue to scale with nodes and zoom.

### Development baselines

Run `pnpm baseline` to generate production JS size/dependency reports and deterministic
CPU measurements. See [baseline instructions](docs/baselines/README.md) for scope,
comparison rules, recorded results, and the Obsidian runtime measurement protocol.

**Refresh nodes** reloads notes and links without forcing a full layout; changed data follows the selected algorithm's normal incremental behavior. **Recalculate layout** recomputes the current graph without reloading notes. In ELK fully interactive mode, it discards previous automatic geometry and starts a fresh layout. Both actions are available in the toolbar and blank-canvas context menu. Canvas manual positions remain saved.
