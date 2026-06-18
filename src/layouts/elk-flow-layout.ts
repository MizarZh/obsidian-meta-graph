import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

export class ElkFlowLayout implements LayoutEngine {
	private readonly elk = new ELK();

	async apply(graph: RuntimeGraph): Promise<void> {
		const elkGraph: ElkNode = {
			id: 'root',
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': 'RIGHT',
				'elk.spacing.nodeNode': '60',
				'elk.layered.spacing.nodeNodeBetweenLayers': '100',
				'elk.edgeRouting': 'POLYLINE',
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
