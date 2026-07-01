import Sigma from 'sigma';
import { createEdgeArrowProgram } from 'sigma/rendering';
import type { ChartGroup, LabelPosition } from '../../../core/types';
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
	DashedArrowEdgeProgram,
	DashedEdgeProgram,
	DottedArrowEdgeProgram,
	DottedEdgeProgram,
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
} from './sigma-group-overlay';
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
	private labelColor: string;
	private labelTheme: LabelThemeConfig;
	private labelBackgroundOpacity: number;
	private forceLabels: boolean;
	private readonly groupOverlayLayer: GroupOverlayLayer;

	constructor(
		private graph: RuntimeGraph,
		container: HTMLElement,
		private palette: GraphPalette,
		fadeDistance = 1.5,
		labelSize = 14,
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
				doubleClickZoomingDuration: 0,
				doubleClickZoomingRatio: 1,
				defaultEdgeType: 'line',
				edgeProgramClasses: {
					arrow: createEdgeArrowProgram<
						RuntimeNodeAttributes,
						RuntimeEdgeAttributes
					>(),
					dashed: DashedEdgeProgram,
					'dashed-arrow': DashedArrowEdgeProgram,
					dotted: DottedEdgeProgram,
					'dotted-arrow': DottedArrowEdgeProgram,
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
					),
					defaultDrawNodeHover: createNodeHoverDrawer(
						() => this.getCurrentLabelOpacity(),
						() => this.labelPosition,
						() => this.labelOffset,
						() => this.getLabelColor(),
						() => this.getLabelBackground(),
					),
				defaultDrawEdgeLabel: createEdgeLabelDrawer(() =>
					this.getCurrentLabelOpacity(),
				),
				renderEdgeLabels: true,
				labelColor: { color: palette.label },
				labelSize,
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
		this.groupOverlayLayer.update();
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.instance.setSetting('labelColor', { color: this.getLabelColor() });
		this.instance.refresh();
	}

	setGroups(
		groups: ChartGroup[],
		callbacks?: GroupInteractionCallbacks,
	): void {
		this.groupOverlayLayer.setGroups(groups, callbacks);
	}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		return this.groupOverlayLayer.getGroupAtViewportPosition(position);
	}

	setActiveDropGroup(groupId?: string): void {
		this.groupOverlayLayer.setActiveDropGroup(groupId);
	}

	setSelected(nodeId?: string): void {
		this.selectedNodeId = nodeId;
		this.instance.refresh();
	}

	setHovered(nodeId?: string): void {
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.instance.refresh();
	}

	setFadeDistance(fadeDistance: number): void {
		this.fadeDistance = fadeDistance;
		this.instance.refresh();
	}

	setLabelSize(labelSize: number): void {
		this.instance.setSetting('labelSize', labelSize);
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.labelPosition = labelPosition;
		this.instance.refresh();
	}

	setLabelOffset(labelOffset: number): void {
		this.labelOffset = labelOffset;
		this.instance.refresh();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.instance.refresh();
	}

	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.labelTheme = labelTheme;
		this.instance.setSetting('labelColor', { color: this.getLabelColor() });
		this.instance.refresh();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.instance.refresh();
	}

	setLabelDensity(labelDensity: number): void {
		this.instance.setSetting('labelDensity', labelDensity);
	}

	setForceLabels(forceLabels: boolean): void {
		this.forceLabels = forceLabels;
		this.instance.refresh();
	}

	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.updateHoveredNeighborhood();
		this.instance.refresh();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.instance.refresh();
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
		this.groupOverlayLayer.kill();
		this.instance.kill();
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
}
