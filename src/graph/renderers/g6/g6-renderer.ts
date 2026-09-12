import { Graph, GraphEvent, type GraphOptions, type State } from '@antv/g6';
import { flowTitleReferenceExtent } from '@/graph/renderers/flow-title-viewport';
import { G6_STATE_TRANSFORM } from '@/graph/renderers/g6/g6-state-transform';
import { G6_POSITION_TRANSFORM } from '@/graph/renderers/g6/g6-position-transform';
import { installG6TranslateBatch } from '@/graph/renderers/g6/g6-translate-batch';
import { observeG6Translation } from '@/graph/renderers/g6/g6-translation-diagnostics';
import {
	PlanarPerformance,
	observeGCanvas,
	getPlanarPerformance,
} from '@/graph/renderers/planar-performance';
import type { LabelPosition } from '@/core/types';
import type { LayoutGroupGeometry } from '@/layouts/group-geometry';
import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';
import type {
	GraphPosition,
	RuntimeGraph,
} from '@/graph/model/graphology-adapter';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import type { RendererCapabilities } from '@/graph/renderers/renderer-capabilities';
import type { PlanarRenderer } from '@/graph/renderers/renderer-contracts';
import type { LabelThemeConfig } from '@/graph/renderers/renderer-label-style';
import {
	calculateSigmaCompatibleFitZoom,
	denormalizePlanarPosition,
	getPlanarLabelVisualScale,
	getPlanarNativeZoomRange,
	getPlanarVisualScale,
	nativeZoomToPlanarLevel,
	normalizePlanarFitZoom,
	normalizePlanarPosition,
	PLANAR_STAGE_PADDING,
	PLANAR_WHEEL_ZOOM_FACTOR,
	planarLevelToNativeZoom,
	type PlanarViewportState,
} from '@/graph/renderers/planar-viewport-scale';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from '@/graph/renderers/renderer-groups';
import type { G6RendererOptions } from '@/graph/renderers/renderer-options';
import {
	createG6LabelVisibilityIndex,
	createG6LabelVisibilityPatch,
	createG6StylePatch,
	isG6RenderedNode,
	resolveG6LabelVisibilityFromIndex,
	toG6Data,
	type G6LabelVisibility,
	type G6LabelVisibilityIndex,
} from '@/graph/renderers/g6/g6-data';
import {
	createG6CoordinateSpace,
	type G6CoordinateSpace,
} from '@/graph/renderers/g6/g6-coordinate-space';
import { G6GroupLayer } from '@/graph/renderers/g6/g6-groups';
import {
	G6_LABEL_CONTROLLER_KEY,
	type G6LabelController,
	type G6LabelControllerDirtyIds,
	type G6LabelControllerSnapshot,
} from '@/graph/renderers/g6/g6-label-controller';
import {
	createG6InteractionStyles,
	createG6LabelStyles,
	G6_INTERACTION_STATE,
	resolveG6RotatedNodeLabelStyle,
	type G6DisplayStyleOptions,
	type G6VisualScale,
} from '@/graph/renderers/g6/g6-styles';
import { G6SceneCache } from '@/graph/renderers/g6/g6-scene-cache';

const INITIAL_NATIVE_ZOOM_RANGE: [number, number] = [0.001, 1000];
const FOCUS_DURATION = 350;
const ZOOM_DURATION = 180;
const ZOOM_CHANGE_EPSILON = 1e-6;
const WHEEL_PIXEL_DELTA_PER_STEP = 100;
const MOUSE_WHEEL_INTERPOLATION_MS = 72;
const MOUSE_WHEEL_DELTA_THRESHOLD = 50;
const LARGE_LABEL_SCENE_ELEMENT_COUNT = 500;
const LABEL_VIEWPORT_PIXELS_PER_NODE = 3600;
const MIN_VIEWPORT_NODE_LABELS = 24;
const MAX_VIEWPORT_NODE_LABELS = 400;
const NODE_HOVER_LEAVE_GRACE_MS = 80;

interface G6InteractionSnapshot {
	traceActive?: boolean;
	dimUnrelated?: boolean;
	activeNodeId?: string;
	pinnedNodeId?: string;
	hoveredEdgeId?: string;
	selectedNodeId?: string;
	selectedEdgeId?: string;
}

export type G6GraphInstance = Pick<
	Graph,
	| 'destroy'
	| 'draw'
	| 'focusElement'
	| 'getCanvas'
	| 'getCanvasCenter'
	| 'getCanvasByViewport'
	| 'getElementPosition'
	| 'getPluginInstance'
	| 'getViewportByCanvas'
	| 'getZoom'
	| 'off'
	| 'on'
	| 'resize'
	| 'setData'
	| 'setElementState'
	| 'setOptions'
	| 'setZoomRange'
	| 'translateBy'
	| 'translateElementTo'
	| 'updateData'
	| 'zoomBy'
	| 'zoomTo'
>;

export type G6GraphFactory = (options: GraphOptions) => G6GraphInstance;

