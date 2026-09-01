import Sigma from 'sigma';
import type { LabelPosition } from '../../../core/types';
import {
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
	type RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import { immediateNeighborhood } from '../../model/neighborhood';
import type { GraphPalette } from '../../styles/graph-styles';
import {
	resolveThreeLabelStyle,
	type LabelThemeConfig,
} from '../renderer-label-style';
import { calculateLabelOpacity } from './label-opacity';
import {
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
	ArrowEdgeProgram,
	SolidEdgeProgram,
} from './patterned-edge-program';
import {
	createEdgeLabelDrawer,
	createNodeHoverDrawer,
	createNodeLabelDrawer,
} from './sigma-label-rendering';
import { reduceSigmaEdge, reduceSigmaNode } from './sigma-hover-policy';
import {
	GroupOverlayLayer,
	type GroupInteractionCallbacks,
	type GroupOverlayGroup,
} from './sigma-group-overlay';
import { LayoutGroupLayer } from './sigma-layout-group-layer';
import type { LayoutGroupGeometry } from '../../../layouts/group-geometry';
import {
	NodeDiamondProgram,
	NodeHexagonProgram,
	NodeSquareProgram,
	NodeStarProgram,
	NodeTriangleProgram,
} from './node-shape-programs';
export type {
	GroupGeometry,
	GroupInteractionCallbacks,
} from './sigma-group-overlay';

export class SigmaRenderer {
	readonly instance: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private fadeDistance: number;
	private labelPosition: LabelPosition;
	private labelOffset: number;
	private labelBold: boolean;
	private labelItalic: boolean;
	private labelColor: string;
	private labelTheme: LabelThemeConfig;
	private labelBackgroundOpacity: number;
	private forceLabels: boolean;
	private readonly groupOverlayLayer: GroupOverlayLayer;
	private readonly layoutGroupLayer: LayoutGroupLayer;
	private readonly zoomLevelListeners = new Set<(level: number) => void>();
	private readonly handleCameraUpdated = (): void => {
		this.emitZoomLevel();
	};

	constructor(
		private graph: RuntimeGraph,
		container: HTMLElement,
		private palette: GraphPalette,
		fadeDistance = 1.5,
		labelSize = 14,
		labelBold = false,
		labelItalic = false,
		labelPosition: LabelPosition = 'right',
		labelOffset = 1,
		labelColor = '',
		labelBackgroundOpacity = 0.82,
		labelDensity = 0.8,
		forceLabels = false,
		labelLightTextColor = '#111111',
		labelLightBackgroundColor = '#ffffff',
		labelLightBackgroundOpacity = 0.82,
		labelDarkTextColor = '#ffffff',
		labelDarkBackgroundColor = '#000000',
		labelDarkBackgroundOpacity = 0.62,
	) {
		this.fadeDistance = fadeDistance;
		this.labelPosition = labelPosition;
		this.labelOffset = labelOffset;
		this.labelBold = labelBold;
		this.labelItalic = labelItalic;
		this.labelColor = labelColor;
		this.labelTheme = {
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		};
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.forceLabels = forceLabels;
		this.instance = new Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>(
			graph,
			container,
			{
				allowInvalidContainer: true,
				minCameraRatio: 0.25,
				maxCameraRatio: 4,
				doubleClickZoomingDuration: 0,
				doubleClickZoomingRatio: 1,
				defaultEdgeType: 'line',
				edgeProgramClasses: {
					line: SolidEdgeProgram,
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
					),
				defaultDrawNodeLabel: createNodeLabelDrawer(
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.labelOffset,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
					() => this.getLabelStyle(),
				),
				defaultDrawNodeHover: createNodeHoverDrawer(
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.labelOffset,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
					() => this.getLabelStyle(),
				),
				defaultDrawEdgeLabel: createEdgeLabelDrawer(() =>
					this.getCurrentLabelOpacity(),
				),
				renderEdgeLabels: true,
				labelColor: { color: palette.label },
				labelSize,
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
		this.groupOverlayLayer = new GroupOverlayLayer(
			this.instance,
			() => this.graph,
		);
		this.layoutGroupLayer = new LayoutGroupLayer(this.instance);
		this.instance.getCamera().on('updated', this.handleCameraUpdated);
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	setGraph(graph: RuntimeGraph): void {
		this.graph = graph;
		if (this.pinnedNodeId && !graph.hasNode(this.pinnedNodeId)) {
			this.pinnedNodeId = undefined;
		}
		this.updateHoveredNeighborhood();
		this.instance.setGraph(graph);
		this.syncGroupFocus();
		this.groupOverlayLayer.update();
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.instance.setSetting('labelColor', { color: this.getLabelColor() });
		this.refresh();
	}

	refresh(): void {
		this.instance.refresh();
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks?: GroupInteractionCallbacks,
	): void {
		this.groupOverlayLayer.setGroups(groups, callbacks);
		this.syncGroupFocus();
	}

	setLayoutGroupGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.layoutGroupLayer.setGeometries(geometries, getGroupNodeIds);
		this.syncGroupFocus();
	}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		return this.groupOverlayLayer.getGroupAtViewportPosition(position);
	}

	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		return this.instance.viewportToGraph(position);
	}

	setActiveDropGroup(groupId?: string): void {
		this.groupOverlayLayer.setActiveDropGroup(groupId);
	}

	setSelected(nodeId?: string): void {
		if (this.selectedNodeId === nodeId) {
			return;
		}
		this.selectedNodeId = nodeId;
		this.refresh();
	}

	setHovered(nodeId?: string): void {
		if (this.hoveredNodeId === nodeId) {
			return;
		}
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.syncGroupFocus();
		this.refresh();
	}

	setFadeDistance(fadeDistance: number): void {
		this.fadeDistance = fadeDistance;
		this.refresh();
	}

	setLabelSize(labelSize: number): void {
		this.instance.setSetting('labelSize', labelSize);
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

	setLabelOffset(labelOffset: number): void {
		this.labelOffset = labelOffset;
		this.refresh();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.refresh();
	}

	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.labelTheme = labelTheme;
		this.instance.setSetting('labelColor', { color: this.getLabelColor() });
		this.refresh();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.refresh();
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
		this.syncGroupFocus();
		this.refresh();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.syncGroupFocus();
		this.refresh();
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
		if (this.instance.getCustomBBox()) {
			this.instance.setCustomBBox(null);
		}
	}

	kill(): void {
		this.instance.getCamera().off('updated', this.handleCameraUpdated);
		this.zoomLevelListeners.clear();
		this.groupOverlayLayer.kill();
		this.layoutGroupLayer.kill();
		this.instance.kill();
	}

	private emitZoomLevel(): void {
		const level = this.getZoomLevel();
		this.zoomLevelListeners.forEach((listener) => listener(level));
	}

	private getHoverState() {
		return {
			activeHoverNodeId: this.getActiveHoverNodeId(),
			selectedNodeId: this.selectedNodeId,
			hoveredNeighborhood: this.hoveredNeighborhood,
			forceLabels: this.forceLabels,
		};
	}

	private getActiveHoverNodeId(): string | undefined {
		return this.pinnedNodeId ?? this.hoveredNodeId;
	}

	private syncGroupFocus(): void {
		const activeNodeId = this.getActiveHoverNodeId();
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

	private getCurrentLabelOpacity(): number {
		return calculateLabelOpacity(
			this.fadeDistance,
			this.instance?.getCamera().getState().ratio ?? 1,
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
