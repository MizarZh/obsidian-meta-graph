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
import { getWorkspaceGraphForceSettings } from './graph-settings';
import { createWorkspaceGraphRenderer } from './renderer-factory';
import { createWorkspaceRuntimeGraph } from './runtime-graph';

export interface WorkspaceRendererLifecycleOptions {
	readState(): WorkspaceState;
	readCanvas(): HTMLDivElement | undefined;
	readLayoutSnapshot(): LayoutSnapshot;
	readContainerSize(): { width: number; height: number };
	waitForCanvasSize(): Promise<boolean>;
	bindEvents(renderer: GraphRenderer): () => void;
	syncRendererGroups(): void;
	setRendererDebugState(state: RendererDebugState): void;
}

export class WorkspaceRendererLifecycle {
	private currentRenderer: GraphRenderer | undefined;
	private unbindEvents: (() => void) | undefined;
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
		const initialState = this.options.readState();
		const canvas = this.options.readCanvas();

		if (
			!initialState.projection ||
			initialState.projection.nodes.length === 0 ||
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
		if (!state.projection || state.projection.nodes.length === 0) {
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
		const graph = createWorkspaceRuntimeGraph(
			state.projection,
			positions,
			state,
			palette,
		);
		const newNodeIds = graph
			.nodes()
			.filter((nodeId) => !positions.has(nodeId));
		this.options.setRendererDebugState({
			status: 'layout',
			mode: state.mode,
			container: this.options.readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
		await applyStableRuntimeLayout(graph, layoutSnapshot, newNodeIds, {
			mode: state.mode,
			forceLayout,
			graphSpacing: state.graphSpacing,
			graphForceSettings: getWorkspaceGraphForceSettings(state),
			flowEdgeStyle: state.flowEdgeStyle,
			flowDirection: state.flowDirection,
			flowSpacing: state.flowSpacing,
			arcSpacing: state.arcSpacing,
			arcDirection: state.arcDirection,
		});
		if (version !== this.renderVersion) {
			return;
		}

		const rendererKind = getRendererKindForMode(state.mode);
		if (
			this.currentRenderer &&
			getRendererKind(this.currentRenderer) !== rendererKind
		) {
			this.clearRenderer();
		}

		const firstRender = !this.currentRenderer;
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

		this.options.syncRendererGroups();
		this.currentRenderer.setSelected(state.selectedNodeId);
		this.currentRenderer.setHovered(state.hoveredNodeId);
		if (firstRender || fitAfterRender) {
			this.currentRenderer.fit();
		}
		this.options.setRendererDebugState({
			status: 'rendered',
			mode: state.mode,
			container: this.options.readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
	}

	dispose(): void {
		this.renderVersion += 1;
		this.clearRenderer();
	}

	private clearRenderer(): void {
		this.unbindEvents?.();
		this.unbindEvents = undefined;
		this.stopForceLayoutSimulation();
		this.currentRenderer?.kill();
		this.currentRenderer = undefined;
	}
}
