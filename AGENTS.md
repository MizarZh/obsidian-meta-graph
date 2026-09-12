# AGENTS.md

This repository is an Obsidian community plugin named **Meta Graph**.

## Project facts

- Package manager: **pnpm**.
- Bundler: esbuild.
- UI framework: Svelte 5.
- Runtime graph model: Graphology.
- Planar renderers:
    - Sigma.js 3 is the default renderer.
    - AntV G6 5 uses its Canvas renderer as an optional per-chart engine.
    - Graph, Free, Flow, Arc, and HEB expose Sigma/G6 selection in the UI.
- Spatial renderers: Graph 3D and Cube use their dedicated Three.js-based renderers and must not offer G6.
- Layout engines:
    - Graph: ForceAtlas2.
    - Free: persisted manual positions.
    - Flow: ELK layered layout.
    - Arc: deterministic arc layout.
    - HEB: deterministic hierarchical edge-bundling layout.
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
pnpm exec vitest run src/__tests__/core/core.test.ts src/__tests__/workspace/persistence/workspace-persistence.test.ts
```

For planar renderer work, run the source-aligned renderer and lifecycle tests:

```bash
pnpm exec vitest run src/__tests__/graph/renderers/g6-data.test.ts src/__tests__/graph/renderers/g6-coordinate-space.test.ts src/__tests__/graph/renderers/g6-events.test.ts src/__tests__/graph/renderers/g6-label-controller.test.ts src/__tests__/graph/renderers/g6-renderer.test.ts src/__tests__/graph/renderers/g6-flow.test.ts src/__tests__/graph/renderers/g6-arc.test.ts src/__tests__/graph/renderers/g6-heb.test.ts src/__tests__/graph/renderers/renderer-capabilities.test.ts src/__tests__/workspace/rendering/renderer-lifecycle.test.ts
```

- Never run `git diff`.
- Never run `pnpm dev`.
- After every completed change, run `pnpm build`.

## Source map

- `src/main.ts`: plugin lifecycle, commands, view registration, settings loading.
- `src/settings/settings.ts`: plugin-wide settings and defaults.
- `src/settings/SettingsTab.ts`: Obsidian Settings UI.
- `src/workspace/KnowledgeWorkspaceView.ts`: custom TextFileView for workspace Markdown files.
- `src/workspace/workspace-controller.ts`: stable workspace facade over domain actions and coordinators.
- `src/workspace/controller/`: workspace state store plus refresh, connection, and template orchestration.
- `src/workspace/meta-graph-model.ts`: workspace document defaults, normalization, serialization.
- `src/workspace/actions/`: controller action facades for connections, curated files, dock actions, file selection/opening, and template-note orchestration.
- `src/workspace/state/`: pure workspace state reducers/selectors for charts, settings, connection fields, curated files, dock data, manual layout, query, style, and active workspace state.
- `src/workspace/services/`: Obsidian/IO-backed services for metadata indexing, connection frontmatter writes, and template note creation.
- `src/workspace/runtime/`: refresh/projection state application and debug snapshot serialization.
- `src/core/relation-parser.ts`: frontmatter relationship parsing.
- `src/core/metadata-indexer.ts`: Obsidian metadata cache -> canonical knowledge index.
- `src/query/neighborhood.ts`: query projection.
- `src/graph/model/graphology-adapter.ts`: projection -> canonical runtime Graphology graph shared by renderers.
- `src/graph/renderers/renderer-contracts.ts`: renderer-neutral planar viewport, interaction, layout-route, force-simulation, and Group contracts.
- `src/graph/renderers/renderer-capabilities.ts`: view-mode and renderer capability policy; planar modes resolve the chart's Sigma/G6 choice.
- `src/graph/renderers/renderer-factory.ts` and `renderer-adapter.ts`: renderer construction, type guards, events, display updates, and graph style refresh routing.
- `src/graph/renderers/sigma/`: Sigma renderer, events, WebGL programs, labels, Groups, and parallel/logical edge Canvas layers.
- `src/graph/renderers/g6/`: G6 Canvas renderer, Graphology data/style mapping, coordinate normalization, events, labels, Groups, and logical routed edges.
- `src/layouts/planar-geometry.ts`: renderer-neutral layout-owned logical edge routes and Group geometry.
- `src/ui/Workspace.svelte`: main workspace UI, state subscription, and graph rebuild/layout orchestration.
- `src/ui/ConnectionPanel.svelte`: bottom connection panel.
- `src/ui/FilterPanel.svelte`: settings panel shell for graph/filter/text/note/link controls.
- `src/ui/Toolbar.svelte`: chart switcher, view settings, search, layout controls.
- `src/ui/obsidian/`: shared Obsidian-backed setting controls. Color settings must use `ObsidianColorInput.svelte`.
- `src/ui/filter/`: pure helpers for filter tree editing, style-rule operations, and throttled/deferred setting commits.
- `src/ui/workspace/change-tracker.ts`: classifies workspace changes into rebuild, display sync, style sync, and layout flags.
- `src/ui/workspace/render-plan.ts` and `renderer-coordinator.ts`: convert change flags into an explicit render plan and apply renderer updates in fixed order.
- `src/ui/workspace/settings-ports.ts`: projects workspace state and controller commands into domain-specific settings view/action ports.
- `src/ui/workspace/runtime-graph.ts`: creates runtime Graphology graphs and syncs style-only changes onto existing runtime graphs.
- `src/ui/workspace/renderer-lifecycle.ts`: renderer generation, owned DOM hosts, layout-before-render sequencing, scene replacement, fit, event binding, and stale-render cleanup.
- `src/ui/workspace/renderer-events.ts`: workspace event policy for Sigma, G6, 3D, and Cube renderers.
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

## Planar renderer policy

Planar chart types keep their layout identity and store the rendering engine separately:

```ts
type PlanarRendererKind = 'sigma' | 'g6';
```

The chart model defaults to Sigma. V2 workspace files persist G6 compatibly under the chart extension namespace:

```yaml
type: graph
extensions:
    meta-graph:
        renderer: g6
