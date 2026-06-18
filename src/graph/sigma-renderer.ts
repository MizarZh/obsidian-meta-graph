import Sigma from 'sigma';
import { createEdgeArrowProgram } from 'sigma/rendering';
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
		this.hoveredNeighborhood.clear();
		this.instance.setGraph(graph);
	}

	setSelected(nodeId?: string): void {
		this.selectedNodeId = nodeId;
		this.instance.refresh();
	}

	setHovered(nodeId?: string): void {
		this.hoveredNodeId = nodeId;
		this.hoveredNeighborhood =
			nodeId && this.graph.hasNode(nodeId)
				? immediateNeighborhood(this.graph, nodeId)
				: new Set();
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
		this.instance.resize();
	}

	kill(): void {
		this.instance.kill();
	}

	private reduceNode(
		node: string,
		data: RuntimeNodeAttributes,
	): Partial<NodeDisplayData> {
		if (this.hoveredNodeId && !this.hoveredNeighborhood.has(node)) {
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
		if (node === this.hoveredNodeId) {
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
		if (!this.hoveredNodeId) {
			return { ...data };
		}
		const [source, target] = this.graph.extremities(edge);
		const connected =
			source === this.hoveredNodeId || target === this.hoveredNodeId;
		return connected
			? { ...data, size: data.size + 1, zIndex: 2 }
			: {
					...data,
					color: this.palette.mutedEdge,
					size: 0.4,
					zIndex: 0,
				};
	}
}
