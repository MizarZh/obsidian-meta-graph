import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { FlowEdgeStyle } from '../core/types';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

export class ElkFlowLayout implements LayoutEngine {
	private readonly elk = new ELK();

	constructor(private readonly edgeStyle: FlowEdgeStyle = 'orthogonal') {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const elkGraph: ElkNode = {
			id: 'root',
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': 'RIGHT',
				'elk.spacing.nodeNode': '60',
				'elk.layered.spacing.nodeNodeBetweenLayers': '100',
				'elk.edgeRouting':
					this.edgeStyle === 'orthogonal' ? 'ORTHOGONAL' : 'POLYLINE',
			},
			children: graph.mapNodes((node) => ({
				id: node,
				width: 120,
				height: 44,
			})),
			edges: [],
		};

		graph.forEachEdge(
			(edge, attributes, source, target, sourceAttributes, targetAttributes) => {
				const related = attributes.relation === 'related';
				graph.setEdgeAttribute(edge, 'hidden', related);
				if (!related) {
					elkGraph.edges?.push({
						id: edge,
						sources: [source],
						targets: [target],
					});
				}
				void sourceAttributes;
				void targetAttributes;
			},
		);

		const result = await this.elk.layout(elkGraph);
		for (const node of result.children ?? []) {
			if (graph.hasNode(node.id)) {
				graph.mergeNodeAttributes(node.id, {
					x: node.x ?? 0,
					y: node.y ?? 0,
				});
			}
		}
	}
}

export function applyOrthogonalFlowEdges(graph: RuntimeGraph): void {
	const directedEdges = graph
		.edges()
		.filter(
			(edge) =>
				graph.isDirected(edge) &&
				graph.getEdgeAttribute(edge, 'relation') !== 'related',
		);

	for (const edge of directedEdges) {
		const source = graph.source(edge);
		const target = graph.target(edge);
		const sourceAttributes = graph.getNodeAttributes(source);
		const targetAttributes = graph.getNodeAttributes(target);
		const attributes = graph.getEdgeAttributes(edge);

		if (Math.abs(sourceAttributes.y - targetAttributes.y) < 0.001) {
			continue;
		}

		const middleX = (sourceAttributes.x + targetAttributes.x) / 2;
		const bendOne = `__flow-bend__${edge}__1`;
		const bendTwo = `__flow-bend__${edge}__2`;
		graph.dropEdge(edge);
		graph.addNode(
			bendOne,
			createBendNode(middleX, sourceAttributes.y),
		);
		graph.addNode(
			bendTwo,
			createBendNode(middleX, targetAttributes.y),
		);

		const segmentAttributes = {
			...attributes,
			type: 'line',
			logicalEdgeId: edge,
			logicalSource: source,
			logicalTarget: target,
		};
		graph.addDirectedEdgeWithKey(
			`${edge}__segment_1`,
			source,
			bendOne,
			segmentAttributes,
		);
		graph.addDirectedEdgeWithKey(
			`${edge}__segment_2`,
			bendOne,
			bendTwo,
			segmentAttributes,
		);
		graph.addDirectedEdgeWithKey(
			`${edge}__segment_3`,
			bendTwo,
			target,
			{
				...segmentAttributes,
				type: 'arrow',
			},
		);
	}
}

function createBendNode(x: number, y: number) {
	return {
		label: '',
		x,
		y,
		size: 0.01,
		color: 'rgba(0, 0, 0, 0)',
		path: '',
		folder: '',
		domains: [],
		fixed: true,
		isBend: true,
	};
}
