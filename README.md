# Meta Graph

Meta Graph creates Markdown-backed graph workspaces from semantic relationships
stored in Obsidian note properties. A graph workspace is an ordinary Markdown
file with `meta-graph: workspace` frontmatter and YAML chart settings in the
body.

## Metadata

Add relationship properties to note frontmatter, then add those metadata field
names in the workspace connection panel. Each property accepts a single string
or an array. Meta Graph only parses connection metadata fields that the
workspace lists explicitly.

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
8. Add link style rules by relation or source frontmatter field.
   Note and link colors, sizes, line style, labels, and hidden state update the
   visible graph without rerunning layout. Color inputs are throttled while
   dragging so changes preview live without rebuilding the graph for every
   pointer event.
9. Use **Group** settings to add chart-local groups, rename them, set colors,
   and edit their Free-view region geometry. Groups are saved in the workspace
   file, not note frontmatter.
10. Increase **Label density** in **Graph** settings when Sigma samples too few
    labels while zoomed out. Enable **Always show labels** to force every visible
    note label through Sigma's label grid. In 3D graph and Cube layouts, use
    **3D text clarity** in **Text style** to increase label texture resolution;
    higher settings use more GPU memory. In Arc views, use **Label angle** under
    **Arc details** to select Auto, 0°, 45°, or 90°. Auto keeps Right/Left labels
    horizontal and rotates Up/Down labels vertically.
11. Use the bottom connection panel to select or add the metadata field used for
    new links. Set the field direction to **One-way** or **Two-way** from the
    direction dropdown.
12. Use **Details** for quick connections, or drag the link button on a pinned
    note or template to a graph node. `Ctrl`-drag between graph nodes remains an
    advanced shortcut. One-way writes the source note only; two-way writes both
    notes so each note links to the other.
13. In Graph views, enable **Force layout** in **Graph** settings to drag nodes
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
14. In Free views, drag nodes directly to place them by hand. Free views do not
    run an automatic layout after the first placement, and dragged node
    positions are saved in the workspace file.
15. In Free views, drag a group title to move the group. Notes already assigned
    to that group move with it. Drag the bottom-right group handle to resize the
    region.
16. Drag a node into a manual group and release to assign it to that group.
    Drag it out and release over empty space to remove it from the group.
17. In Cube views, each cube face is a group. Drag the background to
    rotate the cube, drag nodes within their face to save their placement, use
    `Shift`-click for local relationship focus, right-click for selection
    details, and `Ctrl`-drag between nodes to add links. Use **Face opacity** in
    **Graph** settings to control cube face transparency.
18. Use **Details**, **Pinned notes**, and **Templates** in the right panel. Only
    one tab is shown at a time. Pinned notes use the same searchable, filterable
    **Add notes** picker as Workspace files. Template editing opens in a modal;
    drag a row to the graph or use its explicit **Create** and link buttons.
19. Use **Undo** in the connection panel, or `Ctrl+Z` / `Cmd+Z` while the
    workspace is focused, to undo connection edits made in the current workspace
    session.
20. Choose **Open notes in** under **Settings -> Meta Graph** to open notes in a
    new tab or a reused right split. Use the fold/unfold button in **Details** to show
    read-only note content below its metadata. **After creating a note** controls whether
    template-created notes stay on the graph or open with the same policy.
21. Select **Debug** to inspect or copy the current query, projection,
    canonical index, adjacency maps, and unresolved links as JSON.

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
meta-graph-version: 1
---
charts:
    - id: knowledge-map
      name: Graph
      type: graph
      source: query
      query:
          roots: []
          folders: []
          tags: []
          domains: []
          relations: [prerequisite, leads-to, related]
          depth: 2
          direction: both
          maxNodes: 200
      curated:
          files: []
          context:
              enabled: false
              depth: 0
              includeOutgoingLinks: true
              includeBacklinks: true
              includeMetadataRelations: true
      layout:
          engine: force-atlas
          spacing: 1
          centerForce: 1
          repelForce: 10
          linkForce: 1
          dragLinkForce: 1
          returnForce: 1
          linkDistance: 250
          manual:
              nodes: {}
              groups: []
      display:
          fadeDistance: 1.5
          enableForceLayout: false
          showInspector: true
          showFilters: true
      style:
          nodeOverrides: {}
          linkOverrides: {}
          nodeRules: []
          linkRules: []

globalQuery:
    roots: []
    folders: []
    tags: []
    domains: []
    relations: []
    hiddenNodeRules: []
    depth: 2
    direction: both
    maxNodes: 200
globalStyle:
    defaultNodeStyle:
        color: '#7c6ff0'
        size: 7
    defaultLinkStyle:
        color: '#888888'
        size: 1.5
        lineStyle: solid
        label: ''
        showLabel: false
        hidden: false
    nodeRules: []
    linkRules: []
activeChart: knowledge-map
connectionFields: []
connectionFieldSpecs: []
connectionFieldModes: {}
activeConnectionFieldSpecId: ''
activeConnectionField: ''
```

Use **Open graph as Markdown** to edit the backing YAML directly.

## Flow layout behavior

Flow charts use ELK layered layout. By default, adding or undoing connection
links refreshes the visible edges without relaying out existing nodes. This
keeps editing stable while you add multiple links. Select **Refresh** to run the
Flow layout manually.

Flow layout has two spacing controls. **Layer spacing** controls distance along
the flow direction. **Lane spacing** controls distance across parallel lanes.
For left-to-right and right-to-left flows, layer spacing is horizontal and lane
spacing is vertical.

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