export class G6Renderer implements PlanarRenderer {
	private diagnostics?: PlanarPerformance;
	private restoreTranslateBatch?: () => void;
	readonly capabilities: RendererCapabilities = {
		kind: 'g6',
		supportsGroupOverlay: true,
		supportsLayoutGroupGeometry: true,
		supportsManualLayout: false,
		supportsEdgePicking: true,
		supportsNodeDragging: true,
		supportsConnectionMoveScheduling: false,
		supportsExternal2DForceSimulation: true,
	};
	readonly instance: G6GraphInstance;
	readonly container: HTMLElement;
	private graph: RuntimeGraph;
	private coordinateSpace: G6CoordinateSpace;
	private edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>;
	private palette: GraphPalette;
	private displayStyle: G6DisplayStyleOptions;
	private scaleLabelsWithZoom: boolean;
	private labelDensity: number;
	private forceLabels: boolean;
	private sceneCache: G6SceneCache;
	private labelVisibility?: G6LabelVisibility;
	private readonly isStale: () => boolean;
	private readonly zoomLevelListeners = new Set<(level: number) => void>();
	private drawQueue: Promise<void> = Promise.resolve();
	private drawScheduled = false;
	private drawDirty = false;
	private forceSyncFrame?: number;
	private forceSyncScheduled = false;
	private forcePositionsDirty = false;
	private readonly submittedForcePositions = new Map<string, GraphPosition>();
	private labelSyncScheduled = false;
	private labelSyncFrame?: number;
	private labelSyncAll = false;
	private readonly pendingLabelNodeIds = new Set<string>();
	private readonly pendingLabelEdgeIds = new Set<string>();
	private killed = false;
	private fitting = false;
	private fitZoom = 1;
	private hasFitBaseline = false;
	private viewportFrameVersion = 0;
	private viewportChangeBound = false;
	private viewportTransformFrame?: number;
	private viewportTransformFallbackQueued = false;
	private viewportPanActive = false;
	private pendingViewportPanX = 0;
	private pendingViewportPanY = 0;
	private lastObservedNativeZoom = 1;
	private interactionSyncFrame?: number;
	private interactionSyncQueued = false;
	private interactionStateInFlight = false;
	private readonly pendingInteractionStates = new Map<string, State[]>();
	private hoverLeaveTimer?: number;
	private appliedInteraction: G6InteractionSnapshot = {};
	private wheelZoomTarget?: number;
	private wheelZoomOrigin?: [number, number];
	private wheelZoomStart?: number;
	private wheelZoomStartedAt?: number;
	private wheelZoomInterpolated = false;
	private selectedNodeId?: string;
	private selectedEdgeId?: string;
	private hoveredNodeId?: string;
	private hoverMode: import('@/settings/settings').NodeHoverMode = 'local';
	private hoveredEdgeId?: string;
	private pinnedNodeId?: string;
	private readonly nodeStateKeys = new Map<string, string>();
	private readonly edgeStateKeys = new Map<string, string>();
	private groupLayer?: G6GroupLayer;
	private groupSceneSyncQueued = false;
	private groupSceneGroups: readonly GroupOverlayGroup[] = [];
	private groupSceneGeometries: readonly LayoutGroupGeometry[] = [];
	private groupSceneCallbacks: GroupInteractionCallbacks = {};
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
		this.syncLabelZoomScale();
		this.emitZoomLevel();
	};
	private readonly handleWheel = (event: WheelEvent): void => {
		if (this.killed || this.fitting || this.isStale()) return;
		const delta = event.deltaY;
		if (!delta) return;
		if (this.viewportPanActive) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		const factor = resolveWheelZoomFactor(event);
		const currentZoom = this.wheelZoomTarget ?? this.instance.getZoom();
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
		const bounds = this.container.getBoundingClientRect();
		this.wheelZoomTarget = nextZoom;
		this.wheelZoomInterpolated = shouldInterpolateWheel(event);
		if (this.wheelZoomInterpolated) {
			this.wheelZoomStart = this.instance.getZoom();
			this.wheelZoomStartedAt = performance.now();
		} else {
			this.wheelZoomStart = undefined;
			this.wheelZoomStartedAt = undefined;
		}
		this.wheelZoomOrigin = [
			event.clientX - bounds.left,
			event.clientY - bounds.top,
		];
		this.scheduleWheelZoom();
	};

	private constructor(
		options: G6RendererOptions,
		instance: G6GraphInstance,
		coordinateSpace: G6CoordinateSpace,
		sceneCache: G6SceneCache,
	) {
		this.graph = options.graph;
		this.coordinateSpace = coordinateSpace;
		this.edgeRoutes = options.edgeRoutes;
		this.palette = options.palette;
		this.displayStyle = createG6DisplayStyleOptions(options);
		this.scaleLabelsWithZoom = options.scaleLabelsWithZoom;
		this.labelDensity = options.labelDensity;
		this.forceLabels = options.forceLabels;
		this.sceneCache = sceneCache;
		this.isStale = options.isStale;
		this.instance = instance;
		this.container = options.container;
		this.container.addEventListener('wheel', this.handleWheel, {
			passive: false,
		});
	}

	static async create(
		options: G6RendererOptions,
		createGraph: G6GraphFactory = (graphOptions) => new Graph(graphOptions),
	): Promise<G6Renderer | undefined> {
		if (options.isStale()) return undefined;
		const sceneCache = new G6SceneCache(options.graph, options.edgeRoutes);
		const coordinateSpace = createG6CoordinateSpace(
			options.graph,
			sceneCache.graphExtent,
		);
		const instance = createGraph(
			createG6GraphOptions(
				options,
				coordinateSpace,
				sceneCache.labelVisibilityIndex,
				sceneCache,
			),
		);
		const renderer = new G6Renderer(
			options,
			instance,
			coordinateSpace,
			sceneCache,
		);
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
		renderer.restoreTranslateBatch = installG6TranslateBatch(instance);
		renderer.diagnostics = new PlanarPerformance({
			owner: renderer,
			engine: 'g6',
			container: options.container,
			snapshot: () => ({
				nodes: renderer.graph.order,
				runtimeEdges: renderer.graph.size,
				logicalEdges: renderer.sceneCache.logicalEdgeCount,
				renderedNodes: renderer.sceneCache.renderedNodeIds.size,
				eligibleNodeLabels: renderer.readLabelVisibility().nodeIds.size,
				eligibleEdgeLabels: renderer.readLabelVisibility().edgeIds.size,
				groups: new Set([
					...renderer.groupSceneGroups.map((g) => g.id),
					...renderer.groupSceneGeometries.map((g) => g.groupId),
				]).size,
				forceLabels: renderer.forceLabels,
				labelDensity: renderer.labelDensity,
				positionFastPath: true,
				retainedTranslationLabels: true,
			}),
			attach: (session) => {
				const stopTranslationDiagnostics = observeG6Translation(
					instance,
					session,
				);
				const canvas = instance.getCanvas();
				const cleanup = (
					['main', 'background', 'label', 'transient'] as const
				).map((layer) =>
					observeGCanvas(
						canvas.getLayer(layer) as unknown as EventTarget,
						layer,
						session,
					),
				);
				return () => {
					stopTranslationDiagnostics();
					cleanup.forEach((dispose) => dispose());
				};
			},
		});
		return renderer;
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	private spacingExtent?: G6SceneCache['graphExtent'];
	private flowReferenceExtent?: G6SceneCache['graphExtent'];

	setGraph(
		graph: RuntimeGraph,
		options?: { preserveViewportScale?: boolean },
	): void {
		const preserveScale = options?.preserveViewportScale === true;
		if (preserveScale)
			this.spacingExtent ??=
				this.flowReferenceExtent ?? this.sceneCache.graphExtent;
		this.forcePositionsDirty = false;
		this.submittedForcePositions.clear();
		const viewportState = this.captureViewportState();
		if (!preserveScale) this.spacingExtent = undefined;
		this.graph = graph;
		this.sceneCache = new G6SceneCache(graph, this.edgeRoutes);
		this.coordinateSpace = createG6CoordinateSpace(
			graph,
			this.spacingExtent ?? this.sceneCache.graphExtent,
		);
		this.labelVisibility = undefined;
		this.dropMissingInteractionTargets();
		this.nodeStateKeys.clear();
		this.edgeStateKeys.clear();
		this.pendingInteractionStates.clear();
		this.appliedInteraction = {};
		this.instance.setData(
			toG6Data(
				graph,
				this.readVisualScale(),
				this.readLabelVisibility(),
				this.readLabelStyles(),
				this.coordinateSpace,
				this.edgeRoutes,
				this.sceneCache.runtimeEdgesByLogicalId,
			),
		);
		this.replaceLabelControllerSnapshot();
		this.syncInteractionStates(false, true);
		this.scheduleDraw();
		if (this.groupLayer) this.groupLayer.invalidateGeometry();
		else if (
			this.groupSceneGroups.length > 0 ||
			this.groupSceneGeometries.length > 0
		) {
			this.scheduleGroupSceneSync();
		}
		if (viewportState) this.scheduleCoordinateFrame(viewportState);
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.syncPaletteOptions();
	}

	refresh(): void {
		if (this.killed || this.isStale()) return;
		this.scheduleDraw();
	}

	refreshGraphStyles(): void {
		const previousLabelVisibility = this.readLabelVisibility();
		const traceChanged =
			this.appliedInteraction?.traceActive !==
			Boolean(this.graph.getAttribute('traceActive'));
		const changes = this.sceneCache.collectStyleChanges();
		this.sceneCache.refreshLabelIndex();
		this.labelVisibility = undefined;
		const labelVisibility = this.readLabelVisibility();
		const labelChanges = diffLabelVisibility(
			previousLabelVisibility,
			labelVisibility,
		);
		const dirty = {
			nodeIds: [
				...new Set([...changes.nodeIds, ...labelChanges.nodeIds]),
			],
			edgeIds: [
				...new Set([...changes.edgeIds, ...labelChanges.edgeIds]),
			],
		};
		const patch = createG6StylePatch(
			this.graph,
			dirty,
			this.readVisualScale(),
			labelVisibility,
			this.readLabelStyles(),
			this.coordinateSpace,
			this.edgeRoutes,
			this.sceneCache.runtimeEdgesByLogicalId,
		);
		if (patch.nodes.length > 0 || patch.edges.length > 0) {
			this.instance.updateData(patch);
		}
		if (traceChanged) {
			this.syncInteractionStates(true, true);
			this.syncGroupFocus();
		}
		this.replaceLabelControllerSnapshot();
		if (changes.nodeIds.length > 0) this.groupLayer?.invalidateGeometry();
		if (traceChanged || patch.nodes.length > 0 || patch.edges.length > 0)
			this.scheduleDraw();
	}

	refreshGraphVisibility(changes: {
		nodeIds: readonly string[];
		edgeIds: readonly string[];
	}): void {
		this.sceneCache.refreshLabelIndex();
		this.labelVisibility = undefined;
		const labelVisibility = this.readLabelVisibility();
		this.instance.updateData(
			createG6StylePatch(
				this.graph,
				{
					nodeIds: changes.nodeIds,
					edgeIds: changes.edgeIds,
				},
				this.readVisualScale(),
				labelVisibility,
				this.readLabelStyles(),
				this.coordinateSpace,
				this.edgeRoutes,
				this.sceneCache.runtimeEdgesByLogicalId,
			),
		);
		this.replaceLabelControllerSnapshot();
		this.groupLayer?.invalidateGeometry();
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
		return this.canvasToGraphPosition({ x: point[0], y: point[1] });
	}

	canvasToGraphPosition(position: { x: number; y: number }): GraphPosition {
		return this.coordinateSpace.toGraph(position);
	}

	graphToViewportPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const g6Position = this.coordinateSpace.toG6(position);
		const point = this.instance.getViewportByCanvas([
			g6Position.x,
			g6Position.y,
		]);
		return { x: point[0], y: point[1] };
	}

	onNodeBadgeFrame(listener: () => void): () => void {
		const canvas = this.instance.getCanvas().getLayer('main');
		canvas.addEventListener('afterrender', listener);
		return () => canvas.removeEventListener('afterrender', listener);
	}

	getNodeBadgeAnchor(nodeId: string) {
		if (this.killed || this.isStale() || !this.graph.hasNode(nodeId))
			return undefined;
		const attributes = this.graph.getNodeAttributes(nodeId);
		if (attributes.hidden || attributes.isBend) return undefined;
		return {
			...this.graphToViewportPosition(attributes),
			radius:
				(attributes.size + (this.selectedNodeId === nodeId ? 2 : 0)) *
				this.readNodeVisualScale(),
		};
	}

	focusNode(nodeId: string): void {
		if (!this.graph.hasNode(nodeId)) return;
		const attributes = this.graph.getNodeAttributes(nodeId);
		if (attributes.hidden || attributes.isBend) return;
		this.cancelWheelZoom();
		this.runViewportAction(() =>
			this.instance.focusElement(nodeId, { duration: FOCUS_DURATION }),
		);
	}

	fit(): void {
		this.spacingExtent = undefined;
		this.cancelWheelZoom();
		this.scheduleCoordinateFrame({
			zoomLevel: 100,
			normalizedCenter: { x: 0.5, y: 0.5 },
		});
	}

	zoomBy(factor: number): void {
		if (!Number.isFinite(factor) || factor <= 0) return;
		this.cancelWheelZoom();
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
		this.cancelWheelZoom();
		this.pendingViewportPanX += delta.x;
		this.pendingViewportPanY += delta.y;
		this.scheduleViewportTransformFrame();
	}

	beginViewportPan(): void {
		if (this.killed || this.isStale()) return;
		this.viewportPanActive = true;
		this.cancelWheelZoom();
	}

	endViewportPan(): void {
		this.viewportPanActive = false;
	}

	getZoomLevel(): number {
		return nativeZoomToPlanarLevel(this.instance.getZoom(), this.fitZoom);
	}

	setZoomLevel(level: number, anchor?: GraphPosition): void {
		if (!Number.isFinite(level)) return;
		this.cancelWheelZoom();
		const zoom = planarLevelToNativeZoom(level, this.fitZoom);
		const origin = anchor
			? this.graphToViewportPosition(anchor)
			: undefined;
		this.runViewportAction(() =>
			origin
				? this.instance.zoomTo(zoom, false, [origin.x, origin.y])
				: this.instance.zoomTo(zoom, false),
		);
	}

	onZoomLevelChange(listener: (level: number) => void): () => void {
		this.zoomLevelListeners.add(listener);
		return () => this.zoomLevelListeners.delete(listener);
	}

	resize(): void {
		if (this.killed) return;
		const viewportState = this.captureViewportState();
		const previousLabelVisibility = this.readLabelVisibility();
		this.instance.resize();
		this.labelVisibility = undefined;
		this.syncLabelVisibility(previousLabelVisibility);
		this.scheduleDraw();
		this.groupLayer?.refreshViewport();
		if (viewportState) this.scheduleCoordinateFrame(viewportState);
	}

	kill(): void {
		if (this.killed) return;
		this.diagnostics?.destroy();
		this.restoreTranslateBatch?.();
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
		if (this.forceSyncFrame !== undefined) {
			window?.cancelAnimationFrame(this.forceSyncFrame);
			this.forceSyncFrame = undefined;
		}
		this.forcePositionsDirty = false;
		this.submittedForcePositions.clear();
		if (this.interactionSyncFrame !== undefined) {
			window?.cancelAnimationFrame(this.interactionSyncFrame);
			this.interactionSyncFrame = undefined;
		}
		this.interactionSyncQueued = false;
		this.pendingInteractionStates.clear();
		if (this.labelSyncFrame !== undefined) {
			window?.cancelAnimationFrame(this.labelSyncFrame);
			this.labelSyncFrame = undefined;
		}
		this.labelSyncScheduled = false;
		this.labelSyncAll = false;
		this.pendingLabelNodeIds.clear();
		this.pendingLabelEdgeIds.clear();
		if (this.hoverLeaveTimer !== undefined) {
			window?.clearTimeout(this.hoverLeaveTimer);
			this.hoverLeaveTimer = undefined;
		}
		if (this.viewportTransformFrame !== undefined) {
			window?.cancelAnimationFrame(this.viewportTransformFrame);
			this.viewportTransformFrame = undefined;
		}
		this.viewportTransformFallbackQueued = false;
		this.viewportPanActive = false;
		this.pendingViewportPanX = 0;
		this.pendingViewportPanY = 0;
		this.cancelWheelZoom();
		this.container.removeEventListener('wheel', this.handleWheel);
		this.groupLayer?.kill();
		this.groupLayer = undefined;
		this.groupSceneSyncQueued = false;
		this.instance.destroy();
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks: GroupInteractionCallbacks = this.groupSceneCallbacks,
	): void {
		const hadFlowTitles = this.groupSceneGroups.some(
			(group) => !!group.titleBandHeight,
		);
		this.groupSceneGroups = groups;
		this.groupSceneCallbacks = callbacks;
		if (hadFlowTitles !== groups.some((group) => !!group.titleBandHeight)) {
			this.scheduleCoordinateFrame({
				zoomLevel: this.getZoomLevel(),
				normalizedCenter: { x: 0.5, y: 0.5 },
			});
		}
		this.scheduleGroupSceneSync();
	}

	setLayoutGroupGeometries(
		geometries: readonly LayoutGroupGeometry[],
		_getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.groupSceneGeometries = geometries;
		this.scheduleGroupSceneSync();
	}

	setLayoutEdgeRoutes(routes?: ReadonlyMap<string, PlanarEdgeRoute>): void {
		this.edgeRoutes = routes;
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
		const maxHitRadius = Math.max(
			14,
			this.sceneCache.maxRenderedNodeSize * this.readNodeVisualScale() +
				8,
		);
		const graphPoint = this.viewportToGraphPosition(position);
		const graphUnitsPerPixel =
			1 /
			Math.max(
				1e-6,
				this.coordinateSpace.scale *
					normalizePlanarFitZoom(this.instance.getZoom()),
			);
		const graphRadius = maxHitRadius * graphUnitsPerPixel;
		for (const nodeId of this.sceneCache.nodeSpatialIndex.query(
			graphPoint,
			graphRadius,
		)) {
			if (!this.graph.hasNode(nodeId)) continue;
			const attributes = this.graph.getNodeAttributes(nodeId);
			if (attributes.hidden || attributes.isBend) continue;
			const nodePosition = this.getNodePosition(nodeId);
			if (!nodePosition) continue;
			const distance = Math.hypot(
				nodePosition.x - graphPoint.x,
				nodePosition.y - graphPoint.y,
			);
			const hitRadius =
				Math.max(14, attributes.size * this.readNodeVisualScale() + 8) *
				graphUnitsPerPixel;
			if (distance <= hitRadius && distance < closestDistance) {
				closestNodeId = nodeId;
				closestDistance = distance;
			}
		}
		return closestNodeId;
	}

	getNodePosition(nodeId: string): GraphPosition | undefined {
		if (!this.graph.hasNode(nodeId)) return undefined;
		const position = this.instance.getElementPosition(nodeId);
		const x = position[0];
		const y = position[1];
		return typeof x === 'number' && typeof y === 'number'
			? this.coordinateSpace.toGraph({ x, y })
			: undefined;
	}

	setNodePosition(nodeId: string, position: GraphPosition): void {
		this.translateNodesTo({ [nodeId]: [position.x, position.y] });
	}

	moveNodesBy(nodeIds: Iterable<string>, delta: GraphPosition): void {
		const positions: Record<string, [number, number]> = {};
		for (const nodeId of nodeIds) {
			const position = this.getNodePosition(nodeId);
			if (!position) continue;
			positions[nodeId] = [position.x + delta.x, position.y + delta.y];
		}
		this.translateNodesTo(positions);
	}

	private translateNodesTo(
		positions: Record<string, [number, number]>,
	): void {
		if (
			this.killed ||
			this.isStale() ||
			Object.keys(positions).length === 0
		)
			return;
		const g6Positions = Object.fromEntries(
			Object.entries(positions).map(([nodeId, position]) => {
				const mapped = this.coordinateSpace.toG6({
					x: position[0],
					y: position[1],
				});
				return [nodeId, [mapped.x, mapped.y] as [number, number]];
			}),
		);
		const translation = this.instance.translateElementTo(
			g6Positions,
			false,
		);
		for (const nodeId of Object.keys(positions)) {
			const position = this.getNodePosition(nodeId);
			if (position) {
				this.graph.mergeNodeAttributes(nodeId, position);
				this.sceneCache.updateNodePosition(nodeId, position);
			}
		}
		this.groupLayer?.syncGeometry();
		void translation.catch((error) => {
			console.error('[Meta Graph] G6 element translation failed', error);
		});
	}

	setActiveDropGroup(groupId?: string): void {
		this.groupLayer?.setActiveDropGroup(groupId);
	}
	setSelected(nodeId?: string): void {
		if (this.selectedNodeId === nodeId) return;
		const previousNodeId = this.selectedNodeId;
		this.selectedNodeId = nodeId;
		this.syncInteractionStates();
		this.syncTransientLabelOwner(previousNodeId, nodeId);
	}
	setSelectedEdge(edgeId?: string): void {
		if (this.selectedEdgeId === edgeId) return;
		const previousEdgeId = this.selectedEdgeId;
		this.selectedEdgeId = edgeId;
		this.syncInteractionStates();
		this.syncTransientEdgeLabelOwner(previousEdgeId, edgeId);
	}
	setSelectedGroup(groupId?: string): void {
		this.groupLayer?.setSelectedGroup(groupId);
	}
	setHovered(nodeId?: string): void {
		const window = this.container.ownerDocument?.defaultView;
		if (this.hoverLeaveTimer !== undefined) {
			window?.clearTimeout(this.hoverLeaveTimer);
			this.hoverLeaveTimer = undefined;
		}
		if (!nodeId && this.hoveredNodeId && window) {
			this.hoverLeaveTimer = window.setTimeout(() => {
				this.hoverLeaveTimer = undefined;
				this.applyHoveredNode(undefined);
			}, NODE_HOVER_LEAVE_GRACE_MS);
			return;
		}
		this.applyHoveredNode(nodeId);
	}

	setHoverMode(mode: import('@/settings/settings').NodeHoverMode): void {
		if (this.hoverMode === mode) return;
		this.hoverMode = mode;
		this.scheduleInteractionSync();
		this.syncTransientLabelOwner(this.hoveredNodeId, this.hoveredNodeId);
	}

	private applyHoveredNode(nodeId?: string): void {
		if (this.hoveredNodeId === nodeId) return;
		const previousNodeId = this.hoveredNodeId;
		this.hoveredNodeId = nodeId;
		this.scheduleInteractionSync();
		this.syncTransientLabelOwner(previousNodeId, nodeId);
		this.syncGroupFocus();
	}
	setHoveredEdge(edgeId?: string): void {
		if (this.hoveredEdgeId === edgeId) return;
		const previousEdgeId = this.hoveredEdgeId;
		this.hoveredEdgeId = edgeId;
		this.scheduleInteractionSync();
		this.syncTransientEdgeLabelOwner(previousEdgeId, edgeId);
	}
	getLogicalEdgeId(runtimeEdgeId: string): string | undefined {
		if (this.edgeRoutes?.has(runtimeEdgeId)) return runtimeEdgeId;
		if (!this.graph.hasEdge(runtimeEdgeId)) return undefined;
		return (
			this.graph.getEdgeAttribute(runtimeEdgeId, 'logicalEdgeId') ??
			runtimeEdgeId
		);
	}
	setFadeDistance(_fadeDistance: number): void {}
	setLabelSize(labelSize: number): void {
		this.displayStyle.labelSize = labelSize;
		this.scheduleLabelSync();
	}
	setScaleLabelsWithZoom(scaleLabelsWithZoom: boolean): void {
		this.scaleLabelsWithZoom = scaleLabelsWithZoom;
		this.syncLabelZoomScale();
		this.groupLayer?.refreshTitlePlacement();
	}
	setLabelBold(labelBold: boolean): void {
		this.displayStyle.labelBold = labelBold;
		this.scheduleLabelSync();
	}
	setLabelItalic(labelItalic: boolean): void {
		this.displayStyle.labelItalic = labelItalic;
		this.scheduleLabelSync();
	}
	setLabelPosition(labelPosition: LabelPosition): void {
		this.displayStyle.labelPosition = labelPosition;
		this.scheduleLabelSync();
	}
	setLabelOffset(labelOffset: number): void {
		this.displayStyle.labelOffset = labelOffset;
		this.scheduleLabelSync();
	}
	setLabelMaxWidth(value: number): void {
		this.displayStyle.labelMaxWidth = value;
		this.scheduleLabelSync();
	}
	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.displayStyle.labelTheme = { ...labelTheme };
		this.scheduleLabelSync();
	}
	setLabelDensity(labelDensity: number): void {
		const previousLabelVisibility = this.readLabelVisibility();
		this.labelDensity = labelDensity;
		this.labelVisibility = undefined;
		this.syncLabelVisibility(previousLabelVisibility);
	}
	setForceLabels(forceLabels: boolean): void {
		const previousLabelVisibility = this.readLabelVisibility();
		this.forceLabels = forceLabels;
		this.labelVisibility = undefined;
		this.syncLabelVisibility(previousLabelVisibility);
	}
	togglePinnedHover(nodeId: string): void {
		const previousNodeId = this.pinnedNodeId;
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.syncInteractionStates();
		this.syncTransientLabelOwner(previousNodeId, this.pinnedNodeId);
		this.syncGroupFocus();
	}
	clearPinnedHover(): void {
		if (!this.pinnedNodeId) return;
		const previousNodeId = this.pinnedNodeId;
		this.pinnedNodeId = undefined;
		this.syncInteractionStates();
		this.syncTransientLabelOwner(previousNodeId, undefined);
		this.syncGroupFocus();
	}
	holdCurrentBounds(): void {}
	clearHeldBounds(): void {}

	beginForceMotion(): void {
		this.submittedForcePositions.clear();
	}
	endForceMotion(): void {
		if (this.killed || this.isStale()) return;
		this.sceneCache.refreshLabelIndex();
		this.labelVisibility = undefined;
		this.scheduleLabelSync();
	}

	syncForcePositions(source?: 'simulation-tick'): void {
		if (this.killed || this.isStale()) return;
		getPlanarPerformance(this)?.record('forceSyncRequest');
		this.forcePositionsDirty = true;
		if (this.forceSyncScheduled) return;
		this.forceSyncScheduled = true;
		const diagnostics = getPlanarPerformance(this);
		const queuedAt = diagnostics ? performance.now() : 0;
		const enqueue = () => {
			this.forceSyncFrame = undefined;
			const enqueuedAt = diagnostics ? performance.now() : 0;
			if (diagnostics === getPlanarPerformance(this))
				diagnostics?.record('forceFrameWait', enqueuedAt - queuedAt);
			this.drawQueue = this.drawQueue
				.then(async () => {
					if (
						this.killed ||
						this.isStale() ||
						!this.forcePositionsDirty
					)
						return;
					this.forcePositionsDirty = false;
					const activeDiagnostics =
						diagnostics === getPlanarPerformance(this)
							? diagnostics
							: undefined;
					activeDiagnostics?.record(
						'forceDrawQueueWait',
						performance.now() - enqueuedAt,
					);
					activeDiagnostics?.record(
						'forceQueueWait',
						performance.now() - queuedAt,
					);
					await this.submitForcePositions();
				})
				.catch((error) => {
					this.submittedForcePositions.clear();
					console.error('[Meta Graph] G6 force draw failed', error);
				})
				.finally(() => {
					this.forceSyncScheduled = false;
					if (this.forcePositionsDirty) this.syncForcePositions();
				});
		};
		const window = this.container.ownerDocument?.defaultView;
		// D3 already paces automatic steps. Keep queue ordering/backpressure,
		// but don't request another frame merely to enqueue these positions.
		// Pointer bursts and follow-up work after a busy batch still use rAF.
		if (source === 'simulation-tick') {
			diagnostics?.record('forceSameFrameRequest');
			enqueue();
		} else if (window)
			this.forceSyncFrame = window.requestAnimationFrame(enqueue);
		else queueMicrotask(enqueue);
	}

	private async submitForcePositions(): Promise<void> {
		const positions: Record<string, [number, number]> = {};
		for (const id of this.sceneCache.renderedNodeIds) {
			const attributes = this.graph.getNodeAttributes(id);
			const position = { x: attributes.x, y: attributes.y };
			if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
				continue;
			const previous = this.submittedForcePositions.get(id);
			if (previous?.x === position.x && previous.y === position.y)
				continue;
			this.submittedForcePositions.set(id, position);
			this.sceneCache.updateNodePosition(id, position);
			const mapped = this.coordinateSpace.toG6(position);
			positions[id] = [mapped.x, mapped.y];
		}
		if (Object.keys(positions).length === 0) return;
		const diagnostics = getPlanarPerformance(this);
		const started = diagnostics ? performance.now() : 0;
		// G6's translate stage updates endpoints without recomputing every style.
		const translation = this.instance.translateElementTo(positions, false);
		diagnostics?.record('translateSync', performance.now() - started);
		// Non-animated G6 translation applies model/element positions synchronously.
		// Commit Groups before yielding, so the same Canvas frame presents both.
		this.groupLayer?.syncGeometry();
		await translation;
		diagnostics?.record('forceBatch', performance.now() - started);
	}

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
			.catch((error) => {
				console.error('[Meta Graph] G6 draw failed', error);
			})
			.finally(() => {
				this.drawScheduled = false;
				if (this.drawDirty) this.scheduleDraw();
			});
	}

	async prepareExport(
		viewport: import('@/graph/renderers/renderer-export').ExportViewport,
		_scale: number,
	): Promise<void> {
		if (!this.hasFitBaseline) this.fit();
		await this.drawQueue;
		this.instance.setZoomRange([0.000001, 1_000_000]);
		const origin = this.graphToViewportPosition(viewport.center);
		const unit = this.graphToViewportPosition({
			x: viewport.center.x + 1,
			y: viewport.center.y,
		});
		await this.instance.zoomTo(
			this.instance.getZoom() /
				(Math.hypot(unit.x - origin.x, unit.y - origin.y) *
					viewport.unitsPerPixel),
			false,
		);
		const point = this.graphToViewportPosition(viewport.center);
		const center = this.instance.getCanvasCenter();
		await this.instance.translateBy(
			[center[0] - point.x, center[1] - point.y],
			false,
		);
		this.syncCoordinateFrameVisuals();
		this.syncLabelZoomScale();
		await this.drawQueue;
		await this.instance.draw();
		this.groupLayer?.invalidateGeometry();
		this.groupLayer?.update();
		for (const layer of Object.values(
			this.instance.getCanvas().getLayers(),
		))
			layer.render();
	}

	private captureViewportState(): PlanarViewportState | undefined {
		if (!this.hasFitBaseline || this.killed || this.isStale())
			return undefined;
		const center = this.instance.getCanvasCenter();
		const graphCenter = this.instance.getCanvasByViewport([
			center[0],
			center[1],
		]);
		const canonicalCenter = this.coordinateSpace.toGraph({
			x: graphCenter[0],
			y: graphCenter[1],
		});
		return {
			zoomLevel: this.getZoomLevel(),
			normalizedCenter: normalizePlanarPosition(
				canonicalCenter,
				this.spacingExtent ?? this.sceneCache.graphExtent,
			),
		};
	}

	private scheduleCoordinateFrame(viewportState: PlanarViewportState): void {
		if (this.killed || this.isStale()) return;
		this.cancelWheelZoom();
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
		const baseExtent = this.spacingExtent ?? this.sceneCache.graphExtent;
		const extent = this.groupSceneGroups.some(
			(group) => !!group.titleBandHeight,
		)
			? flowTitleReferenceExtent(
					baseExtent,
					viewport,
					this.spacingExtent
						? []
						: this.groupSceneGroups.filter(
								(group) => !!group.titleBandHeight,
							),
				)
			: baseExtent;
		const hadFitBaseline = this.hasFitBaseline;
		this.flowReferenceExtent = this.groupSceneGroups.some(
			(group) => !!group.titleBandHeight,
		)
			? extent
			: undefined;
		const previousFitZoom = this.fitZoom;
		this.fitZoom =
			calculateSigmaCompatibleFitZoom(extent, viewport) /
			this.coordinateSpace.scale;
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
			const g6Center = this.coordinateSpace.toG6(graphCenter);
			const currentCenter = this.instance.getViewportByCanvas([
				g6Center.x,
				g6Center.y,
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
			if (
				!hadFitBaseline ||
				Math.abs(this.fitZoom - previousFitZoom) >
					ZOOM_CHANGE_EPSILON *
						Math.max(this.fitZoom, previousFitZoom)
			) {
				this.syncCoordinateFrameVisuals();
				this.groupLayer?.invalidateGeometry();
			} else {
				this.scheduleLabelSync();
			}
			this.syncLabelZoomScale();
			this.emitZoomLevel();
		} finally {
			this.fitting = false;
		}
	}

	private syncPaletteOptions(): void {
		if (this.killed || this.isStale()) return;
		const visualScale = this.readVisualScale();
		this.instance.setOptions({
			background: this.palette.background,
			...createG6InteractionStyles(this.palette, visualScale),
		});
		this.scheduleLabelSync();
		this.scheduleDraw();
	}

	private syncLabelVisibility(previous?: G6LabelVisibility): void {
		if (this.killed || this.isStale()) return;
		const visualScale = this.readVisualScale();
		const visibility = this.readLabelVisibility();
		const changes = previous
			? diffLabelVisibility(previous, visibility)
			: {
					nodeIds: [...visibility.nodeIds],
					edgeIds: [...visibility.edgeIds],
				};
		if (changes.nodeIds.length > 0 || changes.edgeIds.length > 0) {
			this.instance.updateData(
				createG6LabelVisibilityPatch(
					this.graph,
					changes,
					visualScale,
					visibility,
					this.readLabelStyles(visualScale),
					this.edgeRoutes,
				),
			);
		}
		this.replaceLabelControllerSnapshot(visualScale);
		if (changes.nodeIds.length > 0 || changes.edgeIds.length > 0) {
			this.scheduleDraw();
		}
	}

	private scheduleLabelSync(dirtyIds?: G6LabelControllerDirtyIds): void {
		this.groupLayer?.refreshTitlePlacement();
		if (this.killed || this.isStale()) return;
		if (!dirtyIds) {
			this.labelSyncAll = true;
			this.pendingLabelNodeIds.clear();
			this.pendingLabelEdgeIds.clear();
		} else if (!this.labelSyncAll) {
			for (const nodeId of dirtyIds.nodeIds ?? [])
				this.pendingLabelNodeIds.add(nodeId);
			for (const edgeId of dirtyIds.edgeIds ?? [])
				this.pendingLabelEdgeIds.add(edgeId);
		}
		if (this.labelSyncScheduled) return;
		this.labelSyncScheduled = true;
		const window = this.container.ownerDocument?.defaultView;
		const enqueue = () => {
			this.labelSyncFrame = undefined;
			this.enqueueLabelSync();
		};
		if (window) {
			this.labelSyncFrame = window.requestAnimationFrame(enqueue);
		} else {
			queueMicrotask(enqueue);
		}
	}

	private enqueueLabelSync(): void {
		this.drawQueue = this.drawQueue
			.then(() => {
				if (this.killed || this.isStale()) return;
				const dirtyIds = this.labelSyncAll
					? undefined
					: {
							nodeIds: new Set(this.pendingLabelNodeIds),
							edgeIds: new Set(this.pendingLabelEdgeIds),
						};
				this.labelSyncAll = false;
				this.pendingLabelNodeIds.clear();
				this.pendingLabelEdgeIds.clear();
				const visualScale = this.readVisualScale();
				const snapshot = this.createLabelControllerSnapshot(
					visualScale,
					dirtyIds?.nodeIds,
					dirtyIds?.edgeIds,
				);
				this.readLabelController()?.updateLabels(snapshot, dirtyIds);
			})
			.catch((error) => {
				console.error('[Meta Graph] G6 label update failed', error);
			})
			.finally(() => {
				this.labelSyncScheduled = false;
			});
	}

	private bindViewportChange(): void {
		if (this.killed || this.viewportChangeBound) return;
		this.lastObservedNativeZoom = normalizePlanarFitZoom(
			this.instance.getZoom(),
		);
		this.instance.on(GraphEvent.AFTER_TRANSFORM, this.handleViewportChange);
		this.viewportChangeBound = true;
	}

	/** Rebase canvas-unit styles only when the fit coordinate frame changes. */
	private syncCoordinateFrameVisuals(): void {
		if (this.killed || this.isStale()) return;
		const visualScale = this.readVisualScale();
		this.instance.updateData(
			createG6StylePatch(
				this.graph,
				{
					nodeIds: [...this.sceneCache.renderedNodeIds],
					edgeIds: [
						...this.sceneCache.runtimeEdgesByLogicalId.values(),
					].flat(),
				},
				visualScale,
				this.readLabelVisibility(),
				this.readLabelStyles(visualScale),
				this.coordinateSpace,
				this.edgeRoutes,
				this.sceneCache.runtimeEdgesByLogicalId,
			),
		);
		this.instance.setOptions({
			...createG6InteractionStyles(this.palette, visualScale),
		});
		this.replaceLabelControllerSnapshot(visualScale);
		this.scheduleDraw();
	}

	private readLabelController(): G6LabelController | undefined {
		return this.instance.getPluginInstance<G6LabelController>(
			G6_LABEL_CONTROLLER_KEY,
		);
	}

	private replaceLabelControllerSnapshot(
		visualScale: G6VisualScale = this.readVisualScale(),
	): void {
		this.readLabelController()?.replaceSnapshot(
			this.createLabelControllerSnapshot(visualScale),
		);
	}

	private createLabelControllerSnapshot(
		visualScale: G6VisualScale = this.readVisualScale(),
		styleNodeIds?: Iterable<string>,
		styleEdgeIds?: Iterable<string>,
	): G6LabelControllerSnapshot {
		const snapshot = createG6LabelControllerSnapshot(
			this.graph,
			this.readLabelStyles(visualScale),
			this.edgeRoutes,
			visualScale,
			this.readLabelVisibility(),
			[this.hoveredNodeId, this.pinnedNodeId, this.selectedNodeId],
			this.readTransientEdgeLabelElementIds(),
			this.sceneCache,
			styleNodeIds,
			styleEdgeIds,
		);
		const active = this.getActiveHoverNodeId();
		const fullLabelNodeIds = new Set<string>();
		if (this.hoveredNodeId) fullLabelNodeIds.add(this.hoveredNodeId);
		if (
			!this.graph.getAttribute('traceActive') &&
			active &&
			(this.pinnedNodeId || this.hoverMode === 'local')
		) {
			fullLabelNodeIds.add(active);
			for (const id of this.sceneCache.neighborNodeIdsByNode.get(
				active,
			) ?? [])
				fullLabelNodeIds.add(id);
		}
		return { ...snapshot, fullLabelNodeIds };
	}

	private readVisualScale(): G6VisualScale {
		const nativeZoom = normalizePlanarFitZoom(this.instance.getZoom());
		const logicalLevel = nativeZoomToPlanarLevel(nativeZoom, this.fitZoom);
		const visualScale = getPlanarVisualScale(logicalLevel);
		return {
			geometry: visualScale / nativeZoom,
			label: 1 / normalizePlanarFitZoom(this.fitZoom),
			screen: 1 / nativeZoom,
		};
	}

	private syncLabelZoomScale(): void {
		const logicalLevel = nativeZoomToPlanarLevel(
			this.instance.getZoom(),
			this.fitZoom,
		);
		const cameraScale = getPlanarVisualScale(logicalLevel);
		const targetScale = this.scaleLabelsWithZoom
			? getPlanarLabelVisualScale(logicalLevel)
			: 1;
		this.readLabelController()?.updateZoomScale(targetScale / cameraScale);
	}

	private readNodeVisualScale(): number {
		return getPlanarVisualScale(this.getZoomLevel());
	}

	private readLabelStyles(
		visualScale: G6VisualScale = this.readVisualScale(),
	) {
		return createG6LabelStyles(
			this.palette,
			this.displayStyle,
			visualScale,
		);
	}

	private readLabelVisibility(): G6LabelVisibility {
		this.labelVisibility ??= resolveG6LabelVisibilityFromIndex(
			this.sceneCache.labelVisibilityIndex,
			{
				labelDensity: this.labelDensity,
				forceLabels: this.forceLabels,
				nodeCapacity: this.readViewportNodeLabelCapacity(),
			},
		);
		return this.labelVisibility;
	}

	private syncTransientLabelOwner(
		previousNodeId?: string,
		nextNodeId?: string,
	): void {
		if ((this.displayStyle.labelMaxWidth ?? 0) > 0) {
			const nodeIds = new Set<string>();
			for (const id of [
				previousNodeId,
				nextNodeId,
				this.hoveredNodeId,
				this.pinnedNodeId,
			]) {
				if (!id) continue;
				nodeIds.add(id);
				for (const neighbor of this.sceneCache.neighborNodeIdsByNode.get(
					id,
				) ?? [])
					nodeIds.add(neighbor);
			}
			this.scheduleLabelSync({ nodeIds });
			return;
		}
		const visibleNodeIds = this.readLabelVisibility().nodeIds;
		if (
			(previousNodeId && !visibleNodeIds.has(previousNodeId)) ||
			(nextNodeId && !visibleNodeIds.has(nextNodeId))
		) {
			this.scheduleLabelSync({
				nodeIds: [previousNodeId, nextNodeId].filter(
					(id): id is string => Boolean(id),
				),
			});
		}
	}

	private syncTransientEdgeLabelOwner(
		previousEdgeId?: string,
		nextEdgeId?: string,
	): void {
		if (
			this.hasHiddenTransientEdgeLabel(previousEdgeId) ||
			this.hasHiddenTransientEdgeLabel(nextEdgeId)
		) {
			this.scheduleLabelSync({
				edgeIds: this.readLogicalEdgeElementIds([
					previousEdgeId,
					nextEdgeId,
				]),
			});
		}
	}

	private readLogicalEdgeElementIds(
		logicalEdgeIds: Iterable<string | undefined>,
	): Set<string> {
		const elementIds = new Set<string>();
		for (const logicalEdgeId of logicalEdgeIds) {
			if (!logicalEdgeId) continue;
			for (const runtimeEdgeId of this.sceneCache.runtimeEdgesByLogicalId.get(
				logicalEdgeId,
			) ?? []) {
				elementIds.add(
					this.sceneCache.edgeElementByRuntimeEdgeId.get(
						runtimeEdgeId,
					) ?? runtimeEdgeId,
				);
			}
		}
		return elementIds;
	}

	private hasHiddenTransientEdgeLabel(logicalEdgeId?: string): boolean {
		if (!logicalEdgeId) return false;
		const visibleEdgeIds = this.readLabelVisibility().edgeIds;
		for (const runtimeEdgeId of this.sceneCache.runtimeEdgesByLogicalId.get(
			logicalEdgeId,
		) ?? []) {
			if (
				this.graph.hasEdge(runtimeEdgeId) &&
				this.graph.getEdgeAttribute(runtimeEdgeId, 'label') &&
				!visibleEdgeIds.has(runtimeEdgeId)
			) {
				return true;
			}
		}
		return false;
	}

	private readTransientEdgeLabelElementIds(): Set<string> {
		const elementIds = new Set<string>();
		for (const logicalEdgeId of [this.hoveredEdgeId, this.selectedEdgeId]) {
			if (!logicalEdgeId) continue;
			for (const runtimeEdgeId of this.sceneCache.runtimeEdgesByLogicalId.get(
				logicalEdgeId,
			) ?? []) {
				if (
					!this.graph.hasEdge(runtimeEdgeId) ||
					!this.graph.getEdgeAttribute(runtimeEdgeId, 'label')
				) {
					continue;
				}
				elementIds.add(
					this.sceneCache.edgeElementByRuntimeEdgeId.get(
						runtimeEdgeId,
					) ?? runtimeEdgeId,
				);
			}
		}
		return elementIds;
	}

	private readViewportNodeLabelCapacity(): number | undefined {
		if (!this.isLargeLabelScene()) return undefined;
		const center = this.instance.getCanvasCenter();
		return calculateViewportNodeLabelCapacity(
			Number(center[0]) * 2,
			Number(center[1]) * 2,
		);
	}

	private isLargeLabelScene(): boolean {
		return (
			this.sceneCache.renderedNodeIds.size +
				this.sceneCache.logicalEdgeCount >=
			LARGE_LABEL_SCENE_ELEMENT_COUNT
		);
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
				(nodeId) => this.getNodePosition(nodeId),
				(position) => this.graphToViewportPosition(position),
				(position) => this.viewportToGraphPosition(position),
				() => this.readNodeVisualScale(),
				(position) => this.coordinateSpace.toG6(position),
				() => ({
					size:
						this.displayStyle.labelSize *
						(this.scaleLabelsWithZoom
							? getPlanarLabelVisualScale(this.getZoomLevel())
							: 1),
					position: this.displayStyle.labelPosition,
					offset: this.displayStyle.labelOffset,
					bold: this.displayStyle.labelBold,
					italic: this.displayStyle.labelItalic,
				}),
				() => this.resize(),
			);
			this.groupLayer.setFocusedNode(
				this.graph.getAttribute('traceActive')
					? undefined
					: this.pinnedNodeId,
			);
		}
		return this.groupLayer;
	}

	private scheduleGroupSceneSync(): void {
		if (this.killed || this.isStale() || this.groupSceneSyncQueued) return;
		this.groupSceneSyncQueued = true;
		queueMicrotask(() => {
			this.groupSceneSyncQueued = false;
			if (this.killed || this.isStale()) return;
			this.getOrCreateGroupLayer().setScene(
				this.groupSceneGroups,
				this.groupSceneGeometries,
				this.groupSceneCallbacks,
			);
		});
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
	}

	private syncInteractionStates(scheduleDraw = true, forceAll = false): void {
		if (this.killed || this.isStale()) return;
		const activeNodeId = this.getActiveHoverNodeId();
		const traceActive = Boolean(this.graph.getAttribute('traceActive'));
		const dimUnrelated = Boolean(
			!traceActive &&
			activeNodeId &&
			(this.pinnedNodeId || this.hoverMode === 'local'),
		);
		const nextInteraction: G6InteractionSnapshot = {
			traceActive,
			dimUnrelated,
			activeNodeId,
			pinnedNodeId: this.pinnedNodeId,
			hoveredEdgeId: this.hoveredEdgeId,
			selectedNodeId: this.selectedNodeId,
			selectedEdgeId: this.selectedEdgeId,
		};
		const neighborhood = activeNodeId
			? this.sceneCache.neighborNodeIdsByNode.get(activeNodeId)
			: undefined;
		const nodes: Array<{ id: string; states: State[] }> = [];
		const edges: Array<{ id: string; states: State[] }> = [];
		const nodeIds = this.collectAffectedNodeIds(nextInteraction, forceAll);
		const edgeIds = this.collectAffectedEdgeIds(nextInteraction, forceAll);

		for (const nodeId of nodeIds) {
			if (!this.graph.hasNode(nodeId)) continue;
			if (
				!isG6RenderedNode(
					this.graph.getNodeAttributes(nodeId),
					this.edgeRoutes,
				)
			) {
				continue;
			}
			const states: State[] = [];
			if (dimUnrelated && neighborhood && !neighborhood.has(nodeId))
				states.push(G6_INTERACTION_STATE.dimmed);
			if (nodeId === activeNodeId)
				states.push(G6_INTERACTION_STATE.hovered);
			if (nodeId === this.selectedNodeId)
				states.push(G6_INTERACTION_STATE.selected);
			if (this.updateStateKey(this.nodeStateKeys, nodeId, states)) {
				nodes.push({ id: nodeId, states });
			}
		}

		const updatedEdgeElements = new Set<string>();
		for (const edgeId of edgeIds) {
			if (!this.graph.hasEdge(edgeId)) continue;
			const attributes = this.graph.getEdgeAttributes(edgeId);
			const elementId =
				this.sceneCache.edgeElementByRuntimeEdgeId.get(edgeId) ??
				edgeId;
			if (updatedEdgeElements.has(elementId)) continue;
			updatedEdgeElements.add(elementId);
			const states: State[] = [];
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			const connected = Boolean(
				!traceActive &&
				activeNodeId &&
				this.sceneCache.incidentEdgesByNode
					.get(activeNodeId)
					?.has(edgeId),
			);
			if (dimUnrelated && activeNodeId && !connected)
				states.push(G6_INTERACTION_STATE.dimmed);
			if (connected) states.push(G6_INTERACTION_STATE.connected);
			if (
				logicalEdgeId === this.hoveredEdgeId &&
				(!dimUnrelated || connected)
			) {
				states.push(G6_INTERACTION_STATE.hovered);
			}
			if (logicalEdgeId === this.selectedEdgeId)
				states.push(G6_INTERACTION_STATE.selected);
			if (dimUnrelated && !connected)
				states.push(G6_INTERACTION_STATE.focusHidden);
			if (this.updateStateKey(this.edgeStateKeys, elementId, states)) {
				edges.push({ id: elementId, states });
			}
		}
		this.appliedInteraction = nextInteraction;
		if (nodes.length === 0 && edges.length === 0) return;
		if (!scheduleDraw) {
			this.instance.updateData({ nodes, edges });
			return;
		}
		const states = Object.fromEntries(
			[...nodes, ...edges].map(({ id, states: elementStates }) => [
				id,
				elementStates,
			]),
		);
		this.enqueueInteractionStates(states);
	}

	private enqueueInteractionStates(states: Record<string, State[]>): void {
		for (const [id, elementStates] of Object.entries(states))
			this.pendingInteractionStates.set(id, elementStates);
		this.flushInteractionStateQueue();
	}

	private flushInteractionStateQueue(): void {
		if (
			this.interactionStateInFlight ||
			this.pendingInteractionStates.size === 0 ||
			this.killed ||
			this.isStale()
		) {
			return;
		}
		const states = Object.fromEntries(this.pendingInteractionStates);
		this.pendingInteractionStates.clear();
		this.interactionStateInFlight = true;
		void this.instance
			.setElementState(states, false)
			.catch((error) => {
				console.error(
					'[Meta Graph] G6 interaction state update failed',
					error,
				);
			})
			.finally(() => {
				this.interactionStateInFlight = false;
				this.flushInteractionStateQueue();
			});
	}

	private collectAffectedNodeIds(
		next: G6InteractionSnapshot,
		forceAll: boolean,
	): Set<string> {
		if (
			forceAll ||
			Boolean(this.appliedInteraction.dimUnrelated) !==
				Boolean(next.dimUnrelated)
		)
			return new Set(this.sceneCache.renderedNodeIds);
		const affected = new Set<string>();
		const previous = this.appliedInteraction;
		if (previous.activeNodeId !== next.activeNodeId) {
			if (!previous.activeNodeId || !next.activeNodeId) {
				for (const nodeId of this.sceneCache.renderedNodeIds)
					affected.add(nodeId);
			} else {
				affected.add(previous.activeNodeId);
				affected.add(next.activeNodeId);
				this.addSetDifference(
					affected,
					this.sceneCache.neighborNodeIdsByNode.get(
						previous.activeNodeId,
					),
					this.sceneCache.neighborNodeIdsByNode.get(
						next.activeNodeId,
					),
				);
				this.addSetDifference(
					affected,
					this.sceneCache.neighborNodeIdsByNode.get(
						next.activeNodeId,
					),
					this.sceneCache.neighborNodeIdsByNode.get(
						previous.activeNodeId,
					),
				);
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
		if (
			forceAll ||
			Boolean(this.appliedInteraction.dimUnrelated) !==
				Boolean(next.dimUnrelated)
		)
			return new Set(
				[...this.sceneCache.runtimeEdgesByLogicalId.values()].flat(),
			);
		const affected = new Set<string>();
		const previous = this.appliedInteraction;
		if (previous.activeNodeId !== next.activeNodeId) {
			if (!previous.activeNodeId || !next.activeNodeId) {
				for (const edgeIds of this.sceneCache.runtimeEdgesByLogicalId.values())
					for (const edgeId of edgeIds) affected.add(edgeId);
			} else {
				this.addSetDifference(
					affected,
					this.sceneCache.incidentEdgesByNode.get(
						previous.activeNodeId,
					),
					this.sceneCache.incidentEdgesByNode.get(next.activeNodeId),
				);
				this.addSetDifference(
					affected,
					this.sceneCache.incidentEdgesByNode.get(next.activeNodeId),
					this.sceneCache.incidentEdgesByNode.get(
						previous.activeNodeId,
					),
				);
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

	private addSetDifference(
		target: Set<string>,
		left?: ReadonlySet<string>,
		right?: ReadonlySet<string>,
	): void {
		for (const id of left ?? []) if (!right?.has(id)) target.add(id);
	}

	private getActiveHoverNodeId(): string | undefined {
		return this.pinnedNodeId ?? this.hoveredNodeId;
	}

	private syncGroupFocus(): void {
		this.groupLayer?.setFocusedNode(
			this.graph.getAttribute('traceActive')
				? undefined
				: this.pinnedNodeId,
		);
	}

	private addLogicalEdges(target: Set<string>, logicalEdgeId?: string): void {
		if (!logicalEdgeId) return;
		for (const edgeId of this.sceneCache.runtimeEdgesByLogicalId.get(
			logicalEdgeId,
		) ?? []) {
			target.add(edgeId);
		}
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

	centerViewport(position: GraphPosition): void {
		this.runViewportAction(async () => {
			const target = this.graphToViewportPosition(position);
			const center = this.instance.getCanvasCenter();
			await this.instance.translateBy(
				[center[0] - target.x, center[1] - target.y],
				false,
			);
		});
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

	private scheduleWheelZoom(): void {
		if (
			this.killed ||
			this.isStale() ||
			this.viewportPanActive ||
			this.wheelZoomTarget === undefined
		) {
			return;
		}
		this.scheduleViewportTransformFrame();
	}

	private scheduleViewportTransformFrame(): void {
		if (
			this.killed ||
			this.isStale() ||
			this.viewportTransformFrame !== undefined ||
			this.viewportTransformFallbackQueued
		) {
			return;
		}
		const window = this.container.ownerDocument?.defaultView;
		if (!window) {
			this.viewportTransformFallbackQueued = true;
			queueMicrotask(() => {
				this.viewportTransformFallbackQueued = false;
				this.flushViewportTransformFrame();
			});
			return;
		}
		this.viewportTransformFrame = window.requestAnimationFrame((now) => {
			this.viewportTransformFrame = undefined;
			this.flushViewportTransformFrame(now);
		});
	}

	private flushViewportTransformFrame(now = performance.now()): void {
		if (this.killed || this.isStale()) return;
		if (this.pendingViewportPanX || this.pendingViewportPanY) {
			this.flushViewportPan();
			return;
		}
		if (this.viewportPanActive) return;
		if (this.wheelZoomTarget !== undefined) {
			this.flushWheelZoom(now);
		}
	}

	private flushWheelZoom(now: number): void {
		const target = this.wheelZoomTarget;
		const origin = this.wheelZoomOrigin;
		if (this.killed || this.isStale() || target === undefined || !origin) {
			this.cancelWheelZoom();
			return;
		}
		const current = normalizePlanarFitZoom(this.instance.getZoom());
		if (!this.wheelZoomInterpolated) {
			this.cancelWheelZoom();
			if (target === current) return;
			void this.instance
				.zoomBy(target / current, false, origin)
				.catch(() => undefined);
			return;
		}
		const start = normalizePlanarFitZoom(this.wheelZoomStart ?? current);
		const startedAt = this.wheelZoomStartedAt ?? now;
		const progress = Math.min(
			1,
			Math.max(0, (now - startedAt) / MOUSE_WHEEL_INTERPOLATION_MS),
		);
		const eased = 1 - (1 - progress) ** 2;
		const next = start * (target / start) ** eased;
		if (progress >= 1) this.cancelWheelZoom();
		else this.scheduleViewportTransformFrame();
		if (Math.abs(next - current) <= ZOOM_CHANGE_EPSILON * current) return;
		void this.instance
			.zoomBy(next / current, false, origin)
			.catch(() => undefined);
	}

	private cancelWheelZoom(): void {
		this.wheelZoomTarget = undefined;
		this.wheelZoomOrigin = undefined;
		this.wheelZoomStart = undefined;
		this.wheelZoomStartedAt = undefined;
		this.wheelZoomInterpolated = false;
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
		if (this.wheelZoomTarget !== undefined) {
			this.scheduleViewportTransformFrame();
		}
	}

	private emitZoomLevel(): void {
		const level = this.getZoomLevel();
		this.zoomLevelListeners.forEach((listener) => listener(level));
	}
}

export function createG6GraphOptions(
	options: G6RendererOptions,
	coordinateSpace: G6CoordinateSpace = createG6CoordinateSpace(options.graph),
	labelVisibilityIndex: G6LabelVisibilityIndex = createG6LabelVisibilityIndex(
		options.graph,
	),
	sceneCache?: G6SceneCache,
): GraphOptions {
	const bounds = options.container.getBoundingClientRect();
	const edgeCount =
		sceneCache?.logicalEdgeCount ??
		options.edgeRoutes?.size ??
		options.graph.size;
	const nodeCapacity =
		(sceneCache?.renderedNodeIds.size ?? options.graph.order) + edgeCount >=
		LARGE_LABEL_SCENE_ELEMENT_COUNT
			? calculateViewportNodeLabelCapacity(bounds.width, bounds.height)
			: undefined;
	const labelVisibility = resolveG6LabelVisibilityFromIndex(
		labelVisibilityIndex,
		{
			...options,
			nodeCapacity,
		},
	);
	const displayStyle = createG6DisplayStyleOptions(options);
	const labelStyles = createG6LabelStyles(options.palette, displayStyle);
	return {
		container: options.container,
		devicePixelRatio: options.exportPixelRatio,
		data: toG6Data(
			options.graph,
			undefined,
			labelVisibility,
			labelStyles,
			coordinateSpace,
			options.edgeRoutes,
			sceneCache?.runtimeEdgesByLogicalId,
		),
		animation: false,
		autoResize: false,
		background: options.palette.background,
		padding: PLANAR_STAGE_PADDING,
		zoomRange: INITIAL_NATIVE_ZOOM_RANGE,
		behaviors: createG6Behaviors(),
		transforms: [G6_STATE_TRANSFORM, G6_POSITION_TRANSFORM],
		plugins: [
			{
				type: G6_LABEL_CONTROLLER_KEY,
				key: G6_LABEL_CONTROLLER_KEY,
				snapshot: createG6LabelControllerSnapshot(
					options.graph,
					labelStyles,
					options.edgeRoutes,
					undefined,
					labelVisibility,
					[],
					[],
					sceneCache,
				),
			},
		],
		...createG6InteractionStyles(options.palette),
	};
}

function createG6LabelControllerSnapshot(
	graph: RuntimeGraph,
	styles: ReturnType<typeof createG6LabelStyles>,
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>,
	visualScale?: G6VisualScale,
	labelVisibility?: G6LabelVisibility,
	interactionNodeIds: readonly (string | undefined)[] = [],
	interactionEdgeIds: Iterable<string> = [],
	sceneCache?: G6SceneCache,
	styleNodeIds?: Iterable<string>,
	styleEdgeIds?: Iterable<string>,
): G6LabelControllerSnapshot {
	const partial = styleNodeIds !== undefined;
	const dirtyNodes = partial ? new Set(styleNodeIds) : undefined;
	const nodeIds = new Set(
		partial
			? [...dirtyNodes!].filter((id) => labelVisibility?.nodeIds.has(id))
			: (labelVisibility?.nodeIds ?? []),
	);
	for (const nodeId of interactionNodeIds) {
		if (nodeId && (!dirtyNodes || dirtyNodes.has(nodeId)))
			nodeIds.add(nodeId);
	}
	for (const nodeId of [...nodeIds]) {
		if (!graph.hasNode(nodeId)) {
			nodeIds.delete(nodeId);
			continue;
		}
		const attributes = graph.getNodeAttributes(nodeId);
		if (
			!isG6RenderedNode(attributes, edgeRoutes) ||
			attributes.hidden ||
			!attributes.label
		) {
			nodeIds.delete(nodeId);
		}
	}
	const nodeStyles = new Map<
		string,
		ReturnType<typeof resolveG6RotatedNodeLabelStyle>
	>();
	for (const nodeId of styleNodeIds ?? nodeIds) {
		if (!nodeIds.has(nodeId)) continue;
		const attributes = graph.getNodeAttributes(nodeId);
		const style = sceneCache
			? sceneCache.getRotatedLabelStyle(
					nodeId,
					attributes,
					visualScale,
					styles.node,
				)
			: resolveG6RotatedNodeLabelStyle(
					attributes,
					visualScale,
					styles.node,
				);
		if (Object.keys(style).length > 0) nodeStyles.set(nodeId, style);
	}
	const edgeIds = new Set<string>();
	const dirtyEdges = partial ? new Set(styleEdgeIds) : undefined;
	const runtimeLabelIds = dirtyEdges
		? [...dirtyEdges]
				.flatMap(
					(id) => sceneCache?.runtimeEdgesByLogicalId.get(id) ?? [id],
				)
				.filter((id) => labelVisibility?.edgeIds.has(id))
		: (labelVisibility?.edgeIds ?? []);
	for (const runtimeEdgeId of runtimeLabelIds) {
		if (!graph.hasEdge(runtimeEdgeId)) continue;
		const logicalEdgeId =
			graph.getEdgeAttribute(runtimeEdgeId, 'logicalEdgeId') ??
			runtimeEdgeId;
		edgeIds.add(
			edgeRoutes?.has(logicalEdgeId) ? logicalEdgeId : runtimeEdgeId,
		);
	}
	for (const edgeId of interactionEdgeIds)
		if (!dirtyEdges || dirtyEdges.has(edgeId)) edgeIds.add(edgeId);
	return {
		partial,
		nodeIds,
		edgeIds,
		nodeStyle: styles.node,
		nodeStyles,
		edgeStyle: styles.edge,
	};
}

export function calculateViewportNodeLabelCapacity(
	width: number,
	height: number,
): number {
	if (!(width > 0) || !(height > 0)) return MAX_VIEWPORT_NODE_LABELS;
	return Math.min(
		MAX_VIEWPORT_NODE_LABELS,
		Math.max(
			MIN_VIEWPORT_NODE_LABELS,
			Math.floor((width * height) / LABEL_VIEWPORT_PIXELS_PER_NODE),
		),
	);
}

function diffLabelVisibility(
	previous: G6LabelVisibility,
	next: G6LabelVisibility,
): { nodeIds: string[]; edgeIds: string[] } {
	return {
		nodeIds: symmetricSetDifference(previous.nodeIds, next.nodeIds),
		edgeIds: symmetricSetDifference(previous.edgeIds, next.edgeIds),
	};
}

function symmetricSetDifference(
	left: ReadonlySet<string>,
	right: ReadonlySet<string>,
): string[] {
	const difference: string[] = [];
	for (const id of left) if (!right.has(id)) difference.push(id);
	for (const id of right) if (!left.has(id)) difference.push(id);
	return difference;
}

export function createG6Behaviors(): NonNullable<GraphOptions['behaviors']> {
	return [
		{
			type: 'zoom-canvas',
			trigger: ['pinch'],
			animation: false,
		},
	];
}

function resolveWheelZoomFactor(event: WheelEvent): number {
	const step =
		event.deltaMode === 0 || event.deltaMode === undefined
			? Math.max(
					-4,
					Math.min(4, event.deltaY / WHEEL_PIXEL_DELTA_PER_STEP),
				)
			: Math.sign(event.deltaY);
	return PLANAR_WHEEL_ZOOM_FACTOR ** -step;
}

function shouldInterpolateWheel(event: WheelEvent): boolean {
	return (
		(event.deltaMode ?? 0) !== 0 ||
		Math.abs(event.deltaY) >= MOUSE_WHEEL_DELTA_THRESHOLD
	);
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
		labelMaxWidth: options.labelMaxWidth ?? 0,
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
