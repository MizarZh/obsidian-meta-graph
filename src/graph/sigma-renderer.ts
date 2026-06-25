import Sigma from "sigma";
import {
	createEdgeArrowProgram,
	drawStraightEdgeLabel,
	type NodeHoverDrawingFunction,
} from "sigma/rendering";
import type {
	EdgeLabelDrawingFunction,
	NodeLabelDrawingFunction,
} from "sigma/rendering";
import type { NodeDisplayData, EdgeDisplayData } from "sigma/types";
import type { LabelPosition } from "../core/types";
import {
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
	type RuntimeNodeAttributes,
} from "./graphology-adapter";
import { immediateNeighborhood } from "./graph-events";
import { withAlpha, type GraphPalette } from "./graph-styles";
import { calculateLabelOpacity } from "./label-opacity";
import {
	DashedArrowEdgeProgram,
	DashedEdgeProgram,
	DottedArrowEdgeProgram,
	DottedEdgeProgram,
} from "./patterned-edge-program";

const DEFAULT_NODE_LABEL_BASE_SIZE = 7;

export class SigmaRenderer {
	readonly instance: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private fadeDistance: number;
	private labelPosition: LabelPosition;
	private labelColor: string;
	private labelBackgroundOpacity: number;

	constructor(
		private graph: RuntimeGraph,
		container: HTMLElement,
		private readonly palette: GraphPalette,
		fadeDistance = 1.5,
		labelSize = 14,
		labelPosition: LabelPosition = "right",
		labelColor = "",
		labelBackgroundOpacity = 0.82,
	) {
		this.fadeDistance = fadeDistance;
		this.labelPosition = labelPosition;
		this.labelColor = labelColor;
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.instance = new Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>(
			graph,
			container,
			{
				allowInvalidContainer: true,
				defaultEdgeType: "line",
				edgeProgramClasses: {
					arrow: createEdgeArrowProgram<
						RuntimeNodeAttributes,
						RuntimeEdgeAttributes
					>(),
					dashed: DashedEdgeProgram,
					"dashed-arrow": DashedArrowEdgeProgram,
					dotted: DottedEdgeProgram,
					"dotted-arrow": DottedArrowEdgeProgram,
				},
				nodeReducer: (node, data) => this.reduceNode(node, data),
				edgeReducer: (edge, data) => this.reduceEdge(edge, data),
				defaultDrawNodeLabel: createNodeLabelDrawer(
					palette,
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
				),
				defaultDrawNodeHover: createNodeHoverDrawer(
					palette,
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
				),
				defaultDrawEdgeLabel: createEdgeLabelDrawer(() =>
					this.getCurrentLabelOpacity(),
				),
				renderEdgeLabels: true,
				labelColor: { color: palette.label },
				labelSize,
				labelDensity: 0.8,
				labelRenderedSizeThreshold: 0,
				zIndex: true,
			},
		);
	}

	setGraph(graph: RuntimeGraph): void {
		this.graph = graph;
		if (this.pinnedNodeId && !graph.hasNode(this.pinnedNodeId)) {
			this.pinnedNodeId = undefined;
		}
		this.updateHoveredNeighborhood();
		this.instance.setGraph(graph);
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
		this.instance.setSetting("labelSize", labelSize);
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.labelPosition = labelPosition;
		this.instance.refresh();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.instance.refresh();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
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
		return this.graph.getNodeAttribute(nodeId, "isBend")
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

	kill(): void {
		this.instance.kill();
	}

	private reduceNode(
		node: string,
		data: RuntimeNodeAttributes,
	): Partial<NodeDisplayData> {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		if (data.isBend) {
			return {
				...data,
				label: null,
				size: 0.01,
				highlighted: false,
				zIndex: -1,
			};
		}
		if (activeHoverNodeId && !this.hoveredNeighborhood.has(node)) {
			return {
				...data,
				color: this.palette.mutedNode,
				label: null,
				zIndex: 0,
			};
		}
		if (node === this.selectedNodeId) {
			return {
				...data,
				color: this.palette.selected,
				size: data.size + 3,
				highlighted: true,
				zIndex: 3,
			};
		}
		if (node === activeHoverNodeId) {
			return {
				...data,
				size: data.size + 2,
				highlighted: true,
				zIndex: 2,
			};
		}
		return { ...data, zIndex: 0 };
	}

	private reduceEdge(
		edge: string,
		data: RuntimeEdgeAttributes,
	): Partial<EdgeDisplayData> {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		if (!activeHoverNodeId) {
			return { ...data };
		}
		const [source, target] = this.graph.extremities(edge);
		const connected =
			source === activeHoverNodeId ||
			target === activeHoverNodeId ||
			data.logicalSource === activeHoverNodeId ||
			data.logicalTarget === activeHoverNodeId;
		return connected
			? { ...data, size: data.size + 1, zIndex: 2 }
			: {
					...data,
					color: this.palette.mutedEdge,
					size: 0.4,
					zIndex: 0,
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
		return withAlpha(this.palette.labelBackground, this.labelBackgroundOpacity);
	}

	private getLabelColor(): string {
		return this.labelColor || this.palette.label;
	}
}

function createNodeLabelDrawer(
	palette: GraphPalette,
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelColor: () => string,
	getLabelBackground: () => string,
): NodeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (!data.label) {
			return;
		}

		const labelSize = getScaledLabelSize(settings.labelSize, data.size);
		const font = `${settings.labelWeight} ${labelSize}px ${settings.labelFont}`;
		const paddingX = 5;
		const paddingY = 3;
		context.save();
		context.font = font;
		context.textBaseline = "middle";
		const textWidth = context.measureText(data.label).width;
		const width = textWidth + paddingX * 2;
		const height = labelSize + paddingY * 2;
		const box = getNodeLabelBox(
			data.x,
			data.y,
			data.size,
			width,
			height,
			paddingX,
			getLabelPosition(),
		);
		context.globalAlpha = getOpacity();
		context.textAlign = box.textAlign;

		context.beginPath();
		drawRoundedRect(context, box.x, box.y, width, height, 4);
		context.fillStyle = getLabelBackground();
		context.fill();
		context.fillStyle = getLabelColor();
		context.fillText(data.label, box.textX, box.textY);
		context.restore();
	};
}

