import type { RendererDebugState, WorkspaceState } from '../../core/types';
import { serializeRuntimeGraph } from '../../graph/model/runtime-graph-debug';
import { readGraphPalette } from '../../graph/styles/graph-styles';
import {
	getModeCapabilities,
	getRendererKind,
	getRendererKindForMode,
	isCube3DRenderer,
	isForce3DRenderer,
	setRendererManualLayout,
	setRendererPalette,
	type GraphRenderer,
} from '../../graph/renderers/renderer-adapter';
import type { SigmaRenderer } from '../../graph/renderers/sigma/sigma-renderer';
import { D3ForceSimulation } from '../../layouts/d3-force-simulation';
import {
	applyStableLayout as applyStableRuntimeLayout,
	hydrateManualLayoutPositions,
	type LayoutSnapshot,
} from '../../layouts/stable-layout';
import { applyParallelDirectEdges } from '../../layouts/parallel-routes';
import { createChartGroupByNode } from '../../query/group-ownership';
import { getWorkspaceGraphForceSettings } from './graph-settings';
import { createWorkspaceGraphRenderer } from './renderer-factory';
import {
	createWorkspaceRuntimeGraph,
	prepareWorkspaceRuntimeGraphVisibilityIndex,
} from './runtime-graph';

export interface WorkspaceRendererLifecycleOptions {
	readState(): WorkspaceState;
	readCanvas(): HTMLDivElement | undefined;
	readLayoutSnapshot(): LayoutSnapshot;
	readContainerSize(): { width: number; height: number };
	waitForCanvasSize(): Promise<boolean>;
	bindEvents(renderer: GraphRenderer): () => void;
	syncRendererGroups(): void;
	setRendererDebugState(state: RendererDebugState): void;
	setFlowRelationConflictCount?(count: number): void;
	setRenderPending?(pending: boolean): void;
	setZoomLevel?(level: number): void;
	readHoveredNodeId?(): string | undefined;
	isLargeVaultModeActive?(): boolean;
	yieldToMainThread?(): Promise<void>;
	recordPerformance?(
		name: string,
		durationMs: number,
		details?: Record<string, number | string | boolean>,
	): void;
}

export class WorkspaceRendererLifecycle {
	private currentRenderer: GraphRenderer | undefined;
	private unbindEvents: (() => void) | undefined;
	private unbindZoomLevel: (() => void) | undefined;
	private renderVersion = 0;
	private forceLayoutSimulation: D3ForceSimulation | undefined;

	constructor(private readonly options: WorkspaceRendererLifecycleOptions) {}

	get renderer(): GraphRenderer | undefined {
		return this.currentRenderer;
	}

	resize(): void {
		this.currentRenderer?.resize();
	}

	fit(): void {
		this.currentRenderer?.fit();
	}

	zoomIn(): void {
		if (!this.currentRenderer) return;
		const current = this.currentRenderer.getZoomLevel();
		const target = Math.min(400, current + 10);
		this.currentRenderer.zoomBy(target / current);
	}

	zoomOut(): void {
		if (!this.currentRenderer) return;
		const current = this.currentRenderer.getZoomLevel();
		const target = Math.max(25, current - 10);
		this.currentRenderer.zoomBy(target / current);
	}

	setZoomLevel(level: number): void {
		this.currentRenderer?.setZoomLevel(level);
	}

	focusNode(nodeId: string): void {
		this.currentRenderer?.focusNode(nodeId);
	}

	setSelected(nodeId?: string): void {
		this.currentRenderer?.setSelected(nodeId);
	}

	setHovered(nodeId?: string): void {
		this.currentRenderer?.setHovered(nodeId);
	}

	refreshPalette(): void {
		const canvas = this.options.readCanvas();
		if (this.currentRenderer && canvas) {
			setRendererPalette(this.currentRenderer, readGraphPalette(canvas));
		}
	}

	handleForceLayoutToggle(enableForceLayout: boolean): void {
		if (!this.currentRenderer) {
			return;
		}
		if (isForce3DRenderer(this.currentRenderer)) {
			this.currentRenderer.setEnableForceLayout(enableForceLayout);
		}
		this.unbindEvents?.();
		this.unbindEvents = this.options.bindEvents(this.currentRenderer);
		this.stopForceLayoutSimulation();
	}

	restartSigmaForceLayoutIfNeeded(): void {
		const state = this.options.readState();
		if (
			getModeCapabilities(state.mode).usesSigmaForceSimulation &&
			state.enableForceLayout &&
			this.currentRenderer &&
			!isForce3DRenderer(this.currentRenderer) &&
			!isCube3DRenderer(this.currentRenderer)
		) {
			this.stopForceLayoutSimulation();
			this.getOrCreateForceLayoutSimulation(this.currentRenderer).start();
		}
	}

