# AGENTS.md

This repository is an Obsidian community plugin named **Meta Graph**.

## Project facts

- Package manager: **pnpm**.
- Bundler: esbuild.
- UI framework: Svelte 5.
- Graph renderer: Sigma.js with Graphology.
- Layout engines:
    - Graph: ForceAtlas2.
    - Flow: ELK layered layout.
    - Arc: deterministic arc layout.
- Plugin entry point: `src/main.ts`.
- Built release artifact: `main.js` at the plugin root.
- Do not commit generated artifacts such as `main.js`, `node_modules/`, or build output unless explicitly requested.

## Commands

Use pnpm commands:

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm exec vitest run
pnpm lint
pnpm build
```

For focused checks during development, prefer:

```bash
pnpm exec tsc --noEmit
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm exec vitest run src/__tests__/core.test.ts src/__tests__/workspace-persistence.test.ts
```

- Never run `git diff`.
- Never run `pnpm dev`.
- After every completed change, run `pnpm build`.

## Source map

- `src/main.ts`: plugin lifecycle, commands, view registration, settings loading.
- `src/settings/settings.ts`: plugin-wide settings and defaults.
- `src/settings/SettingsTab.ts`: Obsidian Settings UI.
- `src/workspace/KnowledgeWorkspaceView.ts`: custom TextFileView for workspace Markdown files.
- `src/workspace/workspace-controller.ts`: workspace facade, lifecycle, refresh scheduling, and listener emission.
- `src/workspace/meta-graph-model.ts`: workspace document defaults, normalization, serialization.
- `src/workspace/actions/`: controller action facades for connections, curated files, dock actions, file selection/opening, and template-note orchestration.
- `src/workspace/state/`: pure workspace state reducers/selectors for charts, settings, connection fields, curated files, dock data, manual layout, query, style, and active workspace state.
- `src/workspace/services/`: Obsidian/IO-backed services for metadata indexing, connection frontmatter writes, and template note creation.
- `src/workspace/runtime/`: refresh/projection state application and debug snapshot serialization.
- `src/core/relation-parser.ts`: frontmatter relationship parsing.
- `src/core/metadata-indexer.ts`: Obsidian metadata cache -> canonical knowledge index.
- `src/query/neighborhood.ts`: query projection.
- `src/graph/graphology-adapter.ts`: projection -> runtime Graphology graph.
- `src/graph/graph-events.ts`: Sigma events, node selection, hover, Ctrl-drag connection gesture.
- `src/graph/renderer-adapter.ts`: renderer kind factory, renderer type guards, graph style refresh adapter.
- `src/graph/sigma-renderer.ts`: Sigma renderer wrapper and visual reducers.
- `src/ui/Workspace.svelte`: main workspace UI, state subscription, and graph rebuild/layout orchestration.
- `src/ui/ConnectionPanel.svelte`: bottom connection panel.
- `src/ui/FilterPanel.svelte`: settings panel shell for graph/filter/text/note/link controls.
- `src/ui/Toolbar.svelte`: chart switcher, view settings, search, layout controls.
- `src/ui/obsidian/`: shared Obsidian-backed setting controls. Color settings must use `ObsidianColorInput.svelte`.
- `src/ui/filter/`: pure helpers for filter tree editing, style-rule operations, and throttled/deferred setting commits.
- `src/ui/workspace/change-tracker.ts`: classifies workspace changes into rebuild, display sync, style sync, and layout flags.
- `src/ui/workspace/render-plan.ts` and `renderer-coordinator.ts`: convert change flags into an explicit render plan and apply renderer updates in fixed order.
- `src/ui/workspace/runtime-graph.ts`: creates runtime Graphology graphs and syncs style-only changes onto existing runtime graphs.
- `src/ui/workspace/renderer-events.ts`: workspace renderer event policy for Sigma, 3D, and Cube renderers.
- `src/ui/workspace/renderer-groups.ts`: renderer group overlay sync and runtime group movement previews.
- `src/ui/workspace/dock-graph-drag.ts`: dock item -> graph node connection drag controller.
- `src/ui/workspace/graph-dock-connection.ts`: graph node -> dock drop target connection controller.
- `src/styles/`: source CSS files for plugin UI styles.
- `styles.css`: generated plugin UI stylesheet built from `src/styles/index.css`.

## Data model

Workspace Markdown files use:

```yaml
---
meta-graph: workspace
meta-graph-version: 1
---
charts:
    - id: knowledge-map
      type: graph
      query: ...
      layout: ...
      display: ...
      style: ...

activeChart: knowledge-map
connectionFields:
    - leads-to
