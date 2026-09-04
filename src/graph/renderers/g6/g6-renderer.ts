import { Graph, GraphEvent, type GraphOptions, type State } from '@antv/g6';
import type { LabelPosition } from '../../../core/types';
import type { LayoutGroupGeometry } from '../../../layouts/group-geometry';
import type { RuntimeGraph } from '../../model/graphology-adapter';
import { immediateNeighborhood } from '../../model/neighborhood';
import type { GraphPalette } from '../../styles/graph-styles';
import type { RendererCapabilities } from '../renderer-capabilities';
import type { PlanarRenderer } from '../renderer-contracts';
import type { LabelThemeConfig } from '../renderer-label-style';
import {
	calculateSigmaCompatibleFitZoom,
	denormalizePlanarPosition,
	getPlanarGraphExtent,
	getPlanarNativeZoomRange,
	getPlanarVisualScale,
	nativeZoomToPlanarLevel,
	normalizePlanarFitZoom,
	normalizePlanarPosition,
	PLANAR_STAGE_PADDING,
	PLANAR_WHEEL_ZOOM_FACTOR,
	planarLevelToNativeZoom,
	type PlanarViewportState,
} from '../planar-viewport-scale';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from '../renderer-groups';
import type { G6RendererOptions } from '../renderer-options';
import { createG6StylePatch, toG6Data } from './g6-data';
import { G6GroupLayer } from './g6-groups';
import {
	createG6ElementStyles,
	type G6DisplayStyleOptions,
	type G6VisualScale,
} from './g6-styles';

const INITIAL_NATIVE_ZOOM_RANGE: [number, number] = [0.001, 1000];
const FOCUS_DURATION = 350;
const ZOOM_DURATION = 180;
const ZOOM_CHANGE_EPSILON = 1e-6;
const WHEEL_ZOOM_DURATION = 250;
const WHEEL_ZOOM_THROTTLE = WHEEL_ZOOM_DURATION / 5;
const VIEWPORT_SETTLE_MS = 80;
const WHEEL_ZOOM_ANIMATION = {
	duration: WHEEL_ZOOM_DURATION,
	easing: 'out-quad',
} as const;

interface G6InteractionSnapshot {
	activeNodeId?: string;
	hoveredEdgeId?: string;
	selectedNodeId?: string;
	selectedEdgeId?: string;
}