	getOrCreateForceLayoutSimulation(
		targetRenderer: SigmaRenderer,
	): D3ForceSimulation {
		if (!this.forceLayoutSimulation) {
			const state = this.options.readState();
			this.forceLayoutSimulation = new D3ForceSimulation(
				targetRenderer.runtimeGraph,
				targetRenderer,
				state.graphSpacing,
				getWorkspaceGraphForceSettings(state),
				createWorkspaceGroupByNode(state),
				(nodeId, position) => {
					this.options
						.readLayoutSnapshot()
						.positions.set(nodeId, position);
				},
			);
		}
		return this.forceLayoutSimulation;
	}

	getForceLayoutSimulation(): D3ForceSimulation | undefined {
		return this.forceLayoutSimulation;
	}

	stopForceLayoutSimulation(): void {
		this.forceLayoutSimulation?.stop();
		this.forceLayoutSimulation = undefined;
		this.currentRenderer?.clearHeldBounds();
	}

	async rebuild(fitAfterRender = false, forceLayout = false): Promise<void> {
		const version = ++this.renderVersion;
		this.options.setRenderPending?.(true);
		try {
			await this.rebuildVersion(version, fitAfterRender, forceLayout);
		} finally {
			if (version === this.renderVersion) {
				this.options.setRenderPending?.(false);
			}
		}
	}

