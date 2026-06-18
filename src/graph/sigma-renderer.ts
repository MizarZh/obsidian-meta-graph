import Sigma from 'sigma';
import { createEdgeArrowProgram } from 'sigma/rendering';
import type { NodeLabelDrawingFunction } from 'sigma/rendering';
import type { NodeDisplayData, EdgeDisplayData } from 'sigma/types';
import {
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
	type RuntimeNodeAttributes,
} from './graphology-adapter';
import { immediateNeighborhood } from './graph-events';
import type { GraphPalette } from './graph-styles';

export class SigmaRenderer {
	readonly instance: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();

	constructor(
		private graph: RuntimeGraph,
		container: HTMLElement,
		private readonly palette: GraphPalette,
	) {
		this.instance = new Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>(
			graph,
			container,
			{
				defaultEdgeType: 'line',
				edgeProgramClasses: {
					arrow: createEdgeArrowProgram<
						RuntimeNodeAttributes,
						RuntimeEdgeAttributes
					>(),
				},
				nodeReducer: (node, data) => this.reduceNode(node, data),
				edgeReducer: (edge, data) => this.reduceEdge(edge, data),
				defaultDrawNodeLabel: createNodeLabelDrawer(palette),
				renderEdgeLabels: false,
				labelColor: { color: palette.label },
				labelDensity: 0.8,
				labelRenderedSizeThreshold: 7,
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
}

function createNodeLabelDrawer(
	palette: GraphPalette,
): NodeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (!data.label) {
			return;
		}

		const font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
		const x = data.x + data.size + 5;
		const paddingX = 5;
		const paddingY = 3;
		context.save();
		context.font = font;
		context.textBaseline = 'middle';
		const textWidth = context.measureText(data.label).width;
		const width = textWidth + paddingX * 2;
		const height = settings.labelSize + paddingY * 2;
		const top = data.y - height / 2;

		context.beginPath();
		drawRoundedRect(context, x - paddingX, top, width, height, 4);
		context.fillStyle = palette.labelBackground;
		context.fill();
		context.fillStyle = palette.label;
		context.fillText(data.label, x, data.y);
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
