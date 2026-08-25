# Meta Graph

Meta Graph creates Markdown-backed graph workspaces from semantic relationships
stored in Obsidian note properties. A graph workspace is an ordinary Markdown
file with `meta-graph: workspace` frontmatter and YAML chart settings in the
body.

## Metadata

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
  connection panel. Metadata parsing still follows the stored metadata link.

Unresolved links are ignored. Enable **Debug unresolved links** in the plugin
settings to report them in the developer console.

## Usage

1. Enable **Meta Graph** in **Settings → Community plugins**.
2. Run **Create graph** from the command palette.
3. Add or select a chart in the graph toolbar. Graph, 3D graph, Cube, Free, Flow,
   Arc, and HEB (hierarchical edge bundling) layouts each keep
   their own source, query, layout, display, and style settings.
4. Use the toolbar settings buttons to edit graph settings, filters, note
   styles, and link styles in one panel.
5. Use **Source → Query** for filter-driven charts, or **Source → Workspace**
   to manually add a fixed set of notes. Workspace source shows workspace files,
   including isolated notes, and existing metadata links between them.
6. Set workspace default note/link styles, then optionally add one chart
   override card. If no chart override exists, the chart inherits the workspace
   default.
7. Add filters and style rules for **All views** or **This view**. File
   filters support file name, path, folder, extension, tags, links, and
   frontmatter property presence.
8. Move note/link style rules between global and chart scopes with each rule's
   move action. Use **Copy chart styles** and **Paste chart styles** to transfer
   chart overrides and rules between charts.
9. Add link style rules by relation or source frontmatter field. Choose circle,
   square, diamond, triangle, hexagon, or star note shapes in workspace
   defaults, chart overrides, and note style rules. Note and link colors, sizes,
   line style, labels, and hidden
   state update the visible graph without rerunning layout. Color inputs are
   throttled while dragging so changes preview live without rebuilding the graph
   for every pointer event.
10. Use **Group** settings to add chart-local groups, set priority, colors,
   padding, and Manual or Rule membership. Each note belongs to at most one
   group; an explicit assignment or Ungrouped override takes priority over
   rules. Graph, Arc, Hierarchical edge bundling, Flow, Free, and Cube render
   groups according to their layout. Graph and Free share the same group frame,
   label, and colored member rings without creating metadata links. Graph
   frames follow their members automatically; Free frames keep editable size
   and position. Use **Shape** on each group to choose Auto, Circle, or Rectangle;
   Auto uses circles in Graph and rectangles in Free. Free circles keep a square
   diameter while resizing. Groups are saved in the workspace file, not note
   frontmatter.
11. Increase **Label density** in **Graph** settings when Sigma samples too few
    labels while zoomed out. Enable **Always show labels** to force every visible
    note label through Sigma's label grid. In 3D graph and Cube layouts, use
    **3D text clarity** in **Text style** to increase label texture resolution;
    higher settings use more GPU memory. In Arc views, use **Label angle** under
    **Arc details** to select Auto, 0°, 45°, or 90°. Auto keeps Right/Left labels
    horizontal and rotates Up/Down labels vertically.
12. Use the bottom connection panel to select the metadata field and direction
    used for new links. To add a field or another direction for an existing
    field, enter the metadata name, choose **One-way**, **Two-way**, or
    **Reverse**, then select **+**. Input and direction changes remain drafts
    until added.
13. Use **Details** for quick connections, or drag the link button on a pinned
    note or template to a graph node. `Ctrl`-drag between graph nodes remains an
    advanced shortcut. One-way writes the source note only; two-way writes both
    notes so each note links to the other.
14. In Graph views, enable **Force layout** in **Graph** settings to drag nodes
    through the force-directed layout. Nearby nodes can move with the graph
    forces, and the layout keeps settling briefly after release. Use
    **Center force**, **Repel force**, **Link force**, **Drag link force**,
    **Return force**, and **Link distance** to tune the graph toward Obsidian's
    built-in graph behavior. The Graph view
    only runs its initial ForceAtlas placement once for a chart; later refreshes,
    force setting changes, added notes, and added links keep existing positions.
    New nodes are placed near positioned neighbors when possible, then Force
    layout can move them through the force field. `Ctrl`-drag still creates
    links.
15. In Free views, drag nodes directly to place them by hand. Free views do not
    run an automatic layout after the first placement, and dragged node
    positions are saved in the workspace file.
16. Drag a group title to move the group. Graph pauses and then resumes its force
    simulation; Free saves the frame and member positions. In Free, use any edge
    or corner handle to resize the region without changing membership.
17. In Free, drag a node into any group frame to create an explicit assignment.
    Drag it out over empty space to set an explicit **Ungrouped** override. Use
    **Automatic** in Details to return the note to rule-based ownership.
18. In Cube views, each cube face is a group. Drag the background to
    rotate the cube, drag nodes within their face to save their placement, use
    `Shift`-click for local relationship focus, right-click for selection
    details, and `Ctrl`-drag between nodes to add links. Use **Face opacity** in
    **Graph** settings to control cube face transparency.
19. Use **Details**, **Pinned notes**, and **Templates** in the right panel. Only
    one tab is shown at a time. Pinned notes use the same searchable, filterable
    **Add notes** picker as Workspace files. Template editing opens in a modal;
    drag a row to the graph or use its explicit **Create** and link buttons.
20. Use **Undo** in the connection panel, or `Ctrl+Z` / `Cmd+Z` while the
    workspace is focused, to undo connection edits made in the current workspace
    session.
21. Choose **Open notes in** under **Settings -> Meta Graph** to open notes in a
    new tab or a reused right split. Use the fold/unfold button in **Details** to show
    read-only note content below its metadata. **After creating a note** controls whether
    template-created notes stay on the graph or open with the same policy.
22. Select **Debug** to inspect or copy the current query, projection,
    canonical index, adjacency maps, unresolved links, and performance timings
    as JSON.
23. Choose **Large vault mode** under **Settings -> Meta Graph**. **Auto**
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
    default: leads-to:directed
    # Runtime IDs are derived as property:mode.
    fields:
        - property: leads-to
          mode: directed

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
          # Manual mode is valid only for Graph and Free. Flow, Arc, and HEB
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

## Flow layout behavior

Flow charts use ELK layered layout. By default, adding or undoing connection
links refreshes the visible edges without relaying out existing nodes. This
keeps editing stable while you add multiple links. Select **Refresh** to run the
Flow layout manually.

Flow layout has two spacing controls. **Layer spacing** controls distance along
the flow direction. **Lane spacing** controls distance across parallel lanes.
For left-to-right and right-to-left flows, layer spacing is horizontal and lane
spacing is vertical.

Flow groups participate in ELK layout as compound containers. Group rules and
explicit assignments keep notes inside one colored container while preserving
cross-group links. Changing group membership, priority, or padding reruns Flow
layout. Edge-only refreshes still preserve existing node positions and update
the group bounds without forcing a new layout.

Use **Graph settings → Flow details → Relation placement** to control layout by
metadata relation. **Default** follows the visible edge direction. **Before**
and **After** place the linked note relative to the note that owns the metadata
field. **Parallel** keeps connected notes in the same layer. These rules affect
layout only; they do not change frontmatter, edge direction, or arrows.

Enable **Relayout Flow after connecting nodes** in the plugin settings if you
want Flow charts to rerun layout immediately after each new connection.

Style-only edits such as note/link colors, sizes, line style, labels, and
hidden state do not run ELK layout. They update the existing runtime graph and
refresh the renderer in place, including Flow orthogonal edge segments.

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
layout calculation, then renders the positioned graph through Sigma.js.

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