	private async rebuildVersion(
		version: number,
		fitAfterRender: boolean,
		forceLayout: boolean,
	): Promise<void> {
		const rebuildStartedAt = performance.now();
		const initialState = this.options.readState();
		const canvas = this.options.readCanvas();

		if (
			!initialState.projection ||
			!canRenderProjection(initialState) ||
			!canvas
		) {
			this.clearRenderer();
			this.options.setRendererDebugState({ status: 'idle' });
			return;
		}

		this.options.setRendererDebugState({
			status: 'waiting-for-size',
			mode: initialState.mode,
			container: this.options.readContainerSize(),
		});
		const hasSize = await this.options.waitForCanvasSize();
		if (!hasSize || version !== this.renderVersion) {
			if (!hasSize) {
				throw new Error(
					'The Sigma container has zero width or height after waiting for layout.',
				);
			}
			return;
		}

		const state = this.options.readState();
		if (!state.projection || !canRenderProjection(state)) {
			this.clearRenderer();
			this.options.setRendererDebugState({ status: 'idle' });
			return;
		}

		const palette = readGraphPalette(canvas);
		const layoutSnapshot = this.options.readLayoutSnapshot();
		hydrateManualLayoutPositions(
			layoutSnapshot,
			state.mode,
			state.manualLayout,
		);
		const positions = layoutSnapshot.positions;
		await this.options.yieldToMainThread?.();
		if (version !== this.renderVersion) return;
		const runtimeGraphStartedAt = performance.now();
		const graph = createWorkspaceRuntimeGraph(
			state.projection,
			positions,
			state,
			palette,
		);
		this.options.recordPerformance?.(
			'render.runtimeGraph',
			performance.now() - runtimeGraphStartedAt,
			{ nodeCount: graph.order, edgeCount: graph.size },
		);
		const newNodeIds = graph
			.nodes()
			.filter((nodeId) => !positions.has(nodeId));
		const groupByNode = createWorkspaceGroupByNode(state);
		this.options.setRendererDebugState({
			status: 'layout',
			mode: state.mode,
			container: this.options.readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
		let progressiveFirstRender = false;
		if (
			!this.currentRenderer &&
			(this.options.isLargeVaultModeActive?.() ?? false) &&
			graph.order >= 200
		) {
			const progressiveRenderer = await createWorkspaceGraphRenderer({
				graph,
				container: canvas,
				palette,
				state,
				isStale: () => version !== this.renderVersion,
			});
			if (progressiveRenderer && version === this.renderVersion) {
				this.currentRenderer = progressiveRenderer;
				this.unbindEvents =
					this.options.bindEvents(progressiveRenderer);
				progressiveRenderer.setSelected(state.selectedNodeId);
				progressiveRenderer.setHovered(this.readHoveredNodeId(state));
				progressiveRenderer.fit();
				progressiveFirstRender = true;
			} else if (progressiveRenderer) {
				progressiveRenderer.kill();
				return;
			}
		}
		await this.options.yieldToMainThread?.();
		if (version !== this.renderVersion) return;
		const layoutStartedAt = performance.now();
		await applyStableRuntimeLayout(graph, layoutSnapshot, newNodeIds, {
			mode: state.mode,
			forceLayout,
			graphSpacing: state.graphSpacing,
			graphForceSettings: getWorkspaceGraphForceSettings(state),
			flowEdgeStyle: state.flowEdgeStyle,
			flowDirection: state.flowDirection,
			flowRelationRules: state.flowRelationRules,
			flowLayerSpacing: state.flowLayerSpacing,
			flowLaneSpacing: state.flowLaneSpacing,
			flowCornerRadius: state.flowCornerRadius,
			arcSpacing: state.arcSpacing,
			arcDirection: state.arcDirection,
			arcLabelAngle: state.arcLabelAngle,
			nodeSort: state.nodeSort,
			nodeSortDirection: state.nodeSortDirection,
			groups: state.grouping.groups,
			groupByNode,
			useLayoutWorker: this.options.isLargeVaultModeActive?.() ?? false,
			isStale: () => version !== this.renderVersion,
		});
		this.options.recordPerformance?.(
			'render.layout',
			performance.now() - layoutStartedAt,
			{ mode: state.mode, nodeCount: graph.order, edgeCount: graph.size },
		);
		if (version !== this.renderVersion) {
			return;
		}
		if (getRendererKindForMode(state.mode) === 'sigma') {
			applyParallelDirectEdges(graph);
		}
		prepareWorkspaceRuntimeGraphVisibilityIndex(graph);
		await this.options.yieldToMainThread?.();
		if (version !== this.renderVersion) return;
		this.options.setFlowRelationConflictCount?.(
			state.mode === 'flow'
				? (layoutSnapshot.flowRelationConflictCount ?? 0)
				: 0,
		);

		const rendererKind = getRendererKindForMode(state.mode);
		if (
			this.currentRenderer &&
			getRendererKind(this.currentRenderer) !== rendererKind
		) {
			this.clearRenderer();
		}

		const firstRender = !this.currentRenderer || progressiveFirstRender;
		const rendererStartedAt = performance.now();
		if (this.currentRenderer) {
			this.unbindEvents?.();
			this.stopForceLayoutSimulation();
			setRendererPalette(this.currentRenderer, palette);
			setRendererManualLayout(this.currentRenderer, state.manualLayout);
			this.currentRenderer.setGraph(graph);
			this.unbindEvents = this.options.bindEvents(this.currentRenderer);
		} else {
			const nextRenderer = await createWorkspaceGraphRenderer({
				graph,
				container: canvas,
				palette,
				state,
				isStale: () => version !== this.renderVersion,
			});
			if (!nextRenderer) {
				return;
			}
			if (version !== this.renderVersion) {
				nextRenderer.kill();
				return;
			}
			this.currentRenderer = nextRenderer;
			this.unbindEvents = this.options.bindEvents(nextRenderer);
		}
		this.options.recordPerformance?.(
			'render.apply',
			performance.now() - rendererStartedAt,
			{ renderer: rendererKind, firstRender },
		);

		this.options.syncRendererGroups();
		this.bindZoomLevel(this.currentRenderer);
		this.currentRenderer.setSelected(state.selectedNodeId);
		this.currentRenderer.setHovered(this.readHoveredNodeId(state));
		if (firstRender || fitAfterRender) {
			this.currentRenderer.fit();
		}
		this.options.setRendererDebugState({
			status: 'rendered',
			mode: state.mode,
			container: this.options.readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
		this.options.recordPerformance?.(
			'render.total',
			performance.now() - rebuildStartedAt,
			{ mode: state.mode, nodeCount: graph.order, edgeCount: graph.size },
		);
	}

	dispose(): void {
		this.renderVersion += 1;
		this.options.setRenderPending?.(false);
		this.clearRenderer();
	}

	private clearRenderer(): void {
		this.unbindZoomLevel?.();
		this.unbindZoomLevel = undefined;
		this.unbindEvents?.();
		this.unbindEvents = undefined;
		this.stopForceLayoutSimulation();
		this.currentRenderer?.kill();
		this.currentRenderer = undefined;
	}

	private bindZoomLevel(renderer: GraphRenderer): void {
		this.unbindZoomLevel?.();
		this.unbindZoomLevel = renderer.onZoomLevelChange((level) =>
			this.options.setZoomLevel?.(level),
		);
		this.options.setZoomLevel?.(renderer.getZoomLevel());
	}

	private readHoveredNodeId(state: WorkspaceState): string | undefined {
		const hoveredNodeId = this.options.readHoveredNodeId
			? this.options.readHoveredNodeId()
			: state.hoveredNodeId;
		return hoveredNodeId &&
			this.currentRenderer?.runtimeGraph.hasNode(hoveredNodeId)
			? hoveredNodeId
			: undefined;
	}
}

function canRenderProjection(state: WorkspaceState): boolean {
	return Boolean(state.projection?.nodes.length) || state.mode === 'cube';
}

export function createWorkspaceGroupByNode(
	state: WorkspaceState,
): Map<string, string> {
	return createChartGroupByNode(
		state.projection?.nodes ?? [],
		state.grouping,
	);
}
