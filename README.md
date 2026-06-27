# Meta Graph

Meta Graph creates Markdown-backed graph workspaces from semantic relationships
stored in Obsidian note properties. A graph workspace is an ordinary Markdown
file with `meta-graph: workspace` frontmatter and YAML chart settings in the
body.

## Metadata

Add any of the supported properties to note frontmatter. Each property accepts a
single string or an array. Meta Graph recognizes the built-in relationship
properties below and any additional connection metadata fields added from the
workspace connection panel.

```yaml
---
domain:
  - astronomy
type: concept

prerequisites:
  - "[[Hydrostatic equilibrium]]"

leads_to:
  - "[[Stellar evolution]]"

related:
  - "[[Hertzsprung–Russell diagram]]"
---
```

Relationship directions are:

- `prerequisites`: linked note → current note
- `leads_to`: current note → linked note
- `related`: undirected
- Custom connection fields: current note → linked note by default, or both
  notes when the field is set to two-way in the connection panel

Unresolved links are ignored. Enable **Debug unresolved links** in the plugin
settings to report them in the developer console.

## Usage

1. Enable **Meta Graph** in **Settings → Community plugins**.
2. Run **Create graph** from the command palette.
3. Add or select a chart in the graph toolbar. Graph, 3D graph, Cube graph,
   Free, Flow, Arc diagram, and Hierarchical edge bundling layouts each keep
   their own source, query, layout, display, and style settings.
4. Use the toolbar settings buttons to edit graph settings, filters, note
   styles, and link styles in one panel.
5. Use **Source → Query** for filter-driven charts, or **Source → Workspace**
   to manually add a fixed set of notes. Workspace source shows selected notes,
   including isolated notes, and existing metadata links between them.
6. Set workspace default note/link styles, then optionally add one chart
   override card. If no chart override exists, the chart inherits the workspace
   default.
7. Add filters and style rules for **All views** or **This view**. File
   filters support file name, path, folder, extension, tags, links, and
   frontmatter property presence.
8. Add link style rules by relation or source frontmatter field.
9. Use **Group** settings to add chart-local groups, rename them, set colors,
   and edit their Free-view region geometry. Groups are saved in the workspace
   file, not note frontmatter.
10. Increase **Label density** in **Graph** settings when Sigma samples too few
   labels while zoomed out. Enable **Always show labels** to force every visible
   note label through Sigma's label grid.
11. Use the bottom connection panel to select or add the metadata field used for
   new links. Set the field direction to **One-way** or **Two-way** from the
   direction dropdown.
12. Hold `Ctrl`, drag from one node to another, and release to add a link to the
   selected metadata field. One-way writes the source note only; two-way writes
   both notes so each note links to the other.
13. In Graph views, enable **Force layout** in **Graph** settings to drag nodes
   through the force-directed layout. Nearby nodes can move with the graph
   forces, and the layout keeps settling briefly after release. `Ctrl`-drag
   still creates links.
14. In Free views, drag nodes directly to place them by hand. Free views do not
   run an automatic layout after the first placement, and dragged node
   positions are saved in the workspace file.
15. In Free views, drag a group title to move the group. Notes already assigned
   to that group move with it. Drag the bottom-right group handle to resize the
   region.
16. Drag a node into a manual group and release to assign it to that group.
   Drag it out and release over empty space to remove it from the group.
17. In Cube graph views, each cube face is a group. Drag the background to
   rotate the cube, drag nodes within their face to save their placement, use
   `Shift`-click for local relationship focus, right-click for selection
   details, and `Ctrl`-drag between nodes to add links.
18. Use the right dock panel to keep templates and selected notes in a compact
   vertical list. Add or edit templates from the dock, choose an optional
   default group for template-created notes, drag items in the dock to reorder
   them, and hold `Ctrl` while dragging a dock item to connect it to a graph
   node.
19. Use **Undo** in the connection panel, or `Ctrl+Z` / `Cmd+Z` while the
   workspace is focused, to undo connection edits made in the current workspace
   session.
20. Select a node to open its note in a new tab.
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
    name: Knowledge map
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
    color: "#7c6ff0"
    size: 7
  defaultLinkStyle:
    color: "#888888"
    size: 1.5
    lineStyle: solid
    label: ""
    showLabel: false
    hidden: false
  nodeRules: []
  linkRules: []
activeChart: knowledge-map
connectionFields:
  - leads-to
connectionFieldSpecs:
  - id: leads-to:directed
    field: leads-to
    mode: directed
  - id: leads-to:bidirectional
    field: leads-to
    mode: bidirectional
connectionFieldModes:
  leads-to: directed
activeConnectionFieldSpecId: leads-to:directed
activeConnectionField: leads-to
```

Use **Open graph as Markdown** to edit the backing YAML directly.

## Flow layout behavior

Flow charts use ELK layered layout. By default, adding or undoing connection
links refreshes the visible edges without relaying out existing nodes. This
keeps editing stable while you add multiple links. Select **Refresh** to run the
Flow layout manually.

Enable **Relayout Flow after connecting nodes** in the plugin settings if you
want Flow charts to rerun layout immediately after each new connection.

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
