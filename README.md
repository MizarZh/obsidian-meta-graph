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
- Custom connection fields: current note → linked note

Unresolved links are ignored. Enable **Debug unresolved links** in the plugin
settings to report them in the developer console.

## Usage

1. Enable **Meta Graph** in **Settings → Community plugins**.
2. Run **Create graph** from the command palette.
3. Add or select a chart in the graph toolbar. Graph, Flow, and Arc layouts
   each keep their own source, query, layout, display, and style settings.
4. Use the toolbar settings buttons to edit graph settings, filters, note
   styles, and link styles in one panel.
5. Use **Source → Query** for filter-driven charts, or **Source → Workspace**
   to manually add a fixed set of notes. Workspace source shows selected notes,
   including isolated notes, and existing metadata links between them.
6. Add filters and style rules for **All views** or **This view**. File
   filters support file name, path, folder, extension, tags, links, and
   frontmatter property presence.
7. Add link style rules by relation or source frontmatter field.
8. Use the bottom connection panel to select or add the metadata field used for
   new links.
9. Hold `Ctrl`, drag from one node to another, and release to add a link to the
   source note's selected metadata field.
10. Use the right dock panel to keep templates and selected notes in a compact
   vertical list. Add or edit templates from the dock, drag items in the dock
   to reorder them, and hold `Ctrl` while dragging a dock item to connect it to
   a graph node.
11. Use **Undo** in the connection panel, or `Ctrl+Z` / `Cmd+Z` while the
   workspace is focused, to undo connection edits made in the current workspace
   session.
12. Select a node to open its note in a new tab.
13. Select **Debug** to inspect or copy the current query, projection,
   canonical index, adjacency maps, and unresolved links as JSON.

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
    display:
      fadeDistance: 1.5
      showInspector: true
      showFilters: true
    style:
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
  nodeRules: []
  linkRules: []
activeChart: knowledge-map
connectionFields:
  - leads-to
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

This project uses pnpm, TypeScript, Svelte, Sigma.js, Graphology, ForceAtlas2,
ELK.js, esbuild, and Vitest.

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
layout and rendering layers.