function createNodeHoverDrawer(
	palette: GraphPalette,
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelColor: () => string,
	getLabelBackground: () => string,
): NodeHoverDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (data.hidden) return;
		if (typeof data.label !== "string") return;

		const { labelFont: font, labelWeight: weight } = settings;
		const size = getScaledLabelSize(settings.labelSize, data.size);
		context.font = `${weight} ${size}px ${font}`;

		const alpha = getOpacity();
		context.save();
		context.globalAlpha = alpha;
		context.fillStyle = getLabelBackground();
		context.shadowOffsetX = 0;
		context.shadowOffsetY = 0;
		context.shadowBlur = 8;
		context.shadowColor = "rgba(0,0,0,0.4)";

		const paddingX = 5;
		const paddingY = 3;
		const textWidth = context.measureText(data.label).width;
		const width = textWidth + paddingX * 2;
		const height = size + paddingY * 2;
		const box = getNodeLabelBox(
			data.x,
			data.y,
			data.size,
			width,
			height,
			paddingX,
			getLabelPosition(),
		);

		context.textBaseline = "middle";
		context.textAlign = box.textAlign;
		context.beginPath();
		drawRoundedRect(context, box.x, box.y, width, height, 4);
		context.fill();

		context.shadowBlur = 0;
		context.fillStyle = getLabelColor();
		context.fillText(data.label, box.textX, box.textY);
		context.restore();
	};
}

function getScaledLabelSize(baseLabelSize: number, nodeSize: number): number {
	return (baseLabelSize * nodeSize) / DEFAULT_NODE_LABEL_BASE_SIZE;
}

function getNodeLabelBox(
	nodeX: number,
	nodeY: number,
	nodeSize: number,
	width: number,
	height: number,
	paddingX: number,
	position: LabelPosition,
): {
	x: number;
	y: number;
	textX: number;
	textY: number;
	textAlign: CanvasTextAlign;
} {
	const gap = 5;
	if (position === "left") {
		const textX = nodeX - nodeSize - gap;
		return {
			x: textX - width + paddingX,
			y: nodeY - height / 2,
			textX,
			textY: nodeY,
			textAlign: "right",
		};
	}
	if (position === "top") {
		const y = nodeY - nodeSize - gap - height;
		return {
			x: nodeX - width / 2,
			y,
			textX: nodeX,
			textY: y + height / 2,
			textAlign: "center",
		};
	}
	if (position === "bottom") {
		const y = nodeY + nodeSize + gap;
		return {
			x: nodeX - width / 2,
			y,
			textX: nodeX,
			textY: y + height / 2,
			textAlign: "center",
		};
	}
	const textX = nodeX + nodeSize + gap;
	return {
		x: textX - paddingX,
		y: nodeY - height / 2,
		textX,
		textY: nodeY,
		textAlign: "left",
	};
}

function createEdgeLabelDrawer(
	getOpacity: () => number,
): EdgeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, edgeData, sourceData, targetData, settings) => {
		context.save();
		context.globalAlpha = getOpacity();
		drawStraightEdgeLabel(
			context,
			edgeData,
			sourceData,
			targetData,
			settings,
		);
		context.restore();
	};
}

function drawRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void {
	const right = x + width;
	const bottom = y + height;
	context.moveTo(x + radius, y);
	context.lineTo(right - radius, y);
	context.quadraticCurveTo(right, y, right, y + radius);
	context.lineTo(right, bottom - radius);
	context.quadraticCurveTo(right, bottom, right - radius, bottom);
	context.lineTo(x + radius, bottom);
	context.quadraticCurveTo(x, bottom, x, bottom - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
}
