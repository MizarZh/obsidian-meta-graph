<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		DebugSnapshot,
		MetaGraphDocument,
		WorkspaceState,
	} from '../core/types';
	import { bindGraphEvents } from '../graph/graph-events';
	import {
		GraphologyAdapter,
		type GraphPosition,
		type RuntimeGraph,
	} from '../graph/graphology-adapter';
	import { readGraphPalette } from '../graph/graph-styles';
	import { SigmaRenderer } from '../graph/sigma-renderer';
	import {
		applyOrthogonalFlowEdges,
		ElkFlowLayout,
		type OrthogonalRouteMap,
	} from '../layouts/elk-flow-layout';
	import { ForceAtlasLayout } from '../layouts/force-layout';
	import type { WorkspaceController } from '../workspace/workspace-controller';
	import { serializeMetaGraphState } from '../workspace/meta-graph-model';
	import FilterPanel from './FilterPanel.svelte';
	import DebugPanel from './DebugPanel.svelte';
	import DisplayControls from './DisplayControls.svelte';
	import Inspector from './Inspector.svelte';
	import Toolbar from './Toolbar.svelte';

	let {
		controller,
		onAutoSave,
	}: {
		controller: WorkspaceController;
		onAutoSave: (document: MetaGraphDocument) => Promise<void>;
	} = $props();
	let workspaceState: WorkspaceState = $state(getInitialState());
	let canvas: HTMLDivElement;
	let renderer: SigmaRenderer | undefined;
	let unbindEvents: (() => void) | undefined;
	let renderVersion = 0;
	let autoSaveTimer: number | undefined;
	let pendingAutoSave: MetaGraphDocument | undefined;
	let lastAutoSavedState = '';
	let lastProjection: WorkspaceState['projection'];
	let lastActiveChartId: string | undefined;
	let lastMode: WorkspaceState['mode'] | undefined;
	let lastFlowEdgeStyle: WorkspaceState['flowEdgeStyle'] | undefined;
	let lastFlowDirection: WorkspaceState['flowDirection'] | undefined;
	let lastLayoutRevision: number | undefined;
	let lastNodeStyleRules: WorkspaceState['nodeStyleRules'] | undefined;
	let lastLinkStyleRules: WorkspaceState['linkStyleRules'] | undefined;
	let activeTab: 'workspace' | 'debug' = $state('workspace');
	interface LayoutSnapshot {
		positions: Map<string, GraphPosition>;
		edgeIds: Set<string>;
		orthogonalRoutes: OrthogonalRouteMap;
	}
	const layoutSnapshots = new Map<string, LayoutSnapshot>();

	function getInitialState(): WorkspaceState {
		return controller.snapshot;
	}

	onMount(() => {
		lastAutoSavedState = JSON.stringify(
			serializeMetaGraphState(controller.snapshot),
		);
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (
				entry &&
				entry.contentRect.width > 0 &&
				entry.contentRect.height > 0
			) {
				renderer?.resize();
			}
		});
		resizeObserver.observe(canvas);

		const unsubscribe = controller.subscribe((nextState) => {
			const activeChartChanged =
				lastActiveChartId !== undefined &&
				nextState.activeChartId !== lastActiveChartId;
			const modeChanged =
				lastMode !== undefined && nextState.mode !== lastMode;
			const flowStyleChanged =
				lastFlowEdgeStyle !== undefined &&
				nextState.flowEdgeStyle !== lastFlowEdgeStyle;
			const flowDirectionChanged =
				lastFlowDirection !== undefined &&
				nextState.flowDirection !== lastFlowDirection;
			const layoutRevisionChanged =
				lastLayoutRevision !== undefined &&
				nextState.layoutRevision !== lastLayoutRevision;
			const styleRulesChanged =
				nextState.nodeStyleRules !== lastNodeStyleRules ||
				nextState.linkStyleRules !== lastLinkStyleRules;
			const displaySettingsChanged =
				nextState.fadeDistance !== workspaceState.fadeDistance;
			const shouldRebuild =
				nextState.activeChartId !== lastActiveChartId ||
				nextState.projection !== lastProjection ||
				nextState.mode !== lastMode ||
				nextState.flowEdgeStyle !== lastFlowEdgeStyle ||
				nextState.flowDirection !== lastFlowDirection ||
				nextState.layoutRevision !== lastLayoutRevision ||
				styleRulesChanged;
			workspaceState = nextState;
			scheduleAutoSave(nextState);
			if (displaySettingsChanged) {
				renderer?.setFadeDistance(nextState.fadeDistance);
			}
			if (shouldRebuild) {
				lastProjection = nextState.projection;
				lastActiveChartId = nextState.activeChartId;
				lastMode = nextState.mode;
				lastFlowEdgeStyle = nextState.flowEdgeStyle;
				lastFlowDirection = nextState.flowDirection;
				lastLayoutRevision = nextState.layoutRevision;
				lastNodeStyleRules = nextState.nodeStyleRules;
				lastLinkStyleRules = nextState.linkStyleRules;
				void rebuildGraph(
					activeChartChanged ||
					modeChanged ||
						flowStyleChanged ||
						flowDirectionChanged ||
						layoutRevisionChanged,
					flowStyleChanged ||
						flowDirectionChanged ||
						layoutRevisionChanged,
				).catch(
					(error: unknown) => {
					controller.setRendererDebugState({
						status: 'error',
						error: formatError(error),
					});
					},
				);
			} else {
				renderer?.setSelected(nextState.selectedNodeId);
				renderer?.setHovered(nextState.hoveredNodeId);
			}
		});

		return () => {
			renderVersion += 1;
			window.clearTimeout(autoSaveTimer);
			if (pendingAutoSave) {
				void onAutoSave(pendingAutoSave);
				pendingAutoSave = undefined;
			}
			unsubscribe();
			resizeObserver.disconnect();
			unbindEvents?.();
			renderer?.kill();
		};
	});

	function scheduleAutoSave(state: WorkspaceState): void {
		const document = serializeMetaGraphState(state);
		const serialized = JSON.stringify(document);
		const fingerprint = serialized;
		if (fingerprint === lastAutoSavedState) {
			return;
		}
		lastAutoSavedState = fingerprint;
		pendingAutoSave = document;
		window.clearTimeout(autoSaveTimer);
		autoSaveTimer = window.setTimeout(() => {
			const documentToSave = pendingAutoSave;
			pendingAutoSave = undefined;
			if (documentToSave) {
				void onAutoSave(documentToSave);
			}
		}, 350);
	}

	async function rebuildGraph(
		fitAfterRender = false,
		forceLayout = false,
	): Promise<void> {
		const version = ++renderVersion;

		if (
			!workspaceState.projection ||
			workspaceState.projection.nodes.length === 0 ||
			!canvas
		) {
			unbindEvents?.();
			unbindEvents = undefined;
			renderer?.kill();
			renderer = undefined;
			controller.setRendererDebugState({ status: 'idle' });
			return;
		}

		controller.setRendererDebugState({
			status: 'waiting-for-size',
			mode: workspaceState.mode,
			container: readContainerSize(),
		});
		const hasSize = await waitForCanvasSize();
		if (!hasSize || version !== renderVersion) {
			if (!hasSize) {
				throw new Error(
					'The Sigma container has zero width or height after waiting for layout.',
				);
			}
			return;
		}

		const palette = readGraphPalette(canvas);
		const layoutSnapshot = getLayoutSnapshot();
		const positions = layoutSnapshot.positions;
		const graph = new GraphologyAdapter(
			palette,
			workspaceState.nodeStyleRules,
			getActiveLinkStyleRules(),
		).fromProjection(workspaceState.projection, positions);
		const newNodeIds = graph
			.nodes()
			.filter((nodeId) => !positions.has(nodeId));
		controller.setRendererDebugState({
			status: 'layout',
			mode: workspaceState.mode,
			container: readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
		await applyStableLayout(
			graph,
			layoutSnapshot,
			newNodeIds,
			forceLayout,
		);
		if (version !== renderVersion) {
			return;
		}

		const firstRender = !renderer;
		if (renderer) {
			renderer.setGraph(graph);
		} else {
			const nextRenderer = new SigmaRenderer(
				graph,
				canvas,
				palette,
				workspaceState.fadeDistance,
			);
			renderer = nextRenderer;
			unbindEvents = bindGraphEvents(nextRenderer, {
				onSelect: (nodeId) => controller.selectNode(nodeId),
				onHover: (nodeId) => controller.hoverNode(nodeId),
				onOpen: (nodeId) => void controller.openNode(nodeId),
			});
		}
		renderer.setSelected(workspaceState.selectedNodeId);
		renderer.setHovered(workspaceState.hoveredNodeId);
		if (firstRender || fitAfterRender) {
			renderer.fit();
		}
		controller.setRendererDebugState({
			status: 'rendered',
			mode: workspaceState.mode,
			container: readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
	}

	const selectedNode = $derived(
		workspaceState.projection?.nodes.find(
			(node) => node.id === workspaceState.selectedNodeId,
		),
	);
	const debugSnapshot: DebugSnapshot = $derived(
		controller.getDebugSnapshot(workspaceState),
	);

	function setActiveTab(tab: 'workspace' | 'debug'): void {
		activeTab = tab;
		if (tab === 'workspace') {
			window.requestAnimationFrame(() => renderer?.resize());
		}
	}

	async function waitForCanvasSize(): Promise<boolean> {
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const { width, height } = canvas.getBoundingClientRect();
			if (width > 0 && height > 0) {
				return true;
			}
			await nextAnimationFrame();
		}
		return false;
	}

	function nextAnimationFrame(): Promise<void> {
		return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
	}

	function readContainerSize(): { width: number; height: number } {
		const { width, height } = canvas.getBoundingClientRect();
		return { width, height };
	}

	async function applyStableLayout(
		graph: RuntimeGraph,
		snapshot: LayoutSnapshot,
		newNodeIds: string[],
		forceLayout: boolean,
	): Promise<void> {
		const positions = snapshot.positions;
		const firstLayout = positions.size === 0;
		const currentEdgeIds = getLogicalFlowEdgeIds(graph);
		const flowEdgesChanged =
			workspaceState.mode === 'flow' &&
			!setsEqual(currentEdgeIds, snapshot.edgeIds);
		const missingOrthogonalRoute =
			workspaceState.mode === 'flow' &&
			workspaceState.flowEdgeStyle === 'orthogonal' &&
			[...currentEdgeIds].some(
				(edgeId) => !snapshot.orthogonalRoutes.has(edgeId),
			);
		const needsLayout =
			forceLayout ||
			firstLayout ||
			newNodeIds.length > 0 ||
			flowEdgesChanged ||
			missingOrthogonalRoute;

		if (workspaceState.mode === 'flow') {
			if (needsLayout) {
				const layout = new ElkFlowLayout(
					workspaceState.flowEdgeStyle,
					workspaceState.flowDirection,
					workspaceState.flowSpacing,
				);
				await layout.apply(graph);
				snapshot.edgeIds = currentEdgeIds;
				snapshot.orthogonalRoutes =
					workspaceState.flowEdgeStyle === 'orthogonal'
						? layout.getOrthogonalRoutes()
						: new Map();
			} else if (workspaceState.flowEdgeStyle === 'orthogonal') {
				applyOrthogonalFlowEdges(graph, snapshot.orthogonalRoutes);
			}
		} else {
			if (needsLayout) {
				await new ForceAtlasLayout(workspaceState.graphSpacing).apply(graph);
			}
		}

		graph.forEachNode((nodeId, attributes) => {
			if (!attributes.isBend) {
				positions.set(nodeId, { x: attributes.x, y: attributes.y });
			}
			graph.setNodeAttribute(nodeId, 'fixed', false);
		});
	}

	function getLayoutSnapshot(): LayoutSnapshot {
		const key =
			workspaceState.mode === 'graph'
				? `${workspaceState.activeChartId}-graph`
				: `${workspaceState.activeChartId}-flow-${workspaceState.flowEdgeStyle}-${workspaceState.flowDirection}`;
		let snapshot = layoutSnapshots.get(key);
		if (!snapshot) {
			snapshot = {
				positions: new Map(),
				edgeIds: new Set(),
				orthogonalRoutes: new Map(),
			};
			layoutSnapshots.set(key, snapshot);
		}
		return snapshot;
	}

	function getLogicalFlowEdgeIds(graph: RuntimeGraph): Set<string> {
		return new Set(
			graph
				.edges()
				.filter((edge) => !graph.getEdgeAttribute(edge, 'hidden')),
		);
	}

	function getActiveLinkStyleRules() {
		return workspaceState.linkStyleRules;
	}

	function setsEqual(left: Set<string>, right: Set<string>): boolean {
		return (
			left.size === right.size &&
			[...left].every((value) => right.has(value))
		);
	}

	function serializeRuntimeGraph(graph: RuntimeGraph) {
		return {
			nodeCount: graph.order,
			edgeCount: graph.size,
			nodes: graph.mapNodes((id, attributes) => ({
				id,
				x: attributes.x,
				y: attributes.y,
				label: attributes.label,
			})),
			edges: graph.mapEdges((id, attributes, source, target) => ({
				id,
				source,
				target,
				type: attributes.type,
				hidden: attributes.hidden,
			})),
		};
	}

	function formatError(error: unknown): string {
		return error instanceof Error
			? `${error.name}: ${error.message}\n${error.stack ?? ''}`
			: String(error);
	}
</script>

<div class="knowledge-workspace">
	<nav class="knowledge-workspace-tabs" aria-label="Knowledge workspace views">
		<button
			class:active={activeTab === 'workspace'}
			onclick={() => setActiveTab('workspace')}>Workspace</button
		>
		<button
			class:active={activeTab === 'debug'}
			onclick={() => setActiveTab('debug')}>Debug</button
		>
	</nav>
	<div class:knowledge-workspace-hidden={activeTab !== 'workspace'}>
		<Toolbar
			mode={workspaceState.mode}
			charts={workspaceState.charts}
			activeChartId={workspaceState.activeChartId}
			flowEdgeStyle={workspaceState.flowEdgeStyle}
			flowDirection={workspaceState.flowDirection}
			onSelectChart={(id) => controller.setActiveChart(id)}
			onAddChart={() => controller.addChart()}
			onRenameChart={(name) => controller.setActiveChartName(name)}
			onChartType={(mode) => controller.setActiveChartType(mode)}
			onDeleteChart={() => controller.deleteActiveChart()}
			onFlowEdgeStyle={(style) => controller.setFlowEdgeStyle(style)}
			onFlowDirection={(direction) =>
				controller.setFlowDirection(direction)}
			onFit={() => renderer?.fit()}
			onRefresh={() => controller.refresh(true)}
		/>
	</div>
	<div
		class="knowledge-workspace-body"
		class:knowledge-workspace-hidden={activeTab !== 'workspace'}
	>
		<FilterPanel
			query={workspaceState.query}
			folders={workspaceState.availableFolders}
			tags={workspaceState.availableTags}
			nodeStyleRules={workspaceState.nodeStyleRules}
			linkStyleRules={getActiveLinkStyleRules()}
			linkStyleMode={workspaceState.mode}
			onChange={(patch) => controller.updateQuery(patch)}
			onNodeStyleRulesChange={(rules) =>
				controller.setNodeStyleRules(rules)}
			onLinkStyleRulesChange={(rules) =>
				controller.setLinkStyleRules(rules)}
		/>
		<main class="knowledge-workspace-main">
			<div class="knowledge-workspace-canvas" bind:this={canvas}></div>
			<DisplayControls
				fadeDistance={workspaceState.fadeDistance}
				onInput={(value) => controller.setFadeDistance(value)}
				onCommit={(value) => controller.setFadeDistance(value)}
			/>
			{#if workspaceState.projection?.nodes.length === 0}
				<div class="knowledge-workspace-empty">No matching metadata relationships.</div>
			{/if}
			<Inspector node={selectedNode} />
		</main>
	</div>
	{#if activeTab === 'debug'}
		<DebugPanel
			snapshot={debugSnapshot}
			onRefresh={() => controller.refresh(true)}
		/>
	{/if}
</div>