```

Sigma is omitted from the extension and is the fallback for missing or unknown values. Old plugin versions therefore ignore the extension and open the chart with Sigma. Copying a planar chart or switching between planar view modes preserves its renderer choice; Graph 3D and Cube ignore it.

Important renderer rules:

- G6 is a renderer and interaction layer only. Do not configure a G6 layout. ForceAtlas2, manual positions, ELK, Arc, and HEB remain the canonical layout producers.
- RuntimeGraph coordinates, layout snapshots, logical edge routes, and Group geometry are renderer-neutral. Do not write G6-internal coordinates back to workspace state.
- G6's reversible coordinate-space adapter must be used for nodes, paths, viewport conversion, dragging, Groups, focus, and hit testing. Preserve the shared Y-axis orientation.
- Sigma and G6 share the same logical 25%-400% zoom range, 30px fit padding, and physical node/edge/arrow/Group scaling. Do not use G6 rendered bounds or `fitView()` as the workspace's canonical fit calculation because labels and markers alter those bounds.
- Layout-owned Flow and Arc routes render as one G6 logical edge per relationship. Bend nodes and segmented runtime edges remain Sigma/layout implementation details and must not become visible or pickable G6 elements.
- Selection, hover, focus, context menus, and styling always use logical edge IDs. A routed relationship must never expose a temporary bend or segment ID to workspace state.
- Each renderer owns an absolute-positioned child host. Destroy the old renderer and remove its host before constructing another engine so third-party inline canvas styles cannot contaminate the shared workspace container.
- Renderer creation and scene replacement are asynchronous and generation-checked. A stale renderer or queued draw must never reclaim the active view.
- For initial G6 creation, pass complete data to the graph options and await `render()`. For complete scene replacement, use `setData()` followed by `render()`. Wait for queued work before fitting or binding interaction events. Use `updateData()`/`draw()` or the label controller only for incremental display and style updates.
- Complete G6 data must explicitly initialize element `states`; renderer replacement and pointer teardown must clear transient node, edge, and Group hover. Do not restore hover from the previous chart or renderer.
- Kill G6 by removing wheel/pointer listeners, cancelling animation frames and queued work, destroying Group/label helpers, and calling the G6 instance's `destroy()`.

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

For G6 Flow rendering:

- Curve, Orthogonal, and Bundled layouts publish complete logical routes after ELK finishes; one relationship becomes one registered G6 logical Polyline.
- Straight Flow edges may use ordinary G6 line/quadratic elements.
- G6 data must omit bend nodes whenever logical routes are present. Incomplete route snapshots must fall back to real logical endpoints, never dangling bend IDs.
- Flow container regions consume the same layout Group geometry as Sigma. Do not derive their bounds from rendered labels or G6 element bounds.
- Style-only changes update path appearance without rerunning ELK or reconstructing route geometry.

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
- Flow orthogonal edge segments and G6 logical routes must stay synchronized through `logicalEdgeId`.
- Color controls use `ObsidianColorInput` and its throttled commit helper so drag previews update live without committing every pointer event.
- Display settings such as label size/color/density stay in `syncRendererDisplaySettings`; do not convert them into graph rebuilds.
- G6 label appearance updates use the lightweight label controller; density or visibility changes may use data patches. Neither path may call layout or replace the complete scene.

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
- Before releasing, trim the upcoming CHANGELOG section against the previous released tag: describe only the final user-visible differences between releases, not the development process. Merge repeated entries for the same feature; remove superseded designs, intermediate fixes, and reverted behavior. Check the final implementation and commit history so the release notes describe what actually ships. Preserve older published release sections.
- Update docs when changing major behavior, especially connection editing, undo, metadata parsing, Flow layout policy, renderer refresh policy, or workspace/style persistence.