activeConnectionField: leads-to
```

Built-in metadata relationships:

- `prerequisites` / `prerequisite`: linked note -> current note.
- `leads_to` / `leads-to` / `leadsTo`: current note -> linked note.
- `related`: undirected.

Custom connection fields are stored in the workspace document and are parsed as directed current note -> linked note edges.

## Connection editing behavior

Users can hold `Ctrl`, drag from one visible node to another, and release to write a link into the source note's active metadata field.

Important details:

- Connection writes use `app.fileManager.processFrontMatter`.
- Links are generated with `app.fileManager.generateMarkdownLink`.
- Duplicate links are skipped.
- Connection undo is an in-memory stack in `WorkspaceController`.
- `Ctrl+Z` / `Cmd+Z` is handled in `Workspace.svelte` only when the workspace has focus and the event target is not an editable control.
- Undo restores the previous frontmatter value shape when possible.

## Flow layout policy

Flow charts must remain stable while users create multiple links.

Default behavior:

- Adding or undoing links refreshes the real projection.
- Edge-only changes do **not** run ELK layout.
- Existing node positions are preserved.
- Manual Refresh still forces layout.

Global plugin setting:

- `relayoutFlowAfterConnection`
- UI label: **Relayout Flow after connecting nodes**
- Default: `false`
- When `true`, dragging a new Flow connection schedules the next refresh with `forceLayout = true`.
- Undo does not force relayout through this setting.

When modifying Flow behavior, avoid temporary renderer-only edges. The graph should stay synchronized with the canonical projection.

## Style refresh policy

Visual style edits must stay responsive and must not trigger full graph rebuilds unless the projection or layout input changed.

Style-only changes include:

- `defaultNodeStyle`
- `defaultLinkStyle`
- `nodeStyleOverrides`
- `linkStyleOverrides`
- `globalNodeStyleRules`
- `globalLinkStyleRules`
- `nodeStyleRules`
- `linkStyleRules`

These should be classified by `analyzeWorkspaceStateChanges` as `styleRulesChanged` with `shouldRebuild = false`. Apply them with `syncWorkspaceRuntimeGraphStyles`, then call `refreshRendererGraphStyles`.

Important details:

- Do not run ELK, ForceAtlas, Arc, or HEB layout for style-only edits.
- Flow orthogonal edge segments must stay synchronized through `logicalEdgeId`.
- Color controls use `ObsidianColorInput` and its throttled commit helper so drag previews update live without committing every pointer event.
- Display settings such as label size/color/density stay in `syncRendererDisplaySettings`; do not convert them into graph rebuilds.

## Sigma edge width policy

- `Sigma.scaleSize(edge.size)` is the nominal full CSS-pixel width, not a half-width.
- Native WebGL edges feather inward, while Canvas strokes preserve their nominal ink coverage. Canvas parallel edges therefore subtract `antiAliasingFeather / devicePixelRatio` from visual stroke width.
- Arrow geometry, lane spacing, and hit width must use the nominal width; only the Canvas stroke uses the feather-compensated width.
- Keep the parallel-edge Canvas at Sigma's real `devicePixelRatio`. Do not cap it, or high-DPI resampling will change perceived thickness.
- Native solid and patterned edge programs must share the same feather rule so one Canvas compensation matches every edge type.

## Sigma logical edge selection

- Workspace node, logical-edge, and group selections are transient and mutually exclusive.
- Native Sigma `clickEdge` IDs must resolve through `logicalEdgeId`; selecting one Flow segment highlights every segment of that logical edge.
- Canvas parallel edges must submit their logical ID through the shared event callbacks. Do not restore private selection state inside `SigmaParallelEdgeLayer`.
- Stage click priority is Canvas edge, group, then blank-stage clearing; native edge and node picking are handled by Sigma before `clickStage`.
- Native reducers and the Canvas layer must read the same `selectedEdgeId`, selected color, and `size + 2` emphasis rule.
- Native `enterEdge` / `leaveEdge` must map through `logicalEdgeId`; native and Canvas hover emphasis both resolve metrics from `edge.size + 2` rather than adding fixed post-scale pixels.

## Coding guidelines

- Keep `src/main.ts` focused on lifecycle, commands, and view registration.
- Prefer small modules with clear responsibility.
- Use Obsidian cleanup helpers (`registerEvent`, `registerDomEvent`, `registerInterval`) when registering long-lived listeners.
- Keep startup light; defer indexing and layout work until views need it.
- Avoid network calls unless the feature clearly needs them and the behavior is documented.
- Do not use Node/Electron-only APIs unless the plugin is intentionally desktop-only.
- Preserve user data carefully when modifying frontmatter.
- Avoid unrelated refactors while fixing behavior.
- Do not edit `styles.css` directly. Make stylesheet changes under `src/styles/`, then run `pnpm build:css` to regenerate `styles.css`.

## UI control standards

- Use `ObsidianButton` for commands. Pure icon buttons are only for familiar single actions and must include an aria label and tooltip.
- Use `ObsidianDropdown` for enumerations. Use a segmented control when the option set is small and direct comparison is useful.
- Use `ObsidianToggle` for booleans and `ObsidianSlider` for continuous numeric values. Use numeric text inputs only when exact values such as coordinates or dimensions matter.
- Use `ObsidianTextInput` for text and `ObsidianSuggestInput` or a domain picker when suggestions are available.
- Business panels must not create raw `input[type="color"]` controls. Use `ObsidianColorInput` for every setting color.
- Color controls use a 36 x 26 px pill swatch, Obsidian border/accent variables, a visible focus state, and a disabled state. Do not add panel-specific color-control styling.
- Color changes preview locally, commit at most once every 120 ms while dragging, and flush the final value on change, blur, or unmount. Every control must provide a stable, domain-unique commit key.
- Group, Graph, Text, Note, and Link settings must preserve the same dimensions, states, and commit semantics for equivalent controls.

## UI copy

- Use sentence case.
- Keep labels short.
- Use **Settings -> Community plugins** style arrows in docs.
- In UI text, prefer direct labels such as **Refresh**, **Undo**, **Debug**.

## Documentation

- `README.md` is user-facing.
- `design.md` records current architecture, limitations, and planning notes.
- Record every feature change in `CHANGELOG.md`.
- When bumping the plugin version, update the corresponding release version and date in `CHANGELOG.md`.
- Update docs when changing major behavior, especially connection editing, undo, metadata parsing, Flow layout policy, renderer refresh policy, or workspace/style persistence.
