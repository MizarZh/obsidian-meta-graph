import Sigma from 'sigma';
import { flowTitleReferenceExtent } from '@/graph/renderers/flow-title-viewport';
import {
	PlanarPerformance,
	isPlanarPerformanceLoggingEnabled,
} from '@/graph/renderers/planar-performance';
import { EdgeRectangleProgram } from 'sigma/rendering';
import type { LabelPosition } from '@/core/types';
import {
	type GraphPosition,
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
	type RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import { immediateNeighborhood } from '@/graph/model/neighborhood';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import {
	resolveThreeLabelStyle,
	type LabelThemeConfig,
} from '@/graph/renderers/renderer-label-style';
import { calculateLabelOpacity } from '@/graph/renderers/sigma/label-opacity';
import {
	ArrowEdgeProgram,
	ChevronArrowEdgeProgram,
	DashDotArrowEdgeProgram,
	DashDotChevronArrowEdgeProgram,
	DashDotEdgeProgram,
	DashedChevronArrowEdgeProgram,
	DashedArrowEdgeProgram,
	DashedEdgeProgram,
	DottedChevronArrowEdgeProgram,
	DottedArrowEdgeProgram,
	DottedEdgeProgram,
} from '@/graph/renderers/sigma/patterned-edge-program';
import {
	createEdgeLabelDrawer,
	createNodeHoverDrawer,
	createNodeLabelDrawer,
} from '@/graph/renderers/sigma/sigma-label-rendering';
import { CanvasTextWidthCache } from '@/graph/renderers/sigma/canvas-text-metrics';
import { getZoomAwareLabelSize } from '@/graph/renderers/sigma/sigma-label-geometry';
import {
	reduceSigmaEdge,
	reduceSigmaNode,
} from '@/graph/renderers/sigma/sigma-hover-policy';
import {
	GroupOverlayLayer,
	type GroupInteractionCallbacks,
	type GroupOverlayGroup,
} from '@/graph/renderers/sigma/sigma-group-overlay';
import { LayoutGroupLayer } from '@/graph/renderers/sigma/sigma-layout-group-layer';
import { SigmaParallelEdgeLayer } from '@/graph/renderers/sigma/sigma-parallel-edge-layer';
import type { LayoutGroupGeometry } from '@/layouts/group-geometry';
import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';
import {
	NodeDiamondProgram,
	NodeHexagonProgram,
	NodeSquareProgram,
	NodeStarProgram,
	NodeTriangleProgram,
} from '@/graph/renderers/sigma/node-shape-programs';
import type { RendererCapabilities } from '@/graph/renderers/renderer-capabilities';
import type { SigmaRendererOptions } from '@/graph/renderers/renderer-options';
import {
	getPlanarLabelVisualScale,
	getPlanarGraphExtent,
	PLANAR_WHEEL_ZOOM_FACTOR,
	planarZoomToSizeRatio,
} from '@/graph/renderers/planar-viewport-scale';
import {
	createSigmaHoverRefreshIndex,
	createSigmaHoverRefreshPlan,
	SigmaHoverRefreshCoordinator,
	type SigmaHoverRefreshIndex,
	type SigmaHoverRefreshState,
} from '@/graph/renderers/sigma/sigma-hover-refresh';
export type {
	GroupGeometry,
	GroupInteractionCallbacks,
} from '@/graph/renderers/sigma/sigma-group-overlay';

export class SigmaRenderer {
	readonly instance: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
	private diagnostics?: PlanarPerformance;
	private diagnosticManualGroups = new Set<string>();
	private diagnosticLayoutGroups = new Set<string>();
	private graph: RuntimeGraph;
	private palette: GraphPalette;
	readonly capabilities: RendererCapabilities = {
		kind: 'sigma',
		supportsGroupOverlay: true,
		supportsLayoutGroupGeometry: true,
		supportsManualLayout: false,
		supportsEdgePicking: true,
		supportsNodeDragging: true,
		supportsConnectionMoveScheduling: false,
		supportsExternal2DForceSimulation: true,
	};
	private selectedNodeId?: string;
	private selectedEdgeId?: string;
	private selectedGroupId?: string;
	private hoveredEdgeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoverMode: import('@/settings/settings').NodeHoverMode = 'local';
	private hoveredNeighborhood = new Set<string>();
	private fadeDistance: number;
	private labelPosition: LabelPosition;
	private labelOffset: number;
	private labelMaxWidth = 0;
	private labelBold: boolean;
	private labelItalic: boolean;
	private labelTheme: LabelThemeConfig;
	private forceLabels: boolean;
	private scaleLabelsWithZoom: boolean;
	private forceMotionActive = false;
	private readonly groupOverlayLayer: GroupOverlayLayer;
	private readonly layoutGroupLayer: LayoutGroupLayer;
	private parallelEdgeStyle: 'straight' | 'curve' = 'straight';
	private readonly parallelEdgeLayer: SigmaParallelEdgeLayer;
	private hoverRefreshIndex: SigmaHoverRefreshIndex;
	private readonly hoverRefreshCoordinator: SigmaHoverRefreshCoordinator;
	private readonly textWidthCache = new CanvasTextWidthCache();
	private readonly zoomLevelListeners = new Set<(level: number) => void>();
	private readonly handleCameraUpdated = (): void => {
		this.emitZoomLevel();
	};

	constructor(options: SigmaRendererOptions) {
		const {
			graph,
			container,
			palette,
			fadeDistance,
			labelSize,
			scaleLabelsWithZoom,
			labelBold,
			labelItalic,
			labelPosition,
			labelOffset,
			labelDensity,
			forceLabels,
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		} = options;
		this.graph = graph;
		this.parallelEdgeStyle = options.parallelEdgeStyle ?? 'straight';
		this.palette = palette;
		this.fadeDistance = fadeDistance;
		this.scaleLabelsWithZoom = scaleLabelsWithZoom;
		this.labelPosition = labelPosition;
		this.labelOffset = labelOffset;
		this.labelMaxWidth = options.labelMaxWidth ?? 0;
		this.labelBold = labelBold;
		this.labelItalic = labelItalic;
		this.labelTheme = {
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		};
		this.forceLabels = forceLabels;
		this.instance = new Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>(
			graph,
			container,
			{
				allowInvalidContainer: true,
				enableEdgeEvents: true,
				minCameraRatio: 0.25,
				maxCameraRatio: 4,
				zoomingRatio: PLANAR_WHEEL_ZOOM_FACTOR,
				zoomToSizeRatioFunction: planarZoomToSizeRatio,
				doubleClickZoomingDuration: 0,
				doubleClickZoomingRatio: 1,
				defaultEdgeType: 'line',
				edgeProgramClasses: {
					line: EdgeRectangleProgram,
					arrow: ArrowEdgeProgram,
					dashed: DashedEdgeProgram,
					'dashed-arrow': DashedArrowEdgeProgram,
					'chevron-arrow': ChevronArrowEdgeProgram,
					'dashed-chevron-arrow': DashedChevronArrowEdgeProgram,
					dotted: DottedEdgeProgram,
					'dotted-arrow': DottedArrowEdgeProgram,
					'dotted-chevron-arrow': DottedChevronArrowEdgeProgram,
					'dash-dot': DashDotEdgeProgram,
					'dash-dot-arrow': DashDotArrowEdgeProgram,
					'dash-dot-chevron-arrow': DashDotChevronArrowEdgeProgram,
				},
				nodeProgramClasses: {
					square: NodeSquareProgram,
					diamond: NodeDiamondProgram,
					triangle: NodeTriangleProgram,
					hexagon: NodeHexagonProgram,
					star: NodeStarProgram,
				},
				nodeReducer: (node, data) =>
					reduceSigmaNode(
						node,
						data,
						this.getHoverState(),
						this.palette,
					),
				edgeReducer: (edge, data) =>
					reduceSigmaEdge(
						data,
						this.getHoverState(),
						this.palette,
						this.graph.extremities(edge),
						edge,
					),
				defaultDrawNodeLabel: createNodeLabelDrawer(
					(baseSize) => this.getRenderedLabelSize(baseSize),
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.labelOffset,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
					() => this.getLabelStyle(),
					this.textWidthCache,
					() => this.labelMaxWidth,
				),
				defaultDrawNodeHover: createNodeHoverDrawer(
					(baseSize) => this.getRenderedLabelSize(baseSize),
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.labelOffset,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
					() => this.getLabelStyle(),
					this.textWidthCache,
					() => this.labelMaxWidth,
				),
				defaultDrawEdgeLabel: createEdgeLabelDrawer(
					(baseSize) => this.getRenderedLabelSize(baseSize),
					() => this.getCurrentLabelOpacity(),
					this.textWidthCache,
					() => this.labelMaxWidth,
				),
				renderEdgeLabels: true,
				labelColor: { color: palette.label },
				labelSize,
				edgeLabelSize: labelSize,
				labelWeight: this.getLabelWeight(),
				labelDensity,
				labelRenderedSizeThreshold: 0,
				zIndex: true,
			},
		);
		this.instance
			.getMouseCaptor()
			.on('doubleClick', (event: { preventSigmaDefault(): void }) => {
				event.preventSigmaDefault();
			});
		this.instance
			.getTouchCaptor()
			.on('doubletap', (event: { preventSigmaDefault(): void }) => {
				event.preventSigmaDefault();
			});
		this.parallelEdgeLayer = new SigmaParallelEdgeLayer(
			this.instance,
			() => this.graph,
			() => ({
				activeHoverNodeId: this.getActiveHoverNodeId(),
				parallelEdgeStyle: this.parallelEdgeStyle,
				localHover: this.hoverMode === 'local',
				pinnedNodeId: this.pinnedNodeId,
				forceMotionActive: this.forceMotionActive,
				selectedEdgeId: this.selectedEdgeId,
				hoveredEdgeId: this.hoveredEdgeId,
				selectedEdgeColor: this.palette.selected,
				mutedEdgeColor: this.palette.mutedEdge,
			}),
			() => this.getCurrentLabelOpacity(),
			this.textWidthCache,
			() => this.labelMaxWidth,
		);
		this.groupOverlayLayer = new GroupOverlayLayer(
			this.instance,
			() => this.graph,
			() => ({
				size: getZoomAwareLabelSize(
					this.instance.getSetting('labelSize'),
					(size) => this.instance.scaleSize(size),
					this.scaleLabelsWithZoom,
				),
				position: this.labelPosition,
				offset: this.labelOffset,
				bold: this.labelBold,
				italic: this.labelItalic,
			}),
			() => this.resize(),
		);
		this.layoutGroupLayer = new LayoutGroupLayer(
			this.instance,
			this.textWidthCache,
		);
		this.hoverRefreshIndex = createSigmaHoverRefreshIndex(this.graph);
		this.hoverRefreshCoordinator = new SigmaHoverRefreshCoordinator(
			container.ownerDocument.defaultView ?? window,
			this.readHoverRefreshState(),
			(previous, next) => this.applyHoverRefresh(previous, next),
		);
		this.raiseHoverLabelLayer();
		this.diagnostics = new PlanarPerformance({
			owner: this,
			engine: 'sigma',
			container,
			snapshot: () => ({
				nodes: this.graph.order,
				runtimeEdges: this.graph.size,
				displayedNodeLabels:
					this.instance.getNodeDisplayedLabels().size,
				displayedNativeEdgeLabels:
					this.instance.getEdgeDisplayedLabels().size,
				groups: new Set([
					...this.diagnosticManualGroups,
					...this.diagnosticLayoutGroups,
				]).size,
				forceLabels: this.forceLabels,
			}),
			attach: (session) => {
				let started = 0;
				let processStarted = 0;
				const beforeProcess = () => {
					processStarted = performance.now();
				};
				const afterProcess = () =>
					session.record(
						'process',
						performance.now() - processStarted,
					);
				const before = () => {
					started = performance.now();
				};
				const after = () => {
					session.record('render', performance.now() - started);
					session.paint();
				};
				const updated = () => session.record('graphAttributeBatch');
				this.instance.on('beforeRender', before);
				this.instance.on('afterRender', after);
				this.instance.on('beforeProcess', beforeProcess);
				this.instance.on('afterProcess', afterProcess);
				this.graph.on('eachNodeAttributesUpdated', updated);
				const graph = this.graph;
				return () => {
					this.instance.off('beforeRender', before);
					this.instance.off('afterRender', after);
					this.instance.off('beforeProcess', beforeProcess);
					this.instance.off('afterProcess', afterProcess);
					graph.off('eachNodeAttributesUpdated', updated);
				};
			},
		});
		this.instance.getCamera().on('updated', this.handleCameraUpdated);
		if (this.scaleLabelsWithZoom) {
			// Sigma draws once inside its constructor, before this.instance is assigned.
			// Redraw now so the initialization fallback is replaced by the zoomed size.
			this.refresh();
		}
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	private spacingBoundsHeld = false;
	private hasFlowTitles = false;
	private flowTitleGroups: GroupOverlayGroup[] = [];

	private syncFlowTitleReference(): void {
		if (!this.hasFlowTitles) return;
		const held = this.spacingBoundsHeld
			? this.instance.getCustomBBox()
			: null;
		const base = held
			? {
					...held,
					center: {
						x: (held.x[0] + held.x[1]) / 2,
						y: (held.y[0] + held.y[1]) / 2,
					},
					normalizationRatio:
						Math.max(
							held.x[1] - held.x[0],
							held.y[1] - held.y[0],
						) || 1,
				}
			: getPlanarGraphExtent(this.graph);
		const extent = flowTitleReferenceExtent(
			base,
			this.instance.getDimensions(),
			held ? [] : this.flowTitleGroups,
		);
		const previous = this.instance.getCustomBBox();
		if (
			previous &&
			previous.x[0] === extent.x[0] &&
			previous.x[1] === extent.x[1] &&
			previous.y[0] === extent.y[0] &&
			previous.y[1] === extent.y[1]
		)
			return;
		this.instance.setCustomBBox({ x: extent.x, y: extent.y });
		// setCustomBBox only schedules a render in Sigma 3. Reprocess node
		// normalization as well, or the new frame uses stale normalized positions.
		this.instance.scheduleRefresh();
	}

	setGraph(
		graph: RuntimeGraph,
		options?: { preserveViewportScale?: boolean },
	): void {
		if (options?.preserveViewportScale) {
			this.holdCurrentBounds();
			this.spacingBoundsHeld = true;
		} else if (this.spacingBoundsHeld) {
			this.spacingBoundsHeld = false;
			this.clearHeldBounds();
		}
		this.diagnostics?.setEnabled(false);
		this.graph = graph;
		this.hoverRefreshIndex = createSigmaHoverRefreshIndex(graph);
		if (this.pinnedNodeId && !graph.hasNode(this.pinnedNodeId)) {
			this.pinnedNodeId = undefined;
		}
		this.updateHoveredNeighborhood();
		this.hoverRefreshCoordinator.synchronize(this.readHoverRefreshState());
		this.instance.setGraph(graph);
		this.syncFlowTitleReference();
		this.diagnostics?.setEnabled(isPlanarPerformanceLoggingEnabled());
		this.parallelEdgeLayer.invalidate();
		this.syncGroupFocus();
		this.groupOverlayLayer.update();
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.instance.setSetting('labelColor', { color: this.getLabelColor() });
		this.refresh();
	}

	refresh(): void {
		this.hoverRefreshCoordinator.synchronize(this.readHoverRefreshState());
		this.syncGroupFocus();
		this.instance.refresh();
	}

	refreshGraphStyles(): void {
		this.refresh();
	}

	refreshGraphVisibility(changes: {
		nodeIds: readonly string[];
		edgeIds: readonly string[];
	}): void {
		this.instance.refresh({
			partialGraph: {
				nodes: [...changes.nodeIds],
				edges: [...changes.edgeIds],
			},
			skipIndexation: true,
			schedule: true,
		});
	}

	beginForceMotion(): void {
		if (this.forceMotionActive) return;
		// Keep viewport targets in a stable coordinate frame while physics moves nodes.
		this.holdCurrentBounds();
		this.forceMotionActive = true;
		this.instance.refresh({
			partialGraph: {
				nodes: this.graph.nodes(),
				edges: this.graph.edges(),
			},
			skipIndexation: true,
			schedule: true,
		});
	}

	endForceMotion(): void {
		if (!this.forceMotionActive) return;
		this.forceMotionActive = false;
		this.refresh();
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks?: GroupInteractionCallbacks,
	): void {
		const hadFlowTitles = this.hasFlowTitles;
		this.flowTitleGroups = groups.filter(
			(group) => !!group.titleBandHeight,
		);
		this.hasFlowTitles = groups.some((group) => !!group.titleBandHeight);
		if (this.hasFlowTitles) this.syncFlowTitleReference();
		else if (hadFlowTitles) {
			this.instance.setCustomBBox(null);
			this.instance.scheduleRefresh();
		}
		this.groupOverlayLayer.setGroups(groups, callbacks);
		this.diagnosticManualGroups = new Set(groups.map((group) => group.id));
		this.syncGroupFocus();
	}

	setLayoutGroupGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.layoutGroupLayer.setGeometries(geometries, getGroupNodeIds);
		this.diagnosticLayoutGroups = new Set(
			geometries.map((group) => group.groupId),
		);
		this.syncGroupFocus();
	}

	setLayoutEdgeRoutes(_routes?: ReadonlyMap<string, PlanarEdgeRoute>): void {}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		return (
			this.groupOverlayLayer.getGroupAtViewportPosition(position) ??
			this.layoutGroupLayer.getGroupAtViewportPosition(position)
		);
	}

	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		return this.instance.viewportToGraph(position);
	}

	graphToViewportPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		return this.instance.graphToViewport(position);
	}

	getNodePosition(nodeId: string): GraphPosition | undefined {
		if (!this.graph.hasNode(nodeId)) return undefined;
		const { x, y } = this.graph.getNodeAttributes(nodeId);
		return { x, y };
	}

	setNodePosition(nodeId: string, position: GraphPosition): void {
		if (!this.graph.hasNode(nodeId)) return;
		this.graph.mergeNodeAttributes(nodeId, position);
		this.refresh();
	}

	moveNodesBy(nodeIds: Iterable<string>, delta: GraphPosition): void {
		let moved = false;
		for (const nodeId of nodeIds) {
			const position = this.getNodePosition(nodeId);
			if (!position) continue;
			this.graph.mergeNodeAttributes(nodeId, {
				x: position.x + delta.x,
				y: position.y + delta.y,
			});
			moved = true;
		}
		if (moved) this.refresh();
	}

	setActiveDropGroup(groupId?: string): void {
		this.groupOverlayLayer.setActiveDropGroup(groupId);
	}

	setSelected(nodeId?: string): void {
		if (this.selectedNodeId === nodeId) {
			return;
		}
		const previousNodeId = this.selectedNodeId;
		this.selectedNodeId = nodeId;
		const nodes = [previousNodeId, nodeId].filter(
			(id): id is string => id !== undefined && this.graph.hasNode(id),
		);
		if (nodes.length === 0) return;
		// Only the old and new selection need their reducer output recomputed.
		// Size and zIndex change, so retain indexation but defer the render.
		this.instance.refresh({
			partialGraph: { nodes, edges: [] },
			skipIndexation: false,
			schedule: true,
		});
	}

	setSelectedEdge(edgeId?: string): void {
		if (this.selectedEdgeId === edgeId) return;
		this.selectedEdgeId = edgeId;
		this.refresh();
	}

	setSelectedGroup(groupId?: string): void {
		if (this.selectedGroupId === groupId) return;
		this.selectedGroupId = groupId;
		this.groupOverlayLayer.setSelectedGroup(groupId);
		this.layoutGroupLayer.setSelectedGroup(groupId);
	}

	setHoveredGroup(groupId?: string): void {
		this.layoutGroupLayer.setHoveredGroup(groupId);
	}

	setHoveredEdge(edgeId?: string): void {
		if (this.hoveredEdgeId === edgeId) return;
		this.hoveredEdgeId = edgeId;
		this.scheduleHoverRefresh();
	}

	clearHoveredEdge(edgeId: string): void {
		if (this.hoveredEdgeId !== edgeId) return;
		this.hoveredEdgeId = undefined;
		this.scheduleHoverRefresh();
	}

	setHovered(nodeId?: string): void {
		if (this.hoveredNodeId === nodeId) {
			return;
		}
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.scheduleHoverRefresh();
	}

	setFadeDistance(fadeDistance: number): void {
		this.fadeDistance = fadeDistance;
		this.refresh();
	}

	setHoverMode(mode: import('@/settings/settings').NodeHoverMode): void {
		if (this.hoverMode === mode) return;
		this.hoverMode = mode;
		this.refresh();
	}

	setLabelSize(labelSize: number): void {
		this.instance.setSettings({ labelSize, edgeLabelSize: labelSize });
		this.groupOverlayLayer.update();
	}

	setScaleLabelsWithZoom(scaleLabelsWithZoom: boolean): void {
		if (this.scaleLabelsWithZoom === scaleLabelsWithZoom) return;
		this.scaleLabelsWithZoom = scaleLabelsWithZoom;
		this.refresh();
	}

	setLabelBold(labelBold: boolean): void {
		this.labelBold = labelBold;
		this.instance.setSetting('labelWeight', this.getLabelWeight());
		this.refresh();
	}

	setLabelItalic(labelItalic: boolean): void {
		this.labelItalic = labelItalic;
		this.refresh();
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.labelPosition = labelPosition;
		this.refresh();
	}

	setLabelMaxWidth(value: number): void {
		this.labelMaxWidth = value;
		this.refresh();
	}

	setLabelOffset(labelOffset: number): void {
		this.labelOffset = labelOffset;
		this.refresh();
	}

	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.labelTheme = labelTheme;
		this.instance.setSetting('labelColor', { color: this.getLabelColor() });
		this.refresh();
	}

	setParallelEdgeStyle(value: 'straight' | 'curve'): void {
		if (this.parallelEdgeStyle === value) return;
		this.parallelEdgeStyle = value;
		this.parallelEdgeLayer.update();
	}

	setLabelDensity(labelDensity: number): void {
		this.instance.setSetting('labelDensity', labelDensity);
	}

	setForceLabels(forceLabels: boolean): void {
		this.forceLabels = forceLabels;
		this.refresh();
	}

	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.updateHoveredNeighborhood();
		this.scheduleHoverRefresh();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.scheduleHoverRefresh();
	}

	focusNode(nodeId: string): void {
		const displayData = this.instance.getNodeDisplayData(nodeId);
		if (!displayData) {
			return;
		}
		const camera = this.instance.getCamera();
		void camera.animate(
			{ x: displayData.x, y: displayData.y, ratio: 0.35 },
			{ duration: 350 },
		);
	}

	getNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		const hitTest = this.instance as unknown as {
			getNodeAtPosition(position: {
				x: number;
				y: number;
			}): string | null;
		};
		const nodeId = hitTest.getNodeAtPosition(position);
		if (!nodeId || !this.graph.hasNode(nodeId)) {
			return this.getNearestNodeAtViewportPosition(position);
		}
		return this.graph.getNodeAttribute(nodeId, 'isBend')
			? undefined
			: nodeId;
	}

	getEdgeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		return this.parallelEdgeLayer.getEdgeAtViewportPosition(position);
	}

	getLogicalEdgeId(runtimeEdgeId: string): string | undefined {
		if (!this.graph.hasEdge(runtimeEdgeId)) return undefined;
		const attributes = this.graph.getEdgeAttributes(runtimeEdgeId);
		return attributes.logicalEdgeId ?? runtimeEdgeId;
	}

	private getNearestNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		let closestNodeId: string | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;
		const sizeScaler = this.instance as unknown as {
			scaleSize(size?: number): number;
		};
		this.graph.forEachNode((nodeId, attributes) => {
			if (attributes.isBend) {
				return;
			}
			const viewportPosition = this.instance.graphToViewport({
				x: attributes.x,
				y: attributes.y,
			});
			const dx = viewportPosition.x - position.x;
			const dy = viewportPosition.y - position.y;
			const distance = Math.hypot(dx, dy);
			const hitRadius = Math.max(
				14,
				sizeScaler.scaleSize(attributes.size) + 8,
			);
			if (distance <= hitRadius && distance < closestDistance) {
				closestNodeId = nodeId;
				closestDistance = distance;
			}
		});
		return closestNodeId;
	}

	fit(): void {
		this.instance.resize();
		if (this.spacingBoundsHeld) {
			this.spacingBoundsHeld = false;
			this.clearHeldBounds();
		}
		this.syncFlowTitleReference();
		void this.instance.getCamera().animatedReset({ duration: 350 });
	}

	zoomBy(factor: number): void {
		const camera = this.instance.getCamera();
		if (factor > 1) {
			void camera.animatedZoom({ factor, duration: 180 });
			return;
		}
		void camera.animatedUnzoom({ factor: 1 / factor, duration: 180 });
	}

	getZoomLevel(): number {
		return 100 / this.instance.getCamera().getState().ratio;
	}

	setZoomLevel(level: number): void {
		this.instance.getCamera().setState({ ratio: 100 / level });
	}

	onZoomLevelChange(listener: (level: number) => void): () => void {
		this.zoomLevelListeners.add(listener);
		return () => this.zoomLevelListeners.delete(listener);
	}

	resize(): void {
		this.instance.resize();
		this.syncFlowTitleReference();
		// Sigma's resize() updates canvas dimensions, which clears the drawing
		// buffers. scheduleRefresh() coalesces resize events into one frame and
		// repaints without changing graph coordinates or camera state.
		this.instance.scheduleRefresh({ layoutUnchange: true });
	}

	holdCurrentBounds(): void {
		if (!this.instance.getCustomBBox()) {
			this.instance.setCustomBBox(this.instance.getBBox());
		}
	}

	clearHeldBounds(): void {
		if (this.hasFlowTitles) {
			this.syncFlowTitleReference();
			return;
		}
		// Flow spacing owns its frame until an explicit fit or scene reset.
		if (this.spacingBoundsHeld) return;
		if (this.instance.getCustomBBox()) {
			this.instance.setCustomBBox(null);
		}
	}

	kill(): void {
		this.diagnostics?.destroy();
		this.hoverRefreshCoordinator.dispose();
		this.instance.getCamera().off('updated', this.handleCameraUpdated);
		this.zoomLevelListeners.clear();
		this.parallelEdgeLayer.kill();
		this.groupOverlayLayer.kill();
		this.layoutGroupLayer.kill();
		this.instance.kill();
	}

	private emitZoomLevel(): void {
		const level = this.getZoomLevel();
		this.zoomLevelListeners.forEach((listener) => listener(level));
	}

	private raiseHoverLabelLayer(): void {
		const canvases = this.instance.getCanvases();
		const hoverLabels = canvases.hovers;
		const mouse = canvases.mouse;
		if (!hoverLabels || !mouse) return;
		// Sigma normally puts highlighted-node WebGL above hover labels. Centered
		// labels overlap the node, so pinned/hovered labels must sit above it while
		// the mouse canvas remains the top interaction layer.
		mouse.before(hoverLabels);
	}

	private getHoverState() {
		const instance = this.instance as
			Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes> | undefined;
		return {
			localHover: this.hoverMode === 'local',
			activeHoverNodeId: this.getActiveHoverNodeId(),
			pinnedNodeId: this.pinnedNodeId,
			selectedNodeId: this.selectedNodeId,
			selectedEdgeId: this.selectedEdgeId,
			hoveredEdgeId: this.hoveredEdgeId,
			hoveredNeighborhood: this.hoveredNeighborhood,
			forceLabels: this.forceLabels,
			forceMotionActive: this.forceMotionActive,
			sizeRatio: instance?.getCamera().getState().ratio ?? 1,
		};
	}

	private getActiveHoverNodeId(): string | undefined {
		return this.pinnedNodeId ?? this.hoveredNodeId;
	}

	private syncGroupFocus(): void {
		const activeNodeId =
			this.pinnedNodeId ??
			(this.hoverMode === 'local' ? this.hoveredNodeId : undefined);
		this.groupOverlayLayer.setFocusedNode(activeNodeId);
		this.layoutGroupLayer.setFocusedNode(activeNodeId);
	}

	private updateHoveredNeighborhood(): void {
		const nodeId = this.getActiveHoverNodeId();
		this.hoveredNeighborhood =
			nodeId && this.graph.hasNode(nodeId)
				? immediateNeighborhood(this.graph, nodeId)
				: new Set();
	}

	private scheduleHoverRefresh(): void {
		this.hoverRefreshCoordinator.schedule(this.readHoverRefreshState());
	}

	private applyHoverRefresh(
		previous: SigmaHoverRefreshState,
		next: SigmaHoverRefreshState,
	): void {
		this.syncGroupFocus();
		const { nodeIds, edgeIds } = createSigmaHoverRefreshPlan(
			this.graph,
			this.hoverRefreshIndex,
			previous,
			next,
		);
		if (nodeIds.length === 0 && edgeIds.length === 0) return;
		this.instance.refresh({
			partialGraph: { nodes: nodeIds, edges: edgeIds },
			skipIndexation: true,
			schedule: true,
		});
	}

	private readHoverRefreshState(): SigmaHoverRefreshState {
		return {
			activeNodeId: this.getActiveHoverNodeId(),
			pinnedNodeId: this.pinnedNodeId,
			neighborhood: this.hoveredNeighborhood,
			edgeId: this.hoveredEdgeId,
		};
	}

	private getCurrentLabelOpacity(): number {
		return calculateLabelOpacity(
			this.fadeDistance,
			this.instance?.getCamera().getState().ratio ?? 1,
		);
	}

	private getRenderedLabelSize(baseSize: number): number {
		const instance = this.instance as
			Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes> | undefined;
		return getZoomAwareLabelSize(
			baseSize,
			instance
				? (size) =>
						size *
						getPlanarLabelVisualScale(
							100 / instance.getCamera().getState().ratio,
						)
				: undefined,
			this.scaleLabelsWithZoom,
		);
	}

	private getLabelBackground(): string {
		return resolveThreeLabelStyle(this.palette, this.labelTheme)
			.backgroundColor;
	}

	private getLabelColor(): string {
		return resolveThreeLabelStyle(this.palette, this.labelTheme).textColor;
	}

	private getLabelWeight(): 'normal' | 'bold' {
		return this.labelBold ? 'bold' : 'normal';
	}

	private getLabelStyle(): 'normal' | 'italic' {
		return this.labelItalic ? 'italic' : 'normal';
	}
}
