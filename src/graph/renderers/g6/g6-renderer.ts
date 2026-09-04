import { Graph, GraphEvent, type GraphOptions, type State } from '@antv/g6';
import type { LabelPosition } from '../../../core/types';
import type { LayoutGroupGeometry } from '../../../layouts/group-geometry';
import type { RuntimeGraph } from '../../model/graphology-adapter';
import { immediateNeighborhood } from '../../model/neighborhood';
import type { GraphPalette } from '../../styles/graph-styles';
import type { RendererCapabilities } from '../renderer-capabilities';
import type { PlanarRenderer } from '../renderer-contracts';
import type { LabelThemeConfig } from '../renderer-label-style';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from '../renderer-groups';
import type { G6RendererOptions } from '../renderer-options';
import { createG6StylePatch, toG6Data } from './g6-data';
import { G6GroupLayer } from './g6-groups';
import { createG6InteractionStyles } from './g6-styles';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const FIT_DURATION = 350;
const FOCUS_DURATION = 350;
const ZOOM_DURATION = 180;

export type G6GraphInstance = Pick<
	Graph,
	| 'destroy'
	| 'draw'
	| 'fitView'
	| 'focusElement'
	| 'getCanvasByViewport'
	| 'getViewportByCanvas'
	| 'getZoom'
	| 'off'
	| 'on'
	| 'resize'
	| 'setData'
	| 'setOptions'
	| 'updateData'
	| 'zoomBy'
	| 'zoomTo'
>;

export type G6GraphFactory = (options: GraphOptions) => G6GraphInstance;

export class G6Renderer implements PlanarRenderer {
	readonly capabilities: RendererCapabilities = {
		kind: 'g6',
		supportsGroupOverlay: true,
		supportsLayoutGroupGeometry: true,
		supportsManualLayout: false,
		supportsEdgePicking: true,
		supportsNodeDragging: false,
		supportsConnectionMoveScheduling: false,
		supportsExternal2DForceSimulation: false,
	};
	readonly instance: G6GraphInstance;
	readonly container: HTMLElement;
	private graph: RuntimeGraph;
	private readonly isStale: () => boolean;
	private readonly zoomLevelListeners = new Set<(level: number) => void>();
	private drawQueue: Promise<void> = Promise.resolve();
	private killed = false;
	private selectedNodeId?: string;
	private selectedEdgeId?: string;
	private hoveredNodeId?: string;
	private hoveredEdgeId?: string;
	private pinnedNodeId?: string;
	private readonly nodeStateKeys = new Map<string, string>();
	private readonly edgeStateKeys = new Map<string, string>();
	private groupLayer?: G6GroupLayer;
	private readonly handleViewportChange = (): void => {
		this.emitZoomLevel();
	};

	private constructor(options: G6RendererOptions, instance: G6GraphInstance) {
		this.graph = options.graph;
		this.isStale = options.isStale;
		this.instance = instance;
		this.container = options.container;
		this.instance.on(GraphEvent.AFTER_TRANSFORM, this.handleViewportChange);
	}

	static async create(
		options: G6RendererOptions,
		createGraph: G6GraphFactory = (graphOptions) => new Graph(graphOptions),
	): Promise<G6Renderer | undefined> {
		if (options.isStale()) return undefined;
		const instance = createGraph(createG6GraphOptions(options));
		const renderer = new G6Renderer(options, instance);
		try {
			await instance.draw();
		} catch (error) {
			renderer.kill();
			throw error;
		}
		if (options.isStale()) {
			renderer.kill();
			return undefined;
		}
		return renderer;
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	setGraph(graph: RuntimeGraph): void {
		this.graph = graph;
		this.dropMissingInteractionTargets();
		this.nodeStateKeys.clear();
		this.edgeStateKeys.clear();
		this.instance.setData(toG6Data(graph));
		this.syncInteractionStates(false);
		this.scheduleDraw();
	}

	setPalette(palette: GraphPalette): void {
		this.instance.setOptions({
			background: palette.background,
			...createG6InteractionStyles(palette),
		});
		this.scheduleDraw();
	}

	refresh(): void {
		this.scheduleDraw();
	}

	refreshGraphStyles(): void {
		this.instance.updateData(
			createG6StylePatch(this.graph, {
				nodeIds: this.graph.nodes(),
				edgeIds: this.graph.edges(),
			}),
		);
		this.scheduleDraw();
	}

	refreshGraphVisibility(changes: {
		nodeIds: readonly string[];
		edgeIds: readonly string[];
	}): void {
		this.instance.updateData(createG6StylePatch(this.graph, changes));
		this.scheduleDraw();
	}

	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const point = this.instance.getCanvasByViewport([position.x, position.y]);
		return { x: point[0], y: point[1] };
	}

	graphToViewportPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const point = this.instance.getViewportByCanvas([position.x, position.y]);
		return { x: point[0], y: point[1] };
	}

	focusNode(nodeId: string): void {
		if (!this.graph.hasNode(nodeId)) return;
		const attributes = this.graph.getNodeAttributes(nodeId);
		if (attributes.hidden || attributes.isBend) return;
		this.runViewportAction(() =>
			this.instance.focusElement(nodeId, { duration: FOCUS_DURATION }),
		);
	}

	fit(): void {
		this.runViewportAction(() =>
			this.instance.fitView(
				{ when: 'always', direction: 'both' },
				{ duration: FIT_DURATION },
			),
		);
	}

	zoomBy(factor: number): void {
		if (!Number.isFinite(factor) || factor <= 0) return;
		this.runViewportAction(() =>
			this.instance.zoomBy(factor, { duration: ZOOM_DURATION }),
		);
	}

	getZoomLevel(): number {
		return this.instance.getZoom() * 100;
	}

	setZoomLevel(level: number): void {
		if (!Number.isFinite(level)) return;
		const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level / 100));
		this.runViewportAction(() => this.instance.zoomTo(zoom, false));
	}

	onZoomLevelChange(listener: (level: number) => void): () => void {
		this.zoomLevelListeners.add(listener);
		return () => this.zoomLevelListeners.delete(listener);
	}

	resize(): void {
		if (this.killed) return;
		this.instance.resize();
		this.scheduleDraw();
	}

	kill(): void {
		if (this.killed) return;
		this.killed = true;
		this.instance.off(GraphEvent.AFTER_TRANSFORM, this.handleViewportChange);
		this.zoomLevelListeners.clear();
		this.groupLayer?.kill();
		this.groupLayer = undefined;
		this.instance.destroy();
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks?: GroupInteractionCallbacks,
	): void {
		this.getOrCreateGroupLayer().setGroups(groups, callbacks);
	}

	setLayoutGroupGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.getOrCreateGroupLayer().setGeometries(
			geometries,
			getGroupNodeIds,
		);
	}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		return this.groupLayer?.getGroupAtViewportPosition(position);
	}

	getNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		let closestNodeId: string | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;
		const zoom = Math.max(0, this.instance.getZoom());
		this.graph.forEachNode((nodeId, attributes) => {
			if (attributes.hidden || attributes.isBend) return;
			const center = this.graphToViewportPosition(attributes);
			const distance = Math.hypot(
				center.x - position.x,
				center.y - position.y,
			);
			const hitRadius = Math.max(14, attributes.size * zoom + 8);
			if (distance <= hitRadius && distance < closestDistance) {
				closestNodeId = nodeId;
				closestDistance = distance;
			}
		});
		return closestNodeId;
	}

	setActiveDropGroup(groupId?: string): void {
		this.groupLayer?.setActiveDropGroup(groupId);
	}
	setSelected(nodeId?: string): void {
		if (this.selectedNodeId === nodeId) return;
		this.selectedNodeId = nodeId;
		this.syncInteractionStates();
	}
	setSelectedEdge(edgeId?: string): void {
		if (this.selectedEdgeId === edgeId) return;
		this.selectedEdgeId = edgeId;
		this.syncInteractionStates();
	}
	setSelectedGroup(groupId?: string): void {
		this.groupLayer?.setSelectedGroup(groupId);
	}
	setHovered(nodeId?: string): void {
		if (this.hoveredNodeId === nodeId) return;
		this.hoveredNodeId = nodeId;
		this.syncInteractionStates();
		this.groupLayer?.setFocusedNode(this.pinnedNodeId ?? nodeId);
	}
	setHoveredEdge(edgeId?: string): void {
		if (this.hoveredEdgeId === edgeId) return;
		this.hoveredEdgeId = edgeId;
		this.syncInteractionStates();
	}
	getLogicalEdgeId(runtimeEdgeId: string): string | undefined {
		if (!this.graph.hasEdge(runtimeEdgeId)) return undefined;
		return (
			this.graph.getEdgeAttribute(runtimeEdgeId, 'logicalEdgeId') ??
			runtimeEdgeId
		);
	}
	setFadeDistance(_fadeDistance: number): void {}
	setLabelSize(_labelSize: number): void {}
	setScaleLabelsWithZoom(_scaleLabelsWithZoom: boolean): void {}
	setLabelBold(_labelBold: boolean): void {}
	setLabelItalic(_labelItalic: boolean): void {}
	setLabelPosition(_labelPosition: LabelPosition): void {}
	setLabelOffset(_labelOffset: number): void {}
	setLabelTheme(_labelTheme: LabelThemeConfig): void {}
	setLabelDensity(_labelDensity: number): void {}
	setForceLabels(_forceLabels: boolean): void {}
	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.syncInteractionStates();
		this.groupLayer?.setFocusedNode(
			this.pinnedNodeId ?? this.hoveredNodeId,
		);
	}
	clearPinnedHover(): void {
		if (!this.pinnedNodeId) return;
		this.pinnedNodeId = undefined;
		this.syncInteractionStates();
		this.groupLayer?.setFocusedNode(this.hoveredNodeId);
	}
	holdCurrentBounds(): void {}
	clearHeldBounds(): void {}

	private scheduleDraw(): void {
		if (this.killed || this.isStale()) return;
		this.drawQueue = this.drawQueue
			.then(async () => {
				if (this.killed || this.isStale()) return;
				await this.instance.draw();
			})
			.catch(() => undefined);
	}

	setHoveredGroup(groupId?: string): void {
		this.groupLayer?.setHoveredGroup(groupId);
	}

	private getOrCreateGroupLayer(): G6GroupLayer {
		if (!this.groupLayer) {
			this.groupLayer = new G6GroupLayer(
				this.instance,
				this.container,
				() => this.graph,
				(position) => this.graphToViewportPosition(position),
				(position) => this.viewportToGraphPosition(position),
			);
			this.groupLayer.setFocusedNode(
				this.pinnedNodeId ?? this.hoveredNodeId,
			);
		}
		return this.groupLayer;
	}

	private syncInteractionStates(scheduleDraw = true): void {
		if (this.killed || this.isStale()) return;
		const activeNodeId = this.pinnedNodeId ?? this.hoveredNodeId;
		const neighborhood = activeNodeId
			? immediateNeighborhood(this.graph, activeNodeId)
			: undefined;
		const nodes: Array<{ id: string; states: State[] }> = [];
		const edges: Array<{ id: string; states: State[] }> = [];

		this.graph.forEachNode((nodeId) => {
			const states: State[] = [];
			if (neighborhood && !neighborhood.has(nodeId)) states.push('dimmed');
			if (nodeId === activeNodeId) states.push('hovered');
			if (nodeId === this.selectedNodeId) states.push('selected');
			if (this.updateStateKey(this.nodeStateKeys, nodeId, states)) {
				nodes.push({ id: nodeId, states });
			}
		});

		this.graph.forEachEdge((edgeId, attributes, source, target) => {
			const states: State[] = [];
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			const connected = Boolean(
				activeNodeId &&
					(source === activeNodeId ||
						target === activeNodeId ||
						attributes.logicalSource === activeNodeId ||
						attributes.logicalTarget === activeNodeId),
			);
			if (activeNodeId && !connected) states.push('dimmed');
			if (connected) states.push('connected');
			if (
				logicalEdgeId === this.hoveredEdgeId &&
				(!this.pinnedNodeId || connected)
			) {
				states.push('hovered');
			}
			if (logicalEdgeId === this.selectedEdgeId) states.push('selected');
			if (this.updateStateKey(this.edgeStateKeys, edgeId, states)) {
				edges.push({ id: edgeId, states });
			}
		});

		if (nodes.length === 0 && edges.length === 0) return;
		this.instance.updateData({ nodes, edges });
		if (scheduleDraw) this.scheduleDraw();
	}

	private updateStateKey(
		index: Map<string, string>,
		id: string,
		states: readonly State[],
	): boolean {
		const key = states.join('\0');
		const previous = index.get(id);
		index.set(id, key);
		return previous !== undefined ? previous !== key : key.length > 0;
	}

	private dropMissingInteractionTargets(): void {
		if (this.selectedNodeId && !this.graph.hasNode(this.selectedNodeId)) {
			this.selectedNodeId = undefined;
		}
		if (this.hoveredNodeId && !this.graph.hasNode(this.hoveredNodeId)) {
			this.hoveredNodeId = undefined;
		}
		if (this.pinnedNodeId && !this.graph.hasNode(this.pinnedNodeId)) {
			this.pinnedNodeId = undefined;
		}
		if (
			this.selectedEdgeId &&
			!this.hasLogicalEdge(this.selectedEdgeId)
		) {
			this.selectedEdgeId = undefined;
		}
		if (this.hoveredEdgeId && !this.hasLogicalEdge(this.hoveredEdgeId)) {
			this.hoveredEdgeId = undefined;
		}
	}

	private hasLogicalEdge(logicalEdgeId: string): boolean {
		return this.graph.someEdge(
			(edgeId, attributes) =>
				(attributes.logicalEdgeId ?? edgeId) === logicalEdgeId,
		);
	}

	private runViewportAction(action: () => Promise<void>): void {
		if (this.killed || this.isStale()) return;
		void action()
			.then(() => {
				if (!this.killed && !this.isStale()) this.emitZoomLevel();
			})
			.catch(() => undefined);
	}

	private emitZoomLevel(): void {
		const level = this.getZoomLevel();
		this.zoomLevelListeners.forEach((listener) => listener(level));
	}
}

export function createG6GraphOptions(options: G6RendererOptions): GraphOptions {
	return {
		container: options.container,
		data: toG6Data(options.graph),
		animation: false,
		autoResize: false,
		background: options.palette.background,
		padding: 32,
		zoomRange: [MIN_ZOOM, MAX_ZOOM],
		behaviors: ['drag-canvas', 'zoom-canvas'],
		transforms: [
			{
				type: 'process-parallel-edges',
				mode: 'bundle',
				distance: 15,
				loopMode: 'nested',
				loopDistance: 15,
			},
		],
		...createG6InteractionStyles(options.palette),
	};
}
