# Knowledge Workspace

Knowledge Workspace is a read-only, two-dimensional view of semantic
relationships stored in Obsidian note properties. It builds a local graph around
the active note without changing vault files.

## Metadata

Add any of the supported properties to note frontmatter. Each property accepts a
single string or an array.

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

Unresolved links are ignored. Enable **Debug unresolved links** in the plugin
settings to report them in the developer console.

## Usage

1. Enable **Knowledge Workspace** in **Settings → Community plugins**.
2. Open a note containing supported metadata.
3. Run **Open knowledge workspace** from the command palette.
4. Select **Graph** for a ForceAtlas2 layout or **Flow** for an ELK layered
   layout.
5. Add node style rules by folder, tag, domain, type, or title.
6. Add link style rules by relation or source frontmatter field.
7. Add show/hide filter rules by folder or tag.
8. Select a node to open its note in a new tab.
9. Select **Debug** to inspect or copy the current query, projection,
   canonical index, adjacency maps, and unresolved links as JSON.

The current demo displays all matching relationship components in the vault.
Isolated notes are omitted when no matching relationship remains. Graph and
Flow both include directed and undirected relations; Link style rules control
their visual appearance.

Graph and Flow maintain separate link-style rule lists. By default, Graph gives
`related` links a distinct color, while Flow hides `related` links. These are
ordinary editable rules rather than renderer-level relation behavior.

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
  -> GraphQueryEngine
  -> GraphProjection
  -> GraphologyAdapter
  -> LayoutEngine
  -> SigmaRenderer
```

The canonical knowledge model uses plain TypeScript maps and sets. Graphology is
created from each projection and is only the runtime container used by the
layout and rendering layers.