export type G6GraphInstance = Pick<
	Graph,
	| 'destroy'
	| 'draw'
	| 'focusElement'
	| 'getCanvasCenter'
	| 'getCanvasByViewport'
	| 'getViewportByCanvas'
	| 'getZoom'
	| 'off'
	| 'on'
	| 'resize'
	| 'setData'
	| 'setOptions'
	| 'setZoomRange'
	| 'translateBy'
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
	private palette: GraphPalette;
	private displayStyle: G6DisplayStyleOptions;
	private scaleLabelsWithZoom: boolean;
	private labelDensity: number;
	private forceLabels: boolean;
	private readonly isStale: () => boolean;
	private readonly zoomLevelListeners = new Set<(level: number) => void>();
	private drawQueue: Promise<void> = Promise.resolve();
	private drawScheduled = false;
	private drawDirty = false;
	private killed = false;
	private fitting = false;
	private fitZoom = 1;
	private hasFitBaseline = false;
	private viewportFrameVersion = 0;
	private viewportVisualSyncTimer?: number;
	private viewportVisualSyncQueued = false;
	private viewportChangeBound = false;
	private viewportPanFrame?: number;
	private viewportPanQueued = false;
	private pendingViewportPanX = 0;
	private pendingViewportPanY = 0;
	private lastObservedNativeZoom = 1;
	private interactionSyncFrame?: number;
	private interactionSyncQueued = false;
	private appliedInteraction: G6InteractionSnapshot = {};
	private readonly interactionEdgesByNode = new Map<string, Set<string>>();
	private readonly runtimeEdgesByLogicalId = new Map<string, Set<string>>();
	private lastWheelDirection = 0;
	private lastWheelTriggerTime = 0;
	private selectedNodeId?: string;
	private selectedEdgeId?: string;
	private hoveredNodeId?: string;
	private hoveredEdgeId?: string;
	private pinnedNodeId?: string;
	private readonly nodeStateKeys = new Map<string, string>();
	private readonly edgeStateKeys = new Map<string, string>();
	private groupLayer?: G6GroupLayer;
	private readonly handleViewportChange = (): void => {
		if (this.killed || this.fitting) return;
		this.viewportFrameVersion += 1;
		const nativeZoom = normalizePlanarFitZoom(this.instance.getZoom());
		if (
			Math.abs(nativeZoom - this.lastObservedNativeZoom) <=
			ZOOM_CHANGE_EPSILON *
				Math.max(nativeZoom, this.lastObservedNativeZoom)
		) {
			return;
		}
		this.lastObservedNativeZoom = nativeZoom;
		this.emitZoomLevel();
		this.scheduleViewportVisualSync();
	};
	private readonly handleWheel = (event: WheelEvent): void => {
		if (this.killed || this.fitting || this.isStale()) return;
		const delta = event.deltaY;
		if (!delta) return;

		const direction = delta < 0 ? 1 : -1;
		const factor =
			direction > 0
				? PLANAR_WHEEL_ZOOM_FACTOR
				: 1 / PLANAR_WHEEL_ZOOM_FACTOR;
		const currentZoom = this.instance.getZoom();
		const [minZoom, maxZoom] = this.hasFitBaseline
			? getPlanarNativeZoomRange(this.fitZoom)
			: INITIAL_NATIVE_ZOOM_RANGE;
		const nextZoom = Math.min(
			maxZoom,
			Math.max(minZoom, currentZoom * factor),
		);
		if (nextZoom === currentZoom) return;

		event.preventDefault();
		event.stopPropagation();
		const now = Date.now();
		if (
			this.lastWheelDirection === direction &&
			this.lastWheelTriggerTime > 0 &&
			now - this.lastWheelTriggerTime < WHEEL_ZOOM_THROTTLE
		) {
			return;
		}
		this.lastWheelDirection = direction;
		this.lastWheelTriggerTime = now;

		const bounds = this.container.getBoundingClientRect();
		this.runViewportAction(() =>
			this.instance.zoomBy(factor, WHEEL_ZOOM_ANIMATION, [
				event.clientX - bounds.left,
				event.clientY - bounds.top,
			]),
		);
	};

	private constructor(options: G6RendererOptions, instance: G6GraphInstance) {
		this.graph = options.graph;
		this.palette = options.palette;
		this.displayStyle = createG6DisplayStyleOptions(options);
		this.scaleLabelsWithZoom = options.scaleLabelsWithZoom;
		this.labelDensity = options.labelDensity;
		this.forceLabels = options.forceLabels;
		this.isStale = options.isStale;
		this.instance = instance;
		this.container = options.container;
		this.rebuildInteractionIndexes();
		this.container.addEventListener('wheel', this.handleWheel, {
			passive: false,
		});
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
		renderer.bindViewportChange();
		return renderer;
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	setGraph(graph: RuntimeGraph): void {
		const viewportState = this.captureViewportState();
		this.graph = graph;
		this.dropMissingInteractionTargets();
		this.nodeStateKeys.clear();
		this.edgeStateKeys.clear();
		this.appliedInteraction = {};
		this.rebuildInteractionIndexes();
		this.instance.setData(toG6Data(graph, this.readVisualScale()));
		this.syncInteractionStates(false, true);
		this.scheduleDraw();
		if (viewportState) this.scheduleCoordinateFrame(viewportState);
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.syncVisualOptions();
	}

	refresh(): void {
		this.scheduleDraw();
	}

	refreshGraphStyles(): void {
		this.instance.updateData(
			createG6StylePatch(
				this.graph,
				{
					nodeIds: this.graph.nodes(),
					edgeIds: this.graph.edges(),
				},
				this.readVisualScale(),
			),
		);
		this.scheduleDraw();
	}

	refreshGraphVisibility(changes: {
		nodeIds: readonly string[];
		edgeIds: readonly string[];
	}): void {
		this.instance.updateData(
			createG6StylePatch(this.graph, changes, this.readVisualScale()),
		);
		this.scheduleDraw();
	}

	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const point = this.instance.getCanvasByViewport([
			position.x,
			position.y,
		]);
		return { x: point[0], y: point[1] };
	}

	graphToViewportPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const point = this.instance.getViewportByCanvas([
			position.x,
			position.y,
		]);
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
		this.scheduleCoordinateFrame({
			zoomLevel: 100,
			normalizedCenter: { x: 0.5, y: 0.5 },
		});
	}

	zoomBy(factor: number): void {
		if (!Number.isFinite(factor) || factor <= 0) return;
		this.runViewportAction(() =>
			this.instance.zoomBy(factor, { duration: ZOOM_DURATION }),
		);
	}

	panViewportBy(delta: { x: number; y: number }): void {
		if (
			this.killed ||
			this.isStale() ||
			!Number.isFinite(delta.x) ||
			!Number.isFinite(delta.y)
		) {
			return;
		}
		this.pendingViewportPanX += delta.x;
		this.pendingViewportPanY += delta.y;
		const window = this.container.ownerDocument?.defaultView;
		if (!window) {
			if (this.viewportPanQueued) return;
			this.viewportPanQueued = true;
			queueMicrotask(() => {
				this.viewportPanQueued = false;
				this.flushViewportPan();
			});
			return;
		}
		if (this.viewportPanFrame !== undefined) return;
		this.viewportPanFrame = window.requestAnimationFrame(() => {
			this.viewportPanFrame = undefined;
			this.flushViewportPan();
		});
	}

	getZoomLevel(): number {
		return nativeZoomToPlanarLevel(this.instance.getZoom(), this.fitZoom);
	}

	setZoomLevel(level: number): void {
		if (!Number.isFinite(level)) return;
		const zoom = planarLevelToNativeZoom(level, this.fitZoom);
		this.runViewportAction(() => this.instance.zoomTo(zoom, false));
	}

	onZoomLevelChange(listener: (level: number) => void): () => void {
		this.zoomLevelListeners.add(listener);
		return () => this.zoomLevelListeners.delete(listener);
	}

	resize(): void {
		if (this.killed) return;
		const viewportState = this.captureViewportState();
		this.instance.resize();
		this.scheduleDraw();
		if (viewportState) this.scheduleCoordinateFrame(viewportState);
	}

	kill(): void {
		if (this.killed) return;
		this.killed = true;
		this.viewportFrameVersion += 1;
		if (this.viewportChangeBound) {
			this.instance.off(
				GraphEvent.AFTER_TRANSFORM,
				this.handleViewportChange,
			);
			this.viewportChangeBound = false;
		}
		this.zoomLevelListeners.clear();
		const window = this.container.ownerDocument?.defaultView;
		if (this.interactionSyncFrame !== undefined) {
			window?.cancelAnimationFrame(this.interactionSyncFrame);
			this.interactionSyncFrame = undefined;
		}
		if (this.viewportPanFrame !== undefined) {
			window?.cancelAnimationFrame(this.viewportPanFrame);
			this.viewportPanFrame = undefined;
		}
		this.pendingViewportPanX = 0;
		this.pendingViewportPanY = 0;
		if (this.viewportVisualSyncTimer !== undefined) {
			window?.clearTimeout(this.viewportVisualSyncTimer);
			this.viewportVisualSyncTimer = undefined;
		}
		this.container.removeEventListener('wheel', this.handleWheel);
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
		this.getOrCreateGroupLayer().setGeometries(geometries, getGroupNodeIds);
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
		this.graph.forEachNode((nodeId, attributes) => {
			if (attributes.hidden || attributes.isBend) return;
			const center = this.graphToViewportPosition(attributes);
			const distance = Math.hypot(
				center.x - position.x,
				center.y - position.y,
			);
			const hitRadius = Math.max(
				14,
				attributes.size * this.readNodeVisualScale() + 8,
			);
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
		this.scheduleInteractionSync();
	}
	setHoveredEdge(edgeId?: string): void {
		if (this.hoveredEdgeId === edgeId) return;
		this.hoveredEdgeId = edgeId;
		this.scheduleInteractionSync();
	}
	getLogicalEdgeId(runtimeEdgeId: string): string | undefined {
		if (!this.graph.hasEdge(runtimeEdgeId)) return undefined;
		return (
			this.graph.getEdgeAttribute(runtimeEdgeId, 'logicalEdgeId') ??
			runtimeEdgeId
		);
	}
	setFadeDistance(_fadeDistance: number): void {}
	setLabelSize(labelSize: number): void {
		this.displayStyle.labelSize = labelSize;
		this.syncVisualOptions();
	}
	setScaleLabelsWithZoom(scaleLabelsWithZoom: boolean): void {
		this.scaleLabelsWithZoom = scaleLabelsWithZoom;
		this.syncVisualOptions();
	}
	setLabelBold(labelBold: boolean): void {
		this.displayStyle.labelBold = labelBold;
		this.syncVisualOptions();
	}
	setLabelItalic(labelItalic: boolean): void {
		this.displayStyle.labelItalic = labelItalic;
		this.syncVisualOptions();
	}
	setLabelPosition(labelPosition: LabelPosition): void {
		this.displayStyle.labelPosition = labelPosition;
		this.syncVisualOptions();
	}
	setLabelOffset(labelOffset: number): void {
		this.displayStyle.labelOffset = labelOffset;
		this.syncVisualOptions();
	}
	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.displayStyle.labelTheme = { ...labelTheme };
		this.syncVisualOptions();
	}
	setLabelDensity(labelDensity: number): void {
		this.labelDensity = labelDensity;
		this.syncVisualOptions();
	}
	setForceLabels(forceLabels: boolean): void {
		this.forceLabels = forceLabels;
		this.syncVisualOptions();
	}
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
		this.drawDirty = true;
		if (this.drawScheduled) return;
		this.drawScheduled = true;
		this.drawQueue = this.drawQueue
			.then(async () => {
				while (this.drawDirty && !this.killed && !this.isStale()) {
					this.drawDirty = false;
					await this.instance.draw();
				}
			})
			.catch(() => undefined)
			.finally(() => {
				this.drawScheduled = false;
				if (this.drawDirty) this.scheduleDraw();
			});
	}

	private captureViewportState(): PlanarViewportState | undefined {
		if (!this.hasFitBaseline || this.killed || this.isStale())
			return undefined;
		const center = this.instance.getCanvasCenter();
		const graphCenter = this.instance.getCanvasByViewport([
			center[0],
			center[1],
		]);
		return {
			zoomLevel: this.getZoomLevel(),
			normalizedCenter: normalizePlanarPosition(
				{ x: graphCenter[0], y: graphCenter[1] },
				getPlanarGraphExtent(this.graph),
			),
		};
	}

	private scheduleCoordinateFrame(viewportState: PlanarViewportState): void {
		if (this.killed || this.isStale()) return;
		const version = ++this.viewportFrameVersion;
		this.drawQueue = this.drawQueue
			.then(async () => {
				if (
					this.killed ||
					this.isStale() ||
					version !== this.viewportFrameVersion
				) {
					return;
				}
				await this.applyCoordinateFrame(viewportState, version);
			})
			.catch(() => undefined);
	}

	private async applyCoordinateFrame(
		viewportState: PlanarViewportState,
		version: number,
	): Promise<void> {
		const canvasCenter = this.instance.getCanvasCenter();
		const viewport = {
			width: canvasCenter[0] * 2,
			height: canvasCenter[1] * 2,
		};
		if (!(viewport.width > 0) || !(viewport.height > 0)) return;
		const extent = getPlanarGraphExtent(this.graph);
		this.fitZoom = calculateSigmaCompatibleFitZoom(extent, viewport);
		this.instance.setZoomRange(getPlanarNativeZoomRange(this.fitZoom));
		this.fitting = true;
		try {
			await this.instance.zoomTo(
				planarLevelToNativeZoom(viewportState.zoomLevel, this.fitZoom),
				false,
			);
			this.lastObservedNativeZoom = normalizePlanarFitZoom(
				this.instance.getZoom(),
			);
			if (
				this.killed ||
				this.isStale() ||
				version !== this.viewportFrameVersion
			) {
				return;
			}
			const graphCenter = denormalizePlanarPosition(
				viewportState.normalizedCenter,
				extent,
			);
			const currentCenter = this.instance.getViewportByCanvas([
				graphCenter.x,
				graphCenter.y,
			]);
			await this.instance.translateBy(
				[
					canvasCenter[0] - currentCenter[0],
					canvasCenter[1] - currentCenter[1],
				],
				false,
			);
			if (
				this.killed ||
				this.isStale() ||
				version !== this.viewportFrameVersion
			) {
				return;
			}
			this.hasFitBaseline = true;
			this.syncViewportVisuals();
			this.emitZoomLevel();
		} finally {
			this.fitting = false;
		}
	}

	private syncVisualOptions(): void {
		if (this.killed || this.isStale()) return;
		this.instance.setOptions({
			background: this.palette.background,
			behaviors: createG6Behaviors({
				scaleLabelsWithZoom: this.scaleLabelsWithZoom,
				labelDensity: this.labelDensity,
				forceLabels: this.forceLabels,
			}),
			...createG6ElementStyles(
				this.palette,
				this.displayStyle,
				this.readVisualScale(),
			),
		});
		this.scheduleDraw();
	}

	private bindViewportChange(): void {
		if (this.killed || this.viewportChangeBound) return;
		this.lastObservedNativeZoom = normalizePlanarFitZoom(
			this.instance.getZoom(),
		);
		this.instance.on(GraphEvent.AFTER_TRANSFORM, this.handleViewportChange);
		this.viewportChangeBound = true;
	}

	private scheduleViewportVisualSync(): void {
		if (this.killed || this.isStale()) return;
		const window = this.container.ownerDocument?.defaultView;
		if (!window) {
			if (this.viewportVisualSyncQueued) return;
			this.viewportVisualSyncQueued = true;
			queueMicrotask(() => {
				this.viewportVisualSyncQueued = false;
				this.syncViewportVisuals();
			});
			return;
		}
		if (this.viewportVisualSyncTimer !== undefined) {
			window.clearTimeout(this.viewportVisualSyncTimer);
		}
		this.viewportVisualSyncTimer = window.setTimeout(() => {
			this.viewportVisualSyncTimer = undefined;
			this.syncViewportVisuals();
		}, VIEWPORT_SETTLE_MS);
	}

	private syncViewportVisuals(): void {
		if (this.killed || this.isStale()) return;
		const visualScale = this.readVisualScale();
		this.instance.updateData(
			createG6StylePatch(
				this.graph,
				{
					nodeIds: this.graph.nodes(),
					edgeIds: this.graph.edges(),
				},
				visualScale,
			),
		);
		this.instance.setOptions({
			...createG6ElementStyles(
				this.palette,
				this.displayStyle,
				visualScale,
			),
			transforms: createG6Transforms(visualScale.geometry),
		});
		this.scheduleDraw();
	}

	private readVisualScale(): G6VisualScale {
		const nativeZoom = normalizePlanarFitZoom(this.instance.getZoom());
		const logicalLevel = nativeZoomToPlanarLevel(nativeZoom, this.fitZoom);
		const visualScale = getPlanarVisualScale(logicalLevel);
		return {
			geometry: visualScale / nativeZoom,
			label: (this.scaleLabelsWithZoom ? visualScale : 1) / nativeZoom,
			screen: 1 / nativeZoom,
		};
	}

	private readNodeVisualScale(): number {
		return getPlanarVisualScale(this.getZoomLevel());
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
				() => this.readNodeVisualScale(),
			);
			this.groupLayer.setFocusedNode(
				this.pinnedNodeId ?? this.hoveredNodeId,
			);
		}
		return this.groupLayer;
	}

	private scheduleInteractionSync(): void {
		if (this.interactionSyncQueued || this.killed || this.isStale()) return;
		this.interactionSyncQueued = true;
		const window = this.container.ownerDocument?.defaultView;
		if (window) {
			this.interactionSyncFrame = window.requestAnimationFrame(() => {
				this.interactionSyncFrame = undefined;
				this.flushInteractionSync();
			});
			return;
		}
		queueMicrotask(() => this.flushInteractionSync());
	}

	private flushInteractionSync(): void {
		this.interactionSyncQueued = false;
		if (this.killed || this.isStale()) return;
		this.syncInteractionStates();
		this.groupLayer?.setFocusedNode(
			this.pinnedNodeId ?? this.hoveredNodeId,
		);
	}

	private syncInteractionStates(scheduleDraw = true, forceAll = false): void {
		if (this.killed || this.isStale()) return;
		const activeNodeId = this.pinnedNodeId ?? this.hoveredNodeId;
		const nextInteraction: G6InteractionSnapshot = {
			activeNodeId,
			hoveredEdgeId: this.hoveredEdgeId,
			selectedNodeId: this.selectedNodeId,
			selectedEdgeId: this.selectedEdgeId,
		};
		const neighborhood = activeNodeId
			? immediateNeighborhood(this.graph, activeNodeId)
			: undefined;
		const nodes: Array<{ id: string; states: State[] }> = [];
		const edges: Array<{ id: string; states: State[] }> = [];
		const nodeIds = this.collectAffectedNodeIds(nextInteraction, forceAll);
		const edgeIds = this.collectAffectedEdgeIds(nextInteraction, forceAll);

		for (const nodeId of nodeIds) {
			if (!this.graph.hasNode(nodeId)) continue;
			const states: State[] = [];
			if (neighborhood && !neighborhood.has(nodeId))
				states.push('dimmed');
			if (nodeId === activeNodeId) states.push('hovered');
			if (nodeId === this.selectedNodeId) states.push('selected');
			if (this.updateStateKey(this.nodeStateKeys, nodeId, states)) {
				nodes.push({ id: nodeId, states });
			}
		}

		for (const edgeId of edgeIds) {
			if (!this.graph.hasEdge(edgeId)) continue;
			const attributes = this.graph.getEdgeAttributes(edgeId);
			const states: State[] = [];
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			const connected = Boolean(
				activeNodeId &&
				this.interactionEdgesByNode.get(activeNodeId)?.has(edgeId),
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
		}
		this.appliedInteraction = nextInteraction;

		if (nodes.length === 0 && edges.length === 0) return;
		this.instance.updateData({ nodes, edges });
		if (scheduleDraw) this.scheduleDraw();
	}

	private collectAffectedNodeIds(
		next: G6InteractionSnapshot,
		forceAll: boolean,
	): Set<string> {
		if (forceAll) return new Set(this.graph.nodes());
		const affected = new Set<string>();
		const previous = this.appliedInteraction;
		if (previous.activeNodeId !== next.activeNodeId) {
			if (!previous.activeNodeId || !next.activeNodeId) {
				this.graph.forEachNode((nodeId) => affected.add(nodeId));
			} else {
				for (const nodeId of immediateNeighborhood(
					this.graph,
					previous.activeNodeId,
				)) {
					affected.add(nodeId);
				}
				for (const nodeId of immediateNeighborhood(
					this.graph,
					next.activeNodeId,
				)) {
					affected.add(nodeId);
				}
			}
		}
		if (previous.selectedNodeId !== next.selectedNodeId) {
			if (previous.selectedNodeId) affected.add(previous.selectedNodeId);
			if (next.selectedNodeId) affected.add(next.selectedNodeId);
		}
		return affected;
	}

	private collectAffectedEdgeIds(
		next: G6InteractionSnapshot,
		forceAll: boolean,
	): Set<string> {
		if (forceAll) return new Set(this.graph.edges());
		const affected = new Set<string>();
		const previous = this.appliedInteraction;
		if (previous.activeNodeId !== next.activeNodeId) {
			if (!previous.activeNodeId || !next.activeNodeId) {
				this.graph.forEachEdge((edgeId) => affected.add(edgeId));
			} else {
				this.addInteractionEdges(affected, previous.activeNodeId);
				this.addInteractionEdges(affected, next.activeNodeId);
			}
		}
		if (previous.hoveredEdgeId !== next.hoveredEdgeId) {
			this.addLogicalEdges(affected, previous.hoveredEdgeId);
			this.addLogicalEdges(affected, next.hoveredEdgeId);
		}
		if (previous.selectedEdgeId !== next.selectedEdgeId) {
			this.addLogicalEdges(affected, previous.selectedEdgeId);
			this.addLogicalEdges(affected, next.selectedEdgeId);
		}
		return affected;
	}

	private addInteractionEdges(target: Set<string>, nodeId?: string): void {
		if (!nodeId) return;
		for (const edgeId of this.interactionEdgesByNode.get(nodeId) ?? []) {
			target.add(edgeId);
		}
	}

	private addLogicalEdges(target: Set<string>, logicalEdgeId?: string): void {
		if (!logicalEdgeId) return;
		for (const edgeId of this.runtimeEdgesByLogicalId.get(logicalEdgeId) ??
			[]) {
			target.add(edgeId);
		}
	}

	private rebuildInteractionIndexes(): void {
		this.interactionEdgesByNode.clear();
		this.runtimeEdgesByLogicalId.clear();
		this.graph.forEachEdge((edgeId, attributes, source, target) => {
			for (const nodeId of new Set([
				source,
				target,
				attributes.logicalSource,
				attributes.logicalTarget,
			])) {
				if (!nodeId) continue;
				const edges =
					this.interactionEdgesByNode.get(nodeId) ?? new Set();
				edges.add(edgeId);
				this.interactionEdgesByNode.set(nodeId, edges);
			}
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			const runtimeEdges =
				this.runtimeEdgesByLogicalId.get(logicalEdgeId) ?? new Set();
			runtimeEdges.add(edgeId);
			this.runtimeEdgesByLogicalId.set(logicalEdgeId, runtimeEdges);
		});
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
		if (this.selectedEdgeId && !this.hasLogicalEdge(this.selectedEdgeId)) {
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
		const viewportFrameVersion = this.viewportFrameVersion;
		void action()
			.then(() => {
				if (
					!this.killed &&
					!this.isStale() &&
					viewportFrameVersion === this.viewportFrameVersion
				) {
					this.handleViewportChange();
				}
			})
			.catch(() => undefined);
	}

	private flushViewportPan(): void {
		if (this.killed || this.isStale()) {
			this.pendingViewportPanX = 0;
			this.pendingViewportPanY = 0;
			return;
		}
		const x = this.pendingViewportPanX;
		const y = this.pendingViewportPanY;
		this.pendingViewportPanX = 0;
		this.pendingViewportPanY = 0;
		if (x === 0 && y === 0) return;
		void this.instance.translateBy([x, y], false).catch(() => undefined);
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
		padding: PLANAR_STAGE_PADDING,
		zoomRange: INITIAL_NATIVE_ZOOM_RANGE,
		behaviors: createG6Behaviors(options),
		transforms: createG6Transforms(),
		...createG6ElementStyles(
			options.palette,
			createG6DisplayStyleOptions(options),
		),
	};
}

export function createG6Behaviors(options: {
	scaleLabelsWithZoom: boolean;
	labelDensity: number;
	forceLabels: boolean;
}): NonNullable<GraphOptions['behaviors']> {
	const density = Math.min(1, Math.max(0, options.labelDensity));
	return [
		{
			type: 'zoom-canvas',
			trigger: ['pinch'],
			animation: false,
		},
		{
			type: 'auto-adapt-label',
			enable: !options.forceLabels,
			padding: Math.round(4 + (1 - density) * 24),
			throttle: 32,
		},
	];
}

export function createG6Transforms(
	geometryScale = 1,
): NonNullable<GraphOptions['transforms']> {
	return [
		{
			type: 'process-parallel-edges',
			mode: 'bundle',
			distance: 15 * geometryScale,
			loopMode: 'nested',
			loopDistance: 15 * geometryScale,
		},
	];
}

function createG6DisplayStyleOptions(
	options: G6RendererOptions,
): G6DisplayStyleOptions {
	return {
		labelSize: options.labelSize,
		labelBold: options.labelBold,
		labelItalic: options.labelItalic,
		labelPosition: options.labelPosition,
		labelOffset: options.labelOffset,
		labelTheme: {
			labelLightTextColor: options.labelLightTextColor,
			labelLightBackgroundColor: options.labelLightBackgroundColor,
			labelLightBackgroundOpacity: options.labelLightBackgroundOpacity,
			labelDarkTextColor: options.labelDarkTextColor,
			labelDarkBackgroundColor: options.labelDarkBackgroundColor,
			labelDarkBackgroundOpacity: options.labelDarkBackgroundOpacity,
		},
	};
}
