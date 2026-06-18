<script lang="ts">
	import { onMount } from 'svelte';
	import type { DebugSnapshot, WorkspaceState } from '../core/types';
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
	} from '../layouts/elk-flow-layout';
	import { ForceAtlasLayout } from '../layouts/force-layout';
	import type { WorkspaceController } from '../workspace/workspace-controller';
	import FilterPanel from './FilterPanel.svelte';
	import DebugPanel from './DebugPanel.svelte';
	import Inspector from './Inspector.svelte';
	import Toolbar from './Toolbar.svelte';

	let { controller }: { controller: WorkspaceController } = $props();
	let workspaceState: WorkspaceState = $state(getInitialState());
	let canvas: HTMLDivElement;
	let renderer: SigmaRenderer | undefined;
	let unbindEvents: (() => void) | undefined;
	let renderVersion = 0;
	let lastProjection: WorkspaceState['projection'];
	let lastMode: WorkspaceState['mode'] | undefined;
	let lastFlowEdgeStyle: WorkspaceState['flowEdgeStyle'] | undefined;
	let activeTab: 'workspace' | 'debug' = $state('workspace');
	const positionsByMode: Record<
		WorkspaceState['mode'],
		Map<string, GraphPosition>
	> = {
		graph: new Map(),
		flow: new Map(),
	};

	function getInitialState(): WorkspaceState {
		return controller.snapshot;
	}

	onMount(() => {
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
			const modeChanged =
				lastMode !== undefined && nextState.mode !== lastMode;
			const shouldRebuild =
				nextState.projection !== lastProjection ||
				nextState.mode !== lastMode ||
				nextState.flowEdgeStyle !== lastFlowEdgeStyle;
			workspaceState = nextState;
			if (shouldRebuild) {
				lastProjection = nextState.projection;
				lastMode = nextState.mode;
				lastFlowEdgeStyle = nextState.flowEdgeStyle;
				void rebuildGraph(modeChanged).catch((error: unknown) => {
					controller.setRendererDebugState({
						status: 'error',
						error: formatError(error),
					});
				});
			} else {
				renderer?.setSelected(nextState.selectedNodeId);
				renderer?.setHovered(nextState.hoveredNodeId);
			}
		});

		return () => {
			renderVersion += 1;
			unsubscribe();
			resizeObserver.disconnect();
			unbindEvents?.();
			renderer?.kill();
		};
	});

	async function rebuildGraph(fitAfterRender = false): Promise<void> {
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
		const positions = positionsByMode[workspaceState.mode];
		const graph = new GraphologyAdapter(palette).fromProjection(
			workspaceState.projection,
			positions,
		);
		const newNodeIds = graph
			.nodes()
			.filter((nodeId) => !positions.has(nodeId));
		controller.setRendererDebugState({
			status: 'layout',
			mode: workspaceState.mode,
			container: readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
		await applyStableLayout(graph, positions, newNodeIds);
		if (version !== renderVersion) {
			return;
		}

		const firstRender = !renderer;
		if (renderer) {
			renderer.setGraph(graph);
		} else {
			const nextRenderer = new SigmaRenderer(graph, canvas, palette);
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

	function focusCurrentNote(): void {
		if (workspaceState.currentNoteId) {
			renderer?.focusNode(workspaceState.currentNoteId);
		}
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
		positions: Map<string, GraphPosition>,
		newNodeIds: string[],
	): Promise<void> {
		const firstLayout = positions.size === 0;
		const needsLayout = firstLayout || newNodeIds.length > 0;

		if (workspaceState.mode === 'flow') {
			graph.forEachEdge((edge, attributes) => {
				graph.setEdgeAttribute(
					edge,
					'hidden',
					attributes.relation === 'related',
				);
			});
			if (needsLayout) {
				const preserved = new Map(positions);
				await new ElkFlowLayout(workspaceState.flowEdgeStyle).apply(graph);
				for (const [nodeId, position] of preserved) {
					if (graph.hasNode(nodeId)) {
						graph.mergeNodeAttributes(nodeId, position);
					}
				}
			}
			if (workspaceState.flowEdgeStyle === 'orthogonal') {
				applyOrthogonalFlowEdges(graph);
			}
		} else {
			graph.forEachEdge((edge) =>
				graph.setEdgeAttribute(edge, 'hidden', false),
			);
			if (needsLayout) {
				await new ForceAtlasLayout().apply(graph);
			}
		}

		graph.forEachNode((nodeId, attributes) => {
			if (!attributes.isBend) {
				positions.set(nodeId, { x: attributes.x, y: attributes.y });
			}
			graph.setNodeAttribute(nodeId, 'fixed', false);
		});
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
			flowEdgeStyle={workspaceState.flowEdgeStyle}
			onMode={(mode) => controller.setMode(mode)}
			onFlowEdgeStyle={(style) => controller.setFlowEdgeStyle(style)}
			onCurrentNote={focusCurrentNote}
			onFit={() => renderer?.fit()}
			onRefresh={() => controller.refresh()}
		/>
	</div>
	<div
		class="knowledge-workspace-body"
		class:knowledge-workspace-hidden={activeTab !== 'workspace'}
	>
		<FilterPanel
			query={workspaceState.query}
			folders={workspaceState.availableFolders}
			domains={workspaceState.availableDomains}
			onChange={(patch) => controller.updateQuery(patch)}
		/>
		<main class="knowledge-workspace-main">
			<div class="knowledge-workspace-canvas" bind:this={canvas}></div>
			{#if !workspaceState.currentNoteId}
				<div class="knowledge-workspace-empty">Open a note to center the graph.</div>
			{:else if workspaceState.projection?.nodes.length === 0}
				<div class="knowledge-workspace-empty">No matching metadata relationships.</div>
			{/if}
			<Inspector node={selectedNode} />
		</main>
	</div>
	{#if activeTab === 'debug'}
		<DebugPanel snapshot={debugSnapshot} onRefresh={() => controller.refresh()} />
	{/if}
</div>
